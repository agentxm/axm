import effectEslint from "@effect/eslint-plugin";
import nxPlugin from "@nx/eslint-plugin";
import * as jsoncParser from "jsonc-eslint-parser";
import { capabilityBoundaries } from "./tools/architecture/boundaries.mjs";
import {
  capabilityElements,
  capabilityFileDescriptors,
  capabilitySourceFiles,
} from "./tools/architecture/config.mjs";

const axmPolicyPlugin = {
  rules: {
    "no-terminal-control-literals": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          screen:
            "Terminal controls belong to Screen; handlers emit semantic documents and interactions.",
        },
      },
      create(context) {
        const check = (node, value) => {
          if (typeof value === "string" && (value.includes("\u001b") || value.includes("\u009b"))) {
            context.report({ node, messageId: "screen" });
          }
        };
        return {
          Literal(node) {
            check(node, node.value);
          },
          TemplateElement(node) {
            check(node, node.value.cooked);
          },
        };
      },
    },
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
    "no-command-defect-exit": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          outcome:
            "Return a typed command outcome or failure; Effect.die is for violated invariants, not CLI exit status.",
        },
      },
      create(context) {
        const effectNamespaces = new Set();
        return {
          ImportDeclaration(node) {
            if (node.source.value !== "effect/Effect") return;
            for (const specifier of node.specifiers) {
              if (specifier.type === "ImportNamespaceSpecifier") {
                effectNamespaces.add(specifier.local.name);
              } else if (
                specifier.type === "ImportSpecifier" &&
                specifier.imported.type === "Identifier" &&
                specifier.imported.name === "die"
              ) {
                context.report({ node: specifier, messageId: "outcome" });
              }
            }
          },
          MemberExpression(node) {
            if (node.object.type !== "Identifier" || !effectNamespaces.has(node.object.name)) {
              return;
            }
            const property = node.computed
              ? node.property.type === "Literal"
                ? node.property.value
                : undefined
              : node.property.type === "Identifier"
                ? node.property.name
                : undefined;
            if (property === "die") context.report({ node, messageId: "outcome" });
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
    "no-effect-prompt": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          screen:
            "Ask through Screen.ask: Effect's Prompt widgets paint outside the painter and cannot take the gutter, the key hints, or the terminal's height.",
        },
      },
      create(context) {
        const CLI = "effect/unstable/cli";
        const namespaces = new Set();
        const isPromptModule = (source) => source?.value === `${CLI}/Prompt`;
        const isCliModule = (source) => source?.value === CLI;
        const isPromptKey = (node) =>
          (node.type === "Identifier" && node.name === "Prompt") ||
          (node.type === "Literal" && node.value === "Prompt");
        const dynamicSource = (node) => {
          const value = node?.type === "AwaitExpression" ? node.argument : node;
          return value?.type === "ImportExpression" ? value.source : undefined;
        };
        const destructuresPrompt = (pattern) =>
          pattern.type === "ObjectPattern" &&
          pattern.properties.some(
            (property) => property.type === "Property" && isPromptKey(property.key),
          );
        return {
          ImportDeclaration(node) {
            if (isPromptModule(node.source)) {
              context.report({ node, messageId: "screen" });
              return;
            }
            if (!isCliModule(node.source)) return;
            for (const specifier of node.specifiers) {
              if (specifier.type === "ImportNamespaceSpecifier") {
                namespaces.add(specifier.local.name);
              } else if (
                specifier.type === "ImportSpecifier" &&
                specifier.imported.type === "Identifier" &&
                specifier.imported.name === "Prompt"
              ) {
                context.report({ node: specifier, messageId: "screen" });
              }
            }
          },
          MemberExpression(node) {
            if (!isPromptKey(node.property)) return;
            const source = dynamicSource(node.object);
            if (
              (node.object.type === "Identifier" && namespaces.has(node.object.name)) ||
              isCliModule(source)
            ) {
              context.report({ node, messageId: "screen" });
            }
          },
          ExportNamedDeclaration(node) {
            if (isPromptModule(node.source)) {
              context.report({ node, messageId: "screen" });
              return;
            }
            if (
              isCliModule(node.source) &&
              node.specifiers.some((specifier) => isPromptKey(specifier.local))
            ) {
              context.report({ node, messageId: "screen" });
            }
          },
          ExportAllDeclaration(node) {
            if (isPromptModule(node.source)) context.report({ node, messageId: "screen" });
          },
          ImportExpression(node) {
            if (isPromptModule(node.source)) context.report({ node, messageId: "screen" });
          },
          VariableDeclarator(node) {
            const source = dynamicSource(node.init);
            if (node.id.type === "Identifier" && isCliModule(source)) {
              namespaces.add(node.id.name);
              return;
            }
            if (!destructuresPrompt(node.id)) return;
            if (
              (node.init?.type === "Identifier" && namespaces.has(node.init.name)) ||
              isCliModule(source)
            ) {
              context.report({ node, messageId: "screen" });
            }
          },
          AssignmentExpression(node) {
            if (node.left.type === "Identifier" && isCliModule(dynamicSource(node.right))) {
              namespaces.add(node.left.name);
            }
          },
        };
      },
    },
    "no-terminal-read-input": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          owner:
            "Acquire Terminal.readInput only in screen/interaction.ts so each interaction has one scoped input owner.",
        },
      },
      create(context) {
        const isReadInput = (node) =>
          (node.type === "Identifier" && node.name === "readInput") ||
          (node.type === "Literal" && node.value === "readInput");
        return {
          MemberExpression(node) {
            if (isReadInput(node.property)) context.report({ node, messageId: "owner" });
          },
          VariableDeclarator(node) {
            if (
              node.id.type === "ObjectPattern" &&
              node.id.properties.some(
                (property) => property.type === "Property" && isReadInput(property.key),
              )
            ) {
              context.report({ node, messageId: "owner" });
            }
          },
        };
      },
    },
  },
};

