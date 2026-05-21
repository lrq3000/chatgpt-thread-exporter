const listeners: Array<(request: Record<string, unknown>) => void> = [];

const runtime = {
  onMessage: {
    addListener: (listener: (request: Record<string, unknown>) => void) => {
      listeners.push(listener);
    },
  },
};

describe('page feedback listener installation', () => {
  it('installs the runtime listener only once', async () => {
    jest.resetModules();
    listeners.length = 0;

    const module = await import('./page_feedback');
    module.installPageFeedbackListener(runtime as any);
    module.installPageFeedbackListener(runtime as any);

    expect(listeners).toHaveLength(1);
  });
});
