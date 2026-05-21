import { extractConversationTurnsFromDocument } from './live_turn_extractor';

const runtimeSnapshotProbeId = 'chatgpt-thread-exporter-runtime-snapshot';

(() => {
  const output = document.getElementById(runtimeSnapshotProbeId);
  if (!output) return;

  output.textContent = JSON.stringify({
    conversationTurns: extractConversationTurnsFromDocument(document),
  });
})();