/**
 * Module boundaries.
 *
 * Tags come from the project graph: `type:*`, `role:*`, `scope:*`, and
 * `release:cli` are authored in each project.json; `domain:*` is inferred from
 * placement by scripts/placement-tags-plugin.ts. Every matching constraint is
 * enforced independently, so the strategic (domain) and technical (role)
 * matrices intersect and a later permissive row never overrides an earlier one.
 */
const moduleBoundaryOptions = {
  banTransitiveDependencies: true,
  // The root purpose setup loads the specification contract lazily so a
  // project without specifications never needs it built; the repository
  // scripts in the same root project import it statically.
  checkDynamicDependenciesExceptions: ["@agentxm/specification-metadata"],
  allow: [
    "^.*/eslint(\\.base)?\\.config\\.[cm]?js$",
    "^.*/vitest\\.execution\\.js$",
    "^.*/vitest\\.reporting\\.js$",
    // Subprocess e2e fixtures (apps/cli-e2e/src/fixtures/*.mjs) observe the
    // CLI package's built shipped surface by path, and drive it through the
    // built contracts it observes.
    "^\\.\\./\\.\\./\\.\\./cli/dist/",
    "^\\.\\./\\.\\./\\.\\./\\.\\./packages/core/workspace/dist/",
  ],
};

// Product packages that the end-to-end and test-support projects observe only
// as shipped artifacts, never as imported code.
const productScopeBans = [
  "scope:extension-content",
  "scope:extension-model",
  "scope:registry-client",
  "scope:registry-protocol",
  "scope:workspace",
];

// Technical roles: dependencies point inward and never back toward the
// application. Features are peers; capabilities may use lower integrations.
const runtimeRoleDependencies = {
  "role:application": ["role:feature", "role:capability", "role:integration", "role:contract"],
  "role:feature": ["role:capability", "role:integration", "role:contract"],
  "role:capability": ["role:capability", "role:integration", "role:contract"],
  // Integrations may also compose the leaf content library and generic host
  // primitives. Both have narrower dependency budgets under their own scope.
  "role:integration": [
    "role:integration",
    "role:contract",
    "scope:extension-content",
    "scope:host-primitives",
  ],
  "role:contract": ["role:contract"],
};

