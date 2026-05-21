export type ExportOptions = {
  includeToolOutputs: boolean;
  includeReasoningNodes: boolean;
};

type RawConversationMessage = {
  id?: string;
  author?: { role?: string };
  content?: {
    content_type?: string;
    parts?: unknown[];
    text?: string;
  };
  metadata?: {
    citations?: CitationReference[];
    content_references?: ContentReference[];
    [key: string]: unknown;
  };
  status?: string;
  channel?: string | null;
  recipient?: string | null;
};

type CitationReference = {
  start_ix?: number;
  end_ix?: number;
  citation_format_type?: string;
  metadata?: {
    name?: string;
    extra?: {
      cloud_doc_url?: string;
      line_range?: [number, number] | number[];
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
};

type ContentReferenceSourceCandidate = {
  title?: string;
  name?: string;
  url?: string;
  attribution?: string;
  domain?: string;
  [key: string]: unknown;
};

type ContentReference = {
  start_idx?: number;
  end_idx?: number;
  type?: string;
  sources?: ContentReferenceSourceCandidate[];
  items?: ContentReferenceSourceCandidate[];
  fallback_items?: ContentReferenceSourceCandidate[];
  refs?: ContentReferenceSourceCandidate[];
  [key: string]: unknown;
};

type ConversationNode = {
  id?: string;
  parent?: string | null;
  message?: RawConversationMessage;
};

export type ConversationTurn = {
  id?: string;
  role?: string;
  messages?: RawConversationMessage[];
};

export type SharedConversationData = {
  title?: string;
  current_node: string;
  mapping: Record<string, ConversationNode>;
};

const isConversationMapping = (value: unknown): value is Record<string, ConversationNode> => {
  return !!value && typeof value === 'object' && !Array.isArray(value);
};

const isConversationCandidate = (value: unknown): value is SharedConversationData => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  const candidate = value as SharedConversationData;
  return typeof candidate.current_node === 'string' && isConversationMapping(candidate.mapping);
};

const isConversationTurn = (value: unknown): value is ConversationTurn => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  const candidate = value as ConversationTurn;
  return typeof candidate.role === 'string' && Array.isArray(candidate.messages);
};

export type ExportNode = {
  kind: 'user' | 'assistant' | 'tool' | 'reasoning';
  title: string;
  content: string;
  citations?: CitationGroup[];
};

export type CitationSource = {
  key: string;
  name: string;
  url: string;
  lineRange?: [number, number] | number[];
};

export type CitationGroup = {
  placeholder: string;
  sources: CitationSource[];
};

const streamPattern = /streamController\.enqueue\("((?:\\.|[^"\\])*)"\)/g;

const stringifyStructuredPart = (part: unknown): string => {
  if (typeof part === 'string') return part;

  try {
    return JSON.stringify(part, null, 2);
  } catch (_error) {
    return String(part);
  }
};

const getCitationSource = (citation: CitationReference): CitationSource => {
  const metadata = citation.metadata || {};
  const extra = metadata.extra || {};
  const name = (metadata.name || 'Source').trim();
  const url = (extra.cloud_doc_url || '').trim();
  const lineRange = Array.isArray(extra.line_range) && extra.line_range.length >= 2
    ? [extra.line_range[0], extra.line_range[1]] as [number, number]
    : undefined;

  return {
    key: [name, url, lineRange ? lineRange[0] : '', lineRange ? lineRange[1] : ''].join('|'),
    name,
    url,
    lineRange,
  };
};

const normalizeContentReferenceSource = (source: ContentReferenceSourceCandidate): CitationSource | undefined => {
  const url = typeof source.url === 'string' ? source.url.trim() : '';
  const primaryName = typeof source.title === 'string' && source.title.trim().length > 0
    ? source.title.trim()
    : typeof source.name === 'string' && source.name.trim().length > 0
      ? source.name.trim()
      : typeof source.attribution === 'string' && source.attribution.trim().length > 0
        ? source.attribution.trim()
        : typeof source.domain === 'string' && source.domain.trim().length > 0
          ? source.domain.trim()
          : 'Source';

  return {
    key: [primaryName, url].join('|'),
    name: primaryName,
    url,
  };
};

const getContentReferenceSources = (reference: ContentReference): CitationSource[] => {
  const sourceCandidates = [reference.sources, reference.items, reference.fallback_items, reference.refs]
    .filter(Array.isArray)
    .reduce((all, current) => all.concat(current as ContentReferenceSourceCandidate[]), [] as ContentReferenceSourceCandidate[]);

  const deduped = new Map<string, CitationSource>();
  for (const sourceCandidate of sourceCandidates) {
    const normalized = normalizeContentReferenceSource(sourceCandidate);
    if (!normalized) continue;
    if (normalized.url.length === 0 && normalized.name === 'Source') continue;
    if (!deduped.has(normalized.key)) {
      deduped.set(normalized.key, normalized);
    }
  }

  return Array.from(deduped.values());
};

