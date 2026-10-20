export default [{
  files: ['src/web/**/*.{js,jsx}', 'docs/assets/parameter-geometry-model.js', 'docs/assets/parameter-geometry-view.js', 'docs/assets/parameter-geometry-3d-source.js'],
  ignores: ['src/web/app.bundle.js'],
  languageOptions: {
    ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } },
    globals: Object.fromEntries([
      'window', 'document', 'navigator', 'location', 'localStorage', 'getComputedStyle', 'fetch', 'WebSocket',
      'URL', 'URLSearchParams', 'Blob', 'FileReader', 'FormData', 'AbortController',
      'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame',
      'cancelAnimationFrame', 'performance', 'console', 'Event', 'CustomEvent', 'DOMPoint', 'HTMLElement', 'ResizeObserver',
    ].map(name => [name, 'readonly'])),
  },
  rules: {
    'no-undef': 'error',
    'no-use-before-define': ['error', { functions: false, classes: true, variables: false }],
    'no-unreachable': 'error',
    'no-constant-condition': ['error', { checkLoops: false }],
  },
}];
