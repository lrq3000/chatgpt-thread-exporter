import { SharedConversationData } from './chatgpt_parser';

// The new chatgpt.com app shell (the "Work mode" UI) hard-loads thread pages
// without any embedded conversation data: it fetches the conversation itself
// from the same-origin backend API using a Bearer token minted by
// /api/auth/session. Reusing those endpoints from the content script keeps the
// extension permission-free (activeTab already covers the active tab) and
// layout-independent (identical on desktop and mobile viewports).

export type ConversationApiResult =
  | { ok: true; data: SharedConversationData }
  | { ok: false; error: string };

type SessionLike = {
  accessToken?: unknown;
  [key: string]: unknown;
};

const isConversationMapping = (value: unknown): value is SharedConversationData['mapping'] => {
  return !!value && typeof value === 'object' && !Array.isArray(value);
};

const isSharedConversationData = (value: unknown): value is SharedConversationData => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as SharedConversationData;
  return typeof candidate.current_node === 'string' && isConversationMapping(candidate.mapping);
};

// Matches live thread pages: /c/<id> and custom-GPT threads /g/<slug>/c/<id>.
// Share pages use a separate path handled by fetchSharedConversationViaApi.
export const isConversationPath = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'chatgpt.com' && parsed.hostname !== 'chat.openai.com') return false;
    return /^\/c\/[^/]+/.test(parsed.pathname) || /^\/g\/[^/]+\/c\/[^/]+/.test(parsed.pathname);
  } catch (_error) {
    return false;
  }
};

export const isSharePath = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'chatgpt.com' && parsed.hostname !== 'chat.openai.com') return false;
    return /^\/share\/[^/]+/.test(parsed.pathname);
  } catch (_error) {
    return false;
  }
};

export const extractConversationIdFromPath = (pathname: string): string | undefined => {
  const match = /^\/(?:g\/[^/]+\/)?c\/([^/?#]+)/.exec(pathname);
  if (!match) return undefined;
  // location.pathname keeps percent-encoding (e.g. local-chatgpt%3A<uuid> for
  // client-side branched threads); decode once so the id is sent to the API
  // exactly once-encoded as the server expects it.
  try {
    return decodeURIComponent(match[1]);
  } catch (_error) {
    return match[1];
  }
};

export const extractShareIdFromPath = (pathname: string): string | undefined => {
  const match = /^\/share\/([^/?#]+)/.exec(pathname);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch (_error) {
    return match[1];
  }
};

// Client-side branched threads get ids like "local-chatgpt:<uuid>"; they are
// not stored server-side, so both conversation endpoints answer 400 "Invalid
// conversation" for them. Skipping the API for these ids avoids two wasted
// requests and routes straight to the DOM fallback.
export const isClientSideConversationId = (conversationId: string): boolean => {
  return conversationId.indexOf(':') !== -1;
};

const fetchJson = async (url: string, init: RequestInit | undefined, fetchImpl: typeof fetch): Promise<unknown> => {
  const response = await fetchImpl(url, init);
  if (!response.ok) {
    throw new Error('ChatGPT backend request failed (' + response.status + ') for ' + url);
  }
  return response.json();
};

// The access token lives in the page's own auth session endpoint. When the
// viewer is logged out (anonymous share visits) the field is absent and the
// caller must fall back to another extraction path.
const fetchAccessToken = async (fetchImpl: typeof fetch): Promise<string> => {
  const session = (await fetchJson('/api/auth/session', { credentials: 'include' }, fetchImpl)) as SessionLike | null;
  if (!session || typeof session.accessToken !== 'string' || session.accessToken.length === 0) {
    throw new Error('No ChatGPT access token available; please log in to chatgpt.com.');
  }
  return session.accessToken;
};

const bearerHeaders = (accessToken: string): HeadersInit => ({
  Authorization: 'Bearer ' + accessToken,
});

export const fetchConversationViaApi = async ({
  conversationId,
  fetchImpl = fetch,
}: {
  conversationId: string;
  fetchImpl?: typeof fetch;
}): Promise<ConversationApiResult> => {
  if (isClientSideConversationId(conversationId)) {
    return {
      ok: false,
      error: 'This is a client-side branched thread; the ChatGPT conversation API does not store it.',
    };
  }
  try {
    const accessToken = await fetchAccessToken(fetchImpl);
    const data = await fetchJson(
      '/backend-api/conversation/' + encodeURIComponent(conversationId),
      { credentials: 'include', headers: bearerHeaders(accessToken) },
      fetchImpl
    );

    if (!isSharedConversationData(data)) {
      return { ok: false, error: 'The ChatGPT conversation API returned an unexpected payload.' };
    }
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Conversation API request failed.' };
  }
};

// Share endpoints serve the classic mapping/current_node payload at the top
// level of the response, so it feeds straight into the shared-conversation
// parser. Works for both chat and work share pages.
export const fetchSharedConversationViaApi = async ({
  shareId,
  fetchImpl = fetch,
}: {
  shareId: string;
  fetchImpl?: typeof fetch;
}): Promise<ConversationApiResult> => {
  try {
    const accessToken = await fetchAccessToken(fetchImpl);
    const data = await fetchJson(
      '/backend-api/share/' + encodeURIComponent(shareId),
      { credentials: 'include', headers: bearerHeaders(accessToken) },
      fetchImpl
    );

    if (!isSharedConversationData(data)) {
      return { ok: false, error: 'The ChatGPT share API returned an unexpected payload.' };
    }
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Share API request failed.' };
  }
};