const extractCitationGroups = (text: string, citations: CitationReference[] | undefined): { content: string; citations?: CitationGroup[] } => {
  if (!citations || citations.length === 0) return { content: text };

  const validCitations = citations
    .filter((citation) => typeof citation.start_ix === 'number' && typeof citation.end_ix === 'number')
    .sort((left, right) => (left.start_ix as number) - (right.start_ix as number) || (left.end_ix as number) - (right.end_ix as number));

  if (validCitations.length === 0) return { content: text };

  const groups: CitationReference[][] = [];
  for (const citation of validCitations) {
    const lastGroup = groups[groups.length - 1];
    if (!lastGroup) {
      groups.push([citation]);
      continue;
    }

    const previousCitation = lastGroup[lastGroup.length - 1];
    const previousEnd = previousCitation.end_ix as number;
    const currentStart = citation.start_ix as number;
    const between = text.slice(previousEnd, currentStart);
    if (currentStart <= previousEnd || between.trim().length === 0) {
      lastGroup.push(citation);
      continue;
    }

    groups.push([citation]);
  }

  let rendered = text;
  const extractedGroups: CitationGroup[] = [];
  for (let groupIndex = groups.length - 1; groupIndex >= 0; groupIndex -= 1) {
    const group = groups[groupIndex];
    const start = group[0].start_ix as number;
    const end = group[group.length - 1].end_ix as number;
    const placeholder = '@@CITATION_GROUP_' + groupIndex + '@@';
    extractedGroups.unshift({
      placeholder,
      sources: group.map((citation) => getCitationSource(citation)),
    });
    rendered = rendered.slice(0, start) + placeholder + rendered.slice(end);
  }

  return { content: rendered, citations: extractedGroups };
};

const extractCitationGroupsFromContentReferences = (
  text: string,
  contentReferences: ContentReference[] | undefined
): { content: string; citations?: CitationGroup[] } => {
  if (!contentReferences || contentReferences.length === 0) return { content: text };

  const validReferences = contentReferences
    .filter((reference) => typeof reference.start_idx === 'number' && typeof reference.end_idx === 'number')
    .map((reference) => ({
      start: reference.start_idx as number,
      end: reference.end_idx as number,
      sources: getContentReferenceSources(reference),
    }))
    .filter((reference) => reference.sources.length > 0)
    .sort((left, right) => left.start - right.start || left.end - right.end);

  if (validReferences.length === 0) return { content: text };

  let rendered = text;
  const groups: CitationGroup[] = [];
  for (let index = validReferences.length - 1; index >= 0; index -= 1) {
    const reference = validReferences[index];
    const placeholder = '@@CITATION_GROUP_' + index + '@@';
    groups.unshift({
      placeholder,
      sources: reference.sources,
    });
    rendered = rendered.slice(0, reference.start) + placeholder + rendered.slice(reference.end);
  }

  return {
    content: rendered,
    citations: groups,
  };
};

const decodeReferenceGraph = (values: any[], index: number, seen: Set<number> = new Set()): any => {
  if (index < 0) return undefined;

  const value = values[index];
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(index)) return undefined;

  seen.add(index);

  if (Array.isArray(value)) {
    const arrayValue = value.map((item) => typeof item === 'number' ? decodeReferenceGraph(values, item, seen) : item);
    seen.delete(index);
    return arrayValue;
  }

  const objectValue: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = rawKey.startsWith('_') ? decodeReferenceGraph(values, Number(rawKey.slice(1)), seen) : rawKey;
    objectValue[String(key)] = typeof rawValue === 'number' ? decodeReferenceGraph(values, rawValue, seen) : rawValue;
  }

  seen.delete(index);
  return objectValue;
};

const extractMessageText = (message: RawConversationMessage | undefined): { content: string; citations?: CitationGroup[] } => {
  if (!message || !message.content) return { content: '' };

  const applyContentReferences = (content: string): { content: string; citations?: CitationGroup[] } => {
    const extractedFromReferences = extractCitationGroupsFromContentReferences(
      content,
      message.metadata && message.metadata.content_references
    );

    if (extractedFromReferences.citations && extractedFromReferences.citations.length > 0) {
      return extractedFromReferences;
    }

    return extractCitationGroups(content, message.metadata && message.metadata.citations);
  };

  if (Array.isArray(message.content.parts)) {
    return applyContentReferences(
      message.content.parts
        .map((part) => stringifyStructuredPart(part))
        .filter((part) => part.trim().length > 0)
        .join('\n')
        .trim()
    );
  }

  if (typeof message.content.text === 'string') {
    return applyContentReferences(message.content.text.trim());
  }
  return { content: '' };
};

const getNodeKind = (message: RawConversationMessage | undefined): ExportNode['kind'] | undefined => {
  const role = message && message.author && message.author.role;
  const contentType = message && message.content && message.content.content_type;

  if (role === 'user') return 'user';
  if (role === 'tool') return 'tool';
  // Live /c/... threads expose hidden web.run call payloads as assistant code messages.
  // They are transport details rather than user-visible conversation content.
  if (role === 'assistant' && contentType === 'code') return undefined;
  if (role === 'assistant' && (contentType === 'thoughts' || contentType === 'reasoning_recap')) return 'reasoning';
  if (role === 'assistant') return 'assistant';
  return undefined;
};

