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