// Strategic direction: core may use supporting and generic; supporting may use
// generic plus the exact contract seams and the leaf content library; generic
// depends on nothing of AXM.
const domainDependencies = {
  "domain:core": ["domain:core", "domain:supporting", "domain:generic"],
  "domain:supporting": [
    "domain:supporting",
    "domain:generic",
    "scope:extension-model",
    "scope:registry-protocol",
    "scope:extension-content",
  ],
  "domain:generic": ["domain:generic"],
};

/**
 * `production: true` keeps every runtime role's own source away from
 * role:tooling so the engineering libraries under tools/ never enter runtime;
 * `production: false` lets test-purpose files inside runtime packages compose
 * them.
 */
const moduleBoundaryConstraints = ({ production }) => [
  { sourceTag: "type:app", onlyDependOnLibsWithTags: ["type:lib"] },
  { sourceTag: "type:lib", onlyDependOnLibsWithTags: ["type:lib"] },
  { sourceTag: "type:tooling", onlyDependOnLibsWithTags: ["type:lib"] },
  {
    sourceTag: "type:e2e",
    onlyDependOnLibsWithTags: ["type:lib"],
    notDependOnLibsWithTags: productScopeBans,
  },
  {
    sourceTag: "scope:test",
    onlyDependOnLibsWithTags: ["type:lib"],
    notDependOnLibsWithTags: productScopeBans,
  },
  ...Object.entries(domainDependencies).map(([sourceTag, targets]) => ({
    sourceTag,
    onlyDependOnLibsWithTags: production ? targets : [...targets, "role:tooling"],
  })),
  // Runtime roles list no role:tooling target, so production source can never
  // import a tooling library directly. A transitive notDependOnLibsWithTags ban
  // is deliberately absent: colocated specifications and tests import the
  // specification-metadata and test-support tooling libraries, those imports
  // are project-graph edges, and a transitive ban would flag every runtime
  // consumer of a library that merely tests itself.
  ...Object.entries(runtimeRoleDependencies).map(([sourceTag, targets]) => ({
    sourceTag,
    onlyDependOnLibsWithTags: production ? targets : [...targets, "role:tooling"],
  })),
  { sourceTag: "role:e2e", onlyDependOnLibsWithTags: ["role:tooling", "role:contract"] },
  { sourceTag: "role:tooling", onlyDependOnLibsWithTags: ["type:lib"] },
  // Stable asymmetric contract boundary the role matrix cannot express: the
  // shared model depends on nothing, the Registry protocol only on the model.
  // Colocated specifications inside either contract import the shared
  // specification-metadata tooling library, so test-purpose files may reach
  // role:tooling while runtime code keeps the exact seam.
  {
    sourceTag: "scope:extension-model",
    onlyDependOnLibsWithTags: production
      ? ["scope:extension-model"]
      : ["scope:extension-model", "role:tooling"],
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
      "@fast-check/vitest",
    ],
  },
  {
    sourceTag: "scope:registry-protocol",
    onlyDependOnLibsWithTags: production
      ? ["scope:registry-protocol", "scope:extension-model"]
      : ["scope:registry-protocol", "scope:extension-model", "role:tooling"],
  },
  // Content behavior is a leaf: it reads the model and nothing else, so the
  // Registry implementation and integrations can consume it without pulling
  // workspace or transport packages.
  {
    sourceTag: "scope:extension-content",
    onlyDependOnLibsWithTags: ["scope:extension-content", "scope:extension-model"],
  },
];

/**
 * The CLI handler boundary's only non-test exceptions.
 *
 * A handler parses, calls a feature or capability application API, and
 * renders. A command family that owns no feature — because the thing it
 * drives has none above it — is named here rather than the restriction being
 * widened for every handler.
 * `scripts/composition-root-lint-exceptions.test.ts` exercises the restriction.
 */
