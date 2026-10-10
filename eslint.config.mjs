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
];

export default config;
