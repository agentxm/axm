import effectEslint from "@effect/eslint-plugin";
import nxPlugin from "@nx/eslint-plugin";
import jsoncParser from "jsonc-eslint-parser";

const axmPolicyPlugin = {
  rules: {
    "no-unbounded-io": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          bounded:
            "This variable-cardinality I/O surface requires an evidence-backed concurrency bound.",
        },
      },
      create(context) {
        return {
          Property(node) {
            if (
              node.key.type === "Identifier" &&
              node.key.name === "concurrency" &&
              node.value.type === "Literal" &&
              node.value.value === "unbounded"
            ) {
              context.report({ node, messageId: "bounded" });
            }
          },
        };
      },
    },
  },
};

export default [
  ...nxPlugin.configs["flat/base"],
  ...nxPlugin.configs["flat/typescript"],
  ...nxPlugin.configs["flat/javascript"],
  {
    ignores: [
      "**/dist/**",
      "**/out-tsc/**",
      "**/build/**",
      "**/node_modules/**",
      "agent_extensions/**",
      ".axm/cache/**",
      ".claude/worktrees/**",
      "**/.wrangler-artifacts/**",
      "**/vite.config.*.timestamp*",
      "**/vitest.config.*.timestamp*",
    ],
  },
  {
    files: [
      "**/*.ts",
      "**/*.tsx",
      "**/*.mts",
      "**/*.cts",
      "**/*.js",
      "**/*.jsx",
      "**/*.mjs",
      "**/*.cjs",
    ],
    rules: {
      "@nx/enforce-module-boundaries": [
        "error",
        {
          enforceBuildableLibDependency: true,
          banTransitiveDependencies: true,
          allow: [
            "^.*/eslint(\\.base)?\\.config\\.[cm]?js$",
            "^.*/vitest\\.reporting\\.js$",
            // Specifications exercise the CLI application boundary in-process
            // through its published harness entry points.
            "^axm\\.sh/(app|runtime|specification-harness)$",
            // Subprocess e2e fixtures observe the built library artifact by
            // path. They move to the CLI package's shipped surface when the
            // runtime envelope moves into the application package.
            "^\\.\\./\\.\\./\\.\\./extension-management/dist/",
          ],
          depConstraints: [
            {
              sourceTag: "type:app",
              onlyDependOnLibsWithTags: ["type:lib"],
            },
            {
              sourceTag: "type:lib",
              onlyDependOnLibsWithTags: ["type:lib"],
            },
            {
              sourceTag: "type:tooling",
              onlyDependOnLibsWithTags: ["type:lib"],
            },
            {
              sourceTag: "type:e2e",
              onlyDependOnLibsWithTags: ["type:lib"],
              notDependOnLibsWithTags: [
                "scope:core",
                "scope:extension-model",
                "scope:registry-protocol",
                "scope:workspace-operations",
                "scope:workspace-state",
              ],
            },
            {
              sourceTag: "type:specification",
              onlyDependOnLibsWithTags: ["type:lib", "type:app"],
            },
            {
              sourceTag: "scope:test",
              onlyDependOnLibsWithTags: ["type:lib"],
              notDependOnLibsWithTags: [
                "scope:core",
                "scope:extension-model",
                "scope:registry-protocol",
                "scope:workspace-operations",
                "scope:workspace-state",
              ],
            },
            // Layer direction: dependencies point inward and never back
            // toward the application. Feature packages are peers.
            {
              sourceTag: "layer:app",
              onlyDependOnLibsWithTags: [
                "layer:feature",
                "layer:kernel",
                "layer:integration",
                "layer:contract",
              ],
            },
            {
              sourceTag: "layer:feature",
              onlyDependOnLibsWithTags: ["layer:kernel", "layer:integration", "layer:contract"],
            },
            {
              sourceTag: "layer:kernel",
              onlyDependOnLibsWithTags: ["layer:kernel", "layer:contract"],
            },
            {
              sourceTag: "layer:integration",
              onlyDependOnLibsWithTags: ["layer:integration", "layer:contract"],
            },
            {
              sourceTag: "layer:contract",
              onlyDependOnLibsWithTags: ["layer:contract"],
            },
            // Stable asymmetric contract boundary the layer matrix cannot
            // express: the shared model depends on nothing, the Registry
            // protocol only on the model.
            {
              sourceTag: "scope:extension-model",
              onlyDependOnLibsWithTags: ["scope:extension-model"],
              allowedExternalImports: [
                "effect",
                "effect/**",
                "packageurl-js",
                "semver",
                "spdx-expression-parse",
                // Test-runner imports inside the package's own test files.
                "vitest",
                "vitest/**",
                "@effect/vitest",
              ],
            },
            {
              sourceTag: "scope:registry-protocol",
              onlyDependOnLibsWithTags: ["scope:registry-protocol", "scope:extension-model"],
            },
          ],
        },
      ],
    },
  },
  {
    // Manifest fidelity: build inputs and each buildable package's
    // package.json must agree. Missing, obsolete, and mismatched entries
    // fail lint instead of surfacing at publish time.
    files: ["**/package.json"],
    languageOptions: {
      parser: jsoncParser,
    },
    rules: {
      "@nx/dependency-checks": [
        "error",
        {
          buildTargets: ["build"],
          checkMissingDependencies: true,
          checkObsoleteDependencies: true,
          checkVersionMismatches: true,
          // Loaded through a computed dynamic-import specifier the static
          // graph cannot see (credential-store keychain tier).
          ignoredDependencies: ["@napi-rs/keyring"],
        },
      ],
    },
  },
  {
    files: ["packages/**/src/**/*.ts", "packages/**/src/**/*.tsx"],
    ignores: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "**/src/main.ts",
      "**/src/config.ts",
      "**/src/runtime.ts",
      "**/e2e/**",
      "**/*-e2e/**",
    ],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "Use centralized runtime config modules and Effect Config instead of direct process.env reads.",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "BinaryExpression[left.type='MemberExpression'][left.property.name='hostname'][right.type='Literal'][right.value='localhost']",
          message:
            "Avoid hostname-based policy checks. Use explicit config flags or route structure.",
        },
        {
          selector:
            "BinaryExpression[right.type='MemberExpression'][right.property.name='hostname'][left.type='Literal'][left.value='localhost']",
          message:
            "Avoid hostname-based policy checks. Use explicit config flags or route structure.",
        },
      ],
    },
  },
  {
    // Timestamp backstop: production code reads the clock through
    // DateTime.now / Clock and holds DateTime.Utc; ambient Date construction
    // belongs only at sanctioned edges (listed in ignores) and tests.
    files: [
      "packages/extension-management/src/**/*.ts",
      "packages/extension-model/src/**/*.ts",
      "packages/registry-protocol/src/**/*.ts",
      "packages/workspace-operations/src/**/*.ts",
      "packages/workspace-state/src/**/*.ts",
      "packages/cli/src/**/*.ts",
    ],
    ignores: [
      "**/*.test.ts",
      "**/*.spec.ts",
      "packages/cli/src/test-helpers.ts",
      "packages/cli/src/test-stubs.ts",
      // deterministic archive mtime constant, not a clock read
      "packages/extension-management/src/unstable/utils/build-zip-archive.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "BinaryExpression[left.type='MemberExpression'][left.property.name='hostname'][right.type='Literal'][right.value='localhost']",
          message:
            "Avoid hostname-based policy checks. Use explicit config flags or route structure.",
        },
        {
          selector:
            "BinaryExpression[right.type='MemberExpression'][right.property.name='hostname'][left.type='Literal'][left.value='localhost']",
          message:
            "Avoid hostname-based policy checks. Use explicit config flags or route structure.",
        },
        {
          selector: "NewExpression[callee.name='Date']",
          message:
            "Use DateTime.now (Effect clock) or DateTime.makeUnsafe at a driver edge instead of ambient Date construction.",
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: "Use DateTime.now or Clock.currentTimeMillis instead of Date.now().",
        },
      ],
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.cts", "**/*.mts"],
    plugins: {
      "@effect": effectEslint,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
      "@effect/no-import-from-barrel-package": [
        "error",
        {
          packageNames: ["effect", "@effect/platform", "@effect/platform-node"],
        },
      ],
    },
  },
  {
    // Effect production invariants are global. A justified defect conversion
    // or module-lifetime singleton must carry its rationale at the exact site.
    files: ["packages/*/src/**/*.ts", "packages/*/src/**/*.tsx"],
    ignores: ["**/*.test.ts", "**/*.spec.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "BinaryExpression[left.type='MemberExpression'][left.property.name='hostname'][right.type='Literal'][right.value='localhost']",
          message:
            "Avoid hostname-based policy checks. Use explicit config flags or route structure.",
        },
        {
          selector:
            "BinaryExpression[right.type='MemberExpression'][right.property.name='hostname'][left.type='Literal'][left.value='localhost']",
          message:
            "Avoid hostname-based policy checks. Use explicit config flags or route structure.",
        },
        {
          selector: "NewExpression[callee.name='Date']",
          message:
            "Use DateTime.now (Effect clock) or DateTime.makeUnsafe at a driver edge instead of ambient Date construction.",
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: "Use DateTime.now or Clock.currentTimeMillis instead of Date.now().",
        },
        {
          selector: "MemberExpression[object.name='Effect'][property.name='orDie']",
          message:
            "Preserve expected failures in the Effect error channel and translate them at the owning boundary.",
        },
        {
          selector: "MemberExpression[object.name='Layer'][property.name='orDie']",
          message:
            "Preserve expected layer failures unless the site documents why failure violates an invariant.",
        },
        {
          selector:
            "Program > VariableDeclaration > VariableDeclarator > NewExpression[callee.name='Map']",
          message:
            "Module-global Maps need an explicit owner, bounded lifetime, and release or eviction story.",
        },
        {
          selector:
            "CallExpression[callee.object.name='Effect'][callee.property.name='sync'] ThrowStatement",
          message:
            "Effect.sync turns thrown exceptions into defects. Use Effect.try and map the expected failure.",
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.name='Effect'][callee.property.name=/^run(?:Sync|Promise|Fork)/]",
          message:
            "Keep Effect execution at the sanctioned process entry adapters; preserve requirements in R elsewhere.",
        },
      ],
    },
  },
  {
    files: ["packages/*/src/**/*.ts", "packages/*/src/**/*.tsx"],
    // The composition root plus the CLI's test-support module (consumed only
    // by internal tests) are the bounded non-test exceptions.
    ignores: [
      "packages/cli/src/runtime.ts",
      "packages/cli/src/test-helpers.ts",
      "**/*.test.ts",
      "**/*.spec.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "effect/unstable/http/FetchHttpClient",
              message:
                "Provide the Fetch HTTP client once in packages/cli/src/runtime.ts so transport policy is applied uniformly.",
            },
          ],
          patterns: [
            {
              group: ["@agentxm/*/live"],
              message:
                "Concrete environment-backed Layers compose only in the application composition root (packages/cli/src/runtime.ts); feature logic keeps service requirements in its Effect environment.",
            },
            {
              group: ["@agentxm/*/testing"],
              message:
                "Deterministic in-memory ports serve tests and specifications; production source composes real services.",
            },
            {
              group: ["@agentxm/*/src/*", "@agentxm/*/dist/*", "axm.sh/src/*", "axm.sh/dist/*"],
              message:
                "Deep imports bypass the provider's declared public API; export the symbol intentionally or move the responsibility to the right package.",
            },
          ],
        },
      ],
    },
  },
  {
    // The specification corpus observes the boundary it verifies: the CLI
    // only through its published entry points, lower packages only through
    // contracts and package-owned ./testing ports.
    files: ["specifications/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^axm\\.sh(/(?!app$|runtime$|specification-harness$).*)?$",
              message:
                "Specifications exercise the CLI only through its published entry points: axm.sh/app, axm.sh/runtime, axm.sh/specification-harness.",
            },
            {
              regex:
                "^@agentxm/(workspace-(state|operations|sync|lint|configuration|inspection)|extension-(workspace|sources|lifecycle|authoring|publish|discovery)|agent-integration|registry-(client|auth)|knowledge-query)(/(?!testing$).*)?$",
              message:
                "Specifications never import a kernel, integration, or feature root; compose the published CLI harness, the contract packages, or a package-owned ./testing port.",
            },
          ],
        },
      ],
    },
  },
  {
    // These variable-cardinality I/O surfaces were remediated in the 2026-08
    // concurrency census. Keep literal unbounded traversal from returning.
    files: [
      "packages/extension-management/src/unstable/registry/remote-client.ts",
      "packages/extension-management/src/unstable/source-resolution/providers/convention-discovery.ts",
      "packages/extension-management/src/unstable/workspace-inspection/version-currency/collectors.ts",
    ],
    plugins: {
      "axm-policy": axmPolicyPlugin,
    },
    rules: {
      "axm-policy/no-unbounded-io": "error",
    },
  },
  {
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.test.cts",
      "**/*.test.mts",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "**/*.spec.cts",
      "**/*.spec.mts",
    ],
    rules: {
      "@typescript-eslint/consistent-type-assertions": "off",
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.name='Effect'][callee.property.name=/^run(?:Sync|Promise|Fork|Callback)/]",
          message:
            "Use @effect/vitest and return the Effect from it.effect/it.live instead of creating a nested test runtime.",
        },
      ],
    },
  },
  // Config files are not part of any tsconfig project — disable type-aware linting
  {
    files: ["vitest.config.ts", "**/vitest*.config.ts"],
    languageOptions: {
      parserOptions: {
        projectService: false,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
    },
  },
  {
    files: ["**/*.js", "**/*.jsx", "**/*.cjs", "**/*.mjs"],
    rules: {},
  },
];