const cliHandlerBoundaryExceptions = [
  // `cache *` is a CLI-adapter-only command family: the archive cache is the
  // Registry client's own on-disk store, and no feature owns it.
  "apps/cli/src/root/cache/**",
];

// Screen is the terminal boundary for every handler, including cache commands.
const cliTerminalImportPatterns = [
  {
    group: [
      "**/screen/frame.js",
      "**/screen/streams.js",
      "**/screen/interaction.js",
      "**/screen/ask/run.js",
      "**/screen/wait/run.js",
      "**/screen/terminal-style.js",
      "**/screen/scene.js",
      "effect/Terminal",
      "effect/Console",
      "node:tty",
      "node:readline",
    ],
    message:
      "Handlers use Screen and typed documents; terminal geometry, streams and input are owned by Screen.",
  },
  {
    group: ["**/screen/index.js"],
    importNames: [
      "Frame",
      "FrameLive",
      "OutputStreams",
      "OutputStreamsLive",
      "makeTestOutputStreams",
      "stderrIsTTY",
      "paintScene",
      "paintLivePart",
      "runWait",
      "runStaticWait",
      "InteractiveScreen",
      "MachineScreen",
    ],
    message:
      "Handlers use Screen and emitResult; terminal composition belongs to runtime adapters.",
  },
];

