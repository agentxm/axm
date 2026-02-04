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
      // Relax some strict rules for pragmatic development
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-namespace": "off",
      "no-fallthrough": "off",
      "require-yield": "off",
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
