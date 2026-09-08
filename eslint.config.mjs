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
    "no-direct-process-output": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          processStream:
            "Route CLI output through Screen instead of writing process.{{stream}} directly.",
          console: "Route CLI output through Screen instead of the global console.",
        },
      },
      create(context) {
        return {
          CallExpression(node) {
            const callee = node.callee;
            if (callee.type !== "MemberExpression" || callee.computed) return;
            if (callee.object.type === "Identifier" && callee.object.name === "console") {
              context.report({ node, messageId: "console" });
              return;
            }
            if (
              callee.property.type === "Identifier" &&
              callee.property.name === "write" &&
              callee.object.type === "MemberExpression" &&
              !callee.object.computed &&
              callee.object.object.type === "Identifier" &&
              callee.object.object.name === "process" &&
              callee.object.property.type === "Identifier" &&
              (callee.object.property.name === "stdout" || callee.object.property.name === "stderr")
            ) {
              context.report({
                node,
                messageId: "processStream",
                data: { stream: callee.object.property.name },
              });
            }
          },
        };
      },
    },
    "no-result-stream": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          buffered:
            "Ordinary --json output is one document; streaming requires a future explicit output mode.",
        },
      },
      // Bans the `resultStream` binding, member, and property key. Comments and
      // ordinary string data are deliberately out of scope: the policy governs
      // the streaming result shape, not the word.
      create(context) {
        const reportLiteralKey = (node) => {
          if (node.type === "Literal" && node.value === "resultStream") {
            context.report({ node, messageId: "buffered" });
          }
        };
        return {
          Identifier(node) {
            if (node.name === "resultStream") {
              context.report({ node, messageId: "buffered" });
            }
          },
          MemberExpression(node) {
            if (node.computed) reportLiteralKey(node.property);
          },
          Property(node) {
            if (!node.computed) reportLiteralKey(node.key);
          },
        };
      },
    },
    "no-unguarded-prompt-run": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          guarded: "Production prompts must run through the requireInteractive prompt boundary.",
        },
      },
      create(context) {
        return {
          MemberExpression(node) {
            if (
              !node.computed &&
              node.object.type === "Identifier" &&
              node.object.name === "Prompt" &&
              node.property.type === "Identifier" &&
              node.property.name === "run"
            ) {
              context.report({ node, messageId: "guarded" });
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
            "^.*/vitest\\.execution\\.js$",
            "^.*/vitest\\.reporting\\.js$",
            // Specifications exercise the CLI application boundary in-process
            // through its published harness entry points.
            "^axm\\.sh/(app|runtime|specification-harness)$",
            // Subprocess e2e fixtures observe the CLI package's built shipped
            // surface by path, and drive it through the built lifecycle
            // contract it observes.
            "^\\.\\./\\.\\./\\.\\./cli/dist/",
            "^\\.\\./\\.\\./\\.\\./workspace-operations/dist/",
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
                "scope:agent-integration",
                "scope:extension-model",
                "scope:extension-lifecycle",
                "scope:extension-sources",
                "scope:extension-workspace",
                "scope:registry-client",
                "scope:registry-protocol",
                "scope:workspace-lint",
                "scope:workspace-operations",
                "scope:workspace-state",
                "scope:workspace-sync",
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
                "scope:agent-integration",
                "scope:extension-model",
                "scope:extension-lifecycle",
                "scope:extension-sources",
                "scope:extension-workspace",
                "scope:registry-client",
                "scope:registry-protocol",
                "scope:workspace-lint",
                "scope:workspace-operations",
                "scope:workspace-state",
                "scope:workspace-sync",
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
    // Production machine-output, streaming, and prompt boundaries.
    //
    // These are dedicated rule keys rather than `no-restricted-syntax` entries
    // on purpose: flat config replaces a rule's options wholesale, so any later
    // block matching the same files silently drops earlier selectors. The
    // previous `no-restricted-syntax` form of these restrictions was inert for
    // exactly that reason. Distinct keys compose with the blocks below.
    //
    // Scope is the production source selection: package sources only, excluding
    // tests, generated clients, and the e2e/test-support packages that observe
    // published artifacts rather than owning production literals.
    files: ["packages/*/src/**/*.ts", "packages/*/src/**/*.tsx"],
    ignores: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "**/__generated__/**",
      "packages/cli-e2e/**",
      "packages/e2e-utils/**",
    ],
    plugins: {
      "axm-policy": axmPolicyPlugin,
    },
    rules: {
      "axm-policy/no-direct-process-output": "error",
      "axm-policy/no-result-stream": "error",
      "axm-policy/no-unguarded-prompt-run": "error",
    },
  },
  {
    // `Screen` is the sole writer after runtime startup
    // (docs/architecture/commands/output.md); streams.ts is its process
    // adapter and owns the process stream handles.
    files: ["packages/cli/src/screen/streams.ts"],
    rules: {
      "axm-policy/no-direct-process-output": "off",
    },
  },
  {
    // The guarded prompt boundary: requireInteractive lives here, so this is
    // the one production module that may reach Prompt.run.
    files: ["packages/cli/src/prompt/helpers.ts"],
    rules: {
      "axm-policy/no-unguarded-prompt-run": "off",
    },
  },
  {
    // Timestamp backstop: production code reads the clock through
    // DateTime.now / Clock and holds DateTime.Utc; ambient Date construction
    // belongs only at sanctioned edges (listed in ignores) and tests.
    files: [
      "packages/agent-integration/src/**/*.ts",
      "packages/extension-authoring/src/**/*.ts",
      "packages/extension-discovery/src/**/*.ts",
      "packages/extension-lifecycle/src/**/*.ts",
      "packages/extension-model/src/**/*.ts",
      "packages/extension-publish/src/**/*.ts",
      "packages/extension-sources/src/**/*.ts",
      "packages/extension-workspace/src/**/*.ts",
      "packages/knowledge-query/src/**/*.ts",
      "packages/registry-auth/src/**/*.ts",
      "packages/registry-client/src/**/*.ts",
      "packages/registry-protocol/src/**/*.ts",
      "packages/workspace-configuration/src/**/*.ts",
      "packages/workspace-inspection/src/**/*.ts",
      "packages/workspace-lint/src/**/*.ts",
      "packages/workspace-operations/src/**/*.ts",
      "packages/workspace-state/src/**/*.ts",
      "packages/workspace-sync/src/**/*.ts",
      "packages/cli/src/**/*.ts",
    ],
    ignores: [
      "**/*.test.ts",
      "**/*.spec.ts",
      "packages/cli/src/test-helpers.ts",
      "packages/cli/src/test-stubs.ts",
      // deterministic archive mtime constant, not a clock read
      "packages/extension-publish/src/archive.ts",
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
    ignores: [
      "**/*.test.ts",
      "**/*.spec.ts",
      "packages/workspace-lint/src/catalog/workspace/conformance/test-helpers.ts",
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
    // The composition root plus explicitly named test-support modules are the
    // bounded non-test exceptions.
    ignores: [
      "packages/cli/src/runtime.ts",
      "packages/cli/src/test-helpers.ts",
      // Published specification adapter exposes real services to boundary tests.
      "packages/cli/src/specification-harness.ts",
      "packages/workspace-lint/src/catalog/workspace/conformance/test-helpers.ts",
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
      "packages/registry-client/src/remote-client.ts",
      "packages/extension-sources/src/providers/convention-discovery.ts",
      "packages/workspace-inspection/src/version-currency/collectors.ts",
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
