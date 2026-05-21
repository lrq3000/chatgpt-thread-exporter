const fs = require('node:fs');
const path = require('node:path');

describe('ChatGPT Thread Exporter scaffold', () => {
  it('defines a standalone extension manifest', () => {
    const manifestPath = path.join(__dirname, '..', 'public', 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
  });
});
