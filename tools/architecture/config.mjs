import { readFileSync } from "node:fs";

// These are native JS Boundaries descriptors. Extend this enforced scope as
// capabilities acquire their final owners; unconverted packages retain Nx's
// existing constraints until the corresponding capability gate is active.
export const capabilityElements = [
  {
    type: "frontstage",
    pattern: "packages/*/extension-lifecycle/src/mcps",
    capture: ["strategy"],
    partialMatch: false,
  },
  {
    type: "frontstage",
    pattern: "packages/*/extension-lifecycle/src/skills",
    capture: ["strategy"],
    partialMatch: false,
  },
  {
    type: "frontstage",
    pattern: "packages/*/extension-lifecycle/src/subagents",
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
  "packages/core/extension-lifecycle/src/mcps/domain",
  // Enforce the extracted owner policy and contracts. The remaining install,
  // projection, and source-acquisition implementations still need migration.
  "packages/core/extension-lifecycle/src/skills/domain",
  "packages/core/extension-lifecycle/src/skills/application",
  "packages/core/extension-lifecycle/src/subagents/domain",
  "packages/core/extension-lifecycle/src/subagents/application",
  "packages/core/extension-model/src",
  "packages/supporting/cli-maintenance/src/official-skill",
  "packages/supporting/cli-maintenance/src/self-update",
];
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
];
