/**
 * @jest-environment jsdom
 */
import { extractConversationTurnsFromNewDocument, extractExportNodesFromNewDocument } from './new_dom_turn_extractor';
import { ExportOptions } from './chatgpt_parser';

const buildDocument = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');

const turnHtml = (turnKey: string, userText?: string, assistantBlocks?: string[]): string => {
  const userSection = userText
    ? '<div data-user-message-bubble="true"><div>' + userText + '</div></div>'
    : '';
  const assistantSection = (assistantBlocks || [])
    .map((block) => '<div data-markdown-text-style="assistant-message">' + block + '</div>')
    .join('');
  return '<div data-turn-key="' + turnKey + '">' + userSection + assistantSection + '</div>';
};

const options: ExportOptions = { includeToolOutputs: true, includeReasoningNodes: true };

describe('extractConversationTurnsFromNewDocument', () => {
  it('returns empty array when no turn elements exist', () => {
    const doc = buildDocument('<html><body><p>No turns here</p></body></html>');
    expect(extractConversationTurnsFromNewDocument(doc)).toEqual([]);
  });

  it('extracts a user turn followed by an assistant turn', () => {
    const doc = buildDocument(
      '<html><body>' +
        turnHtml('t1', 'Hello agent') +
        turnHtml('t2', undefined, ['<p>First answer</p>']) +
        '</body></html>'
    );

    const turns = extractConversationTurnsFromNewDocument(doc);

    expect(turns.length).toBe(2);
    expect(turns[0].role).toBe('user');
    expect(turns[0].messages?.[0]?.content?.parts).toEqual(['Hello agent']);
    expect(turns[1].role).toBe('assistant');
    expect(turns[1].messages?.[0]?.content?.parts).toEqual(['First answer']);
  });

  it('merges multiple assistant markdown blocks of the same turn into one message', () => {
    const doc = buildDocument(
      '<html><body>' + turnHtml('t1', 'Q', ['<p>Part one</p>', '<p>Part two</p>']) + '</body></html>'
    );

    const turns = extractConversationTurnsFromNewDocument(doc);

    // One turn element groups the user prompt and the assistant work: user
    // first, then the assistant blocks merged into a single assistant turn.
    expect(turns.length).toBe(2);
    expect(turns[0].role).toBe('user');
    expect(turns[1].role).toBe('assistant');
    const parts = turns[1].messages?.[0]?.content?.parts || [];
    expect(parts.length).toBe(2);
    expect(parts[0]).toContain('Part one');
    expect(parts[1]).toContain('Part two');
  });

  it('keeps document order across interleaved turns', () => {
    const doc = buildDocument(
      '<html><body>' +
        turnHtml('t1', 'Q1', ['A1']) +
        turnHtml('t2', 'Q2', ['A2']) +
        '</body></html>'
    );

    const turns = extractConversationTurnsFromNewDocument(doc);

    expect(turns.map((turn) => turn.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });

  it('skips empty turns', () => {
    const doc = buildDocument('<html><body>' + turnHtml('t1') + '</body></html>');
    expect(extractConversationTurnsFromNewDocument(doc)).toEqual([]);
  });

  it('deduplicates turn keys when the same turn appears twice', () => {
    const html = turnHtml('t1', 'Only once');
    const doc = buildDocument('<html><body>' + html + html + '</body></html>');
    const turns = extractConversationTurnsFromNewDocument(doc);
    expect(turns.length).toBe(1);
  });
});

describe('extractExportNodesFromNewDocument', () => {
  it('renders user and assistant nodes through the shared parser', () => {
    const doc = buildDocument(
      '<html><body>' +
        turnHtml('t1', 'What is TS?') +
        turnHtml('t2', undefined, ['<p>TypeScript is a typed superset of JS.</p>']) +
        '</body></html>'
    );

    const nodes = extractExportNodesFromNewDocument(doc, options);

    expect(nodes.length).toBe(2);
    expect(nodes[0].kind).toBe('user');
    expect(nodes[0].content).toContain('What is TS?');
    expect(nodes[1].kind).toBe('assistant');
    expect(nodes[1].content).toContain('TypeScript is a typed superset');
  });

  it('drops reasoning-style collapsed labels from thinking summaries', () => {
    const doc = buildDocument(
      '<html><body>' +
        turnHtml('t1', 'Q', [
          '<p>Réfléchi pendant 2m 2s</p>',
          '<p>The actual answer body.</p>',
        ]) +
        '</body></html>'
    );

    const nodes = extractExportNodesFromNewDocument(doc, options);

    const contents = nodes.map((node) => node.content).join('\n');
    expect(contents).toContain('The actual answer body.');
    expect(contents).not.toContain('Réfléchi pendant');
  });
});