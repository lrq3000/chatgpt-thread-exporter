# Work Mode Thread Export — Design

Date: 2026-09-28
Status: Approved by user (Approach A primary + B fallback)

## Problem

OpenAI migrated chatgpt.com to a new app shell ("Work mode", Codex-derived UI).
The old live-thread extraction relied on DOM elements with
`data-testid^="conversation-turn-"` and React fiber `turn` objects; those markers
are gone from the new UI for both Work mode AND Chat mode threads rendered in the
new shell. The extension therefore fails to export live threads on the new UI.

## Verified facts (browser probes, 2026-09-28)

- New UI markers: `[data-turn-key]` (one per turn), `[data-user-message-bubble]`,
  `[data-markdown-text-style="assistant-message"]`, `.codex-toast-area`,
  `#app-shell-sidebar`. Zero `conversation-turn-` testids remain.
- Hard-loaded thread pages embed conversation data in React Router turbo-stream
  inline scripts (`streamController.enqueue("P10:...")`, global reference-graph
  table, `["P", n]` promise markers resolved by later chunks). Work threads carry
  a linear `messages[]` model (`content_type: text|thoughts|reasoning_recap`,
  `parent_id` in metadata); chat threads in the new shell hard-load *without*
  conversation payload (fetched via XHR after load).
- SPA navigation leaves stale enqueue scripts; `window.__reactRouterContext.state`
  is emptied after hydration. Inline-script parsing is therefore unreliable.
- Both modes' pages fetch the conversation themselves via
  `GET /backend-api/conversations/{id}?num_turns=10` with
  `Authorization: Bearer <accessToken>` where the token comes from
  `GET /api/auth/session` (same-origin, session cookies, no extra permissions).
- `GET /backend-api/conversation/{id}` (singular) returns the exact classic
  `mapping` + `current_node` tree format the existing parser already consumes.
- `GET /backend-api/share/{shareId}` returns the classic format at top level
  (mapping/current_node/linear_conversation) for both chat and work shares;
  the old `routes/share.$shareId` HTML stream format is gone from new-shell pages.
- The API path is layout-independent, so it covers desktop and mobile viewports.

## Approach

### A. Conversation API extraction (primary path)

New module `src/conversation_api.ts`:

- `isConversationPath(url)`: matches `/c/<id>` and `/g/<slug>/c/<id>` (replaces the
  old test in the content script; share pages handled separately).
- `fetchConversationViaApi({ conversationId, fetchImpl })`:
  1. `GET /api/auth/session` → `accessToken` (throws a specific error if absent,
     e.g. logged out).
  2. `GET /backend-api/conversation/{conversationId}` with the Bearer token.
  3. Validates `mapping` + `current_node` and returns it as
     `SharedConversationData`.
- Failure returns a typed result so the caller can fall back.

### B. DOM extraction from new turn elements (fallback path)

New module `src/new_dom_turn_extractor.ts`:

- Enumerates `[data-turn-key]` elements in document order.
- Within each turn:
  - user content: `[data-user-message-bubble]` text (innerText-ish via
    textContent + block-aware joins).
  - assistant content: `[data-markdown-text-style="assistant-message"]` blocks.
- Returns `ConversationTurn[]` (user / assistant) with no citations (DOM has no
  citation metadata; that's an accepted limitation of the fallback).
- Reasoning summaries are skipped in the fallback (UI shows "Réfléchi pendant…"
  collapsed text only).

### Pipeline wiring

`runThreadExport` order (each step falls back to the next on failure):

1. **Share pages** (`/share/<id>`): API `GET /backend-api/share/{shareId}`
   (classic format) → existing HTML stream parser (old share format still
   supported for cached/old pages).
2. **Live threads** (`/c/<id>`, `/g/…/c/<id>`): API `GET /backend-api/conversation/{id}`
   → DOM extractor (B) → runtime full-thread collector (old UI fallback, kept
   for old-UI rollouts) → HTML stream parser.
3. Same `buildMarkdownFromSources` renderer as before.

### Testing

- Jest unit tests for both new modules (fetch mocks, malformed payloads, DOM fixtures).
- Existing suite must stay green (no regressions).
- E2E via browser-controller on real pages:
  - work live thread `/c/6ab882f1-…` (A and B)
  - chat live thread `/c/6ab87daf-…` (A)
  - share chat `/share/6ab9a2cc-…` (A share path)
  - share work `/share/6ab9a370-…` (A share path)

### Permissions

No manifest changes: the content script already runs in the active tab (activeTab
+ scripting), and the fetches are same-origin page-context requests.