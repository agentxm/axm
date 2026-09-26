import { readFileSync } from "node:fs";

// These are native JS Boundaries descriptors. Extend this enforced scope as
// capabilities acquire their final owners; unconverted packages retain Nx's
// existing constraints until the corresponding capability gate is active.
export const capabilityElements = [
  {
    type: "frontstage",
    pattern: "packages/core/extension-kinds/src/mcp-connections/lifecycle",
    capture: ["strategy"],
    partialMatch: false,
  },
  {
    type: "frontstage",
    pattern: "packages/core/extension-kinds/src/skills/lifecycle",
    capture: ["strategy"],
    partialMatch: false,
  },
  {
    type: "frontstage",
    pattern: "packages/core/extension-kinds/src/subagents/lifecycle",
    capture: ["strategy"],
    partialMatch: false,
  },
  {
    type: "backstage",
    pattern: "packages/*/extension-model/src",
    capture: ["strategy"],
    partialMatch: false,
  },
  {
    type: "backstage",
    pattern: "packages/*/host-primitives/src",
    capture: ["strategy"],
    partialMatch: false,
  },
  {
    type: "backstage",
    pattern: "packages/*/cli-maintenance/src/official-skill",
    capture: ["strategy"],
    partialMatch: false,
  },
  {
    type: "frontstage",
    pattern: "packages/*/cli-maintenance/src/self-update",
    capture: ["strategy"],
    partialMatch: false,
  },
  { type: "test-support", pattern: "tools/specification-metadata/src", partialMatch: false },
];

export const capabilityRoots = [
  "packages/core/extension-kinds/src/mcp-connections/lifecycle/domain",
  // Enforce the extracted application contracts. The remaining install,
  // projection, and source-acquisition implementations still need migration.
  "packages/core/extension-kinds/src/skills/lifecycle/application",
  "packages/core/extension-kinds/src/subagents/lifecycle/application",
  "packages/core/extension-model/src",
  "packages/generic/host-primitives/src",
  "packages/supporting/cli-maintenance/src/official-skill",
  "packages/supporting/cli-maintenance/src/self-update",
];

const slicePackages = ["workspace-kernel", "extension-kinds", "workspace-features"];

// The cycle gate cruises every slice of the three workspace packages; the
// capability roots inside extension-kinds are already covered by it.
export const cycleRoots = [
  ...slicePackages.map((name) => `packages/core/${name}/src`),
  ...capabilityRoots.filter((root) => !root.startsWith("packages/core/extension-kinds/src/")),
];

// The cruise follows imports into supporting packages that are not gated here
// (their own cycles are out of scope), so file cycles are judged from the roots.
export const cycleRootPath = `^(?:${cycleRoots.join("|")})/`;

// Folder cycles count only between slices (one folder under src/). Sub-folders
// inside one slice are organisational (lifecycle/install and lifecycle/uninstall
// may cycle), so the folder rule matches slice folders at both ends.
export const sliceFolder = `^packages/core/(?:${slicePackages.join("|")})/src/[^/]+$`;

export const capabilitySourceFiles = capabilityRoots.map(
  (root) => `${root}/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}`,
);

const model = JSON.parse(
  readFileSync(
    new URL("../../packages/core/extension-model/package.json", import.meta.url),
    "utf8",
  ),
);
export const capabilityFileDescriptors = [
  {
    pattern: Object.values(model.exports).map(
      (entry) => `packages/core/extension-model/${entry["axm-source"].slice(2)}`,
    ),
    category: "domain-api",
  },
  { pattern: "packages/core/extension-model/src/**/*", category: "domain" },
  { pattern: "packages/generic/host-primitives/src/**/*", category: "adapter" },
];
