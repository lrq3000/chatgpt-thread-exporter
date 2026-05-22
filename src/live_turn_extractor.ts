import { ConversationTurn } from './chatgpt_parser';

type RuntimeDocumentLike = Pick<Document, 'querySelectorAll'>;

const preferredNestedKeys = [
  'pendingProps',
  'memoizedProps',
  'props',
  'children',
  'child',
  'sibling',
  'return',
  'memoizedState',
  'ref',
  'current',
] as const;

const isConversationTurn = (value: unknown): value is ConversationTurn => {
  return !!value
    && typeof value === 'object'
    && Array.isArray((value as ConversationTurn).messages)
    && typeof (value as ConversationTurn).role === 'string';
};

const extractTurnFromReactNode = (
  value: unknown,
  depth: number = 0,
  seen: Set<unknown> = new Set()
): ConversationTurn | undefined => {
  if (!value || typeof value !== 'object' || depth > 12 || seen.has(value)) return undefined;
  seen.add(value);

  const directTurn = (value as { turn?: unknown }).turn;
  if (isConversationTurn(directTurn)) {
    return directTurn;
  }

  // ChatGPT stores turn data on a few stable React fields first, but newer builds
  // also tuck older turns behind `fiber.return.pendingProps.turn`. We walk those
  // hotspots before falling back to a bounded object scan.
  for (const key of preferredNestedKeys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;

    const nestedValue = (value as Record<string, unknown>)[key];
    const nestedTurn = extractTurnFromReactNode(nestedValue, depth + 1, seen);
    if (nestedTurn) return nestedTurn;
  }

  for (const nestedValue of Object.values(value as Record<string, unknown>)) {
    if (!nestedValue || typeof nestedValue !== 'object') continue;

    const nestedTurn = extractTurnFromReactNode(nestedValue, depth + 1, seen);
    if (nestedTurn) return nestedTurn;
  }

  return undefined;
};

export const extractConversationTurnsFromDocument = (documentLike: RuntimeDocumentLike): ConversationTurn[] => {
  const sections = Array.from(documentLike.querySelectorAll('[data-testid^="conversation-turn-"]'));
  const turns: ConversationTurn[] = [];
  const seenTurnIds = new Set<string>();

  for (const section of sections) {
    const reactKey = Object.keys(section).find((key) => key.indexOf('__reactFiber$') === 0 || key.indexOf('__reactProps$') === 0);
    if (!reactKey) continue;

    const turn = extractTurnFromReactNode((section as Record<string, unknown>)[reactKey]);
    if (!turn) continue;

    const turnId = typeof turn.id === 'string' ? turn.id : 'turn-' + turns.length;
    if (seenTurnIds.has(turnId)) continue;

    seenTurnIds.add(turnId);
    turns.push(turn);
  }

  return turns;
};
