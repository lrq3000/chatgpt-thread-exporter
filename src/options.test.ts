import { loadExportOptions, saveExportOptions } from './storage';
import { initializeOptionsPage } from './options';

type StoredOptions = {
  includeToolOutputs?: boolean;
  includeReasoningNodes?: boolean;
};

const createStorageArea = (initialState: StoredOptions = {}) => {
  let state: StoredOptions = {...initialState};

  return {
    get: (_keys: string[] | Record<string, unknown>, callback: (items: StoredOptions) => void) => callback({...state}),
    set: (items: StoredOptions, callback?: () => void) => {
      state = {...state, ...items};
      if (callback) callback();
    },
    snapshot: () => ({...state}),
  };
};

describe('options storage defaults', () => {
  it('defaults both export toggles to true', async () => {
    const storageArea = createStorageArea();

    await expect(loadExportOptions(storageArea as any)).resolves.toEqual({
      includeToolOutputs: true,
      includeReasoningNodes: true,
    });
  });

  it('persists options page checkbox changes', async () => {
    const listeners: Record<string, Array<() => void>> = {};
    const toolCheckbox = {
      checked: false,
      addEventListener: (eventName: string, handler: () => void) => {
        listeners[eventName] = listeners[eventName] || [];
        listeners[eventName].push(handler);
      },
      dispatchEvent: (eventName: string) => {
        for (const listener of listeners[eventName] || []) listener();
      },
    };
    const reasoningCheckbox = {
      checked: false,
      addEventListener: (_eventName: string, _handler: () => void) => undefined,
    };
    const fakeDocument = {
      getElementById: (id: string) => id === 'include-tool-outputs' ? toolCheckbox : reasoningCheckbox,
    };

    const storageArea = createStorageArea({
      includeToolOutputs: true,
      includeReasoningNodes: true,
    });

    await initializeOptionsPage(fakeDocument as any, storageArea as any);

    toolCheckbox.checked = false;
    toolCheckbox.dispatchEvent('change');

    await saveExportOptions({ includeReasoningNodes: false }, storageArea as any);

    expect(storageArea.snapshot()).toEqual({
      includeToolOutputs: false,
      includeReasoningNodes: false,
    });
  });

  it('rejects when chrome storage reports a runtime error', async () => {
    const originalChrome = (global as any).chrome;
    (global as any).chrome = { runtime: { lastError: { message: 'Storage unavailable' } } };

    const failingStorageArea = {
      get: (_keys: string[] | Record<string, unknown>, callback: (items: StoredOptions) => void) => callback({}),
      set: (_items: StoredOptions, callback?: () => void) => {
        if (callback) callback();
      },
    };

    await expect(loadExportOptions(failingStorageArea as any)).rejects.toThrow('Storage unavailable');
    await expect(saveExportOptions({ includeToolOutputs: false }, failingStorageArea as any)).rejects.toThrow('Storage unavailable');

    (global as any).chrome = originalChrome;
  });
});
