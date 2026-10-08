type PendingRequest = {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

const pendingRequests = new Map<number, PendingRequest>();
export const chatGptExportTimeoutMs = 5 * 60 * 1000;

// Test hook mirroring the action handler's pending-request setup so tests can
// exercise the timeout feedback path without clicking the toolbar action.
export const registerPendingExportForTest = (tabId: number): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(tabId);
      showFeedbackInTab(tabId, {
        errorText: 'ChatGPT export timed out. Please try again; if this keeps happening on very long threads, wait for the thread to finish loading before exporting.',
      }).catch(() => {
        console.error('ChatGPT export timed out and the feedback toast could not be shown.');
      });
      reject(new Error('ChatGPT export timed out.'));
    }, chatGptExportTimeoutMs);

    pendingRequests.set(tabId, { resolve, reject, timeout });
  });
};

type PageFeedbackResponse = {
  ok?: boolean;
  error?: string;
};

type PageFeedbackMessage = {
  successText?: string;
  errorText?: string;
  markdownText?: string;
  silent?: boolean;
};

export const isSupportedChatGptTabUrl = (url?: string): boolean => {
  if (!url) return false;

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'https:' && parsedUrl.hostname === 'chatgpt.com';
  } catch (_error) {
    return false;
  }
};

const sendPageFeedbackMessage = async (tabId: number, message: PageFeedbackMessage): Promise<PageFeedbackResponse | undefined> => {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['js/page_feedback.bundle.js'],
    injectImmediately: true,
  });

  return await chrome.tabs.sendMessage(tabId, message) as PageFeedbackResponse | undefined;
};

const showFeedbackInTab = async (tabId: number, message: { successText?: string; errorText?: string }): Promise<void> => {
  await sendPageFeedbackMessage(tabId, message);
};

const assertPageFeedbackOk = (response: PageFeedbackResponse | undefined, fallbackMessage: string): void => {
  if (!response || response.ok !== true) {
    throw new Error(response && response.error ? response.error : fallbackMessage);
  }
};

const copyMarkdownInFocusedTab = async (tabId: number, markdownText: string): Promise<void> => {
  const response = await sendPageFeedbackMessage(tabId, { markdownText, silent: true });
  assertPageFeedbackOk(response, 'Clipboard copy failed in the focused ChatGPT tab.');
};

