import effectEslint from "@effect/eslint-plugin";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", ".reference/**", ".axm/cache/**"],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    plugins: {
      "@effect": effectEslint,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      // Allow unused vars with _ prefix
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      // Warn on explicit any - use eslint-disable when truly needed
      "@typescript-eslint/no-explicit-any": "warn",
      // Namespaces rarely needed but not harmful
      "@typescript-eslint/no-namespace": "off",
      // Prefer @ts-expect-error over @ts-ignore, require description
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": "allow-with-description",
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-check": false,
        },
      ],
      // Catch unintentional fallthrough - use "// falls through" comment for intentional
      "no-fallthrough": "error",
    },
  },
  {
    files: ["packages/*/src/**/*", "packages/*/e2e/**/*"],
    rules: {
      // Effect-specific rules for source files (warn for now, enable as error when ready)
      "@effect/no-import-from-barrel-package": [
        "warn",
        {
          packageNames: ["effect"],
        },
      ],
    },
  },
);
