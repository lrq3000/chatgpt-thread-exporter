import {
  buildMarkdownFromPageHtml,
  buildMarkdownFromSources,
  findConversationScrollContainer,
  isLiveConversationPath,
  injectFullThreadCollector,
  injectRuntimeSnapshotProbe,
} from './content_script_export_chatgpt';
import { extractConversationTurnsFromDocument } from './live_turn_extractor';

const buildSerializedHtml = (): string => {
  const payload = {
    loaderData: {
      'routes/share.$shareId.($action)': {
        serverResponse: {
          data: {
            title: 'Fixture Thread',
            current_node: 'assistant-final',
            mapping: {
              'user-node': {
                id: 'user-node',
                parent: null,
                message: {
                  author: { role: 'user' },
                  content: { content_type: 'text', parts: ['User question'] },
                },
              },
              'assistant-node': {
                id: 'assistant-node',
                parent: 'user-node',
                message: {
                  author: { role: 'assistant' },
                  content: { content_type: 'text', parts: ['Assistant answer'] },
                },
              },
              'tool-node': {
                id: 'tool-node',
                parent: 'assistant-node',
                message: {
                  author: { role: 'tool' },
                  content: { content_type: 'text', parts: ['Tool output text'] },
                },
              },
              'assistant-final': {
                id: 'assistant-final',
                parent: 'tool-node',
                message: {
                  author: { role: 'assistant' },
                  content: { content_type: 'text', parts: ['Final assistant answer'] },
                },
              },
            },
          },
        },
      },
    },
  };

  const escaped = JSON.stringify(JSON.stringify(payload)).slice(1, -1);
  return `<html><body><script>window.__reactRouterContext={streamController:{enqueue:function(){}}};window.__reactRouterContext.streamController.enqueue("${escaped}")</script></body></html>`;
};

const buildLiveConversationTurnsSnapshot = () => ({
  conversationTurns: [
    {
      id: 'turn-user',
      role: 'user',
      messages: [
        {
          id: 'message-user',
          author: { role: 'user' },
          content: { content_type: 'text', parts: ['Live user question'] },
        },
      ],
    },
    {
      id: 'turn-assistant',
      role: 'assistant',
      messages: [
        {
          id: 'message-thoughts',
          author: { role: 'assistant' },
          content: { content_type: 'thoughts', parts: ['Reasoning trace'] },
        },
        {
          id: 'message-tool',
          author: { role: 'tool' },
          content: { content_type: 'text', parts: ['Search query output'] },
        },
        {
          id: 'message-code',
          author: { role: 'assistant' },
          recipient: 'web.run',
          content: { content_type: 'code', parts: ['Internal web.run code payload'] },
        },
        {
          id: 'message-final',
          author: { role: 'assistant' },
          channel: 'final',
          content: { content_type: 'text', parts: ['Live assistant answer [A] and [B].'] },
          metadata: {
            content_references: [
              {
                type: 'sources_footnote',
                start_idx: 22,
                end_idx: 25,
                sources: [
                  {
                    title: 'Source A',
                    url: 'https://example.com/a',
                    attribution: 'Example A',
                  },
                ],
              },
              {
                type: 'sources_footnote',
                start_idx: 30,
                end_idx: 33,
                sources: [
                  {
                    title: 'Source B',
                    url: 'https://example.com/b',
                    attribution: 'Example B',
                  },
                ],
              },
            ],
          },
        },
      ],
    },
  ],
});

const createReactTurnSection = (turn: unknown, index: number) => {
  return {
    getAttribute: (name: string) => name === 'data-testid' ? 'conversation-turn-' + index : null,
    __reactFiber$fixture: {
      pendingProps: {
        children: [
          {
            props: {
              turn,
              conversation: {
                id: 'live-thread-id',
              },
            },
          },
        ],
      },
    },
  };
};

const createFakeConversationDocument = (turns: unknown[]) => {
  const sections = turns.map((turn, index) => createReactTurnSection(turn, index));
  return {
    querySelectorAll: (selector: string) => selector === '[data-testid^="conversation-turn-"]' ? sections : [],
  } as unknown as Document;
};

