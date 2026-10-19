import tseslint from 'typescript-eslint'

export default tseslint.config(
    // Build output (published as-is, not hand-written code).
    { ignores: ['dist/'] },

    // Mirrors the previous .eslintrc.json:
    // - eslint:recommended
    // - plugin:@typescript-eslint/recommended
    // - no-explicit-any as warning, unused vars as error (ignoring _-prefixed)
    ...tseslint.configs.recommended,
    {
        rules: {
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                // Fields destructured out before `...rest` spreads are removed
                // on purpose (e.g. `const { token, ...safeInvitation } = x`).
                ignoreRestSiblings: true,
                varsIgnorePattern: '^_',
            }],
        },
    },
)
