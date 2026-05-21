import { ConversationTurn } from './chatgpt_parser';
import { collectFullThreadTurns } from './full_thread_collection';

const createTurn = (id: string): ConversationTurn => ({
  id,
  role: id.indexOf('assistant') >= 0 ? 'assistant' : 'user',
  messages: [
    {
      id: id + '-message',
      author: { role: id.indexOf('assistant') >= 0 ? 'assistant' : 'user' },
      content: { content_type: 'text', parts: [id] },
    },
  ],
});

describe('full thread collection', () => {
  it('jumps directly to the top on each pass and keeps retrying while loading pushes scrollTop back down', async () => {
    const scrollContainer = {
      scrollTop: 900,
      scrollToCalls: [] as number[],
      scrollTo(options: { top: number }) {
        this.scrollToCalls.push(options.top);
        this.scrollTop = options.top;
      },
      dispatchEvent() {
        return true;
      },
    };

    const turnSequences = [
      [createTurn('turn-3')],
      [createTurn('turn-2'), createTurn('turn-3')],
      [createTurn('turn-1'), createTurn('turn-2'), createTurn('turn-3')],
      [createTurn('turn-1'), createTurn('turn-2'), createTurn('turn-3')],
    ];

    const metricSequences = [
      { scrollTop: 900, scrollHeight: 2000, turnCount: 1 },
      { scrollTop: 320, scrollHeight: 2600, turnCount: 2 },
      { scrollTop: 320, scrollHeight: 2600, turnCount: 2 },
      { scrollTop: 180, scrollHeight: 3200, turnCount: 3 },
      { scrollTop: 180, scrollHeight: 3200, turnCount: 3 },
      { scrollTop: 0, scrollHeight: 3200, turnCount: 3 },
      { scrollTop: 0, scrollHeight: 3200, turnCount: 3 },
    ];

    let turnIndex = 0;
    let metricIndex = 0;

    const turns = await collectFullThreadTurns({
      scrollContainer,
      extractTurns: () => turnSequences[Math.min(turnIndex++, turnSequences.length - 1)],
      sampleMetrics: () => metricSequences[Math.min(metricIndex++, metricSequences.length - 1)],
      wait: async () => undefined,
      settlePollIntervalMs: 0,
      maxAttempts: 10,
      stableTopPassesRequired: 1,
    });

    expect(turns.map((turn) => turn.id)).toEqual(['turn-1', 'turn-2', 'turn-3']);
    expect(scrollContainer.scrollToCalls.length).toBeGreaterThanOrEqual(2);
    expect(scrollContainer.scrollToCalls.every((value) => value === 0)).toBe(true);
  });

  it('waits through brief metric plateaus before deciding loading is finished', async () => {
    const scrollContainer = {
      scrollTop: 600,
      scrollTo(_options: { top: number }) {
        this.scrollTop = 0;
      },
      dispatchEvent() {
        return true;
      },
    };

    const turn = createTurn('turn-1');
    const metrics = [
      { scrollTop: 600, scrollHeight: 1000, turnCount: 1 },
      { scrollTop: 0, scrollHeight: 1400, turnCount: 2 },
      { scrollTop: 0, scrollHeight: 1400, turnCount: 2 },
      { scrollTop: 0, scrollHeight: 2000, turnCount: 3 },
      { scrollTop: 0, scrollHeight: 2000, turnCount: 3 },
      { scrollTop: 0, scrollHeight: 2000, turnCount: 3 },
    ];
    let metricIndex = 0;
    let waitCalls = 0;

    await collectFullThreadTurns({
      scrollContainer,
      extractTurns: () => [turn],
      sampleMetrics: () => metrics[Math.min(metricIndex++, metrics.length - 1)],
      wait: async () => {
        waitCalls += 1;
      },
      settlePollIntervalMs: 25,
      maxAttempts: 5,
      stableTopPassesRequired: 1,
    });

    expect(waitCalls).toBeGreaterThanOrEqual(4);
  });
});
