const webpack = require('webpack');
const config = require('../webpack.config');

describe('ChatGPT Thread Exporter content bundle', () => {
  it('does not bundle Domino into the injected export script', (done) => {
    const inspectedAssets = {};
    const webpackConfig = {
      ...config,
      plugins: [
        ...(config.plugins || []),
        {
          apply(compiler) {
            compiler.hooks.thisCompilation.tap('InspectExportScriptAssets', (compilation) => {
              compilation.hooks.processAssets.tap(
                {
                  name: 'InspectExportScriptAssets',
                  stage: webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT,
                },
                (assets) => {
                  for (const [name, source] of Object.entries(assets)) {
                    if (name === 'content_script_export_chatgpt.bundle.js') {
                      inspectedAssets[name] = source.source().toString();
                    }
                  }
                }
              );
            });
            compiler.hooks.shouldEmit.tap('InspectExportScriptAssets', () => false);
          },
        },
      ],
    };

    webpack(webpackConfig, (err, stats) => {
      if (err) {
        done(err);
        return;
      }

      const info = stats.toJson({all: false, errors: true});
      if (info.errors && info.errors.length) {
        done(new Error(info.errors.map((error) => error.message || error).join('\n')));
        return;
      }

      const selectionBundle = inspectedAssets['content_script_export_chatgpt.bundle.js'];
      expect(selectionBundle).toBeDefined();
      expect(selectionBundle).toContain('buildMarkdownFromPageHtml');
      expect(selectionBundle).not.toContain('@mixmark-io/domino');
      done();
    });
  }, 30000);
});
