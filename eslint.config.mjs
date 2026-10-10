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
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
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
