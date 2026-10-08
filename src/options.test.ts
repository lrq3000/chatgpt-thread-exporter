import { loadExportOptions, saveExportOptions } from './storage';
import { initializeOptionsPage } from './options';

type StoredOptions = {
  includeToolOutputs?: boolean;
  includeReasoningNodes?: boolean;
  saveToFile?: boolean;
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
      saveToFile: true,
    });
  });

  it('defaults the file save option to true so exports write to a file', async () => {
    const storageArea = createStorageArea();

    const options = await loadExportOptions(storageArea as any);
    expect(options.saveToFile).toBe(true);
  });

  it('lets users opt back into clipboard copying by disabling the file save option', async () => {
    const storageArea = createStorageArea({ saveToFile: false });

    const options = await loadExportOptions(storageArea as any);
    expect(options.saveToFile).toBe(false);
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
    const saveFileCheckbox = {
      checked: false,
      addEventListener: (_eventName: string, _handler: () => void) => undefined,
    };
    const fakeDocument = {
      getElementById: (id: string) => {
        if (id === 'include-tool-outputs') return toolCheckbox;
        if (id === 'include-reasoning-nodes') return reasoningCheckbox;
        return saveFileCheckbox;
      },
    };

    const storageArea = createStorageArea({
      includeToolOutputs: true,
      includeReasoningNodes: true,
      saveToFile: true,
    });

    await initializeOptionsPage(fakeDocument as any, storageArea as any);

    toolCheckbox.checked = false;
    toolCheckbox.dispatchEvent('change');

    await saveExportOptions({ includeReasoningNodes: false }, storageArea as any);

    expect(storageArea.snapshot()).toEqual({
      includeToolOutputs: false,
      includeReasoningNodes: false,
      saveToFile: true,
    });
  });

  it('wires the save-to-file checkbox and persists its changes', async () => {
    const listeners: Record<string, Array<() => void>> = {};
    const saveFileCheckbox = {
      checked: true,
      addEventListener: (eventName: string, handler: () => void) => {
        listeners[eventName] = listeners[eventName] || [];
        listeners[eventName].push(handler);
      },
      dispatchEvent: (eventName: string) => {
        for (const listener of listeners[eventName] || []) listener();
      },
    };
    const toolCheckbox = {
      checked: false,
      addEventListener: (_eventName: string, _handler: () => void) => undefined,
    };
    const reasoningCheckbox = {
      checked: false,
      addEventListener: (_eventName: string, _handler: () => void) => undefined,
    };
    const fakeDocument = {
      getElementById: (id: string) => {
        if (id === 'save-to-file') return saveFileCheckbox;
        if (id === 'include-tool-outputs') return toolCheckbox;
        return reasoningCheckbox;
      },
    };

    const storageArea = createStorageArea({ saveToFile: true });

    await initializeOptionsPage(fakeDocument as any, storageArea as any);

    // The saved state reflects on the checkbox when the page loads.
    expect(saveFileCheckbox.checked).toBe(true);

    saveFileCheckbox.checked = false;
    saveFileCheckbox.dispatchEvent('change');

    expect(storageArea.snapshot()).toEqual({ saveToFile: false });
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
