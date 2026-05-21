type PendingRequest = {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

const pendingRequests = new Map<number, PendingRequest>();

chrome.runtime.onMessage.addListener(async (request, sender) => {
  if (!sender.tab || typeof sender.tab.id !== 'number') return;

  const pendingRequest = pendingRequests.get(sender.tab.id);
  if (!pendingRequest) return;

  clearTimeout(pendingRequest.timeout);
  pendingRequests.delete(sender.tab.id);

  try {
    await chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      files: ['js/page_feedback.bundle.js'],
      injectImmediately: true,
    });

    if (typeof request.markdownText === 'string') {
      await chrome.tabs.sendMessage(sender.tab.id, { markdownText: request.markdownText });
      pendingRequest.resolve();
      return;
    }

    if (typeof request.error === 'string') {
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

  try {
    const completion = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(tab.id as number);
        reject(new Error('ChatGPT export timed out.'));
      }, 30000);

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
