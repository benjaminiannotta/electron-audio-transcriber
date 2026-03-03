module.exports = {
  root: true,
  env: {
    node: true,
    es2023: true,
    jest: true
  },
  parserOptions: {
    ecmaVersion: 'latest'
  },
  extends: ['eslint:recommended'],
  rules: {
    'no-console': 'off'
  },
  overrides: [
    {
      files: ['src/renderer/**/*.js'],
      env: {
        browser: true,
        node: false
      }
    }
  ]
};
