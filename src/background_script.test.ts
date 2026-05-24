describe('background script URL guard', () => {
  beforeEach(() => {
    jest.resetModules();
    (global as unknown as { chrome: unknown }).chrome = {
      runtime: { onMessage: { addListener: jest.fn() } },
      action: { onClicked: { addListener: jest.fn() } },
      scripting: { executeScript: jest.fn() },
      tabs: { sendMessage: jest.fn() },
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
});
