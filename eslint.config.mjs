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
        { packageNames: ["effect", "@effect/platform", "@effect/platform-node", "@effect/vitest"] },
      ],
    },
  },
);
