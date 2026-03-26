import effectEslint from "@effect/eslint-plugin";
import nxPlugin from "@nx/eslint-plugin";

const sourceFiles = [
  "**/*.ts",
  "**/*.tsx",
  "**/*.cts",
  "**/*.mts",
  "**/*.js",
  "**/*.jsx",
  "**/*.cjs",
  "**/*.mjs",
];

export default [
  ...nxPlugin.configs["flat/base"],
  ...nxPlugin.configs["flat/typescript"],
  ...nxPlugin.configs["flat/javascript"],
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      ".reference/**",
      ".axm/cache/**",
      ".claude/worktrees/**",
    ],
  },
  {
    files: sourceFiles,
    rules: {
      "@nx/enforce-module-boundaries": [
        "error",
        {
          allow: [],
          depConstraints: [
            {
              sourceTag: "type:app",
              onlyDependOnLibsWithTags: ["type:lib"],
            },
            {
              sourceTag: "type:lib",
              onlyDependOnLibsWithTags: ["type:lib"],
            },
          ],
          enforceBuildableLibDependency: true,
        },
      ],
    },
  },
  {
    files: sourceFiles,
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
      // Ban non-null assertions (value!) — use ?? or assertion functions
      "@typescript-eslint/no-non-null-assertion": "error",
      // Ban explicit any — use unknown and narrow instead
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.cts", "**/*.mts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
  // Root config files are not part of any tsconfig project — disable type-aware linting
  {
    files: ["vitest.config.ts"],
    languageOptions: {
      parserOptions: {
        projectService: false,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
    },
  },
];
