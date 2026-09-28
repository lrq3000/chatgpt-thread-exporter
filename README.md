# ChatGPT Thread Exporter

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-4285F4?logo=chromewebstore&logoColor=white)](https://chromewebstore.google.com/detail/chatgpt-thread-exporter/jacjjihjaeoligdoojcooomoafbmlbhn)
[![ChatGPT](https://custom-icon-badges.demolab.com/badge/ChatGPT-74aa9c?logo=openai&logoColor=white)](#)

**Instant export of full ChatGPT threads as markdown, with sources and thinking traces.**

A Chrome extension that copies the whole content of a ChatGPT thread as Markdown without relying on text selection.

It is designed specifically for ChatGPT pages as they are dynamically mounted since May 2026 and hence cannot be copied with CTRL+A. Unlike generic selection-based exporters, this extension reads ChatGPT's conversation data model directly.

It includes user messages, assistant messages, sources and links (numbered and recapped at the end of each turn -- multiple sources for a single sentence are all extracted correctly), and optionally: tool or connector outputs, and reasoning or recap nodes.

Both private and shared threads can be exported, in both **Chat mode** and the new **Work mode** UI.

To copy just a selection as markdown on any web page, see [copy-as-markdown](https://github.com/lrq3000/copy-as-markdown).

### How extraction works

OpenAI migrated chatgpt.com to a new app shell (the "Work mode" UI), which removed
the old DOM markers and embedded conversation data the extension used to read.
Since v0.1.7, the extension reads the conversation through ChatGPT's own backend
API, using the access token of your currently logged-in session, with layered
fallbacks so one broken path never blocks an export:

1. **Conversation API (primary path).** The content script requests the session
   token from `/api/auth/session`, then fetches the whole thread from
   `/backend-api/conversation/{id}` (live threads) or `/backend-api/share/{id}`
   (shared public threads). Both endpoints return the complete conversation in
   the format the extension parses best, including citation metadata, tool
   outputs and reasoning nodes. This path never depends on the page layout, so
   it works the same on desktop and on narrow/mobile layouts, and it keeps
   working after in-app navigation (no page reload needed).
2. **New-shell DOM fallback.** If the API is unavailable (e.g. logged out), the
   extension reads the rendered turns directly from the new UI markers
   (`data-turn-key` turns, user bubbles and assistant markdown blocks).
   Content is fully exported, but citations are not available this way because
   the DOM does not carry the citation metadata.
3. **Legacy paths.** The old extraction paths are kept for pages still served
   with the previous UI or old share-page payloads.

All requests are same-origin requests made inside the tab you are exporting:
the extension requests no additional permissions and never reads anything
outside the thread you asked for.

## Install

## Install

* [Chrome WebStore](https://chromewebstore.google.com/detail/chatgpt-thread-exporter/jacjjihjaeoligdoojcooomoafbmlbhn)

* Or download the latest developer release in the [GitHub Releases](https://github.com/lrq3000/chatgpt-thread-exporter/releases/) page, download the zip file, unzip it somewhere, and install as an unpacked extension:

1. Clone or download this repository.
2. Build the extension with the instructions in the Build section below.
3. Open `chrome://extensions/` in Chrome or Chromium.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the `ChatGPT Thread Exporter/dist/` folder.

You can also package it as a CRX or zip for local distribution. See the CRX subsection in Build. However, note that even signed CRX files that are not hosted on the Chrome WebStore are now disabled forcefully since Chrome forcefully migrated to MV3 in 2025.

## Usage

1. Open a ChatGPT thread on `https://chatgpt.com/`.
2. Either scroll all the way up to force load all messages, or create a shareable link and open it (all messages are loaded at once in a shareable link).
3. Click the **ChatGPT Thread Exporter** toolbar icon.
4. The extension extracts the whole thread and copies the resulting Markdown to the clipboard.
5. A toast appears in the page to confirm success or to show an error.

### What gets exported by default

- user messages
- assistant messages
- sources (they get placed at the end of each turn in a #### Sources subsection, and they are numbered by each turn so they can be easily cited)
- tool or connector outputs
- reasoning and recap nodes

Tool and reasoning nodes are grouped beneath the nearest assistant response using fourth-level Markdown headings such as:

```md
## Assistant

Main assistant response

#### Tool Output

...

#### Reasoning

...
```

### Options

The extension exposes an options page with two toggles:

- **Include tool and connector outputs**
- **Include reasoning and recap nodes**

Both are enabled by default.

To open the options page:

1. Open `chrome://extensions/`
2. Find **ChatGPT Thread Exporter**
3. Click **Details**
4. Click **Extension options**

## Build

First install Node.js.

Then install dependencies from inside the `ChatGPT Thread Exporter/` folder:

```bash
npm install
```

To run the test suite:

```bash
npm test
```

To build the unpacked extension bundle:

```bash
npm run build
```

This creates the `dist/` folder that you can load as an unpacked extension.

## Build A CRX

To generate a CRX and a zip package from the already-built `dist/` folder:

```bash
npm run build:crx
```

This uses `crx3` and creates default output files beside the extension folder based on the `dist/` directory name. In practice you should get files such as:

- `dist.pem`
- `dist.crx`
- `dist.zip`

If you want a stable extension ID across rebuilds, keep and reuse a private key file. For example:

```bash
npx crx3 -p dist.pem -o chatgpt-thread-exporter.crx -z chatgpt-thread-exporter.zip -- dist/
```

With the current `crx3` CLI, the fully explicit default-output form is:

```bash
npx crx3 -p -o -z -- dist/
```

If you do not provide a key, `crx3` can generate one for local packaging, but the extension ID may change between builds.

## Notes

- Shared ChatGPT pages (chat and work) are supported through the share API, with
  the old embedded-payload parser kept as a fallback for legacy pages.
- Live logged-in threads (chat and work) are supported through the conversation
  API, with new-shell DOM and legacy runtime extraction as fallbacks.
- If ChatGPT changes its internal client data structures substantially, this
  extension may need to be updated.

## Known limitations

- Images are not exported.
- Attached documents are not exported either (not only those that are only linked but also text/markdown documents that are displayed inline -- always double check your exports, or instruct the agent to always inline all responses and never make an attached document, or ask the agent to inline the files content before export).

## Similar tools

As of 24th May 2026, here are similar export tools that still work:
* [ChatGPT-Backup](https://github.com/FredySandoval/ChatGPT-CHROME_EXTENSION)

## Author

Stephen Karl Larroque with agentic coding (see commits for exact harness and model version).

## License

Licensed under the MIT license.
