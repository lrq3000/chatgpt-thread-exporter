import { ExportOptions } from './chatgpt_parser';

type StorageArea = {
  get: (keys: string[] | Record<string, unknown>, callback: (items: Partial<ExportOptions>) => void) => void;
  set: (items: Partial<ExportOptions>, callback?: () => void) => void;
};

const getRuntimeError = (): Error | undefined => {
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.lastError) return undefined;

  const runtimeError = chrome.runtime.lastError;
  return new Error(runtimeError.message || 'Unknown Chrome runtime error.');
};

export const defaultExportOptions: ExportOptions = {
  includeToolOutputs: true,
  includeReasoningNodes: true,
};

export const loadExportOptions = (storageArea: StorageArea): Promise<ExportOptions> => {
  return new Promise((resolve, reject) => {
    storageArea.get(Object.keys(defaultExportOptions), (items) => {
      const runtimeError = getRuntimeError();
      if (runtimeError) {
        reject(runtimeError);
        return;
      }

      resolve({
        includeToolOutputs: items.includeToolOutputs !== false,
        includeReasoningNodes: items.includeReasoningNodes !== false,
      });
    });
  });
};

export const saveExportOptions = (options: Partial<ExportOptions>, storageArea: StorageArea): Promise<void> => {
  return new Promise((resolve, reject) => {
    storageArea.set(options, () => {
      const runtimeError = getRuntimeError();
      if (runtimeError) {
        reject(runtimeError);
        return;
      }

      resolve();
    });
  });
};
