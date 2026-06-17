type PendingRequest = {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

const pendingRequests = new Map<number, PendingRequest>();
export const chatGptExportTimeoutMs = 5 * 60 * 1000;

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

chrome.runtime.onMessage.addListener(async (request, sender) => {
  if (!sender.tab || typeof sender.tab.id !== 'number') return;

  const pendingRequest = pendingRequests.get(sender.tab.id);
  if (!pendingRequest) return;

  clearTimeout(pendingRequest.timeout);
  pendingRequests.delete(sender.tab.id);

  try {
    if (typeof request.markdownText === 'string') {
      await sendMarkdownToTab(sender.tab.id, request.markdownText);
      pendingRequest.resolve();
      return;
    }

    if (typeof request.error === 'string') {
      await chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        files: ['js/page_feedback.bundle.js'],
        injectImmediately: true,
      });
      await chrome.tabs.sendMessage(sender.tab.id, { errorText: request.error });
      pendingRequest.reject(new Error(request.error));
      return;
    }

    pendingRequest.reject(new Error('The ChatGPT export script returned an unexpected response.'));
  } catch (error) {
    pendingRequest.reject(error instanceof Error ? error : new Error('Unable to complete the ChatGPT export flow.'));
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
