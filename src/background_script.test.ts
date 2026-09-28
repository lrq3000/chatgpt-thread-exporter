describe('background script URL guard', () => {
  const executeScript = jest.fn();
  const sendMessage = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    executeScript.mockReset();
    sendMessage.mockReset();
    (global as unknown as { chrome: unknown }).chrome = {
      runtime: {
        onMessage: { addListener: jest.fn() },
      },
      action: { onClicked: { addListener: jest.fn() } },
      scripting: { executeScript },
      tabs: { sendMessage },
    };
  });

  afterEach(() => {
    delete (global as unknown as { chrome?: unknown }).chrome;
  });

  it('allows only secure ChatGPT pages for activeTab injection', () => {
    const { isSupportedChatGptTabUrl } = require('./background_script');

    expect(isSupportedChatGptTabUrl('https://chatgpt.com/c/123')).toBe(true);
    expect(isSupportedChatGptTabUrl('https://chatgpt.com/')).toBe(true);
    expect(isSupportedChatGptTabUrl('http://chatgpt.com/c/123')).toBe(false);
    expect(isSupportedChatGptTabUrl('https://example.com/')).toBe(false);
    expect(isSupportedChatGptTabUrl(undefined)).toBe(false);
    expect(isSupportedChatGptTabUrl('not a url')).toBe(false);
  });

  it('keeps export requests alive long enough for very large live threads', () => {
    const { chatGptExportTimeoutMs } = require('./background_script');

    expect(chatGptExportTimeoutMs).toBeGreaterThanOrEqual(5 * 60 * 1000);
  });

  it('copies markdown in the selected ChatGPT tab without hidden offscreen access', async () => {
    const { sendMarkdownToTab } = require('./background_script');
    executeScript.mockResolvedValue(undefined);
    sendMessage.mockResolvedValue({ ok: true });

    await expect(sendMarkdownToTab(123, 'markdown')).resolves.toBeUndefined();

    expect(sendMessage).toHaveBeenNthCalledWith(1, 123, { markdownText: 'markdown', silent: true });
    expect(sendMessage).toHaveBeenNthCalledWith(2, 123, { successText: 'ChatGPT thread copied as Markdown' });
  });

  it('rejects markdown delivery when selected-tab clipboard copy fails', async () => {
    const { sendMarkdownToTab } = require('./background_script');
    executeScript.mockResolvedValue(undefined);
    sendMessage
      .mockResolvedValueOnce({ ok: false, error: 'Clipboard denied.' })
      .mockResolvedValueOnce(undefined);

    await expect(sendMarkdownToTab(123, 'markdown')).rejects.toThrow('Clipboard denied.');
    expect(sendMessage).toHaveBeenCalledWith(123, { errorText: 'Clipboard denied.' });
  });
});

describe('orphaned export results stay visible to the user', () => {
  // MV3 service workers are recycled while a long export is running. When the
  // content script finally reports back, the freshly restarted worker has no
  // pending request for that tab; dropping the message silently is what made
  // long-thread exports look like "nothing happened". The worker must instead
  // still surface the outcome (or the failure) in the exporting tab.
  const executeScript = jest.fn();
  const sendMessage = jest.fn();
  const onMessageListeners: Array<(request: any, sender: any) => unknown> = [];

  const buildChrome = () => ({
    runtime: {
      onMessage: { addListener: (listener: (request: any, sender: any) => unknown) => { onMessageListeners.push(listener); } },
    },
    action: { onClicked: { addListener: jest.fn() } },
    scripting: { executeScript },
    tabs: { sendMessage },
  });

  beforeEach(() => {
    jest.resetModules();
    executeScript.mockReset();
    sendMessage.mockReset();
    onMessageListeners.length = 0;
    (global as unknown as { chrome: unknown }).chrome = buildChrome();
  });

  afterEach(() => {
    delete (global as unknown as { chrome?: unknown }).chrome;
  });

  const loadScript = () => require('./background_script');

  const dispatchCompletion = async (payload: Record<string, unknown>) => {
    const background = loadScript();
    const tabId = await background.registerPendingExportForTest(777);
    const listener = onMessageListeners[0];
    await listener({ ...payload }, { tab: { id: 777 } });
    return tabId;
  };

  it('still shows a success toast when the pending request is gone', async () => {
    // Simulate a worker that was restarted: listener installed, but no
    // pendingRequest entry for the reporting tab.
    executeScript.mockResolvedValue(undefined);
    sendMessage.mockResolvedValue({ ok: true });
    loadScript();
    const listener = onMessageListeners[0];

    await listener({ markdownText: 'markdown' }, { tab: { id: 777 } });

    expect(sendMessage).toHaveBeenCalledWith(777, { successText: 'ChatGPT thread copied as Markdown' });
  });

  it('still shows an error toast when a failed result arrives with no pending request', async () => {
    executeScript.mockResolvedValue(undefined);
    sendMessage.mockResolvedValue(undefined);
    loadScript();
    const listener = onMessageListeners[0];

    await listener({ error: 'The current ChatGPT thread did not produce any exportable Markdown.' }, { tab: { id: 778 } });

    expect(sendMessage).toHaveBeenCalledWith(778, { errorText: 'The current ChatGPT thread did not produce any exportable Markdown.' });
  });

  it('shows a timeout error in the tab instead of failing silently', async () => {
    jest.useFakeTimers();
    executeScript.mockResolvedValue(undefined);
    sendMessage.mockResolvedValue(undefined);
    const background = loadScript();
    // The hook promise rejects when the timeout fires; swallow it here because
    // the behavior under test is the feedback toast, not the rejection itself.
    const hookPromise = background.registerPendingExportForTest(999).catch(() => undefined);

    // The real timeout is 5 minutes; advance past it.
    jest.advanceTimersByTime(5 * 60 * 1000 + 1000);
    await hookPromise;
    // Allow the async showFeedbackInTab chain to complete.
    await Promise.resolve();
    await Promise.resolve();

    expect(sendMessage).toHaveBeenCalledWith(999, expect.objectContaining({ errorText: expect.stringMatching(/timed out/i) }));
    jest.useRealTimers();
  });
});
