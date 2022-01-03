module.exports = {
  entry: {
    web: __dirname + '/assets/steepless.jsx',
  },
  output: {
    path: __dirname + '/assets',
    name: 'steepless.js',
  },
  options: {
    minify: true,
  },
};
