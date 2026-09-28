import { ConversationTurn, ExportNode, ExportOptions, parseConversationTurns } from './chatgpt_parser';

// The new chatgpt.com app shell (Work mode UI) no longer renders turns with the
// legacy `data-testid^="conversation-turn-"` markers. Instead each turn is
// wrapped in an element carrying `data-turn-key`, user prompts render inside
// `[data-user-message-bubble]` and assistant answers render as markdown blocks
// tagged `data-markdown-text-style="assistant-message"`. This extractor reads
// those markers when the conversation API (primary path) is unavailable, e.g.
// logged-out sessions or API payload changes. It cannot recover citation
// metadata (the DOM carries none), which is an accepted fallback limitation.

type RuntimeElementLike = {
  getAttribute: (name: string) => string | null;
  querySelectorAll: (selector: string) => ArrayLike<RuntimeElementLike>;
  textContent: string | null;
};

type RuntimeDocumentLike = {
  querySelectorAll: (selector: string) => ArrayLike<RuntimeElementLike>;
};

// Reasoning summaries render as collapsed labels such as "Réfléchi pendant
// 2m 2s" / "Thought for 5s" / "Worked for 1m 18s". They carry no exported
// reasoning content, so the fallback drops them to keep the markdown clean.
const reasoningLabelPattern = /^\s*(?:réfléchi|réfléchir|thought|thinking|worked|worked for)\b[^\n]{0,60}$/i;

const elementText = (element: RuntimeElementLike): string => {
  return (element.textContent || '').replace(/\s+/g, ' ').trim();
};

// Assistant answers may be split across several markdown blocks (intro text,
// tool recap, final answer). Each block becomes one part so the shared parser
// keeps them joined in order inside a single assistant message.
const extractAssistantParts = (turnElement: RuntimeElementLike): string[] => {
  const blocks = Array.from(turnElement.querySelectorAll('[data-markdown-text-style="assistant-message"]'));
  const parts: string[] = [];
  for (const block of blocks) {
    const text = elementText(block);
    if (!text) continue;
    if (reasoningLabelPattern.test(text)) continue;
    parts.push(text);
  }
  return parts;
};

const extractUserPart = (turnElement: RuntimeElementLike): string | undefined => {
  const bubble = turnElement.querySelector('[data-user-message-bubble]');
  if (!bubble) return undefined;
  const text = elementText(bubble);
  return text.length > 0 ? text : undefined;
};

const buildTurn = (
  turnId: string,
  role: 'user' | 'assistant',
  parts: string[]
): ConversationTurn => ({
  id: turnId,
  role,
  messages: [{
    id: turnId,
    author: { role },
    content: {
      content_type: 'text',
      parts,
    },
  }],
});

export const extractConversationTurnsFromNewDocument = (
  documentLike: RuntimeDocumentLike
): ConversationTurn[] => {
  const turnElements = Array.from(documentLike.querySelectorAll('[data-turn-key]'));
  const turns: ConversationTurn[] = [];
  const seenTurnIds = new Set<string>();

  for (const turnElement of turnElements) {
    // Turn keys are message ids; duplicates can appear if the page re-renders
    // the same turn into two containers (e.g. branching previews).
    const rawKey = turnElement.getAttribute('data-turn-key') || 'turn-' + turns.length;
    if (seenTurnIds.has(rawKey)) continue;
    seenTurnIds.add(rawKey);

    // In the new app shell one turn element groups a whole exchange: the user
    // prompt (when present) followed by the assistant's work on it. Emit the
    // user part first so conversation order is preserved, then the assistant
    // parts as their own turn.
    const userPart = extractUserPart(turnElement);
    if (userPart) {
      turns.push(buildTurn(rawKey, 'user', [userPart]));
    }

    const assistantParts = extractAssistantParts(turnElement);
    if (assistantParts.length > 0) {
      turns.push(buildTurn(rawKey + '-assistant', 'assistant', assistantParts));
    }
    // Turns with neither user text nor assistant text (e.g. pure tool turns)
    // are skipped rather than exported as empty blocks.
  }

  return turns;
};

export const extractExportNodesFromNewDocument = (
  documentLike: RuntimeDocumentLike,
  options: ExportOptions
): ExportNode[] => {
  return parseConversationTurns(extractConversationTurnsFromNewDocument(documentLike), options);
};