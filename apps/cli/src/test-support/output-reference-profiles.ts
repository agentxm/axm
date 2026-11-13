import * as Option from "effect/Option";
import {
  createNativeLocationTable,
  type NativeLocationOutcome,
} from "@agentxm/workspace-kernel/locations";
import { makeOperationResolution, type ResolvedUnit } from "@agentxm/workspace-kernel/operations";
import type {
  LocalInspectionDocument,
  ExtensionInventoryDocument,
} from "@agentxm/workspace-features/inspection";
import {
  normalizePublishResult,
  type PublishResultItem,
} from "@agentxm/workspace-features/publishing";
import { exactVersion, extensionName, handle } from "./test-stubs.js";

/** Fixed representation profiles; these are not timing or producer-behavior fixtures. */
const profileName = (index: number) =>
  `extension-reference-profile-${String(index).padStart(3, "0")}`;
const root = "/workspaces/cli-output-reference-profile";
const readers = Array.from(
  { length: 40 },
  (_, index) => `reader-${String(index).padStart(2, "0")}`,
);
const consumers = ["reader-00", "reader-01"];
const complete = { state: "complete", reasons: [] } satisfies LocalInspectionDocument["coverage"];

const agentProfile = (index: number) =>
  consumers.map((agentId) => ({
    extensionType: "skill" as const,
    name: profileName(index),
    agentId,
    outcome: "current" as const,
    reasonCode: "verified-native-unit" as const,
    reason: "The configured native location matches the selected canonical content.",
    mechanism: "symlink",
    path: `${root}/.${agentId}/skills/${profileName(index)}`,
  }));

const nativeProfile = (index: number): ReadonlyArray<NativeLocationOutcome> =>
  consumers.map((reader) => ({
    scope: "project",
    address: { kind: "entry", path: `${root}/.${reader}/skills/${profileName(index)}` },
    aliases: [],
    configuredConsumers: [reader],
    potentialReaders: readers,
    policyReasons: ["Selected configured consumer"],
    ownership: "owned",
    proof: "canonical-symlink-referent",
    state: "unchanged",
    mechanism: "symlink",
    availability: readers.map((agentId) => ({
      agentId,
      state: "unverified",
      reason: "Declared catalog reader; runtime selection and loading have not been observed.",
    })),
  }));

export const inspectionProfile = (count: number): LocalInspectionDocument => {
  const native = createNativeLocationTable();
  const items: LocalInspectionDocument["items"] = Array.from({ length: count }, (_, index) => ({
    id: `subject-${index}`,
    identity: {
      type: "skill",
      name: profileName(index),
      fqn: `@fixture/skills/${profileName(index)}`,
      scope: "project",
      source: {
        authority: "registry",
        sourceName: "fixture",
        endpoint: "https://registry.example.test",
        locator: `fixture:@fixture/skills/${profileName(index)}`,
      },
    },
    requestRefs: ["all"],
    editing: {
      kind: "authoring-transition-required",
      address: {
        path: `${root}/agent_extensions/registry.example.test/@fixture/skills/${profileName(index)}`,
      },
      reason: "Acquired canonical content requires an authored fork before customization.",
    },
    desired: {
      state: "reached",
      direct: true,
      enabled: true,
      packOrigins: ["@fixture/packs/review", "@fixture/packs/team"],
      declarations: [
        {
          kind: "direct",
          address: { path: `${root}/axm.json`, keys: ["skills", profileName(index)] },
          source: `fixture:@fixture/skills/${profileName(index)}`,
          enabled: true,
        },
        ...["review", "team"].map((name) => ({
          kind: "pack" as const,
          address: {
            path: `${root}/packs/${name}/pack.json`,
            keys: ["skills", profileName(index)],
          },
          contributorRef: `pack-${name}`,
          constraint: "^1.2.0",
          enabled: true,
        })),
      ],
      coverage: complete,
    },
    accepted: {
      state: "present",
      version: "1.2.3",
      source: { authority: "registry", endpoint: "https://registry.example.test" },
      coverage: complete,
    },
    observed: {
      state: "present",
      path: `${root}/agent_extensions/registry.example.test/@fixture/skills/${profileName(index)}`,
      manifestVersion: "1.2.3",
      canonicalStatus: "present",
      drift: "not-detected",
      coverage: complete,
    },
    retention: {
      reasons: [
        {
          kind: "direct-declaration",
          detail: "The direct project declaration still selects this package.",
        },
        ...["review", "team"].map((name) => ({
          kind: "pack-route" as const,
          contributorRef: `pack-${name}`,
          detail: `The enabled ${name} Pack still selects this package.`,
        })),
      ],
      coverage: complete,
    },
    nativeLocationRefs: native.add(nativeProfile(index), "observation"),
    duplicateDiscoveries: [],
    nativeCoverage: complete,
    agents: { configured: consumers, observed: consumers },
    agentOutcomes: agentProfile(index).map(
      ({ extensionType: _extensionType, name: _name, ...outcome }) => ({
        ...outcome,
        configuration: "valid" as const,
        projection: "current",
        readiness: "unverified" as const,
        runtime: "not-checked" as const,
      }),
    ),
    runtime: { state: "not-checked" },
  }));
  return {
    scope: "project",
    requests: [
      {
        id: "all",
        kind: "all",
        input: "--all",
        resolution: "resolved",
        code: 0,
        subjectRefs: items.map(({ id }) => id),
        candidateRefs: [],
      },
    ],
    items,
    supportingSubjects: ["review", "team"].map((name) => ({
      id: `pack-${name}`,
      identity: {
        type: "pack",
        name,
        scope: "project",
        fqn: `@fixture/packs/${name}`,
        source: { authority: "workspace" },
      },
    })),
    nativeLocations: native.records(),
    nativeReaderDeclarations: native.readerDeclarations(),
    observationDiagnostics: [],
    coverage: complete,
  };
};

