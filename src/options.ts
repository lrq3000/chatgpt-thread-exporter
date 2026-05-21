import { loadExportOptions, saveExportOptions } from './storage';

type CheckboxLike = {
  checked: boolean;
  addEventListener: (eventName: string, handler: () => void) => void;
};

type DocumentLike = {
  getElementById: (id: string) => CheckboxLike | null;
};

type StorageArea = typeof chrome.storage.sync;

export const initializeOptionsPage = async (doc: DocumentLike, storageArea: StorageArea): Promise<void> => {
  const toolCheckbox = doc.getElementById('include-tool-outputs');
  const reasoningCheckbox = doc.getElementById('include-reasoning-nodes');
  if (!toolCheckbox || !reasoningCheckbox) return;

  const options = await loadExportOptions(storageArea);
  toolCheckbox.checked = options.includeToolOutputs;
  reasoningCheckbox.checked = options.includeReasoningNodes;

  toolCheckbox.addEventListener('change', () => {
    void saveExportOptions({ includeToolOutputs: toolCheckbox.checked }, storageArea);
  });
  reasoningCheckbox.addEventListener('change', () => {
    void saveExportOptions({ includeReasoningNodes: reasoningCheckbox.checked }, storageArea);
  });
};

if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
  void initializeOptionsPage(document as unknown as DocumentLike, chrome.storage.sync);
}
