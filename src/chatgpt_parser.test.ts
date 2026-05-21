import { extractSharedConversationDataFromHtml, parseSharedConversationData } from './chatgpt_parser';
import { formatConversationMarkdown } from './markdown_formatter';

const fixtureConversationData = {
  title: 'Fixture Thread',
  current_node: 'assistant-final',
  mapping: {
    'user-node': {
      id: 'user-node',
      parent: null,
      message: {
        author: { role: 'user' },
        content: { content_type: 'text', parts: ['User question'] },
        status: 'finished_successfully',
      },
    },
    'assistant-node': {
      id: 'assistant-node',
      parent: 'user-node',
      message: {
        author: { role: 'assistant' },
        content: { content_type: 'text', parts: ['Assistant answer'] },
        status: 'finished_successfully',
      },
    },
    'tool-node': {
      id: 'tool-node',
      parent: 'assistant-node',
      message: {
        author: { role: 'tool' },
        content: { content_type: 'text', parts: ['Tool output text'] },
        status: 'finished_successfully',
      },
    },
    'reasoning-node': {
      id: 'reasoning-node',
      parent: 'tool-node',
      message: {
        author: { role: 'assistant' },
        content: { content_type: 'thoughts', parts: ['Reasoning text'] },
        status: 'finished_successfully',
      },
    },
    'assistant-final': {
      id: 'assistant-final',
      parent: 'reasoning-node',
      message: {
        author: { role: 'assistant' },
        content: { content_type: 'text', parts: ['Final assistant answer'] },
        status: 'finished_successfully',
      },
    },
  },
};

const buildSerializedHtml = (): string => {
  const payload = [
    { _1: 2 },
    'loaderData',
    { _3: 4 },
    'routes/share.$shareId.($action)',
    { _5: 6 },
    'serverResponse',
    { _7: 8 },
    'data',
    { _9: 10, _11: 12, _13: 14 },
    'title',
    'Fixture Thread',
    'current_node',
    'assistant-final',
    'mapping',
    {
      _15: 16,
      _17: 18,
      _19: 20,
      _21: 22,
      _23: 24,
    },
    'user-node',
    { _25: 26, _27: 28, _29: 30 },
    'assistant-node',
    { _25: 32, _27: 33, _29: 34, _35: 36 },
    'tool-node',
    { _25: 38, _27: 39, _29: 40, _35: 41 },
    'reasoning-node',
    { _25: 43, _27: 44, _29: 45, _35: 46 },
    'assistant-final',
    { _25: 48, _27: 49, _29: 50, _35: 51 },
    'id',
    'user-node',
    'message',
    { _52: 53, _54: 55, _56: 57 },
    'parent',
    null,
    'user-node',
    { _52: 58, _54: 59, _56: 60, _61: 62 },
    'assistant-node',
    'user-node',
    'tool-node',
    { _52: 63, _54: 64, _56: 65, _61: 66 },
    'assistant-node',
    'reasoning-node',
    { _52: 67, _54: 68, _56: 69, _61: 70 },
    'tool-node',
    'assistant-final',
    { _52: 71, _54: 72, _56: 73, _61: 74 },
    'reasoning-node',
    'assistant-final',
    'assistant-final',
    'author',
    { _75: 76 },
    'content',
    { _77: 78, _79: 80 },
    'status',
    'finished_successfully',
    'role',
    'user',
    'content_type',
    'text',
    'parts',
    ['User question'],
    'metadata',
    {},
    'assistant',
    { _77: 78, _79: 81 },
    { _75: 82 },
    { _77: 83, _79: 84 },
    { _75: 85 },
    { _77: 86, _79: 87 },
    { _75: 82 },
    { _77: 88, _79: 89 },
    'Assistant answer',
    'tool',
    'Tool output text',
    'thoughts',
    ['Reasoning text'],
    'Final assistant answer'
  ];

  const escaped = JSON.stringify(JSON.stringify(payload)).slice(1, -1);
  return `<html><body><script>window.__reactRouterContext={streamController:{enqueue:function(){}}};window.__reactRouterContext.streamController.enqueue("${escaped}")</script></body></html>`;
};

