import { ConversationTurn } from './chatgpt_parser';
import { extractConversationTurnsFromDocument } from './live_turn_extractor';

const createTurn = (id: string, role: 'user' | 'assistant'): ConversationTurn => ({
  id,
  role,
  messages: [
    {
      id: id + '-message',
      author: { role },
      content: { content_type: 'text', parts: [id] },
    },
  ],
});

const createLegacySection = (turn: ConversationTurn, index: number) => ({
  getAttribute: (name: string) => name === 'data-testid' ? 'conversation-turn-' + index : null,
  __reactFiber$fixture: {
    pendingProps: {
      children: [
        {
          props: {
            turn,
          },
        },
      ],
    },
  },
});

const createReturnPathSection = (turn: ConversationTurn, index: number) => {
  const fiber: Record<string, unknown> = {
    pendingProps: {
      children: [],
    },
  };

  fiber.return = {
    pendingProps: {
      turn,
    },
    child: fiber,
  };

  return {
    getAttribute: (name: string) => name === 'data-testid' ? 'conversation-turn-' + index : null,
    __reactFiber$fixture: fiber,
  };
};

describe('live turn extractor', () => {
  it('extracts turns stored on the React fiber return chain', () => {
    const olderTurn = createTurn('older-turn', 'user');
    const latestTurn = createTurn('latest-turn', 'assistant');
    const documentLike = {
      querySelectorAll: (selector: string) => selector === '[data-testid^="conversation-turn-"]'
        ? [createReturnPathSection(olderTurn, 1), createLegacySection(latestTurn, 2)]
        : [],
    } as unknown as Document;

    const turns = extractConversationTurnsFromDocument(documentLike);

    expect(turns.map((turn) => turn.id)).toEqual(['older-turn', 'latest-turn']);
  });
});
