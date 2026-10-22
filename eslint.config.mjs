import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

/**
 * ESLint flat config. Next 16 ships native flat configs, so no FlatCompat
 * shim is needed (and FlatCompat crashes against these plugin objects).
 */
const config = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    /*
     * Working directories, not source. `.tmp-*` holds local verification artefacts (Chromium profiles,
     * captured screenshots, one-off CDP probes) and `.dev-pg` is a local PostgreSQL data directory.
     * Both are gitignored; linting a browser's own bundled JavaScript produces hundreds of findings that
     * have nothing to do with this project.
     */
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', '.tmp-*/**', '.dev-pg/**', '.codegraph/**'],
  },
  {
    rules: {
      '@next/next/no-img-element': 'off',
    },
  },
  {
    // Plain CommonJS Node scripts: `require` is the correct module system here,
    // and they are not part of the app bundle.
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { require: 'readonly', module: 'writable', process: 'readonly', console: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];

export default config;
