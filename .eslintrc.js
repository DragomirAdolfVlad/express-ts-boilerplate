module.exports = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
    },
    plugins: ['@typescript-eslint', 'prettier'],
    extends: [
        'eslint:recommended',
        '@typescript-eslint/recommended',
        '@typescript-eslint/recommended-requiring-type-checking',
        'prettier',
    ],
    rules: {
        // Indentation: 4 spaces
        'indent': ['error', 4, { 'SwitchCase': 1 }],
        '@typescript-eslint/indent': ['error', 4],
        
        // Code quality rules
        '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
        '@typescript-eslint/explicit-function-return-type': 'error',
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-non-null-assertion': 'error',
        '@typescript-eslint/prefer-nullish-coalescing': 'error',
        '@typescript-eslint/prefer-optional-chain': 'error',
        
        // Import rules
        'sort-imports': ['error', { 'ignoreDeclarationSort': true }],
        
        // General rules
        'no-console': 'warn',
        'prefer-const': 'error',
        'no-var': 'error',
        
        // Prettier integration
        'prettier/prettier': ['error', {
            'tabWidth': 4,
            'useTabs': false,
            'semi': true,
            'singleQuote': true,
            'quoteProps': 'as-needed',
            'trailingComma': 'es5',
            'bracketSpacing': true,
            'arrowParens': 'avoid',
            'printWidth': 100,
        }],
    },
    env: {
        node: true,
        es2022: true,
    },
    ignorePatterns: ['dist/', 'node_modules/', '*.js'],
};