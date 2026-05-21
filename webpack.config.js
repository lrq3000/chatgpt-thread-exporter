const path = require('path');
const webpack = require('webpack');

module.exports = {
  mode: 'production',
  resolve: {
    extensions: ['.ts', '.js']
  },
  entry: {
    background_script: [path.join(__dirname, 'src/background_script')],
    content_script_export_chatgpt: [path.join(__dirname, 'src/content_script_export_chatgpt')],
    runtime_snapshot_probe: [path.join(__dirname, 'src/runtime_snapshot_probe')],
    runtime_full_thread_collector: [path.join(__dirname, 'src/runtime_full_thread_collector')],
    page_feedback: [path.join(__dirname, 'src/page_feedback')],
    options: [path.join(__dirname, 'src/options')]
  },
  output: {
    path: path.join(__dirname, 'dist/js'),
    filename: '[name].bundle.js'
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env': {
        NODE_ENV: JSON.stringify('production')
      }
    })
  ],
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: 'ts-loader',
        options: {
          transpileOnly: true
        }
      }
    ]
  }
};
