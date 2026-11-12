import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/*.min.js",
      "**/dev-dist/**",
      "frontend/src/api/schema.d.ts",
      "frontend/playwright-report/**",
      "frontend/test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["frontend/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // Constitution Principles III & IV: domain logic is pure — no I/O, DB, HTTP or Node built-ins.
    files: ["backend/src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["pg", "drizzle-orm", "drizzle-orm/*", "fastify", "@fastify/*", "web-push"], message: "Domain code must be pure (no I/O)." },
            { group: ["node:*", "fs", "net", "http", "https", "child_process"], message: "Domain code must be pure (no I/O)." },
            { group: ["../db/*", "../modules/*", "../http/*", "../realtime/*", "../jobs/*"], message: "Domain code must not depend on infrastructure." },
          ],
        },
      ],
      "no-restricted-properties": ["error", { object: "Date", property: "now", message: "Pass 'now' in as a parameter." }],
      "no-restricted-syntax": ["error", { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: "Pass 'now' in as a parameter." }],
    },
  },
);