const createProbeDocument = (runtimeSnapshot: unknown) => {
  const appendedNodes: any[] = [];
  const root = {
    appendChild(node: any) {
      node.parentNode = root;
      appendedNodes.push(node);
      if (node.src === 'chrome-extension://fixture/js/runtime_snapshot_probe.bundle.js') {
        const resultNode = appendedNodes.find((candidate) => candidate.id === 'chatgpt-thread-exporter-runtime-snapshot');
        if (resultNode) {
          resultNode.textContent = JSON.stringify(runtimeSnapshot);
        }
        if (typeof node.onload === 'function') {
          node.onload();
        }
      }
      return node;
    },
    removeChild(node: any) {
      const index = appendedNodes.indexOf(node);
      if (index >= 0) appendedNodes.splice(index, 1);
      node.parentNode = null;
      return node;
    },
  };

  return {
    appendedNodes,
    document: {
      documentElement: root,
      getElementById: (id: string) => appendedNodes.find((node) => node.id === id) || null,
      createElement: (_tagName: string) => ({
        id: '',
        type: '',
        textContent: '',
        src: '',
        parentNode: null,
        onload: undefined,
        onerror: undefined,
      }),
    } as unknown as Document,
  };
};

const buildOlderLiveConversationTurnsSnapshot = () => ({
  conversationTurns: [
    {
      id: 'turn-older-user',
      role: 'user',
      messages: [
        {
          id: 'message-older-user',
          author: { role: 'user' },
          content: { content_type: 'text', parts: ['Older user question'] },
        },
      ],
    },
    ...buildLiveConversationTurnsSnapshot().conversationTurns,
  ],
});

const createCollectorDocument = (runtimeSnapshot: unknown, initialScrollTop: number) => {
  const appendedNodes: any[] = [];
  const scrollContainer = { scrollTop: initialScrollTop };
  const root = {
    appendChild(node: any) {
      node.parentNode = root;
      appendedNodes.push(node);
      if (node.src === 'chrome-extension://fixture/js/runtime_full_thread_collector.bundle.js') {
        scrollContainer.scrollTop = 0;
        const resultNode = appendedNodes.find((candidate) => candidate.id === 'chatgpt-thread-exporter-runtime-snapshot');
        if (resultNode) {
          resultNode.textContent = JSON.stringify(runtimeSnapshot);
        }
        if (typeof node.onload === 'function') {
          node.onload();
        }
      }
      return node;
    },
    removeChild(node: any) {
      const index = appendedNodes.indexOf(node);
      if (index >= 0) appendedNodes.splice(index, 1);
      node.parentNode = null;
      return node;
    },
  };

  return {
    appendedNodes,
    scrollContainer,
    document: {
      documentElement: root,
      getElementById: (id: string) => appendedNodes.find((node) => node.id === id) || null,
      createElement: (_tagName: string) => ({
        id: '',
        type: '',
        textContent: '',
        src: '',
        parentNode: null,
        onload: undefined,
        onerror: undefined,
      }),
    } as unknown as Document,
  };
};

const createScrollContainerDocument = () => {
  const outerWrapper = {
    tagName: 'DIV',
    className: 'outer-wrapper',
    clientHeight: 765,
    scrollHeight: 765,
    scrollTop: 0,
    parentElement: null as any,
  };
  const scrollableAncestor = {
    tagName: 'DIV',
    className: 'actual-scroll-container',
    clientHeight: 765,
    scrollHeight: 13935,
    scrollTop: 13170,
    parentElement: outerWrapper,
  };
  const visibleOverflowAncestor = {
    tagName: 'DIV',
    className: 'wrong-visible-ancestor',
    clientHeight: 13795,
    scrollHeight: 13827,
    scrollTop: 0,
    parentElement: scrollableAncestor,
  };
  const firstTurn = {
    tagName: 'SECTION',
    className: 'turn',
    clientHeight: 0,
    scrollHeight: 0,
    scrollTop: 0,
    parentElement: visibleOverflowAncestor,
  };
  const doc = {
    querySelector: (selector: string) => selector === '[data-testid^="conversation-turn-"]' ? firstTurn : null,
    scrollingElement: {
      tagName: 'HTML',
      className: 'html-root',
      clientHeight: 765,
      scrollHeight: 765,
      scrollTop: 0,
    },
    documentElement: {
      tagName: 'HTML',
      className: 'html-root',
      clientHeight: 765,
      scrollHeight: 765,
      scrollTop: 0,
    },
    defaultView: {
      getComputedStyle: (element: any) => ({
        overflowY: element === scrollableAncestor ? 'auto' : 'visible',
      }),
    },
  };

  return { document: doc as unknown as Document, scrollableAncestor, visibleOverflowAncestor };
};