describe('ChatGPT parser', () => {
  it('extracts shared conversation data from serialized html', () => {
    const data = extractSharedConversationDataFromHtml(buildSerializedHtml());

    expect(data.title).toBe('Fixture Thread');
    expect(data.current_node).toBe('assistant-final');
    expect(Object.keys(data.mapping)).toEqual([
      'user-node',
      'assistant-node',
      'tool-node',
      'reasoning-node',
      'assistant-final',
    ]);
  });

  it('skips malformed streamed payloads and keeps searching later candidates', () => {
    const validHtml = buildSerializedHtml();
    const html = `<html><body><script>window.__reactRouterContext.streamController.enqueue("not valid json")</script>${validHtml}</body></html>`;

    const data = extractSharedConversationDataFromHtml(html);

    expect(data.current_node).toBe('assistant-final');
  });

  it('reconstructs the current-node chain and keeps tool and reasoning nodes by default', () => {
    const parsed = parseSharedConversationData(fixtureConversationData, {
      includeToolOutputs: true,
      includeReasoningNodes: true,
    });

    expect(parsed.map((node) => node.kind)).toEqual([
      'user',
      'assistant',
      'tool',
      'reasoning',
      'assistant',
    ]);
  });

  it('filters tool and reasoning nodes when disabled', () => {
    const parsed = parseSharedConversationData(fixtureConversationData, {
      includeToolOutputs: false,
      includeReasoningNodes: false,
    });

    expect(parsed.map((node) => node.kind)).toEqual([
      'user',
      'assistant',
      'assistant',
    ]);
  });

  it('formats tool and reasoning nodes under assistant sections using fourth-level headings', () => {
    const parsed = parseSharedConversationData(fixtureConversationData, {
      includeToolOutputs: true,
      includeReasoningNodes: true,
    });
    const markdown = formatConversationMarkdown(parsed);

    expect(markdown).toContain('## User');
    expect(markdown).toContain('## Assistant');
    expect(markdown).toContain('#### Tool Output');
    expect(markdown).toContain('#### Reasoning');
    expect(markdown).toContain('Tool output text');
    expect(markdown).toContain('Reasoning text');
  });

  it('serializes structured tool content instead of dropping it', () => {
    const parsed = parseSharedConversationData({
      title: 'Structured Tool Thread',
      current_node: 'tool-node',
      mapping: {
        'tool-node': {
          id: 'tool-node',
          parent: null,
          message: {
            author: { role: 'tool' },
            content: {
              content_type: 'text',
              parts: [{ result: 'ok', citations: [1, 2] }],
            },
            status: 'finished_successfully',
          },
        },
      },
    }, {
      includeToolOutputs: true,
      includeReasoningNodes: true,
    });

    expect(parsed).toEqual([
      expect.objectContaining({
        kind: 'tool',
        content: '{\n  "result": "ok",\n  "citations": [\n    1,\n    2\n  ]\n}',
      }),
    ]);
  });

  it('replaces a single inline citation marker with a markdown citation', () => {
    const marker = '\ue200filecite\ue202turn27file0\ue201';
    const text = 'Evidence summary. ' + marker + ' Next sentence.';
    const parsed = parseSharedConversationData({
      title: 'Citation Thread',
      current_node: 'assistant-node',
      mapping: {
        'assistant-node': {
          id: 'assistant-node',
          parent: null,
          message: {
            author: { role: 'assistant' },
            content: {
              content_type: 'text',
              parts: [text],
            },
            metadata: {
              citations: [
                {
                  start_ix: text.indexOf('filecite'),
                  end_ix: text.indexOf('') + 1,
                  citation_format_type: 'berry_file_search',
                  metadata: {
                    name: 'Creatine meta-analysis',
                    extra: {
                      cloud_doc_url: 'https://example.com/paper',
                      line_range: [3, 3],
                    },
                  },
                },
              ],
            },
            status: 'finished_successfully',
          },
        },
      },
    }, {
      includeToolOutputs: true,
      includeReasoningNodes: true,
    });

    expect(parsed).toEqual([
      expect.objectContaining({
        content: 'Evidence summary. @@CITATION_GROUP_0@@ Next sentence.',
        citations: [
          {
            placeholder: '@@CITATION_GROUP_0@@',
            sources: [
              {
                key: 'Creatine meta-analysis|https://example.com/paper|3|3',
                name: 'Creatine meta-analysis',
                url: 'https://example.com/paper',
                lineRange: [3, 3],
              },
            ],
          },
        ],
      }),
    ]);
  });

  it('renders file citations without a URL using the file name only', () => {
    const marker = '\ue200filecite\ue202turn42file0\ue201';
    const text = 'Plan note. ' + marker + ' Continue.';
    const parsed = parseSharedConversationData({
      title: 'File Citation Thread',
      current_node: 'assistant-node',
      mapping: {
        'assistant-node': {
          id: 'assistant-node',
          parent: null,
          message: {
            author: { role: 'assistant' },
            content: {
              content_type: 'text',
              parts: [text],
            },
            metadata: {
              citations: [
                {
                  start_ix: text.indexOf('filecite'),
                  end_ix: text.indexOf('') + 1,
                  citation_format_type: 'berry_file_search',
                  metadata: {
                    name: 'nutritional-strategy-for-3-illnesses.md',
                    extra: {
                      cloud_doc_url: '',
                    },
                  },
                },
              ],
            },
            status: 'finished_successfully',
          },
        },
      },
    }, {
      includeToolOutputs: true,
      includeReasoningNodes: true,
    });

    expect(parsed).toEqual([
      expect.objectContaining({
        content: 'Plan note. @@CITATION_GROUP_0@@ Continue.',
        citations: [
          {
            placeholder: '@@CITATION_GROUP_0@@',
            sources: [
              {
                key: 'nutritional-strategy-for-3-illnesses.md|||',
                name: 'nutritional-strategy-for-3-illnesses.md',
                url: '',
                lineRange: undefined,
              },
            ],
          },
        ],
      }),
    ]);
  });

  it('groups multiple citations at one point into a single markdown citation block', () => {
    const firstMarker = '\ue200filecite\ue202turn10file0\ue201';
    const secondMarker = '\ue200filecite\ue202turn11file0\ue202L4-L5\ue201';
    const text = 'Combined claim. ' + firstMarker + secondMarker + ' Done.';
    const firstStart = text.indexOf(firstMarker);
    const secondStart = text.indexOf(secondMarker);
    const parsed = parseSharedConversationData({
      title: 'Multi Citation Thread',
      current_node: 'assistant-node',
      mapping: {
        'assistant-node': {
          id: 'assistant-node',
          parent: null,
          message: {
            author: { role: 'assistant' },
            content: {
              content_type: 'text',
              parts: [text],
            },
            metadata: {
              citations: [
                {
                  start_ix: firstStart,
                  end_ix: firstStart + firstMarker.length,
                  citation_format_type: 'berry_file_search',
                  metadata: {
                    name: 'Source one',
                    extra: {
                      cloud_doc_url: 'https://example.com/one',
                    },
                  },
                },
                {
                  start_ix: secondStart,
                  end_ix: secondStart + secondMarker.length,
                  citation_format_type: 'berry_file_search',
                  metadata: {
                    name: 'Source two',
                    extra: {
                      cloud_doc_url: 'https://example.com/two',
                      line_range: [4, 5],
                    },
                  },
                },
              ],
            },
            status: 'finished_successfully',
          },
        },
      },
    }, {
      includeToolOutputs: true,
      includeReasoningNodes: true,
    });

    expect(parsed).toEqual([
      expect.objectContaining({
        content: 'Combined claim. @@CITATION_GROUP_0@@ Done.',
        citations: [
          {
            placeholder: '@@CITATION_GROUP_0@@',
            sources: [
              {
                key: 'Source one|https://example.com/one||',
                name: 'Source one',
                url: 'https://example.com/one',
                lineRange: undefined,
              },
              {
                key: 'Source two|https://example.com/two|4|5',
                name: 'Source two',
                url: 'https://example.com/two',
                lineRange: [4, 5],
              },
            ],
          },
        ],
      }),
    ]);
  });
});
