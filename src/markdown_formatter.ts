import { CitationSource, ExportNode } from './chatgpt_parser';

const formatLineRange = (lineRange: [number, number] | number[] | undefined): string => {
  if (!Array.isArray(lineRange) || lineRange.length < 2) return '';
  return ', L' + lineRange[0] + '-L' + lineRange[1];
};

const formatSourceLabel = (source: CitationSource): string => {
  const label = source.url ? '[' + source.name + '](' + source.url + ')' : source.name;
  return label + formatLineRange(source.lineRange);
};

type AssistantCitationState = {
  numbering: Map<string, string>;
  bibliography: string[];
  nextIndex: number;
};

const createAssistantCitationState = (): AssistantCitationState => ({
  numbering: new Map<string, string>(),
  bibliography: [],
  nextIndex: 1,
});

const applyAssistantCitationNumbering = (
  content: string,
  citations: ExportNode['citations'],
  assistantNumber: number,
  state: AssistantCitationState
): { content: string } => {
  if (!citations || citations.length === 0) return { content };

  let rendered = content;

  for (const citationGroup of citations) {
    const labels = citationGroup.sources.map((source) => {
      const existingNumber = state.numbering.get(source.key);
      if (existingNumber) return existingNumber;

      const number = assistantNumber + '.' + state.nextIndex;
      state.nextIndex += 1;
      state.numbering.set(source.key, number);
      state.bibliography.push(number + '. ' + formatSourceLabel(source));
      return number;
    });

    rendered = rendered.split(citationGroup.placeholder).join('[' + labels.join(', ') + ']');
  }

  return {
    content: rendered,
  };
};

export const formatConversationMarkdown = (nodes: ExportNode[]): string => {
  const sections: string[] = [];
  let currentAssistantIndex = -1;
  let assistantCount = 0;
  let currentAssistantState: AssistantCitationState | undefined;

  const flushCurrentAssistantSources = (): void => {
    // Citation numbering is scoped to one assistant response. When we leave the
    // current assistant block (for a user turn, a new assistant turn, or EOF),
    // we must persist the gathered bibliography before resetting that scope.
    if (currentAssistantIndex >= 0 && currentAssistantState && currentAssistantState.bibliography.length > 0) {
      sections[currentAssistantIndex] += '\n\n#### Sources\n\n' + currentAssistantState.bibliography.join('\n');
    }
  };

  for (const node of nodes) {
    if (node.kind === 'user') {
      flushCurrentAssistantSources();
      sections.push('## User\n\n' + node.content);
      currentAssistantIndex = -1;
      currentAssistantState = undefined;
      continue;
    }

    if (node.kind === 'assistant') {
      flushCurrentAssistantSources();

      assistantCount += 1;
      currentAssistantState = createAssistantCitationState();
      const renderedAssistant = applyAssistantCitationNumbering(node.content, node.citations, assistantCount, currentAssistantState);
      const assistantSection = '## Assistant\n\n' + renderedAssistant.content;
      sections.push(assistantSection);
      currentAssistantIndex = sections.length - 1;
      continue;
    }

    let subsectionContent = node.content;
    if (currentAssistantIndex >= 0 && currentAssistantState) {
      const renderedSubsection = applyAssistantCitationNumbering(node.content, node.citations, assistantCount, currentAssistantState);
      subsectionContent = renderedSubsection.content;
    }

    const subsection = '#### ' + node.title + '\n\n' + subsectionContent;
    if (currentAssistantIndex >= 0) {
      sections[currentAssistantIndex] += '\n\n' + subsection;
    } else {
      sections.push(subsection);
    }
  }

  flushCurrentAssistantSources();

  return sections.join('\n\n');
};
