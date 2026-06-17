const fs = require('node:fs');
const path = require('node:path');

describe('ChatGPT Thread Exporter scaffold', () => {
  it('defines a standalone extension manifest', () => {
    const manifestPath = path.join(__dirname, '..', 'public', 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
  });

  it('uses activeTab instead of persistent host permissions', () => {
    const manifestPath = path.join(__dirname, '..', 'public', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    expect(manifest.permissions).toEqual(expect.arrayContaining(['activeTab', 'scripting']));
    expect(manifest).not.toHaveProperty('host_permissions');
  });

  it('does not request clipboard readback or offscreen document permissions', () => {
    const manifestPath = path.join(__dirname, '..', 'public', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // Chrome Web Store users see permission prompts as a privacy contract. This
    // extension only needs to write the export chosen from the active tab; it
    // must not ask for APIs that can inspect clipboard contents or hidden pages.
    expect(manifest.permissions).not.toEqual(expect.arrayContaining(['clipboardRead', 'offscreen']));
  });

  it('keeps web accessible resources scoped to ChatGPT pages', () => {
    const manifestPath = path.join(__dirname, '..', 'public', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    expect(manifest.web_accessible_resources).toEqual([
      expect.objectContaining({
        matches: ['https://chatgpt.com/*'],
      }),
    ]);
  });
});
