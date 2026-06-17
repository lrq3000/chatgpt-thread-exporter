# Project Memories

- This Chrome extension should minimize required permissions to the strictest minimal set necessary for it to work.
- Avoid permissions or implementation paths that can read unnecessary private information from the user outside the context of the currently selected tab that the user explicitly wants to copy.
- Treat Chrome Web Store permission sensitivity as a product constraint: prefer active-tab-scoped, user-initiated behavior over broad host, clipboard-read, background, or cross-tab access whenever possible.
