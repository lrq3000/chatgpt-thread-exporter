const listeners: Array<(
  request: Record<string, unknown>,
  sender?: unknown,
  sendResponse?: (response: Record<string, unknown>) => void
) => boolean | void> = [];

const runtime = {
  onMessage: {
    addListener: (listener: (request: Record<string, unknown>) => void) => {
      listeners.push(listener);
    },
  },
};

describe('page feedback listener installation', () => {
  beforeEach(() => {
    (global as unknown as { document: unknown }).document = {
      body: {
        appendChild: jest.fn(),
        removeChild: jest.fn(),
      },
      createElement: jest.fn(() => ({
        appendChild: jest.fn(),
        setAttribute: jest.fn(),
        focus: jest.fn(),
        select: jest.fn(),
        textContent: '',
        value: '',
      })),
      execCommand: jest.fn(() => true),
    };
    (global as unknown as { window: unknown }).window = {
      setTimeout: jest.fn(),
    };
  });

  afterEach(() => {
    delete (global as unknown as { document?: unknown }).document;
    delete (global as unknown as { window?: unknown }).window;
    delete (global as unknown as { navigator?: unknown }).navigator;
  });

  it('installs the runtime listener only once', async () => {
    jest.resetModules();
    listeners.length = 0;

    const module = await import('./page_feedback');
    module.installPageFeedbackListener(runtime as any);
    module.installPageFeedbackListener(runtime as any);

    expect(listeners).toHaveLength(1);
  });

  it('acknowledges clipboard copy only after the copy promise resolves', async () => {
    jest.resetModules();
    listeners.length = 0;
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(global, 'navigator', {
      configurable: true,
      value: { clipboard: { writeText } },
    });

    const module = await import('./page_feedback');
    module.installPageFeedbackListener(runtime as any);
    const sendResponse = jest.fn();

    const keepsMessageChannelOpen = listeners[0]({ markdownText: 'Copied markdown' }, undefined, sendResponse);
    await Promise.resolve();
    await Promise.resolve();

    expect(keepsMessageChannelOpen).toBe(true);
    expect(writeText).toHaveBeenCalledWith('Copied markdown');
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
  });

  it('falls back to execCommand when async clipboard loses user activation', async () => {
    jest.resetModules();
    listeners.length = 0;
    const writeText = jest.fn().mockRejectedValue(new Error('Document is not focused.'));
    Object.defineProperty(global, 'navigator', {
      configurable: true,
      value: { clipboard: { writeText } },
    });

    const module = await import('./page_feedback');
    module.installPageFeedbackListener(runtime as any);
    const sendResponse = jest.fn();

    const keepsMessageChannelOpen = listeners[0]({ markdownText: 'Fallback markdown' }, undefined, sendResponse);
    await Promise.resolve();
    await Promise.resolve();

    expect(keepsMessageChannelOpen).toBe(true);
    expect(writeText).toHaveBeenCalledWith('Fallback markdown');
    expect((document as any).execCommand).toHaveBeenCalledWith('copy');
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
  });

  it('does not read clipboard contents while copying markdown', async () => {
    jest.resetModules();
    listeners.length = 0;
    const writeText = jest.fn().mockResolvedValue(undefined);
    const readText = jest.fn().mockResolvedValue('Copied markdown');
    Object.defineProperty(global, 'navigator', {
      configurable: true,
      value: { clipboard: { writeText, readText } },
    });

    const module = await import('./page_feedback');
    module.installPageFeedbackListener(runtime as any);
    const sendResponse = jest.fn();

    listeners[0]({ markdownText: 'Copied markdown' }, undefined, sendResponse);
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith('Copied markdown');
    expect(readText).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
  });

});
