/**
 * The shared-member constraint scenario every planner is tested against.
 *
 * Two Packs require one skill with broad ranges, the workspace also declares
 * that skill directly with an exact pin, and one MCP connection is declared
 * but disabled. The desired-state graph owns the one rule that combines those
 * contributors, so every planner that resolves the member — install, update,
 * and sync recovery — selects the pinned version, and a pin outside the Pack
 * ranges is one conflict naming all three contributors.
 *
 * The scenario is data first: the authored settings and the Registry
 * publications are the same for an in-memory graph evaluation and for a real
 * workspace with a file-backed Registry, so a specification at either
 * boundary reads the same facts.
 */

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions";
import { PackManifestSchema } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import { LOCKFILE_VERSION, type Lockfile } from "../desired/lockfile/index.js";
import { SettingsSchema } from "../desired/settings/index.js";
import { computePackManifestContentIdentity } from "./pack-manifest-content-identity.js";
import { makeRegistryPackLockEntry } from "./test-stubs.js";
import { evaluateDesiredState } from "./desired-state-evaluation.js";
import type { DesiredStateGraph } from "./desired-state-graph.js";
import { captureDesiredStateInputs } from "./desired-state-reader.js";
import { observePackManifest, type PackManifestsPort } from "./pack-manifests.js";

/** The skill both Packs require and the workspace pins. */
export const SHARED_MEMBER = {
  owner: "@acme",
  name: "review",
  fqn: "@acme/skills/review",
  /** Every published version, oldest first. */
  versions: ["1.0.0", "1.1.0", "1.2.0", "2.0.0"],
} as const;

/** The two Packs that require the shared member, each with a broad range. */
export const SHARED_MEMBER_PACKS = [
  { name: "alpha", fqn: "@acme/packs/alpha", range: "^1.0.0" },
  { name: "beta", fqn: "@acme/packs/beta", range: ">=1.0.0 <2.0.0" },
] as const;

/** Exact direct pins: one inside both Pack ranges, one outside both. */
export const SHARED_MEMBER_PIN = { inside: "1.1.0", outside: "2.0.0" } as const;

/** A declared MCP connection the workspace disabled; it constrains no other extension. */
export const DISABLED_MCP = {
  name: "offline-search",
  fqn: "@acme/mcps/offline-search",
  version: "1.0.0",
} as const;

/** The body each published version of the shared member carries. */
export const sharedMemberBody = (version: string): string => `Review guidance ${version}.`;

/** The Pack version every scenario Pack publishes. */
const PACK_VERSION = "1.0.0";

/** The Registry writes the scenario needs; every file-backed fixture Registry has them. */
export interface SharedMemberPublisher {
  readonly writeSkill: (
    name: string,
    versions: ReadonlyArray<{ readonly version: string; readonly body: string }>,
  ) => void;
  readonly writePack: (
    name: string,
    versions: ReadonlyArray<{
      readonly version: string;
      readonly dependencies: Readonly<Record<string, string>>;
    }>,
  ) => void;
  readonly writeMcp: (name: string, versions: ReadonlyArray<{ readonly version: string }>) => void;
}

/** Publish every version of the member, both Packs, and the disabled connection's package. */
export const publishSharedMemberScenario = (registry: SharedMemberPublisher): void => {
  registry.writeSkill(
    SHARED_MEMBER.name,
    SHARED_MEMBER.versions.map((version) => ({ version, body: sharedMemberBody(version) })),
  );
  for (const pack of SHARED_MEMBER_PACKS) {
    registry.writePack(pack.name, [
      { version: PACK_VERSION, dependencies: { [SHARED_MEMBER.fqn]: pack.range } },
    ]);
  }
  registry.writeMcp(DISABLED_MCP.name, [{ version: DISABLED_MCP.version }]);
};

/**
 * The authored settings entries that declare the scenario, with the given
 * direct pin. Merge them into a fixture's settings document.
 */
export const sharedMemberSettings = (pin: string) => ({
  skills: { [SHARED_MEMBER.name]: `${SHARED_MEMBER.fqn}@${pin}` },
  packs: Object.fromEntries(SHARED_MEMBER_PACKS.map((pack) => [pack.name, pack.fqn])),
  mcpServers: {
    [DISABLED_MCP.name]: { source: DISABLED_MCP.fqn, enabled: false },
  },
});

/**
 * The one text every route states when the shared member's accepted
 * resolution lies outside a later direct pin, written in the form install
 * records: install refuses to replay it and sync refuses to restore it, in
 * the same words.
 */
