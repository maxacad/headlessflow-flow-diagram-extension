const path = require('path');

const tsRule = (configFile) => ({
  test: /\.tsx?$/,
  use: [
    {
      loader: 'ts-loader',
      options: {
        configFile,
        transpileOnly: true,
      },
    },
  ],
  exclude: /node_modules/,
});

const cache = (name) => ({
  type: 'filesystem',
  name,
  buildDependencies: {
    config: [__filename],
  },
});

/** @type {import('webpack').Configuration[]} */
module.exports = [
  // ── Extension (Node.js target) ──────────────────────────────────
  {
    name: 'extension',
    target: 'node',
    entry: './src/extension.ts',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'extension.js',
      libraryTarget: 'commonjs2',
    },
    cache: cache('extension'),
    externals: {
      vscode: 'commonjs vscode',
      bufferutil: 'commonjs bufferutil',
      'utf-8-validate': 'commonjs utf-8-validate',
    },
    resolve: {
      extensions: ['.ts', '.js'],
    },
    module: {
      rules: [
        tsRule('tsconfig.json'),
      ],
    },
  },

  // ── Webview (Browser target) ────────────────────────────────────
  {
    name: 'webview',
    target: 'web',
    entry: './webview-src/index.tsx',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'webview.js',
    },
    cache: cache('webview'),
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
    },
    module: {
      rules: [
        tsRule('tsconfig.webview.json'),
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
  },

  // ── Node Detail Webview (Browser target) ────────────────────────
  {
    name: 'nodeDetail',
    target: 'web',
    entry: './webview-src/nodeDetail/index.tsx',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'nodeDetail.js',
    },
    cache: cache('nodeDetail'),
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
    },
    module: {
      rules: [
        tsRule('tsconfig.webview.json'),
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
  },

  // ── Web Form Editor Webview (Browser target) ─────────────────────────────
  {
    name: 'webform',
    target: 'web',
    entry: './webview-src/webform/index.tsx',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'webform.js',
    },
    cache: cache('webform'),
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
    },
    module: {
      rules: [
        tsRule('tsconfig.webview.json'),
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
  },
];
