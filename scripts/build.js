'use strict';

const webpack = require('webpack');
const path = require('path');
const fs = require('fs-extra');
const config = require('../webpack.config');

fs.emptyDirSync(path.join(__dirname, '../dist'));
fs.copySync(path.join(__dirname, '../public'), path.join(__dirname, '../dist'), {
  dereference: true,
});

webpack(config).run((err, stats) => {
  if (err) {
    throw err;
  }

  if (stats && stats.compilation && stats.compilation.errors.length > 0) {
    throw new Error(stats.compilation.errors.map((error) => error.message || error).join('\n'));
  }
});