export const sendMarkdownToTab = async (tabId: number, markdownText: string): Promise<void> => {
  try {
    // Keep clipboard access scoped to the selected ChatGPT tab. Avoid offscreen
    // documents and clipboard readback permissions because the extension's only
    // user-visible operation is writing the current export after a toolbar click.
    await copyMarkdownInFocusedTab(tabId, markdownText);
    await showFeedbackInTab(tabId, { successText: 'ChatGPT thread copied as Markdown' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Clipboard copy failed.';
    await showFeedbackInTab(tabId, { errorText: message });
    throw new Error(message);
  }
};

// Builds a filesystem-safe suggested name out of the thread title shown in the
// tab. The Save As dialog lets the user adjust it, but a sensible default
// (matching the conversation title) is what gets pre-filled.
export const buildSuggestedFileName = (suggestedName: string | undefined): string => {
  const fallback = 'chatgpt-thread.md';
  if (!suggestedName) return fallback;

  const cleaned = suggestedName
    // Strip every character Windows/POSIX filesystems reject, plus the
    // characters Chrome itself disallows in download filenames.
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return fallback;

  // Keep the suggested name reasonably short so the dialog stays usable.
  const trimmed = cleaned.length > 170 ? cleaned.slice(0, 170).trim() : cleaned;
  return trimmed + '.md';
};

// Huge threads produce multi-megabyte markdown that the clipboard handles
// unreliably, so the default delivery writes a file through Chrome's native
// Save As dialog (the user picks the location and can rename the file).
export const saveMarkdownToFile = async (
  tabId: number,
  markdownText: string,
  suggestedName: string | undefined
): Promise<void> => {
  const downloadsApi = (chrome as unknown as { downloads?: { download: (options: unknown, callback: (downloadId?: number) => void) => void } }).downloads;
  if (!downloadsApi || typeof downloadsApi.download !== 'function') {
    // No downloads API (unexpected on supported Chrome versions): degrade to
    // the clipboard path so the export still reaches the user.
    await sendMarkdownToTab(tabId, markdownText);
    return;
  }

  // Service workers have no URL.createObjectURL, so the payload travels as a
  // data URL. Base64 avoids any percent-encoding size blow-up for non-ASCII.
  const bytes = new TextEncoder().encode(markdownText);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const dataUrl = 'data:text/markdown;charset=utf-8;base64,' + btoa(binary);
  const filename = buildSuggestedFileName(suggestedName);

  await new Promise<void>((resolve) => {
    downloadsApi.download(
      {
        url: dataUrl,
        filename,
        saveAs: true,
      },
      (downloadId) => {
        void (async () => {
          try {
            if (typeof downloadId !== 'number') {
              // A falsy id means the user dismissed the Save As dialog
              // (runtime.lastError carries "Download canceled by the user").
              await showFeedbackInTab(tabId, { errorText: 'File save canceled.' });
            } else {
              await showFeedbackInTab(tabId, { successText: 'ChatGPT thread saved as Markdown file' });
            }
          } finally {
            resolve();
          }
        })();
      }
    );
  });
};

// Central delivery: file save when the export asked for it (option enabled in
// the content script), clipboard copy otherwise.
export const deliverMarkdownResult = async (
  tabId: number,
  markdownText: string,
  saveAsFile: boolean,
  suggestedName?: string
): Promise<void> => {
  if (saveAsFile) {
    await saveMarkdownToFile(tabId, markdownText, suggestedName);
    return;
  }
  await sendMarkdownToTab(tabId, markdownText);
};

chrome.runtime.onMessage.addListener(async (request, sender) => {
  if (!sender.tab || typeof sender.tab.id !== 'number') return;

  const tabId = sender.tab.id;
  const pendingRequest = pendingRequests.get(tabId);
  if (pendingRequest) {
    clearTimeout(pendingRequest.timeout);
    pendingRequests.delete(tabId);
  }

  try {
    if (typeof request.markdownText === 'string') {
      await deliverMarkdownResult(
        tabId,
        request.markdownText,
        request.saveAsFile === true,
        typeof request.suggestedName === 'string' ? request.suggestedName : undefined
      );
      if (pendingRequest) pendingRequest.resolve();
      return;
    }

    if (typeof request.error === 'string') {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['js/page_feedback.bundle.js'],
        injectImmediately: true,
      });
      await chrome.tabs.sendMessage(tabId, { errorText: request.error });
      if (pendingRequest) pendingRequest.reject(new Error(request.error));
      return;
    }

    const unexpected = new Error('The ChatGPT export script returned an unexpected response.');
    if (pendingRequest) {
      pendingRequest.reject(unexpected);
    } else {
      // The result arrived after the service worker was recycled, so no request
      // was waiting for it. Show what happened in the tab instead of dropping
      // the message silently (this is what made long-thread exports look like
      // "nothing happened").
      await showFeedbackInTab(tabId, { errorText: unexpected.message });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to complete the ChatGPT export flow.';
    if (pendingRequest) {
      pendingRequest.reject(error instanceof Error ? error : new Error(message));
    } else {
      // Same orphan case, but the feedback step itself failed (e.g. the tab
      // navigated away). Nothing else can surface the error, so log it here.
      console.error('ChatGPT Thread Exporter could not deliver its result:', message);
    }
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || typeof tab.id !== 'number') return;

  if (!isSupportedChatGptTabUrl(tab.url)) {
    // activeTab is intentionally temporary; reject unsupported pages before injecting any scripts.
    console.error('ChatGPT Thread Exporter can only run on https://chatgpt.com/ pages.');
    return;
  }

  try {
    const completion = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(tab.id as number);
        // Surface the timeout in the exporting tab too: the click's async
        // handler may itself be gone after a service worker recycle, and an
        // unresolved promise shows the user nothing at all.
        showFeedbackInTab(tab.id as number, {
          errorText: 'ChatGPT export timed out. Please try again; if this keeps happening on very long threads, wait for the thread to finish loading before exporting.',
        }).catch(() => {
          console.error('ChatGPT export timed out and the feedback toast could not be shown.');
        });
        reject(new Error('ChatGPT export timed out.'));
      }, chatGptExportTimeoutMs);

      pendingRequests.set(tab.id as number, { resolve, reject, timeout });
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['js/content_script_export_chatgpt.bundle.js'],
      injectImmediately: true,
    });

    await completion;
  } catch (error) {
    console.error('Failed to export ChatGPT thread:', error);
  }
});
