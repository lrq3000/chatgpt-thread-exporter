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