const getNodeTitle = (message: RawConversationMessage | undefined, kind: ExportNode['kind']): string => {
  if (kind === 'user') return 'User';
  if (kind === 'assistant') return 'Assistant';
  if (kind === 'tool') return 'Tool Output';

  const contentType = message && message.content && message.content.content_type;
  return contentType === 'reasoning_recap' ? 'Reasoning Recap' : 'Reasoning';
};

export const extractSharedConversationDataFromHtml = (html: string): SharedConversationData => {
  streamPattern.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = streamPattern.exec(html))) {
    try {
      const decodedString = JSON.parse('"' + match[1] + '"');
      const parsedPayload = JSON.parse(decodedString);
      const decoded = Array.isArray(parsedPayload) ? decodeReferenceGraph(parsedPayload, 0) : parsedPayload;
      const data = decoded
        && decoded.loaderData
        && decoded.loaderData['routes/share.$shareId.($action)']
        && decoded.loaderData['routes/share.$shareId.($action)'].serverResponse
        && decoded.loaderData['routes/share.$shareId.($action)'].serverResponse.data;

      if (data && data.current_node && data.mapping) {
        return data as SharedConversationData;
      }
    } catch (_error) {
      // Some streamed payloads on the page are unrelated or partially escaped.
      // Ignore parse failures here and continue scanning later candidates.
    }
  }

  throw new Error('Unable to extract shared ChatGPT conversation data from page HTML.');
};

export const extractConversationDataFromRuntimeSnapshot = (snapshot: unknown): SharedConversationData => {
  const visited = new Set<unknown>();

  const visit = (value: unknown, depth: number): SharedConversationData | undefined => {
    if (depth > 8) return undefined;
    if (isConversationCandidate(value)) return value;
    if (!value || typeof value !== 'object') return undefined;
    if (visited.has(value)) return undefined;

    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const match = visit(item, depth + 1);
        if (match) return match;
      }

      return undefined;
    }

    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      const match = visit(nestedValue, depth + 1);
      if (match) return match;
    }

    return undefined;
  };

  const match = visit(snapshot, 0);
  if (match) return match;

  throw new Error('Unable to extract live ChatGPT conversation data from runtime snapshot.');
};

export const extractConversationTurnsFromRuntimeSnapshot = (snapshot: unknown): ConversationTurn[] => {
  const visited = new Set<unknown>();

  const visit = (value: unknown, depth: number): ConversationTurn[] | undefined => {
    if (depth > 8) return undefined;
    if (Array.isArray(value) && value.length > 0 && value.every((item) => isConversationTurn(item))) {
      return value as ConversationTurn[];
    }

    if (!value || typeof value !== 'object') return undefined;
    if (visited.has(value)) return undefined;
    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const match = visit(item, depth + 1);
        if (match) return match;
      }

      return undefined;
    }

    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      const match = visit(nestedValue, depth + 1);
      if (match) return match;
    }

    return undefined;
  };

  const match = visit(snapshot, 0);
  if (match) return match;

  throw new Error('Unable to extract live ChatGPT conversation turns from runtime snapshot.');
};

export const parseSharedConversationData = (data: SharedConversationData, options: ExportOptions): ExportNode[] => {
  const chain: ConversationNode[] = [];
  const visited = new Set<string>();
  let currentId: string | null | undefined = data.current_node;

  while (currentId && data.mapping[currentId] && !visited.has(currentId)) {
    visited.add(currentId);
    const node = data.mapping[currentId];
    chain.push(node);
    currentId = node.parent;
  }

  chain.reverse();

  const exportNodes: ExportNode[] = [];
  for (const node of chain) {
    const kind = getNodeKind(node.message);
    if (!kind) continue;
    if (kind === 'tool' && !options.includeToolOutputs) continue;
    if (kind === 'reasoning' && !options.includeReasoningNodes) continue;

    const extractedMessage = extractMessageText(node.message);
    if (!extractedMessage.content) continue;

    exportNodes.push({
      kind,
      title: getNodeTitle(node.message, kind),
      content: extractedMessage.content,
      citations: extractedMessage.citations,
    });
  }

  return exportNodes;
};

export const parseConversationTurns = (turns: ConversationTurn[], options: ExportOptions): ExportNode[] => {
  const exportNodes: ExportNode[] = [];

  for (const turn of turns) {
    for (const message of turn.messages || []) {
      const kind = getNodeKind(message);
      if (!kind) continue;
      if (kind === 'tool' && !options.includeToolOutputs) continue;
      if (kind === 'reasoning' && !options.includeReasoningNodes) continue;

      const extractedMessage = extractMessageText(message);
      if (!extractedMessage.content) continue;

      exportNodes.push({
        kind,
        title: getNodeTitle(message, kind),
        content: extractedMessage.content,
        citations: extractedMessage.citations,
      });
    }
  }

  return exportNodes;
};
