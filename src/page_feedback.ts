let isPageFeedbackListenerInstalled = false;

const showToast = (messageText: string, accentColor: string): void => {
  if (!document.body) return;

  const container = document.createElement('div');
  container.setAttribute('style', [
    'position: fixed',
    'right: 12px',
    'bottom: 24px',
    'display: flex',
    'min-width: 260px',
    'z-index: 2147483647',
    'font-family: Arial, sans-serif',
    'box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25)'
  ].join(';'));

  const accent = document.createElement('div');
  accent.setAttribute('style', 'width: 6px; background: ' + accentColor + '; border-radius: 8px 0 0 8px;');

  const body = document.createElement('div');
  body.setAttribute('style', [
    'background: #ffffff',
    'color: #1f2937',
    'padding: 14px 16px',
    'border-radius: 0 8px 8px 0',
    'font-size: 14px',
    'line-height: 1.4'
  ].join(';'));
  body.textContent = messageText;

  container.appendChild(accent);
  container.appendChild(body);
  document.body.appendChild(container);

  window.setTimeout(() => {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }, 1800);
};

const fallbackCopyToClipboard = (content: string): void => {
  if (!document.body) throw new Error('Document body is not available for clipboard fallback.');

  const textarea = document.createElement('textarea');
  textarea.value = content;
  textarea.setAttribute('readonly', 'true');
  textarea.setAttribute('style', 'position: fixed; opacity: 0; pointer-events: none;');
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error('Clipboard copy failed');
  }
};

const copyMarkdownToClipboard = async (content: string): Promise<void> => {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(content);
      return;
    } catch (_error) {
      // Long live-thread collection can outlive Chromium's transient user activation.
      // In that case the extension clipboard permission can still allow the legacy
      // focused-textarea copy path, so try it before reporting failure.
    }
  }

  fallbackCopyToClipboard(content);
};

export const installPageFeedbackListener = (runtime: typeof chrome.runtime): void => {
  if (isPageFeedbackListenerInstalled) return;

  runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request && typeof request.markdownText === 'string') {
      void copyMarkdownToClipboard(request.markdownText)
        .then(() => {
          if (request.silent !== true) {
            showToast('ChatGPT thread copied as Markdown', '#16a34a');
          }
          sendResponse({ ok: true });
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : 'Clipboard copy failed';
          showToast(message, '#dc2626');
          sendResponse({ ok: false, error: message });
        });
      // Keep the message channel open until the asynchronous clipboard write finishes.
      return true;
    }

    if (request && typeof request.successText === 'string') {
      showToast(request.successText, '#16a34a');
    }

    if (request && typeof request.errorText === 'string') {
      showToast(request.errorText, '#dc2626');
    }
  });

  isPageFeedbackListenerInstalled = true;
};

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  installPageFeedbackListener(chrome.runtime);
}