export const inventoryProfile = (): ExtensionInventoryDocument => ({
  filter: "all",
  count: 30,
  totalCount: 30,
  managementCounts: { configured: 30, implicit: 0, leftover: 0, undeclared: 0, unmanaged: 0 },
  items: Array.from({ length: 30 }, (_, index) => ({
    type: index < 20 ? "skill" : "knowledge",
    name: profileName(index),
    scope: "project",
    fqn: `@fixture/${index < 20 ? "skills" : "knowledge"}/${profileName(index)}`,
    management: "configured",
    installed: true,
    enabled: true,
    version: "1.2.3",
    source: {
      kind: "registry",
      locator: `fixture:@fixture/skills/${profileName(index)}`,
      identity: `@fixture/skills/${profileName(index)}`,
    },
    agents: { configured: consumers, observed: consumers },
    inspection: { state: "not-requested" },
  })),
});

export const restorationProfile = () => {
  const units: ReadonlyArray<ResolvedUnit> = Array.from({ length: 50 }, (_, index) => ({
    id: `skill-${index}`,
    label: profileName(index),
    state: "committed",
    agentOutcomes: agentProfile(index),
    transitions: [
      {
        type: "skill",
        name: profileName(index),
        previous: {
          source: {
            kind: "registry",
            identity: `@fixture/skills/${profileName(index)}`,
            locator: "https://registry.example.test",
          },
          version: "1.2.3",
        },
        proposed: {
          source: {
            kind: "registry",
            identity: `@fixture/skills/${profileName(index)}`,
            locator: "https://registry.example.test",
          },
          version: "1.2.3",
        },
        observedReason: "Accepted canonical content is absent and must be restored.",
        downgrade: false,
      },
    ],
    artifact: {
      path: `${root}/agent_extensions/registry.example.test/@fixture/skills/${profileName(index)}`,
      scope: "project",
      change: "created",
      version: "1.2.3",
      nativeLocations: nativeProfile(index).map((location) => ({ ...location, state: "created" })),
    },
  }));
  return makeOperationResolution({
    name: "Restore selected workspace packages",
    description: Option.none(),
    mode: "apply",
    atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
    units,
  });
};

export const publicationProfile = () => {
  const results: ReadonlyArray<PublishResultItem> = [34, 33, 33].map((count, index) => ({
    id: `@fixture/skills/${profileName(index)}`,
    owner: handle("@fixture"),
    type: "skill",
    name: extensionName(profileName(index)),
    version: exactVersion("1.2.3"),
    action: "publish",
    phase: "authoritative_preflight",
    reason: "selected",
    status: "pending",
    archive: {
      included: Array.from({ length: count }, (_, file) => ({
        path: `references/reference-profile-document-${String(file).padStart(3, "0")}.md`,
        size: 512,
        matchedPatterns: ["references/**"],
        ruleOrigin: { kind: "manifest", field: "include", index: 0 },
      })),
      excluded: [],
      patterns: Array.from({ length: 5 }, (_, rule) => ({
        pattern: rule === 0 ? "references/**" : `optional-reference-${rule}/**`,
        matchCount: rule === 0 ? count : 0,
        origin: { kind: "manifest", field: "include", index: rule },
      })),
      patternCoverage: { explicit: "all", inherited: "matched-only", omittedInheritedCount: 300 },
      warnings: ["Four explicit include patterns matched no source files."],
      includedCount: count,
      excludedCount: 0,
      uncompressedBytes: count * 512,
      zipBytes: count * 128,
      integrity: `sha256-${"1".repeat(64)}`,
    },
  }));
  return normalizePublishResult({ mode: "preview", results });
};
