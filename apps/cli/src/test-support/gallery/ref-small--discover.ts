import * as Schema from "effect/Schema";

import { PackageUrlSchema } from "@agentxm/extension-model/unstable/packaging/package-url";
import { AgentExtensionSourceSchema } from "@agentxm/extension-model/unstable/recommendations/agent-extensions";
import { DiscoveryResolvedExtensionSchema } from "@agentxm/registry-protocol/unstable/registry/discover-schema";
import type { DiscoverExtensionsResult } from "@agentxm/workspace/discovery";

import type { Doc } from "../../screen/doc.js";
import { discoverDoc } from "../../root/discover/view.js";

const companion = (
  owner: string,
  type: string,
  name: string,
  version: string,
  trust: {
    readonly attestedBy: ReadonlyArray<"package" | "extension">;
    readonly official: boolean;
  },
) => ({
  ref: `${owner}/${type}s/${name}`,
  source: { type: "registry", url: new URL("https://registry.agentxm.ai") } as const,
  resolved: true,
  extension: Schema.decodeUnknownSync(DiscoveryResolvedExtensionSchema)({
    owner,
    type,
    name,
    resolution: { type: "registry", version },
  }),
  packageVersionInRange: true,
  ...trust,
});

const locatorCompanion = (name: string, sourceInput: unknown) => {
  const source = Schema.decodeUnknownSync(AgentExtensionSourceSchema)(sourceInput);
  return {
    ref: `@acme/skills/${name}`,
    source,
    resolved: true,
    extension: Schema.decodeUnknownSync(DiscoveryResolvedExtensionSchema)({
      owner: "@acme",
      type: "skill",
      name,
      resolution: sourceInput,
    }),
    attestedBy: ["package"],
    official: false,
    packageVersionInRange: true,
  } satisfies DiscoverExtensionsResult["packages"][number]["extensions"][number];
};

const found = {
  document: { items: [], count: 2, totalDetected: 14, registryAvailable: true },
  registryAvailable: true,
  packages: [
    {
      detectedPackage: Schema.decodeUnknownSync(PackageUrlSchema)("pkg:npm/vitest@3.2.4"),
      extensions: [
        companion("@acme", "skill", "code-review", "1.4.0", {
          attestedBy: ["package", "extension"],
          official: true,
        }),
        companion("@acme", "subagent", "reviewer", "0.9.0", {
          attestedBy: ["package", "extension"],
          official: false,
        }),
        locatorCompanion("git-review", {
          type: "git",
          url: "https://github.com/acme/review-tools.git",
          path: "skills/git-review",
          revision: "v2.1.0",
        }),
      ],
    },
    {
      detectedPackage: Schema.decodeUnknownSync(PackageUrlSchema)("pkg:npm/eslint@9.30.0"),
      extensions: [
        companion("@sam", "skill", "review-notes", "0.2.1", {
          attestedBy: ["extension"],
          official: false,
        }),
        locatorCompanion("local-review", {
          type: "path",
          path: "extensions/local-review",
        }),
      ],
    },
  ],
} satisfies DiscoverExtensionsResult;

const none = {
  document: { items: [], count: 0, totalDetected: 14, registryAvailable: true },
  registryAvailable: true,
  packages: [],
} satisfies DiscoverExtensionsResult;

/**
 * Recommended companions (*Reference cases*, board `7 · Smaller cases`, frame
 * *discover — a table with trust marks; zero results names the query*).
 *
 * Each row carries its tinted type and how far it is vouched for. `axm
 * discover` takes no query, so where the canvas names one the empty state
 * names what was scanned instead.
 */
export const refSmallDiscover: Doc = [
  ...discoverDoc(found),
  { _tag: "blank" },
  ...discoverDoc(none),
];
