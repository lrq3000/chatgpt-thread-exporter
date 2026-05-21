type ScrollContainerLike = {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
  parentElement?: ScrollContainerLike | null;
};

type ScrollDocumentLike = Pick<Document, 'querySelector' | 'scrollingElement' | 'documentElement' | 'defaultView'>;

const isScrollableOverflow = (overflowY: string | undefined): boolean => {
  return overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
};

export const findConversationScrollContainer = (documentLike: ScrollDocumentLike): ScrollContainerLike => {
  const firstTurn = documentLike.querySelector('[data-testid^="conversation-turn-"]') as ScrollContainerLike | null;
  let currentElement = firstTurn;

  while (currentElement && currentElement.parentElement) {
    const overflowY = documentLike.defaultView && typeof documentLike.defaultView.getComputedStyle === 'function'
      ? documentLike.defaultView.getComputedStyle(currentElement as unknown as Element).overflowY
      : undefined;

    if (isScrollableOverflow(overflowY) && currentElement.scrollHeight > currentElement.clientHeight + 8) {
      return currentElement;
    }

    currentElement = currentElement.parentElement;
  }

  return (documentLike.scrollingElement || documentLike.documentElement) as unknown as ScrollContainerLike;
};
