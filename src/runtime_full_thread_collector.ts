import { extractConversationTurnsFromDocument } from './live_turn_extractor';
import { collectFullThreadTurns as collectThreadTurns } from './full_thread_collection';
import { findConversationScrollContainer } from './scroll_container';

const runtimeSnapshotProbeId = 'chatgpt-thread-exporter-runtime-snapshot';

const wait = async (milliseconds: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const collectFullThreadSnapshot = async () => {
  const scrollContainer = findConversationScrollContainer(document) as HTMLElement;
  return {
    conversationTurns: await collectThreadTurns({
      scrollContainer,
      extractTurns: () => extractConversationTurnsFromDocument(document),
      sampleMetrics: () => ({
        scrollTop: scrollContainer.scrollTop,
        scrollHeight: scrollContainer.scrollHeight,
        turnCount: document.querySelectorAll('[data-testid^="conversation-turn-"]').length,
      }),
      wait,
      settlePollIntervalMs: 250,
      maxAttempts: 60,
      stableTopPassesRequired: 2,
      requiredStablePolls: 2,
      maxSettlePolls: 24,
    }),
  };
};

void (async () => {
  const output = document.getElementById(runtimeSnapshotProbeId);
  if (!output) return;

  output.textContent = JSON.stringify(await collectFullThreadSnapshot());
})();