export const sharedMemberOutsidePinFact = (args: {
  /** The Registry source name the recorded direct pin qualifies. */
  readonly registry: string;
  readonly pin: string;
  readonly acceptedVersion: string;
}): string =>
  [
    "fact=workspace/extension-constraints-satisfied",
    `skill '${SHARED_MEMBER.fqn}' has constraint mismatch`,
    `authority=desired-state-graph:${args.registry}:${SHARED_MEMBER.fqn}@${args.pin}`,
    `constraints=${[
      `settings range=${args.pin} location=axm.json`,
      ...SHARED_MEMBER_PACKS.map(
        (pack) =>
          `${pack.fqn} range=${pack.range} location=axm-lock.yaml#packs.${pack.name}.dependencies[${JSON.stringify(SHARED_MEMBER.fqn)}]`,
      ),
    ].join(", ")}`,
    `accepted version=${args.acceptedVersion}`,
    "decision=blocked",
    "reason=accepted-resolution-incompatible",
  ].join("; ");

/**
 * The same scenario with a subagent as the shared member: the two Packs
 * require it with the same broad ranges, and the workspace pins it directly.
 * The subagent Packs carry their own names so the scenario can stand beside
 * the skill one.
 */
export const SHARED_SUBAGENT = {
  owner: SHARED_MEMBER.owner,
  name: "reviewer",
  fqn: "@acme/subagents/reviewer",
  versions: SHARED_MEMBER.versions,
} as const;

/** The two Packs that require the shared subagent, with the shared-member ranges. */
export const SHARED_SUBAGENT_PACKS = SHARED_MEMBER_PACKS.map((pack) => ({
  name: `${pack.name}-agents`,
  fqn: `${pack.fqn}-agents`,
  range: pack.range,
}));

/** The Registry writes the subagent scenario needs. */
export interface SharedSubagentPublisher {
  readonly writeSubagent: (
    name: string,
    versions: ReadonlyArray<{ readonly version: string; readonly body: string }>,
  ) => void;
  readonly writePack: SharedMemberPublisher["writePack"];
}

/** Publish every version of the shared subagent and both Packs that require it. */
export const publishSharedSubagentScenario = (registry: SharedSubagentPublisher): void => {
  registry.writeSubagent(
    SHARED_SUBAGENT.name,
    SHARED_SUBAGENT.versions.map((version) => ({ version, body: sharedMemberBody(version) })),
  );
  for (const pack of SHARED_SUBAGENT_PACKS) {
    registry.writePack(pack.name, [
      { version: PACK_VERSION, dependencies: { [SHARED_SUBAGENT.fqn]: pack.range } },
    ]);
  }
};

/** The authored entries that declare the subagent scenario with the given direct pin. */
export const sharedSubagentSettings = (pin: string) => ({
  subagents: { [SHARED_SUBAGENT.name]: `${SHARED_SUBAGENT.fqn}@${pin}` },
  packs: Object.fromEntries(SHARED_SUBAGENT_PACKS.map((pack) => [pack.name, pack.fqn])),
});

/** The manifest text each scenario Pack is materialized with. */
const scenarioManifestText = (name: string, range: string): string =>
  JSON.stringify({
    owner: SHARED_MEMBER.owner,
    type: "pack",
    name,
    version: PACK_VERSION,
    dependencies: { [SHARED_MEMBER.fqn]: range },
  });

/** Pack manifests held in memory, located where a registry Pack is materialized. */
const scenarioPackManifests: PackManifestsPort = {
  locate: ({ owner, name }) => {
    const pack = SHARED_MEMBER_PACKS.find((candidate) => candidate.name === name);
    const relativePath = `agent_extensions/registry.agentxm.ai/${owner}/packs/${name}/pack.json`;
    return {
      path: `/workspace/${relativePath}`,
      relativePath,
      manifest: Effect.succeed(
        observePackManifest(
          pack === undefined || owner !== SHARED_MEMBER.owner
            ? undefined
            : scenarioManifestText(name, pack.range),
        ),
      ),
    };
  },
};

/** The accepted resolutions that authorize each scenario Pack's materialized manifest. */
const scenarioAcceptedResolutions: Lockfile = {
  lockfileVersion: LOCKFILE_VERSION,
  skills: {},
  packs: Object.fromEntries(
    SHARED_MEMBER_PACKS.map((pack) => [
      pack.name,
      makeRegistryPackLockEntry({
        owner: decodeHandleSync(SHARED_MEMBER.owner),
        name: pack.name,
        dependencies: Schema.decodeUnknownSync(PackManifestSchema)(
          JSON.parse(scenarioManifestText(pack.name, pack.range)),
        ).dependencies,
        sourceHash: computePackManifestContentIdentity(
          Schema.decodeUnknownSync(PackManifestSchema)(
            JSON.parse(scenarioManifestText(pack.name, pack.range)),
          ),
        ),
      }),
    ]),
  ),
};

/**
 * The scenario's desired-state graph with the given direct pin, evaluated in
 * memory. `overrides` replaces top-level settings entries, such as the
 * configured sources or the direct declaration's spelling.
 */
export const sharedMemberGraph = (
  pin: string,
  overrides: Readonly<Record<string, unknown>> = {},
): Effect.Effect<DesiredStateGraph> =>
  captureDesiredStateInputs({
    manifests: scenarioPackManifests,
    baseDir: "/workspace",
    settings: Schema.decodeUnknownSync(SettingsSchema)({
      owner: SHARED_MEMBER.owner,
      ...sharedMemberSettings(pin),
      ...overrides,
    }),
    acceptedResolutions: scenarioAcceptedResolutions,
    registryEndpoints: { agentxm: new URL("https://registry.agentxm.ai") },
  }).pipe(Effect.map(evaluateDesiredState));
