import * as fs from 'fs';
import * as path from 'path';

describe('public manifest icon declarations', () => {
  it('declares extension and action icons for the generated PNG assets', () => {
    const manifestPath = path.join(__dirname, '..', 'public', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // This locks the extension icon contract so asset refreshes do not leave
    // the published package without toolbar or listing icons.
    expect(manifest.icons).toEqual({
      16: 'icons/icon16.png',
      32: 'icons/icon32.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    });
    expect(manifest.action.default_icon).toEqual({
      16: 'icons/icon16.png',
      32: 'icons/icon32.png',
      48: 'icons/icon48.png',
    });
  });
});
