export default [{
  files: ['src/web/*.js'],
  ignores: ['src/web/app.bundle.js'],
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
  rules: {
    'no-use-before-define': ['error', { functions: false, classes: true, variables: false }],
    'no-unreachable': 'error',
    'no-constant-condition': ['error', { checkLoops: false }],
  },
}];
