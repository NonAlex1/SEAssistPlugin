const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const devCerts = require('office-addin-dev-certs');

module.exports = async (env, argv) => {
  const isDev = argv.mode === 'development';
  // Only load dev certs when running the dev server — avoids failure in CI
  const httpsOptions = isDev ? await devCerts.getHttpsServerOptions() : {};

  return {
    entry: {
      taskpane: './src/taskpane/taskpane.tsx',
      commands: './src/commands/commands.ts',
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true,
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js'],
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        filename: 'taskpane.html',
        template: './src/taskpane/taskpane.html',
        chunks: ['taskpane'],
      }),
      new HtmlWebpackPlugin({
        filename: 'commands.html',
        template: './src/commands/commands.html',
        chunks: ['commands'],
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: 'assets', to: 'assets', noErrorOnMissing: true },
          // Deploy production manifest to GitHub Pages so Outlook receives
          // application/xml content-type instead of raw.githubusercontent.com's text/plain
          { from: 'manifest.prod.xml', to: 'manifest.xml' },
        ],
      }),
    ],
    devServer: {
      port: 3000,
      server: {
        type: 'https',
        options: httpsOptions,
      },
      hot: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    },
    devtool: isDev ? 'source-map' : false,
  };
};
