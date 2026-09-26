// Slice boundaries inside packages/core/workspace. Every folder the table below
// names is one slice: the kernel slices are ordered lowest first, extension
// kinds sit on the kernel, and features sit on kinds and the kernel. Three
// slices are nested inside another slice's folder, so the slices are listed
// explicitly rather than matched by one `src/*` pattern.
import boundaries from "eslint-plugin-boundaries";

const ext = "{ts,tsx,mts,cts,js,jsx,mjs,cjs}";
const root = "packages/core/workspace/src";

// [slice, folder under src]. Kernel slices are lowest first: a kernel slice
// may import only the slices listed before it.
const kernelSlices = [
  ["settlement", "transitions/settlement"],
  ["operations", "operations"],
  ["agent-adapters", "projection/agent-adapters"],
  ["workspace-state", "desired-state"],
  ["projection", "projection"],
  ["acquisition", "acquisition"],
  ["sources", "resolution/sources"],
  ["resolution", "resolution"],
  ["planning", "transitions/planning"],
  ["materialization", "materialization"],
  ["reconciliation", "reconciliation"],
];
const kindSlices = [
  ["skills", "skills"],
  ["subagents", "subagents"],
  ["mcp-connections", "mcp-connections"],
  ["hooks", "hooks"],
  ["instructions", "instructions"],
  ["knowledge", "knowledge"],
  ["packs", "packs"],
];
const featureSlices = [
  ["lifecycle", "lifecycle"],
  ["authoring", "authoring"],
  ["publishing", "publishing"],
  ["configuration", "configuration"],
  ["inspection", "inspection"],
  ["linting", "linting"],
  ["discovery", "discovery"],
  ["sharing", "sharing"],
  ["sync", "sync"],
  ["knowledge-query", "knowledge/query"],
];
const slices = [...kernelSlices, ...kindSlices, ...featureSlices];
const testSupportFolder = "testing";
const kindsLiveFile = "kinds-live.ts";

const leaf = (folder) => folder.split("/").at(-1);
// An element captures its folder's last segment (desired-state, query), which
// can differ from the slice name; policies are generated from the table, so the
// difference is invisible to them, and messages print the element path.
const sliceKey = ([, folder]) => leaf(folder);
const descriptor = (type) => (entry) => {
  const [, folder] = entry;
  const parent = folder.split("/").slice(0, -1);
  return {
    type,
    // An extglob group is a capture group, so the literal folder name lands in
    // `captured.slice` without matching any other folder.
    pattern: [root, ...parent, `@(${leaf(folder)})`].join("/"),
    capture: ["slice"],
    partialMatch: false,
  };
};
const depth = (element) => element.pattern.split("/").length;

// With `elements-single-match`, the first descriptor that matches a file is its
// element, so nested slice folders are listed before the folders that contain
// them (a stable sort on depth). kinds-live.ts is a file directly under src;
// element patterns only match folders, so a catch-all for src itself is listed
// last and only files outside every listed folder reach it (slices/placement
// rejects any such file except kinds-live.ts).
const sliceElements = [
  ...kernelSlices.map(descriptor("kernel")),
  ...kindSlices.map(descriptor("kind")),
  ...featureSlices.map(descriptor("feature")),
  { type: "test-support", pattern: `${root}/${testSupportFolder}`, partialMatch: false },
]
  .toSorted((a, b) => depth(b) - depth(a))
  .concat({ type: "kind-composition", pattern: root, partialMatch: false });

// Test purpose follows the build exclusions in tsconfig.lib.json plus the test
// seams (testing.ts) and named test doubles (test-*.ts).
const testFiles = [
  `${root}/${testSupportFolder}/**/*`,
  `${root}/**/*.{test,spec,shared-spec,type-test}.${ext}`,
  `${root}/**/{testing,test-*}.${ext}`,
  `${root}/**/{test-support,__tests__,__fixtures__}/**/*`,
];
// Only files inside a declared slice (or kinds-live.ts) get a category:
// no-unknown-files reports a file only when both its element and its file
// category are unknown, so a catch-all category would silence it.
const sliceFiles = [
  { category: "test", pattern: testFiles },
  {
    category: "production",
    pattern: [...slices.map(([, folder]) => `${root}/${folder}/**/*`), `${root}/${kindsLiveFile}`],
  },
];

const entryFiles = [`index.${ext}`, `live.${ext}`, `testing.${ext}`];
const at = (type, captured) => ({
  type,
  ...(captured ? { captured: { slice: captured } } : {}),
  fileInternalPath: entryFiles,
});
const kernelKeys = kernelSlices.map(sliceKey);
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
  ...kernelKeys.slice(1).map((slice, index) => ({
    from: { element: { type: "kernel", captured: { slice } } },
    allow: { to: { element: at("kernel", kernelKeys.slice(0, index + 1)) } },
  })),
  // Test-purpose files may also compose the shared test world, which itself
  // composes every tier (kinds-live.ts is a file element, so no entry filter).
  {
    from: { file: { categories: "test" } },
    allow: { to: { element: { type: "test-support" } } },
  },
  {
    from: { element: { type: "test-support" } },
    allow: {
      to: [
        { element: at(["kernel", "kind", "feature"]) },
        { element: { type: "kind-composition" } },
      ],
    },
  },
  // Explicit denials come last: the plugin uses last-match precedence.
  ...kernelKeys.slice(0, -1).map((slice, index) => ({
    from: { element: { type: "kernel", captured: { slice } } },
    disallow: {
      to: { element: { type: "kernel", captured: { slice: kernelKeys.slice(index + 1) } } },
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
      "a feature never depends on another feature; move shared behaviour inward.",
    ),
  },
  {
    from: { file: { categories: "production" } },
    disallow: { to: { file: { categories: "test" } } },
    message: described("production", "production code must not depend on tests or test support."),
  },
];

const sliceSourceFiles = [`${root}/**/*.${ext}`];

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
        // Other @agentxm packages are governed by Nx tags; only this package's
        // slices are classified here, so every other local package is external.
        "boundaries/flag-as-external": { customSourcePatterns: ["@agentxm/*", "@agentxm/*/**"] },
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
      // Every file under src belongs to a listed slice, except kinds-live.ts.
      name: "slices/placement",
      files: sliceSourceFiles,
      ignores: [
        ...slices.map(([, folder]) => `${root}/${folder}/**`),
        `${root}/${testSupportFolder}/**`,
        `${root}/${kindsLiveFile}`,
      ],
      rules: {
        "no-restricted-syntax": [
          "error",
          {
            selector: "Program",
            message:
              "Place workspace code in a declared slice folder (tools/architecture/slices.mjs).",
          },
        ],
      },
    },
  ];
}
