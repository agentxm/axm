// Slice boundaries inside @agentxm/workspace-kernel, @agentxm/extension-kinds,
// and @agentxm/workspace-features. Every slice is one folder under its
// package's src, so one `<root>/src/*` pattern per package classifies every
// file and the folder name is the captured slice. The kernel slices are ordered
// lowest first, extension kinds sit on the kernel, and features sit on kinds
// and the kernel; Nx scope rows keep the packages themselves in that order.
import boundaries from "eslint-plugin-boundaries";

const ext = "{ts,tsx,mts,cts,js,jsx,mjs,cjs}";
const packageRoots = {
  kernel: "packages/core/workspace-kernel/src",
  kind: "packages/core/extension-kinds/src",
  feature: "packages/core/workspace-features/src",
};
const packageNames = ["workspace-kernel", "extension-kinds", "workspace-features"];

// Lowest first: a kernel slice may import only the slices listed before it. A
// kernel folder missing from this list can import no kernel slice and be
// imported by none, so a new slice has to be placed here before it can be used.
const kernelOrder = [
  "settlement",
  "operations",
  "agent-adapters",
  "workspace-state",
  "projection",
  "acquisition",
  "sources",
  "resolution",
  "planning",
  "materialization",
  "reconciliation",
];

const testSupport = `${packageRoots.feature}/testing`;
const kindsLiveFile = `${packageRoots.kind}/live.ts`;

// With `elements-single-match`, the first descriptor that matches a file is its
// element: the shared test world precedes the generic feature pattern, and the
// kinds composition root (src/live.ts, a file, which no folder pattern can
// match) is a catch-all for extension-kinds/src listed after that package's
// folder pattern, so only files directly under src reach it (slices/placement
// admits only live.ts there).
const sliceElements = [
  { type: "test-support", pattern: testSupport, partialMatch: false },
  ...Object.entries(packageRoots).map(([type, root]) => ({
    type,
    pattern: `${root}/*`,
    capture: ["slice"],
    partialMatch: false,
  })),
  { type: "kind-composition", pattern: packageRoots.kind, partialMatch: false },
];

const inPackages = (suffix) => Object.values(packageRoots).map((root) => `${root}/${suffix}`);
const sliceSourceFiles = inPackages(`**/*.${ext}`);

// Test purpose follows the build exclusions in each tsconfig.lib.json plus the
// test seams (testing.ts) and named test doubles (test-*.ts). Only files inside
// a slice folder (and the kinds composition root) get a category:
// no-unknown-files reports a file only when both its element and its file
// category are unknown, so a catch-all category would silence it.
const sliceFiles = [
  {
    category: "test",
    pattern: [
      `${testSupport}/**/*`,
      ...inPackages(`**/*.{test,spec,shared-spec,type-test}.${ext}`),
      ...inPackages(`**/{testing,test-*}.${ext}`),
      ...inPackages("**/{test-support,__tests__,__fixtures__}/**/*"),
    ],
  },
  { category: "production", pattern: [...inPackages("*/**/*"), kindsLiveFile] },
];

const entryFiles = [`index.${ext}`, `live.${ext}`, `testing.${ext}`];
const at = (type, slice) => ({
  type,
  ...(slice ? { captured: { slice } } : {}),
  fileInternalPath: entryFiles,
});
const described = (tier, rule) =>
  `${tier} {{from.element.captured.slice}} -> {{to.type}} {{to.element.captured.slice}} ({{to.internalPath}}): ${rule}`;

