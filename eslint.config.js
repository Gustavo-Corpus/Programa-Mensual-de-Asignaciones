import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    // `embedded.ts` es un archivo generado de ~330 KB de base64: analizarlo no
    // aporta nada y ralentiza cada ejecución.
    ignores: [
      'dist/**',
      'dist-preview/**',
      'node_modules/**',
      'src/pdf/assets/fonts/embedded.ts',
    ],
  },
  {
    // Scripts de mantenimiento que se ejecutan con Node directamente.
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // src/domain/ debe seguir siendo un núcleo puro: nada de React, UI,
    // Firebase ni ningún otro paquete salvo date-fns. Equivalente en
    // ESLint a tests/architecture/domain-boundary.test.ts.
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // Prohíbe cualquier import que NO sea una ruta relativa
              // (./ o ../) ni el paquete "date-fns" (o sus subrutas, p. ej.
              // "date-fns/locale"). Se usa `regex` en vez de `group` porque
              // el matcher basado en gitignore de `group` normaliza los
              // prefijos "./" y "../" de forma que no se puede distinguir
              // de forma fiable un import relativo de uno de paquete.
              regex: '^(?!\\.{1,2}/)(?!date-fns(/|$)).+$',
              message:
                'src/domain solo puede importar rutas relativas dentro de sí mismo o el paquete "date-fns".',
            },
          ],
        },
      ],
    },
  },
);
