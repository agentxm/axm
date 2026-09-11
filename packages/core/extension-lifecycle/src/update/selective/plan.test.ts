import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import {
  decodeExtensionNameSync,
  normalizeHandle,
  type ExtensionName,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { RegistrySubagentRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import { SourceHashSchema } from "@agentxm/extension-model/unstable/sources/source-hash";
import {
  decodeVersionSync,
  type Version,
} from "@agentxm/extension-model/unstable/version-constraints";
import type { JobStepResult } from "@agentxm/workspace-operations";
import {
  TreeIntegritySchema,
  type SkillLockEntry,
  type SkillsLockMap,
  type SubagentsLockMap,
} from "@agentxm/workspace-state";

import { buildSelectiveUpdatePlan, type SelectiveUpdateUnit } from "./plan.js";

const CONTENT_IDENTITY = Schema.decodeUnknownSync(SourceHashSchema)("test-content");
const TREE_INTEGRITY = Schema.decodeUnknownSync(TreeIntegritySchema)(
  `sha256-tree-v1:${"0".repeat(64)}`,
);
const AXM = normalizeHandle("@axm");

const extensionName = (value: string): ExtensionName => decodeExtensionNameSync(value);
const exactVersion = (value: string): Version => decodeVersionSync(value);
const handle = (value: string): Handle => normalizeHandle(value);

// -----------------------------------------------------------------------------
// Skills
// -----------------------------------------------------------------------------

const skillBase = (name: string) => ({
  type: "skill" as const,
  skill: {
    name: extensionName(name),
    description: Option.some(`${name} skill`),
    metadata: Option.none(),
  },
});

const makeSkillRef = (
  name: string,
  source:
    | { readonly type: "github"; readonly tree: string }
    | { readonly type: "registry"; readonly version: Version }
    | { readonly type: "local" },
): SkillExtensionRef => {
  if (source.type === "github") {
    return {
      ...skillBase(name),
      refType: "git-hosted",
      owner: AXM,
      name: extensionName(name),
      source: {
        type: "github",
        name: "github",
        url: new URL("https://github.com"),
        owner: "owner",
        repo: "repo",
        ref: Option.none(),
        subPath: Option.none(),
      },
      location: `file:///fake/${name}`,
      gitCommitSha: "commit",
      gitTreeSha: source.tree,
    };
  }
  if (source.type === "registry") {
    return {
      ...skillBase(name),
      refType: "registry",
      source: {
        type: "registry",
        name: "agentxm",
        location: new URL("http://localhost:3000"),
        owner: Option.none(),
      },
      owner: AXM,
      name: extensionName(name),
      version: source.version,
      integrity: Option.some("sha512-AAAA=="),
      publisherBindingId: "hbnd_test",
      packages: [],
    };
  }
  return {
    ...skillBase(name),
    refType: "local",
    owner: AXM,
    name: extensionName(name),
    source: { type: "local", path: "/fake" },
    location: `file:///fake/${name}`,
  };
};

const skillUnit = (
  name: string,
  source:
    | { readonly type: "github"; readonly tree: string }
    | { readonly type: "registry"; readonly version: Version }
    | { readonly type: "local" },
  force = false,
): SelectiveUpdateUnit<string> => ({
  name,
  ref: makeSkillRef(name, source),
  force,
  operation: "install-skill",
});

const githubLock = (name: string, tree: string): SkillLockEntry => ({
  type: "github",
  sourceType: "github",
  sourceName: "github",
  endpoint: new URL("https://github.com"),
  extensionType: "skill",
  workspaceName: extensionName(name),
  packageFormat: "agentxm",
  packageOwner: AXM,
  packageName: extensionName(name),
  owner: "owner",
  repo: "repo",
  resolvedCommit: "commit",
  resolvedTree: tree,
  contentIdentity: CONTENT_IDENTITY,
  treeIntegrity: TREE_INTEGRITY,
});

const registryLock = (version: Version): SkillLockEntry => ({
  type: "registry",
  sourceType: "registry",
  endpoint: new URL("http://localhost:3000"),
  extensionType: "skill",
  workspaceName: extensionName("skill"),
  packageFormat: "agentxm",
  owner: AXM,
  name: extensionName("skill"),
  resolvedVersion: version,
  integrity: "sha512-AAAA==",
  sourceName: "agentxm",
  publisherBindingId: "hbnd_test",
  treeIntegrity: TREE_INTEGRITY,
});

const dispatched = (operation: string) =>
  Effect.succeed<JobStepResult>({ result: "success", message: `executed ${operation}` });

const firstMessage = <TOperation>(
  unit: SelectiveUpdateUnit<TOperation>,
  locks: Readonly<Record<string, SkillLockEntry | undefined>>,
  run: (operation: TOperation) => Effect.Effect<JobStepResult>,
) => {
  const plan = buildSelectiveUpdatePlan([unit], locks, "Update", Option.none(), run);
  const step = plan.jobs[0]?.steps[0];
  if (step === undefined || step.readiness === "error") {
    throw new Error("missing ready plan step");
  }
  return step.run.pipe(Effect.map((result) => result.message));
};

describe("buildSelectiveUpdatePlan — skills", () => {
  it.effect("skips a Git resolution with the same accepted tree", () =>
    Effect.gen(function* () {
      const message = yield* firstMessage(
        skillUnit("commit", { type: "github", tree: "same-tree" }),
        { commit: githubLock("commit", "same-tree") },
        dispatched,
      );
      expect(message).toBe("already up to date");
    }),
  );

  it.effect("dispatches a Git resolution whose accepted tree changed", () =>
    Effect.gen(function* () {
      const message = yield* firstMessage(
        skillUnit("commit", { type: "github", tree: "new-tree" }),
        { commit: githubLock("commit", "old-tree") },
        dispatched,
      );
      expect(message).toBe("executed install-skill");
    }),
  );

  it.effect("compares registry resolutions by accepted version", () =>
    Effect.gen(function* () {
      const unchanged = yield* firstMessage(
        skillUnit("skill", { type: "registry", version: exactVersion("1.0.0") }),
        { skill: registryLock(exactVersion("1.0.0")) },
        dispatched,
      );
      const changed = yield* firstMessage(
        skillUnit("skill", { type: "registry", version: exactVersion("2.0.0") }),
        { skill: registryLock(exactVersion("1.0.0")) },
        dispatched,
      );
      expect(unchanged).toBe("already up to date");
      expect(changed).toBe("executed install-skill");
    }),
  );

  it.effect("dispatches local, missing, and forced resolutions", () =>
    Effect.gen(function* () {
      const local = yield* firstMessage(
        skillUnit("local", { type: "local" }),
        {
          local: {
            type: "local",
            sourceType: "local",
            sourceName: "local",
            extensionType: "skill",
            workspaceName: extensionName("local"),
            packageFormat: "agentxm",
            packageOwner: AXM,
            packageName: extensionName("local"),
            path: "source",
            contentIdentity: CONTENT_IDENTITY,
            treeIntegrity: TREE_INTEGRITY,
          },
        },
        dispatched,
      );
      const missing = yield* firstMessage(
        skillUnit("missing", { type: "github", tree: "tree" }),
        {},
        dispatched,
      );
      const forced = yield* firstMessage(
        skillUnit("forced", { type: "github", tree: "tree" }, true),
        { forced: githubLock("forced", "tree") },
        dispatched,
      );
      expect([local, missing, forced]).toEqual([
        "executed install-skill",
        "executed install-skill",
        "executed install-skill",
      ]);
    }),
  );

  it("preserves the plan envelope for empty work", () => {
    const plan = buildSelectiveUpdatePlan<string, never>(
      [],
      {} satisfies SkillsLockMap,
      "Update skills",
      Option.some("description"),
      dispatched,
    );
    expect(plan._tag).toBe("Plan");
    expect(plan.name).toBe("Update skills");
    expect(plan.description).toEqual(Option.some("description"));
    expect(plan.jobs[0]?.concurrency).toBe("unbounded");
    expect(plan.jobs[0]?.steps).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// Subagents
// -----------------------------------------------------------------------------

const makeSubagentRef = (name: string, version: string): RegistrySubagentRef => ({
  type: "subagent",
  refType: "registry",
  name: extensionName(name),
  owner: handle("@test"),
  version: exactVersion(version),
  integrity: Option.none(),
  publisherBindingId: "hbnd_test",
  packages: [],
  subagent: { name: extensionName(name), description: Option.none() },
  source: {
    type: "registry",
    name: "agentxm",
    location: new URL("file:///test-registry"),
    owner: Option.some(handle("@test")),
  },
});

const acceptedSubagent = (version: string): SubagentsLockMap => ({
  researcher: {
    type: "registry",
    sourceType: "registry",
    endpoint: new URL("file:///test-registry"),
    extensionType: "subagent",
    workspaceName: extensionName("researcher"),
    packageFormat: "agentxm",
    owner: handle("@test"),
    name: extensionName("researcher"),
    resolvedVersion: exactVersion(version),
    integrity: "sha512-AAAA==",
    sourceName: "agentxm",
    publisherBindingId: "hbnd_test",
    treeIntegrity: TREE_INTEGRITY,
  },
});

const applied = () => Effect.succeed<JobStepResult>({ result: "success", message: "applied" });

const runFirstSubagent = (version: string, force: boolean, locks: SubagentsLockMap) => {
  const plan = buildSelectiveUpdatePlan(
    [
      {
        name: "researcher",
        ref: makeSubagentRef("researcher", version),
        force,
        operation: makeSubagentRef("researcher", version),
      },
    ],
    locks,
    "Update subagents",
    Option.none(),
    applied,
  );
  const step = plan.jobs[0]?.steps[0];
  if (step === undefined || step.readiness === "error") return Effect.succeed("error");
  return step.run.pipe(Effect.map((result) => result.message));
};

describe("buildSelectiveUpdatePlan — subagents", () => {
  it.effect("skips the same accepted registry version", () =>
    Effect.gen(function* () {
      const message = yield* runFirstSubagent("1.0.0", false, acceptedSubagent("1.0.0"));
      expect(message).toBe("already up to date");
    }),
  );

  it.effect("dispatches changed, forced, and missing resolutions", () =>
    Effect.gen(function* () {
      const changed = yield* runFirstSubagent("2.0.0", false, acceptedSubagent("1.0.0"));
      const forced = yield* runFirstSubagent("1.0.0", true, acceptedSubagent("1.0.0"));
      const missing = yield* runFirstSubagent("1.0.0", false, {});
      expect([changed, forced, missing]).toEqual(["applied", "applied", "applied"]);
    }),
  );

  it("produces one empty unbounded job for empty input", () => {
    const plan = buildSelectiveUpdatePlan<RegistrySubagentRef, never>(
      [],
      {} satisfies SubagentsLockMap,
      "Update subagents",
      Option.none(),
      applied,
    );
    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]?.concurrency).toBe("unbounded");
    expect(plan.jobs[0]?.steps).toEqual([]);
  });
});