const slicePolicies = [
  // A feature uses kinds and the kernel through their entry files.
  { from: { element: { type: "feature" } }, allow: { to: { element: at(["kind", "kernel"]) } } },
  // A kind uses the kernel through its entry files.
  { from: { element: { type: "kind" } }, allow: { to: { element: at("kernel") } } },
  // The kinds composition root wires every kind's manager Layer.
  {
    from: { element: { type: "kind-composition" } },
    allow: { to: { element: at(["kind", "kernel"]) } },
  },
  // A kernel slice uses the kernel slices below it through their entry files.
  ...kernelOrder.slice(1).map((slice, index) => ({
    from: { element: { type: "kernel", captured: { slice } } },
    allow: { to: { element: at("kernel", kernelOrder.slice(0, index + 1)) } },
  })),
  // Test-purpose files may also compose the shared test world, which itself
  // composes every tier through its entry files.
  {
    from: { file: { categories: "test" } },
    allow: { to: { element: { type: "test-support" } } },
  },
  {
    from: { element: { type: "test-support" } },
    allow: { to: { element: at(["kernel", "kind", "kind-composition", "feature"]) } },
  },
  // Explicit denials come last: the plugin uses last-match precedence.
  ...kernelOrder.slice(0, -1).map((slice, index) => ({
    from: { element: { type: "kernel", captured: { slice } } },
    disallow: {
      to: { element: { type: "kernel", captured: { slice: kernelOrder.slice(index + 1) } } },
    },
    message: described("kernel", "a kernel slice imports only the kernel slices below it."),
  })),
  {
    from: { element: { type: "kernel" } },
    disallow: {
      to: { element: { type: ["kind", "kind-composition", "feature", "test-support"] } },
    },
    message: described("kernel", "the kernel knows no extension kind or feature, not even a type."),
  },
  {
    from: { element: { type: "kind" } },
    disallow: {
      to: { element: { type: ["kind", "kind-composition", "feature", "test-support"] } },
    },
    message: described("kind", "an extension kind imports only the kernel."),
  },
  {
    from: { element: { type: "feature" } },
    disallow: { to: { element: { type: ["feature", "kind-composition"] } } },
    message: described(
      "feature",
      "a feature never depends on another feature or composes kinds; move shared behaviour inward.",
    ),
  },
  {
    from: { file: { categories: "production" } },
    disallow: { to: { file: { categories: "test" } } },
    message: described("production", "production code must not depend on tests or test support."),
  },
];

/**
 * `ignores` takes the capability gate's roots (capabilitySourceFiles). ESLint
 * merges `settings` per file and replaces arrays, so a file matched by both
 * this block and capabilities/dependencies keeps only the later block's
 * elements, files, and policies. The capability gate is the stricter one for
 * its roots (it denies every local import outside its own element), so those
 * files stay with it and this block skips them.
 */
export function sliceBoundaries(rootPath, { ignores = [] } = {}) {
  return [
    {
      name: "slices/dependencies",
      files: sliceSourceFiles,
      ignores,
      plugins: { boundaries },
      settings: {
        "boundaries/root-path": rootPath,
        "boundaries/elements": sliceElements,
        "boundaries/elements-single-match": true,
        "boundaries/files": sliceFiles,
        "boundaries/files-single-match": true,
        // Nx tags govern every other @agentxm package. The three split packages
        // stay local so `@agentxm/workspace-kernel/<slice>` imports resolve
        // (through the axm-source condition) to classified slice entry files.
        "boundaries/flag-as-external": {
          customSourcePatterns: [
            `@agentxm/!(${packageNames.join("|")})`,
            `@agentxm/!(${packageNames.join("|")})/**`,
          ],
        },
        // `import("./x.js").T` type queries are dependencies too (typescript-eslint
        // puts the specifier Literal in TSImportType.source).
        "boundaries/additional-dependency-nodes": [
          { selector: "TSImportType > Literal", kind: "type", name: "import-type" },
        ],
        "import/resolver": {
          typescript: {
            project: [],
            conditionNames: ["axm-source", "import", "node", "default"],
          },
        },
      },
      rules: {
        "boundaries/no-unknown-files": "error",
        "boundaries/no-unknown-dependencies": ["error", { require: "element" }],
        "boundaries/dependencies": [
          "error",
          {
            default: "disallow",
            message: described(
              "{{from.type}}",
              "not an allowed direction, or not the target slice's index, live, or testing entry.",
            ),
            policies: slicePolicies,
          },
        ],
      },
    },
    {
      // extension-kinds/src holds kind folders and the kinds composition root.
      name: "slices/placement",
      files: [`${packageRoots.kind}/*.${ext}`],
      ignores: [kindsLiveFile],
      rules: {
        "no-restricted-syntax": [
          "error",
          {
            selector: "Program",
            message:
              "Place extension kind code in its kind folder; only live.ts sits at the package root.",
          },
        ],
      },
    },
  ];
}
