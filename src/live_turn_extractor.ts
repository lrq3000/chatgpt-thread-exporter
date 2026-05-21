import { ConversationTurn } from './chatgpt_parser';

type RuntimeDocumentLike = Pick<Document, 'querySelectorAll'>;

const extractTurnFromReactNode = (value: unknown): ConversationTurn | undefined => {
  if (!value || typeof value !== 'object') return undefined;

  const candidates = [
    value,
    (value as { pendingProps?: unknown }).pendingProps,
    (value as { memoizedProps?: unknown }).memoizedProps,
    (value as { props?: unknown }).props,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;

    const candidateTurn = (candidate as { turn?: ConversationTurn }).turn;
    if (candidateTurn && Array.isArray(candidateTurn.messages) && typeof candidateTurn.role === 'string') {
      return candidateTurn;
    }

    const children = (candidate as { children?: unknown }).children;
    const childValues = Array.isArray(children) ? children : typeof children === 'undefined' ? [] : [children];
    for (const child of childValues) {
      const childTurn = extractTurnFromReactNode(child);
      if (childTurn) return childTurn;
    }
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
