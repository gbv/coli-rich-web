module.exports = {
  env: {
    es6: true,
    node: true,
    mocha: true,
    browser: true,
  },
  extends: [
    "gbv",
    "gbv/vue/3",
  ],
  parser: "@babel/eslint-parser",
  parserOptions: {
    requireConfigFile: false,
    babelOptions: {
      plugins: [
        "@babel/plugin-syntax-import-assertions",
      ],
    },
  },
}
