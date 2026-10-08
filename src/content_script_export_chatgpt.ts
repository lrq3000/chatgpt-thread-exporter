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
import {
  extractConversationIdFromPath,
  extractShareIdFromPath,
  fetchConversationViaApi,
  fetchSharedConversationViaApi,
  isConversationPath,
  isSharePath,
} from './conversation_api';
import { extractExportNodesFromNewDocument } from './new_dom_turn_extractor';
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

// The old UI matched any /c/<id> path regardless of host; the new-shell API
// path also requires a chatgpt.com origin so the fetch helpers only run on
// pages they can actually serve.
export const isLiveConversationPath = (url: string): boolean => isConversationPath(url);

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

// The new app shell ("Work mode" UI) renders no legacy turn markers and no
// embedded conversation data on hard load, so extraction goes through the
// page's own backend API first, then falls back to DOM markers and finally to
// the legacy runtime collectors used by the old UI and old share pages.
const fetchExportNodesFromNewShell = async (
  pathname: string,
  options: ExportOptions
): Promise<ExportNode[]> => {
  const shareId = extractShareIdFromPath(pathname);
  if (shareId) {
    const shareResult = await fetchSharedConversationViaApi({ shareId });
    if (shareResult.ok) {
      return parseSharedConversationData(shareResult.data, options);
    }
    throw new Error(shareResult.error);
  }

  const conversationId = extractConversationIdFromPath(pathname);
  if (conversationId) {
    const conversationResult = await fetchConversationViaApi({ conversationId });
    if (conversationResult.ok) {
      return parseSharedConversationData(conversationResult.data, options);
    }
    throw new Error(conversationResult.error);
  }

  throw new Error('This page does not reference a ChatGPT conversation.');
};

// Capturing document.documentElement.outerHTML on very long threads means
// stringifying tens of megabytes; make it lazy so it only happens when a
// legacy fallback path actually needs the page HTML.
let cachedPageHtml: string | undefined;
const getPageHtml = (): string => {
  if (cachedPageHtml === undefined) {
    cachedPageHtml = document.documentElement ? document.documentElement.outerHTML : document.body.innerHTML;
  }
  return cachedPageHtml;
};

const runThreadExport = async (): Promise<void> => {
  try {
    const options = await loadExportOptions(chrome.storage.sync);
    const pathname = window.location.pathname;

    let exportNodes: ExportNode[];

    if (isSharePath(window.location.href) || isLiveConversationPath(window.location.href)) {
      // Primary path: the page's own conversation API (works for the new Work
      // mode shell and for regular chat threads alike, on any layout).
      try {
        exportNodes = await fetchExportNodesFromNewShell(pathname, options);
      } catch (_apiError) {
        // Fallback 1: read the new-shell DOM turn markers directly. No citation
        // metadata is available this way, but the thread content still exports.
        const newDomNodes = extractExportNodesFromNewDocument(document, options);
        if (newDomNodes.length === 0) {
          // Fallback 2: legacy extraction paths (old UI DOM fibers, embedded
          // share payloads, runtime probes).
          exportNodes = getExportNodesFromSources({
            html: getPageHtml(),
            runtimeSnapshot: isLiveConversationPath(window.location.href)
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
              })() || await injectRuntimeSnapshotProbe(document, chrome.runtime.getURL('js/runtime_snapshot_probe.bundle.js')),
            options,
          });
        } else {
          exportNodes = newDomNodes;
        }
      }
    } else {
      exportNodes = getExportNodesFromSources({
        html: getPageHtml(),
        runtimeSnapshot: (() => {
          const pageWorldTurns = extractConversationTurnsFromDocument(document);
          return pageWorldTurns.length > 0
            ? { conversationTurns: pageWorldTurns }
            : undefined;
        })() || await injectRuntimeSnapshotProbe(document, chrome.runtime.getURL('js/runtime_snapshot_probe.bundle.js')),
        options,
      });
    }

    const markdownText = formatConversationMarkdown(exportNodes).trim();
    if (!markdownText) {
      throw new Error('The current ChatGPT thread did not produce any exportable Markdown.');
    }
    // Default delivery is a file picked by the user: huge threads are
    // unreliable through the clipboard. The tab title (the thread title)
    // pre-fills the Save As dialog's suggested filename.
    await chrome.runtime.sendMessage({
      markdownText,
      saveAsFile: options.saveToFile !== false,
      suggestedName: document.title,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown ChatGPT export error.';
    await chrome.runtime.sendMessage({ error: message });
  }
};

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage && typeof document !== 'undefined') {
  void runThreadExport();
}
