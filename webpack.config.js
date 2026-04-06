const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
  const isDev = argv.mode === 'development';

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
        ],
      }),
    ],
    devServer: {
      port: 3000,
      server: 'https',
      hot: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    },
    devtool: isDev ? 'source-map' : false,
  };
};
