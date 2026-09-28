import { isConversationPath, fetchConversationViaApi, extractConversationIdFromPath, extractShareIdFromPath, isClientSideConversationId } from './conversation_api';

type FetchResponseLike = { ok: boolean; status: number; json: () => Promise<any> };

const jsonResponse = (body: any, ok = true, status = 200): FetchResponseLike => ({
  ok,
  status,
  json: () => Promise.resolve(body),
});

const sessionPayload = { accessToken: 'token-abc', user: { id: 'u1' } };

const validConversation = {
  title: 'My thread',
  mapping: {
    root: { id: 'root', parent: null, children: ['a'] },
    a: { id: 'a', parent: 'root', message: { id: 'a', author: { role: 'user' }, content: { content_type: 'text', parts: ['Hello there'] } } },
  },
  current_node: 'a',
};

describe('isConversationPath', () => {
  it('matches plain /c/<id> paths', () => {
    expect(isConversationPath('https://chatgpt.com/c/6ab882f1-bae8-83eb-905c-54e5bb6b18e3')).toBe(true);
  });

  it('matches /g/<slug>/c/<id> paths', () => {
    expect(isConversationPath('https://chatgpt.com/g/g-p-1234/c/6ab882f1-bae8-83eb-905c-54e5bb6b18e3')).toBe(true);
  });

  it('does not match share pages or other paths', () => {
    expect(isConversationPath('https://chatgpt.com/share/6ab9a2cc-87f8-83eb-ae3f-8ea9d709e259')).toBe(false);
    expect(isConversationPath('https://chatgpt.com/')).toBe(false);
    expect(isConversationPath('https://example.com/c/abc')).toBe(false);
  });

  it('extracts conversation ids from encoded and plain pathnames', () => {
    // location.pathname keeps percent-encoding; the id must come out decoded.
    expect(extractConversationIdFromPath('/c/6ab882f1-bae8-83eb-905c-54e5bb6b18e3')).toBe('6ab882f1-bae8-83eb-905c-54e5bb6b18e3');
    expect(extractConversationIdFromPath('/g/g-p-1234/c/6ab882f1-bae8-83eb-905c-54e5bb6b18e3')).toBe('6ab882f1-bae8-83eb-905c-54e5bb6b18e3');
    expect(extractConversationIdFromPath('/g/g-p-1234/c/local-chatgpt%3A5ff271d7-ed2e-4122-952d-bc3771d498a4')).toBe('local-chatgpt:5ff271d7-ed2e-4122-952d-bc3771d498a4');
    expect(extractConversationIdFromPath('/c/local-chatgpt:5ff271d7-ed2e-4122-952d-bc3771d498a4')).toBe('local-chatgpt:5ff271d7-ed2e-4122-952d-bc3771d498a4');
    expect(extractConversationIdFromPath('/')).toBeUndefined();
  });

  it('extracts share ids from encoded pathnames', () => {
    expect(extractShareIdFromPath('/share/6ab9a2cc-87f8-83eb-ae3f-8ea9d709e259')).toBe('6ab9a2cc-87f8-83eb-ae3f-8ea9d709e259');
    expect(extractShareIdFromPath('/share/local%3Aabc')).toBe('local:abc');
    expect(extractShareIdFromPath('/')).toBeUndefined();
  });
});

describe('client-side thread ids', () => {
  // Client-side branched threads ("local-chatgpt:" ids) are not stored on the
  // backend: both conversation endpoints answer 400 "Invalid conversation" for
  // them, so the API path must not be attempted and the DOM fallback should
  // take over immediately.
  it('detects client-side ids', () => {
    expect(isClientSideConversationId('local-chatgpt:5ff271d7-ed2e-4122-952d-bc3771d498a4')).toBe(true);
    expect(isClientSideConversationId('6ab9eb79-1f48-83ed-af3d-7f8315ce7ccc')).toBe(false);
  });

  it('fails fast for client-side ids without any network call', async () => {
    const fetchImpl = jest.fn();
    const result = await fetchConversationViaApi({
      conversationId: 'local-chatgpt:5ff271d7-ed2e-4122-952d-bc3771d498a4',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/client-side/i);
  });
});

describe('fetchConversationViaApi', () => {
  it('fetches the session then the conversation with the bearer token', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = jest.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.indexOf('/api/auth/session') !== -1) return Promise.resolve(jsonResponse(sessionPayload));
      return Promise.resolve(jsonResponse(validConversation));
    });

    const result = await fetchConversationViaApi({
      conversationId: 'conv-1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(calls.length).toBe(2);
    expect(calls[0].url).toContain('/api/auth/session');
    expect(calls[1].url).toContain('/backend-api/conversation/conv-1');
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe('Bearer token-abc');
    expect(result.ok).toBe(true);
    expect(result.data?.current_node).toBe('a');
    expect(result.data?.mapping.a.message?.content?.parts).toEqual(['Hello there']);
  });

  it('returns a failure when the session has no access token', async () => {
    const fetchImpl = jest.fn(() => Promise.resolve(jsonResponse({ accessToken: null, user: null })));
    const result = await fetchConversationViaApi({ conversationId: 'conv-1', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns a failure when the conversation response is not ok', async () => {
    const fetchImpl = jest.fn((url: string) => {
      if (url.indexOf('/api/auth/session') !== -1) return Promise.resolve(jsonResponse(sessionPayload));
      return Promise.resolve(jsonResponse({ detail: 'nope' }, false, 404));
    });
    const result = await fetchConversationViaApi({ conversationId: 'conv-1', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns a failure when the payload lacks mapping or current_node', async () => {
    const fetchImpl = jest.fn((url: string) => {
      if (url.indexOf('/api/auth/session') !== -1) return Promise.resolve(jsonResponse(sessionPayload));
      return Promise.resolve(jsonResponse({ title: 'Broken', mapping: { a: {} } }));
    });
    const result = await fetchConversationViaApi({ conversationId: 'conv-1', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.ok).toBe(false);
  });

  it('propagates network errors as failures', async () => {
    const fetchImpl = jest.fn(() => Promise.reject(new Error('offline')));
    const result = await fetchConversationViaApi({ conversationId: 'conv-1', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.ok).toBe(false);
  });
});

describe('fetchSharedConversationViaApi', () => {
  it('fetches the share payload and unwraps the classic format', async () => {
    const sharePayload = { ...validConversation, og_title: 'Découvrez cette discussion' };
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = jest.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.indexOf('/api/auth/session') !== -1) return Promise.resolve(jsonResponse(sessionPayload));
      return Promise.resolve(jsonResponse(sharePayload));
    });

    const { fetchSharedConversationViaApi } = jest.requireActual('./conversation_api');
    const result = await fetchSharedConversationViaApi({ shareId: 'share-1', fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(calls.length).toBe(2);
    expect(calls[1].url).toContain('/backend-api/share/share-1');
    expect(result.ok).toBe(true);
    expect(result.data?.current_node).toBe('a');
  });
});