describe('ChatGPT export content script helper', () => {
  it('builds markdown from page html using stored export options', () => {
    const markdown = buildMarkdownFromPageHtml(buildSerializedHtml(), {
      includeToolOutputs: true,
      includeReasoningNodes: true,
    });

    expect(markdown).toContain('## User');
    expect(markdown).toContain('## Assistant');
    expect(markdown).toContain('#### Tool Output');
    expect(markdown).toContain('Final assistant answer');
  });

  it('falls back to a live runtime snapshot when shared html payloads are unavailable', () => {
    const markdown = buildMarkdownFromSources({
      html: '<html><body><main>live chat page</main></body></html>',
      runtimeSnapshot: {
        appState: {
          conversationStore: {
            current_node: 'assistant-final',
            mapping: {
              'user-node': {
                id: 'user-node',
                parent: null,
                message: {
                  author: { role: 'user' },
                  content: { content_type: 'text', parts: ['Live user question'] },
                },
              },
              'assistant-final': {
                id: 'assistant-final',
                parent: 'user-node',
                message: {
                  author: { role: 'assistant' },
                  content: { content_type: 'text', parts: ['Live assistant answer'] },
                },
              },
            },
          },
        },
      },
      options: {
        includeToolOutputs: true,
        includeReasoningNodes: true,
      },
    });

    expect(markdown).toContain('Live user question');
    expect(markdown).toContain('Live assistant answer');
  });

  it('builds markdown from live conversation turns when shared payloads are unavailable', () => {
    const markdown = buildMarkdownFromSources({
      html: '<html><body><main>live chat page</main></body></html>',
      runtimeSnapshot: buildLiveConversationTurnsSnapshot(),
      options: {
        includeToolOutputs: true,
        includeReasoningNodes: true,
      },
    });

    expect(markdown).toContain('## User');
    expect(markdown).toContain('Live user question');
    expect(markdown).toContain('#### Reasoning');
    expect(markdown).toContain('Reasoning trace');
    expect(markdown).toContain('#### Tool Output');
    expect(markdown).toContain('Search query output');
    expect(markdown).not.toContain('Internal web.run code payload');
    expect(markdown).toContain('Live assistant answer [1.1] and [1.2].');
    expect(markdown).toContain('#### Sources');
    expect(markdown).toContain('1.1. [Source A](https://example.com/a)');
    expect(markdown).toContain('1.2. [Source B](https://example.com/b)');
  });

  it('extracts live conversation turns from React props on rendered /c/ pages', () => {
    const snapshot = buildLiveConversationTurnsSnapshot();
    const turns = extractConversationTurnsFromDocument(createFakeConversationDocument(snapshot.conversationTurns));

    expect(turns).toHaveLength(2);
    expect(turns[0].role).toBe('user');
    expect(turns[0].messages[0].content.parts).toEqual(['Live user question']);
    expect(turns[1].role).toBe('assistant');
    expect(turns[1].messages.map((message) => message.content.content_type)).toEqual(['thoughts', 'text', 'code', 'text']);
    expect(turns[1].messages[3].metadata.content_references).toHaveLength(2);
  });

  it('injects a page-world runtime probe bundle to read live turns safely under CSP', async () => {
    const runtimeSnapshot = buildLiveConversationTurnsSnapshot();
    const probe = createProbeDocument(runtimeSnapshot);

    const extracted = await injectRuntimeSnapshotProbe(
      probe.document,
      'chrome-extension://fixture/js/runtime_snapshot_probe.bundle.js'
    );

    expect(extracted).toEqual(runtimeSnapshot);
    expect(probe.appendedNodes).toHaveLength(0);
  });

  it('identifies live conversation paths without matching shared threads', () => {
    expect(isLiveConversationPath('https://chatgpt.com/c/123')).toBe(true);
    expect(isLiveConversationPath('https://chatgpt.com/g/g-685202a600908191ab3bb5748df5f0b7-omniexpert-developer/c/69fbbd98-5398-83eb-819e-39483cb8425b')).toBe(true);
    expect(isLiveConversationPath('https://chatgpt.com/share/123')).toBe(false);
    expect(isLiveConversationPath('https://chatgpt.com/')).toBe(false);
  });

  it('injects a full-thread collector for live threads and restores scroll position', async () => {
    const runtimeSnapshot = buildOlderLiveConversationTurnsSnapshot();
    const collector = createCollectorDocument(runtimeSnapshot, 640);

    const extracted = await injectFullThreadCollector(
      collector.document,
      collector.scrollContainer,
      'chrome-extension://fixture/js/runtime_full_thread_collector.bundle.js'
    );

    expect(extracted).toEqual(runtimeSnapshot);
    expect(collector.scrollContainer.scrollTop).toBe(640);
    expect(collector.appendedNodes).toHaveLength(0);
  });

  it('prefers the actual overflow scroll container over larger visible ancestors', () => {
    const fixture = createScrollContainerDocument();

    const container = findConversationScrollContainer(fixture.document);

    expect(container).toBe(fixture.scrollableAncestor);
    expect(container).not.toBe(fixture.visibleOverflowAncestor);
  });
});
