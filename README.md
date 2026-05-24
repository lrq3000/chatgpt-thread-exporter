# ChatGPT Thread Exporter

A Chrome extension that copies the whole content of a ChatGPT thread as Markdown without relying on text selection.

It is designed specifically for ChatGPT pages as they are dynamically mounted and hence cannot be copied with CTRL+A. Unlike generic selection-based exporters, this extension reads ChatGPT's conversation data model directly.çç

It includes user messages, assistant messages, sources (numbered and recapped at the end of each turn -- multiple sources for a single sentence are all extracted correctly), and optionally: tool or connector outputs, and reasoning or recap nodes.

To copy just a selection as markdown on any web page, see [copy-as-markdown](https://github.com/lrq3000/copy-as-markdown).

## Install

There is no Chrome Web Store release yet.

For now, install it as an unpacked extension:

1. Clone or download this repository.
2. Build the extension with the instructions in the Build section below.
3. Open `chrome://extensions/` in Chrome or Chromium.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the `ChatGPT Thread Exporter/dist/` folder.

You can also package it as a CRX or zip for local distribution. See the CRX subsection in Build.

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

- Shared ChatGPT pages are supported through embedded serialized conversation data.
- Live logged-in ChatGPT pages are supported through runtime snapshot extraction paths.
- If ChatGPT changes its internal client data structures substantially, this extension may need to be updated.

## Author

Stephen Karl Larroque with agentic coding (see commits for exact harness and model version).

## License

Licensed under the MIT license.
