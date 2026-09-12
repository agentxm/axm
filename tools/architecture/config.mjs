import { readFileSync } from "node:fs";

// These are native JS Boundaries descriptors. Extend this enforced scope as
// capabilities acquire their final owners; unconverted packages retain Nx's
// existing constraints until the corresponding capability gate is active.
export const capabilityElements = [
  {
    type: "backstage",
    pattern: "packages/*/extension-model/src",
    capture: ["strategy"],
    partialMatch: false,
  },
  { type: "test-support", pattern: "tools/specification-metadata/src", partialMatch: false },
];

export const capabilityRoots = ["packages/core/extension-model/src"];
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