const testPurposeFiles = [
  // Test support is excluded from every library build and from the published
  // files; what it composes is test wiring, not product code.
  "**/src/**/test-support/**/*.ts",
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.test.cts",
  "**/*.test.mts",
  "**/*.spec.ts",
  "**/*.spec.tsx",
  "**/*.spec.cts",
  "**/*.spec.mts",
];

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
          ...moduleBoundaryOptions,
          enforceBuildableLibDependency: true,
          depConstraints: moduleBoundaryConstraints({ production: true }),
        },
      ],
    },
  },
  {
    // Configuration composes source-only tooling projects. A rule module needs
    // no npm package or compiler alias merely because Nx gives its tests a task.
    files: ["eslint.config.mjs"],
    rules: {
      "@nx/enforce-module-boundaries": [
        "error",
        {
          ...moduleBoundaryOptions,
          allow: [
            ...moduleBoundaryOptions.allow,
            "./tools/architecture/boundaries.mjs",
            "./tools/architecture/config.mjs",
          ],
          depConstraints: moduleBoundaryConstraints({ production: true }),
        },
      ],
    },
  },
  {
    // Tests and specifications inside buildable libraries may compose the
    // non-buildable engineering libraries under tools/ (role:tooling). Runtime
    // code keeps the strict block above; this block relaxes only buildability
    // and the tooling ban, for test-purpose files.
    files: testPurposeFiles,
    rules: {
      "@nx/enforce-module-boundaries": [
        "error",
        {
          ...moduleBoundaryOptions,
          enforceBuildableLibDependency: false,
          depConstraints: moduleBoundaryConstraints({ production: false }),
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
          ignoredDependencies: [
            // Loaded through a computed dynamic-import specifier the static
            // graph cannot see (credential-store keychain tier).
            "@napi-rs/keyring",
            // The published CLI pins this transitive runtime directly because
            // platform-node's prerelease range can otherwise cross cohorts.
            "@effect/platform-node-shared",
          ],
          // Test-support modules are excluded from every package's build; what
          // they import is a devDependency, not a published one.
          ignoredFiles: [
            "{projectRoot}/src/**/test-support/**/*.ts",
            "{projectRoot}/src/**/test-helpers.ts",
          ],
        },
      ],
    },
  },
  {
    files: ["{apps,packages,tools}/**/src/**/*.ts", "{apps,packages,tools}/**/src/**/*.tsx"],
    ignores: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "**/src/main.ts",
      "**/src/config.ts",
      "**/src/runtime.ts",
      "**/src/**/test-support/**",
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
    // Scope is the production source selection: project sources only, excluding
    // tests, generated clients, and the e2e/test-support packages that observe
    // published artifacts rather than owning production literals.
    files: ["{apps,packages,tools}/**/src/**/*.ts", "{apps,packages,tools}/**/src/**/*.tsx"],
    ignores: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "**/__generated__/**",
      "apps/cli-e2e/**",
      "tools/e2e-utils/**",
    ],
    plugins: {
      "axm-policy": axmPolicyPlugin,
    },
    rules: {
      "axm-policy/no-direct-process-output": "error",
      "axm-policy/no-result-stream": "error",
      "axm-policy/no-effect-prompt": "error",
      "axm-policy/no-terminal-read-input": "error",
    },
  },
  {
    // One scoped acquisition owns every question and wait input queue.
    files: ["apps/cli/src/screen/interaction.ts"],
    rules: {
      "axm-policy/no-terminal-read-input": "off",
    },
  },
  {
    // A command may return a nonzero process outcome or a typed failure.
    // Screen's duplicate-output guard is a true invariant outside this scope.
    files: ["apps/cli/src/root/**/*.ts", "apps/cli/src/cli-runtime/**/*.ts"],
    ignores: ["**/*.test.ts", "**/*.spec.ts", "**/test-support/**"],
    plugins: {
      "axm-policy": axmPolicyPlugin,
    },
    rules: {
      "axm-policy/no-command-defect-exit": "error",
    },
  },
  {
    // `Screen` is the sole writer after runtime startup
    // (docs/architecture/commands/output.md); streams.ts is its process
    // adapter and owns the process stream handles.
    files: ["apps/cli/src/screen/streams.ts"],
    rules: {
      "axm-policy/no-direct-process-output": "off",
    },
  },
  {
    // Timestamp backstop: production code reads the clock through
    // DateTime.now / Clock and holds DateTime.Utc; ambient Date construction
    // belongs only at sanctioned edges (listed in ignores) and tests.
    files: ["{apps,packages}/**/src/**/*.ts"],
    ignores: [
      "**/*.test.ts",
      "**/*.spec.ts",
      "apps/cli-e2e/**",
      "apps/cli/src/test-support/**",
      // deterministic archive mtime constant, not a clock read
      "packages/core/workspace/src/publishing/archive.ts",
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
          selector:
            "CallExpression[callee.object.name='DateTime'][callee.property.name='nowUnsafe']",
          message: "Use DateTime.now or Clock.currentTimeMillis from the active Effect clock.",
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
    files: ["{apps,packages,tools}/**/src/**/*.ts", "{apps,packages,tools}/**/src/**/*.tsx"],
    ignores: [
      "**/*.test.ts",
      "**/*.spec.ts",
      "**/src/**/test-support/**",
      "packages/core/workspace/src/linting/catalog/workspace/conformance/test-helpers.ts",
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
          selector:
            "CallExpression[callee.object.name='DateTime'][callee.property.name='nowUnsafe']",
          message: "Use DateTime.now or Clock.currentTimeMillis from the active Effect clock.",
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
    files: ["{apps,packages,tools}/**/src/**/*.ts", "{apps,packages,tools}/**/src/**/*.tsx"],
    // The composition root plus explicitly named test-support modules are the
    // bounded non-test exceptions.
    ignores: [
      "apps/cli/src/runtime.ts",
      // Owned package composition roots select the Layers they compose.
      "packages/**/src/live.ts",
      "packages/core/workspace/src/**/live.ts",
      // Test support excluded from the library build and the published files.
      "apps/cli/src/test-support/**",
      "packages/core/workspace/src/linting/catalog/workspace/conformance/test-helpers.ts",
      // Composes the real workspace an authoring specification observes.
      "packages/core/workspace/src/authoring/test-support/authoring-workspace.ts",
      // Composes the real workspace and Registry an inspection specification
      // installs into before observing what `show` reports.
      "packages/core/workspace/src/inspection/test-support/installed-workspace.ts",
      // Published deterministic fixtures: each composes the real services its
      // package's specifications observe.
      "packages/core/workspace/src/knowledge/query/testing.ts",
      "packages/core/workspace/src/inspection/testing.ts",
      "packages/core/workspace/src/configuration/testing.ts",
      "packages/core/workspace/src/lifecycle/testing.ts",
      "packages/core/workspace/src/linting/testing.ts",
      // Colocated test support: drives its package's use cases from tests and
      // specifications with the deterministic ports its dependencies publish.
      "packages/core/workspace/src/configuration/**/test-helpers.ts",
      "packages/core/workspace/src/linting/**/test-helpers.ts",
      "packages/core/workspace/src/lifecycle/**/test-helpers.ts",
      "packages/core/workspace/src/packs/**/test-helpers.ts",
      "packages/core/workspace/src/publishing/**/test-helpers.ts",
      "packages/core/workspace/src/reconciliation/sync/**/test-helpers.ts",
      "packages/core/workspace/src/reconciliation/**/test-helpers.ts",
      // Plan-family fixtures, excluded from the library build: the plan
      // specifications observe the real transaction scope over a temporary
      // workspace with the deterministic state ports its dependency publishes.
      "packages/core/workspace/src/transitions/planning/plan/__tests__/plan-spec-support.ts",
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
                "Provide the Fetch HTTP client once in apps/cli/src/runtime.ts so transport policy is applied uniformly.",
            },
          ],
          patterns: [
            {
              group: ["@agentxm/*/live", "@agentxm/workspace/**/live"],
              message:
                "Concrete environment-backed Layers compose in application or package composition roots; feature logic keeps service requirements in its Effect environment.",
            },
            {
              group: ["@agentxm/*/testing", "@agentxm/workspace/**/testing"],
              message:
                "Deterministic in-memory ports serve tests and specifications; production source composes real services.",
            },
            {
              group: [
                "@agentxm/*/src/*",
                "@agentxm/*/dist/*",
                "@agentxm/workspace/**/src/*",
                "@agentxm/workspace/**/dist/*",
                "axm.sh/src/*",
                "axm.sh/dist/*",
              ],
              message:
                "Deep imports bypass the provider's declared public API; export the symbol intentionally or move the responsibility to the right package.",
            },
          ],
        },
      ],
    },
  },
  {
    // A package's own `./testing` entry point is test-support, not production
    // source: it may compose the deterministic ports its dependencies publish
    // under the same entry point. Everything else the rule above bans stays
    // banned here — a testing module still may not compose a `./live` layer or
    // reach past a package's public API.
    files: [
      "{apps,packages,tools}/**/src/testing.ts",
      "{apps,packages,tools}/**/src/testing/**/*.ts",
      "packages/core/workspace/src/**/testing.ts",
    ],
    // These two fixtures exist to bind their package's specifications to the
    // real workspace services over a throwaway workspace, so they compose the
    // same `./live` layers the composition root does.
    ignores: [
      "packages/core/workspace/src/knowledge/query/testing.ts",
      "packages/core/workspace/src/inspection/testing.ts",
      "packages/core/workspace/src/configuration/testing.ts",
      "packages/core/workspace/src/lifecycle/testing.ts",
      // A lint run reads a real workspace through the state and projection
      // services; a fixture that stubbed them would be linting itself.
      "packages/core/workspace/src/linting/testing.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "effect/unstable/http/FetchHttpClient",
              message:
                "Provide the Fetch HTTP client once in apps/cli/src/runtime.ts so transport policy is applied uniformly.",
            },
          ],
          patterns: [
            {
              group: ["@agentxm/*/live", "@agentxm/workspace/**/live"],
              message:
                "Concrete environment-backed Layers compose in application or package composition roots; feature logic keeps service requirements in its Effect environment.",
            },
            {
              group: [
                "@agentxm/*/src/*",
                "@agentxm/*/dist/*",
                "@agentxm/workspace/**/src/*",
                "@agentxm/workspace/**/dist/*",
                "axm.sh/src/*",
                "axm.sh/dist/*",
              ],
              message:
                "Deep imports bypass the provider's declared public API; export the symbol intentionally or move the responsibility to the right package.",
            },
          ],
        },
      ],
    },
  },
  {
    // Closure settlement is transition planning's alone: every plan unit is
    // one semantic closure that operations settles or rolls back at its
    // boundary. Other packages register writes through protectWorkspacePath
    // and run transactions; they never settle closures themselves.
    files: ["{apps,packages,tools}/**/*.ts"],
    ignores: [
      "packages/core/workspace/src/transitions/planning/**",
      "packages/core/workspace/src/transitions/settlement/**",
    ],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@agentxm/workspace/transitions/settlement",
              importNames: [
                "withWorkspaceClosure",
                "settleWorkspaceClosure",
                "rollbackWorkspaceClosure",
                "pendingClosureRestorations",
              ],
              message:
                "The closure API is consumed by @agentxm/workspace/transitions/planning only; register writes with protectWorkspacePath and run transactions with runWorkspaceTransaction.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/cli/src/root/**/*.ts"],
    ignores: testPurposeFiles,
    rules: { "axm-policy/no-terminal-control-literals": "error" },
  },
  {
    files: cliHandlerBoundaryExceptions,
    ignores: testPurposeFiles,
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            ...cliTerminalImportPatterns,
            {
              group: ["@agentxm/workspace/transitions/settlement"],
              importNames: [
                "withWorkspaceClosure",
                "settleWorkspaceClosure",
                "rollbackWorkspaceClosure",
                "pendingClosureRestorations",
              ],
              message: "Closure settlement belongs to transition planning.",
            },
          ],
        },
      ],
    },
  },
  {
    // CLI handler boundary: handlers parse, call feature and capability
    // application APIs, and render. They do not construct plans, touch
    // workspace writers, or reach integrations directly; the composition root
    // (apps/cli/src/runtime.ts), the runtime envelope
    // (apps/cli/src/cli-runtime/**) and the operation-lifecycle envelope
    // (apps/cli/src/operation-lifecycle.ts) sit outside this rule because
    // none of them lives under src/root. Contract *types* stay importable for
    // rendering.
    files: ["apps/cli/src/root/**/*.ts"],
    ignores: [...cliHandlerBoundaryExceptions, ...testPurposeFiles],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@agentxm/workspace/desired-state",
              importNames: ["SettingsWriter", "AcceptedResolutionWriter", "DesiredStateWriter"],
              allowTypeImports: true,
              message:
                "Handlers do not write workspace state; call the owning feature or capability application API.",
            },
            {
              name: "@agentxm/workspace/transitions/planning",
              importNames: ["Plan", "PlannedJobStep", "prepareExecutionCandidate"],
              allowTypeImports: true,
              message:
                "Handlers do not construct or execute plans; call Feature.prepare and Feature.previewOrApply.",
            },
          ],
          patterns: [
            ...cliTerminalImportPatterns,
            {
              group: [
                "@agentxm/workspace/transitions/settlement",
                "@agentxm/workspace/transitions/settlement/*",
                "@agentxm/workspace/resolution/sources",
                "@agentxm/workspace/resolution/sources/*",
                "@agentxm/registry-client",
                "@agentxm/registry-client/*",
              ],
              allowTypeImports: true,
              message:
                "Handlers reach transactions, sources, and the Registry only through feature and capability application APIs.",
            },
          ],
        },
      ],
    },
  },
  {
    // Every retained unbounded literal needs a site-specific rationale for its
    // fixed catalog or fixed-arity join; new literals require the same review.
    files: ["{apps,packages,tools}/**/src/**/*.ts", "{apps,packages,tools}/**/src/**/*.tsx"],
    ignores: testPurposeFiles,
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
  ...capabilityBoundaries(
    import.meta.dirname,
    capabilityElements,
    capabilitySourceFiles,
    capabilityFileDescriptors,
  ),
];
