import {
  ConversationTurn,
  extractConversationDataFromRuntimeSnapshot,
  extractConversationTurnsFromRuntimeSnapshot,
  extractSharedConversationDataFromHtml,
  ExportOptions,
  parseConversationTurns,
  parseSharedConversationData,
  SharedConversationData,
} from './chatgpt_parser';
import { extractConversationTurnsFromDocument } from './live_turn_extractor';
import { findConversationScrollContainer } from './scroll_container';
import { formatConversationMarkdown } from './markdown_formatter';
import { loadExportOptions } from './storage';

type MarkdownSources = {
  html: string;
  runtimeSnapshot?: unknown;
  options: ExportOptions;
};

type RuntimeDocumentLike = Pick<Document, 'querySelectorAll' | 'getElementById' | 'createElement' | 'documentElement'>;
type ScrollContainerLike = { scrollTop: number };

const getConversationDataFromSources = ({ html, runtimeSnapshot }: { html: string; runtimeSnapshot?: unknown }): SharedConversationData => {
  try {
    return extractSharedConversationDataFromHtml(html);
  } catch (sharedError) {
    if (typeof runtimeSnapshot === 'undefined') {
      throw sharedError;
    }

    return extractConversationDataFromRuntimeSnapshot(runtimeSnapshot);
  }
};

const getConversationTurnsFromSources = ({ runtimeSnapshot }: { runtimeSnapshot?: unknown }): ConversationTurn[] => {
  if (typeof runtimeSnapshot === 'undefined') {
    throw new Error('Unable to extract live ChatGPT conversation turns from the current page.');
  }

  return extractConversationTurnsFromRuntimeSnapshot(runtimeSnapshot);
};

const getExportNodesFromSources = ({ html, runtimeSnapshot, options }: MarkdownSources) => {
  try {
    return parseSharedConversationData(getConversationDataFromSources({ html, runtimeSnapshot }), options);
  } catch (sharedError) {
    if (typeof runtimeSnapshot === 'undefined') {
      throw sharedError;
    }

    return parseConversationTurns(getConversationTurnsFromSources({ runtimeSnapshot }), options);
  }
};

const runtimeSnapshotProbeId = 'chatgpt-thread-exporter-runtime-snapshot';

export const isLiveConversationPath = (url: string): boolean => {
  try {
    return new URL(url).pathname.indexOf('/c/') === 0;
  } catch (_error) {
    return false;
  }
};

const waitForResultNodeText = async (documentLike: RuntimeDocumentLike, timeoutMs: number): Promise<string | undefined> => {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const resultNode = documentLike.getElementById(runtimeSnapshotProbeId);
    if (resultNode && resultNode.textContent && resultNode.textContent.trim().length > 0) {
      return resultNode.textContent;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  return undefined;
};

export const injectRuntimeSnapshotProbe = async (
  documentLike: RuntimeDocumentLike,
  scriptUrl: string
): Promise<unknown> => {
  const existingProbe = documentLike.getElementById(runtimeSnapshotProbeId);
  if (existingProbe && existingProbe.parentNode) {
    existingProbe.parentNode.removeChild(existingProbe);
  }

  const resultNode = documentLike.createElement('script');
  resultNode.id = runtimeSnapshotProbeId;
  resultNode.type = 'application/json';
  documentLike.documentElement.appendChild(resultNode);

  const probeScript = documentLike.createElement('script');
  probeScript.src = scriptUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      probeScript.onload = () => resolve();
      probeScript.onerror = () => reject(new Error('Unable to load the ChatGPT live-thread probe script.'));
      documentLike.documentElement.appendChild(probeScript);
    });

    return resultNode.textContent ? JSON.parse(resultNode.textContent) : undefined;
  } finally {
    if (probeScript.parentNode) {
      probeScript.parentNode.removeChild(probeScript);
    }

    if (resultNode.parentNode) {
      resultNode.parentNode.removeChild(resultNode);
    }
  }
};

export const injectFullThreadCollector = async (
  documentLike: RuntimeDocumentLike,
  scrollContainer: ScrollContainerLike,
  scriptUrl: string
): Promise<unknown> => {
  const initialScrollTop = scrollContainer.scrollTop;
  const existingProbe = documentLike.getElementById(runtimeSnapshotProbeId);
  if (existingProbe && existingProbe.parentNode) {
    existingProbe.parentNode.removeChild(existingProbe);
  }

  const resultNode = documentLike.createElement('script');
  resultNode.id = runtimeSnapshotProbeId;
  resultNode.type = 'application/json';
  documentLike.documentElement.appendChild(resultNode);

  const collectorScript = documentLike.createElement('script');
  collectorScript.src = scriptUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      collectorScript.onload = () => resolve();
      collectorScript.onerror = () => reject(new Error('Unable to load the ChatGPT full-thread collector script.'));
      documentLike.documentElement.appendChild(collectorScript);
    });

    const resultText = await waitForResultNodeText(documentLike, 30000);
    return resultText ? JSON.parse(resultText) : undefined;
  } finally {
    scrollContainer.scrollTop = initialScrollTop;

    if (collectorScript.parentNode) {
      collectorScript.parentNode.removeChild(collectorScript);
    }

    if (resultNode.parentNode) {
      resultNode.parentNode.removeChild(resultNode);
    }
  }
};

export const getScrollContainer = (): ScrollContainerLike => findConversationScrollContainer(document) as ScrollContainerLike;
export { findConversationScrollContainer } from './scroll_container';

export const buildMarkdownFromSources = ({ html, runtimeSnapshot, options }: MarkdownSources): string => {
  const nodes = getExportNodesFromSources({ html, runtimeSnapshot, options });
  const markdown = formatConversationMarkdown(nodes).trim();

  if (!markdown) {
    throw new Error('The current ChatGPT thread did not produce any exportable Markdown.');
  }

  return markdown;
};

export const buildMarkdownFromPageHtml = (html: string, options: ExportOptions): string => {
  return buildMarkdownFromSources({ html, options });
};

const runThreadExport = async (): Promise<void> => {
  try {
    const options = await loadExportOptions(chrome.storage.sync);
    const html = document.documentElement ? document.documentElement.outerHTML : document.body.innerHTML;
    const runtimeSnapshot = isLiveConversationPath(window.location.href)
      ? await injectFullThreadCollector(
        document,
        getScrollContainer(),
        chrome.runtime.getURL('js/runtime_full_thread_collector.bundle.js')
      )
      : (() => {
        const pageWorldTurns = extractConversationTurnsFromDocument(document);
        return pageWorldTurns.length > 0
          ? { conversationTurns: pageWorldTurns }
          : undefined;
      })() || await injectRuntimeSnapshotProbe(document, chrome.runtime.getURL('js/runtime_snapshot_probe.bundle.js'));
    const markdownText = buildMarkdownFromSources({ html, runtimeSnapshot, options });
    await chrome.runtime.sendMessage({ markdownText });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown ChatGPT export error.';
    await chrome.runtime.sendMessage({ error: message });
  }
};

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage && typeof document !== 'undefined') {
  void runThreadExport();
}
