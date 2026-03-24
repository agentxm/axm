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
      // Enforce direct imports from Effect submodules
      "@effect/no-import-from-barrel-package": [
        "error",
        { packageNames: ["effect", "@effect/platform", "@effect/platform-node"] },
      ],
      // Allow _-prefixed variables to be unused
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Ban type assertions (as T) — use type-safe alternatives (warn until existing violations are fixed)
      "@typescript-eslint/consistent-type-assertions": ["warn", { assertionStyle: "never" }],
      // Ban non-null assertions (value!) — use ?? or assertion functions (warn until existing violations are fixed)
      "@typescript-eslint/no-non-null-assertion": "warn",
    },
  },
);
