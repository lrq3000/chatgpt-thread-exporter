import { ConversationTurn } from './chatgpt_parser';

type ScrollContainerLike = {
  scrollTop: number;
  scrollTo?: (options: { top: number; behavior?: string }) => void;
  dispatchEvent?: (event: Event) => boolean;
};

type CollectionMetrics = {
  scrollTop: number;
  scrollHeight: number;
  turnCount: number;
};

type CollectionOptions = {
  scrollContainer: ScrollContainerLike;
  extractTurns: () => ConversationTurn[];
  sampleMetrics: () => CollectionMetrics;
  wait: (milliseconds: number) => Promise<void>;
  settlePollIntervalMs: number;
  maxAttempts: number;
  stableTopPassesRequired: number;
  requiredStablePolls?: number;
  maxSettlePolls?: number;
};

const metricsEqual = (left: CollectionMetrics, right: CollectionMetrics): boolean => {
  return left.scrollTop === right.scrollTop
    && left.scrollHeight === right.scrollHeight
    && left.turnCount === right.turnCount;
};

const jumpToTop = (scrollContainer: ScrollContainerLike): void => {
  if (typeof scrollContainer.scrollTo === 'function') {
    scrollContainer.scrollTo({ top: 0, behavior: 'auto' });
  } else {
    scrollContainer.scrollTop = 0;
  }

  if (typeof scrollContainer.dispatchEvent === 'function') {
    scrollContainer.dispatchEvent(new Event('scroll'));
  }
};

const waitForSettledMetrics = async (
  sampleMetrics: () => CollectionMetrics,
  wait: (milliseconds: number) => Promise<void>,
  settlePollIntervalMs: number,
  requiredStablePolls: number,
  maxSettlePolls: number
): Promise<CollectionMetrics> => {
  let previousMetrics = sampleMetrics();
  let stablePolls = 0;

  for (let poll = 0; poll < maxSettlePolls; poll += 1) {
    await wait(settlePollIntervalMs);
    const nextMetrics = sampleMetrics();
    if (metricsEqual(previousMetrics, nextMetrics)) {
      stablePolls += 1;
      if (stablePolls >= requiredStablePolls) {
        return nextMetrics;
      }
    } else {
      stablePolls = 0;
    }

    previousMetrics = nextMetrics;
  }

  return previousMetrics;
};

const mergeTurns = (
  collectedTurns: Map<string, ConversationTurn>,
  orderedIds: string[],
  turns: ConversationTurn[]
): string[] => {
  const visibleIds: string[] = [];

  for (const turn of turns) {
    const turnId = typeof turn.id === 'string' ? turn.id : 'turn-' + visibleIds.length;
    collectedTurns.set(turnId, turn);
    visibleIds.push(turnId);
  }

  for (const existingId of orderedIds) {
    if (visibleIds.indexOf(existingId) < 0 && collectedTurns.has(existingId)) {
      visibleIds.push(existingId);
    }
  }

  return visibleIds;
};

export const collectFullThreadTurns = async ({
  scrollContainer,
  extractTurns,
  sampleMetrics,
  wait,
  settlePollIntervalMs,
  maxAttempts,
  stableTopPassesRequired,
  requiredStablePolls = 2,
  maxSettlePolls = 40,
}: CollectionOptions): Promise<ConversationTurn[]> => {
  const collectedTurns = new Map<string, ConversationTurn>();
  let orderedIds: string[] = [];
  let stableTopPasses = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    orderedIds = mergeTurns(collectedTurns, orderedIds, extractTurns());
    const beforeMetrics = sampleMetrics();

    jumpToTop(scrollContainer);
    const settledMetrics = await waitForSettledMetrics(
      sampleMetrics,
      wait,
      settlePollIntervalMs,
      requiredStablePolls,
      maxSettlePolls
    );
    orderedIds = mergeTurns(collectedTurns, orderedIds, extractTurns());

    const madeProgress = settledMetrics.scrollTop > 0
      || settledMetrics.scrollHeight > beforeMetrics.scrollHeight
      || settledMetrics.turnCount > beforeMetrics.turnCount;

    if (!madeProgress && settledMetrics.scrollTop <= 0) {
      stableTopPasses += 1;
      if (stableTopPasses >= stableTopPassesRequired) {
        break;
      }
    } else {
      stableTopPasses = 0;
    }
  }

  return orderedIds.map((turnId) => collectedTurns.get(turnId)).filter((turn): turn is ConversationTurn => !!turn);
};
