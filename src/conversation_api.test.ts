import { isConversationPath, fetchConversationViaApi } from './conversation_api';

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