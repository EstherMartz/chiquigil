import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    // Generated output, vendored HTML, and the self-contained bot/ package
    // (it has its own package.json + tsconfig) are out of scope for the app lint.
    ignores: [
      'dist',
      'coverage',
      'api/*.mjs',
      'bot',
      'legacy',
      'reference',
      'public',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    linterOptions: {
      // The tree carries inline `eslint-disable` comments for rules this
      // pragmatic baseline doesn't enforce yet (no-console, exhaustive-deps).
      // Keep them as documented intent instead of stripping them; re-enable
      // this once those rules are adopted and the stale suppressions cleaned.
      reportUnusedDisableDirectives: 'off',
    },
    languageOptions: {
      ecmaVersion: 2022,
      // Mixed targets: browser (src/), Node (scripts/, src/api/, config files).
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // The app predates linting and uses `any` pervasively (~130 sites);
      // enforcing this is a separate, deliberate typing effort, not hygiene.
      '@typescript-eslint/no-explicit-any': 'off',

      // Respect the existing `_`-prefix convention for intentionally-unused
      // bindings, and don't flag unused catch bindings.
      '@typescript-eslint/no-unused-vars': ['error', {
        args: 'after-used',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
        destructuredArrayIgnorePattern: '^_',
      }],

      // Useful heuristic, but the never-linted tree has many pre-existing
      // dependency-array mismatches (some already suppressed inline). Leaving
      // it off keeps the lint actionable; turn back on per-feature when fixing.
      'react-hooks/exhaustive-deps': 'off',
    },
  },
)
