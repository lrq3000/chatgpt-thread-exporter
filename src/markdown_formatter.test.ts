import { formatConversationMarkdown } from './markdown_formatter';

describe('markdown formatter citations', () => {
  it('numbers citations per assistant response and appends a sources section', () => {
    const markdown = formatConversationMarkdown([
      {
        kind: 'assistant',
        title: 'Assistant',
        content: 'First claim @@CITATION_GROUP_0@@ and repeat @@CITATION_GROUP_1@@.',
        citations: [
          {
            placeholder: '@@CITATION_GROUP_0@@',
            sources: [
              { key: 'A|https://example.com/a||', name: 'Source A', url: 'https://example.com/a' },
              { key: 'B|https://example.com/b|3|3', name: 'Source B', url: 'https://example.com/b', lineRange: [3, 3] },
            ],
          },
          {
            placeholder: '@@CITATION_GROUP_1@@',
            sources: [
              { key: 'A|https://example.com/a||', name: 'Source A', url: 'https://example.com/a' },
            ],
          },
        ],
      },
      {
        kind: 'assistant',
        title: 'Assistant',
        content: 'Second response @@CITATION_GROUP_0@@.',
        citations: [
          {
            placeholder: '@@CITATION_GROUP_0@@',
            sources: [
              { key: 'C|https://example.com/c||', name: 'Source C', url: 'https://example.com/c' },
            ],
          },
        ],
      },
    ] as any);

    expect(markdown).toContain('First claim [1.1, 1.2] and repeat [1.1].');
    expect(markdown).toContain('#### Sources\n\n1.1. [Source A](https://example.com/a)\n1.2. [Source B](https://example.com/b), L3-L3');
    expect(markdown).toContain('Second response [2.1].');
    expect(markdown).toContain('2.1. [Source C](https://example.com/c)');
  });

  it('does not append a sources section when an assistant message has no citations', () => {
    const markdown = formatConversationMarkdown([
      { kind: 'assistant', title: 'Assistant', content: 'No citations here.' },
    ] as any);

    expect(markdown).toBe('## Assistant\n\nNo citations here.');
  });

  it('shares citation numbering across assistant subsections in the same response', () => {
    const markdown = formatConversationMarkdown([
      {
        kind: 'assistant',
        title: 'Assistant',
        content: 'Answer @@CITATION_GROUP_0@@.',
        citations: [
          {
            placeholder: '@@CITATION_GROUP_0@@',
            sources: [
              { key: 'A|https://example.com/a||', name: 'Source A', url: 'https://example.com/a' },
            ],
          },
        ],
      },
      {
        kind: 'tool',
        title: 'Tool Output',
        content: 'Tool used @@CITATION_GROUP_0@@ and @@CITATION_GROUP_1@@.',
        citations: [
          {
            placeholder: '@@CITATION_GROUP_0@@',
            sources: [
              { key: 'A|https://example.com/a||', name: 'Source A', url: 'https://example.com/a' },
            ],
          },
          {
            placeholder: '@@CITATION_GROUP_1@@',
            sources: [
              { key: 'B|https://example.com/b||', name: 'Source B', url: 'https://example.com/b' },
            ],
          },
        ],
      },
    ] as any);

    expect(markdown).toContain('Answer [1.1].');
    expect(markdown).toContain('Tool used [1.1] and [1.2].');
    expect(markdown).toContain('1.1. [Source A](https://example.com/a)');
    expect(markdown).toContain('1.2. [Source B](https://example.com/b)');
    expect(markdown.match(/#### Sources/g)).toHaveLength(1);
    expect(markdown.indexOf('Tool used [1.1] and [1.2].')).toBeLessThan(markdown.indexOf('#### Sources'));
  });

  it('flushes sources before the next user turn', () => {
    const markdown = formatConversationMarkdown([
      {
        kind: 'assistant',
        title: 'Assistant',
        content: 'Answer @@CITATION_GROUP_0@@.',
        citations: [
          {
            placeholder: '@@CITATION_GROUP_0@@',
            sources: [
              { key: 'A|https://example.com/a||', name: 'Source A', url: 'https://example.com/a' },
            ],
          },
        ],
      },
      {
        kind: 'user',
        title: 'User',
        content: 'Follow-up question',
      },
    ] as any);

    expect(markdown).toContain('Answer [1.1].');
    expect(markdown).toContain('#### Sources\n\n1.1. [Source A](https://example.com/a)');
    expect(markdown.indexOf('#### Sources')).toBeLessThan(markdown.indexOf('## User\n\nFollow-up question'));
  });
});
