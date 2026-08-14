import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { normalizeHandle, SourceHashSchema } from "@agentxm/client-core/unstable/extensions";
import type { SkillLockEntry, SkillsLockMap } from "@agentxm/client-core/unstable/lockfile";
import type { JobStepResult, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import type {
  InstallSkillOperation,
  SkillExtensionRef,
} from "@agentxm/client-core/unstable/skills";
import type { Version } from "@agentxm/client-core/unstable/version-constraints";
import { exactVersion, extensionName } from "../../../test-stubs.js";
import { buildUpdatePlan, type MakeRunClosure } from "./plan.js";

const CONTENT_IDENTITY = Schema.decodeUnknownSync(SourceHashSchema)("test-content");
const AXM = normalizeHandle("@axm");

const skillBase = (name: string) => ({
  type: "skill" as const,
  skill: {
    name: extensionName(name),
    description: Option.some(`${name} skill`),
    metadata: Option.none(),
  },
});

const makeOp = (
  name: string,
  source:
    | { readonly type: "github"; readonly tree: string }
    | { readonly type: "registry"; readonly version: Version }
    | { readonly type: "local" },
  force = false,
): InstallSkillOperation => {
  let ref: SkillExtensionRef;
  if (source.type === "github") {
    ref = {
      ...skillBase(name),
      refType: "git-hosted",
      source: {
        type: "github",
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
  } else if (source.type === "registry") {
    ref = {
      ...skillBase(name),
      refType: "registry",
      source: {
        type: "registry",
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
  } else {
    ref = {
      ...skillBase(name),
      refType: "local",
      source: { type: "local", path: "/fake" },
      location: `file:///fake/${name}`,
    };
  }

  return {
    name: "install-skill",
    args: {
      ref,
      force,
      versionRange: Option.none(),
      skipSettings: Option.none(),
      strictUnknownAgents: Option.none(),
      sourceName: Option.none(),
    },
  };
};

const githubLock = (tree: string): SkillLockEntry => ({
  type: "github",
  owner: "owner",
  repo: "repo",
  resolvedCommit: "commit",
  resolvedTree: tree,
  contentIdentity: CONTENT_IDENTITY,
});

const registryLock = (version: Version): SkillLockEntry => ({
  type: "registry",
  owner: AXM,
  name: extensionName("skill"),
  resolvedVersion: version,
  integrity: "sha512-AAAA==",
  sourceName: "default",
  publisherBindingId: "hbnd_test",
});

const stubRunClosure: MakeRunClosure = (op) =>
  Effect.succeed<JobStepResult>({ result: "success", message: `executed ${op.name}` });

const firstStep = (entries: ReadonlyArray<PlannedJobStep>): PlannedJobStep => {
  const step = entries[0];
  if (step === undefined) throw new Error("missing first plan step");
  return step;
};

const runMessage = (step: PlannedJobStep) =>
  step.readiness === "error"
    ? Effect.succeed("error")
    : step.run.pipe(Effect.map((result) => result.message));

const firstMessage = (op: InstallSkillOperation, locks: SkillsLockMap) => {
  const plan = buildUpdatePlan([op], locks, "Update", Option.none(), stubRunClosure);
  const job = plan.jobs[0];
  if (job === undefined) throw new Error("missing update job");
  return runMessage(firstStep(job.steps));
};

describe("buildUpdatePlan", () => {
  it.effect("skips a Git resolution with the same accepted tree", () =>
    Effect.gen(function* () {
      const message = yield* firstMessage(makeOp("commit", { type: "github", tree: "same-tree" }), {
        commit: githubLock("same-tree"),
      });
      expect(message).toBe("already up to date");
    }),
  );

  it.effect("dispatches a Git resolution whose accepted tree changed", () =>
    Effect.gen(function* () {
      const message = yield* firstMessage(makeOp("commit", { type: "github", tree: "new-tree" }), {
        commit: githubLock("old-tree"),
      });
      expect(message).toBe("executed install-skill");
    }),
  );

  it.effect("compares registry resolutions by accepted version", () =>
    Effect.gen(function* () {
      const unchanged = yield* firstMessage(
        makeOp("skill", { type: "registry", version: exactVersion("1.0.0") }),
        { skill: registryLock(exactVersion("1.0.0")) },
      );
      const changed = yield* firstMessage(
        makeOp("skill", { type: "registry", version: exactVersion("2.0.0") }),
        { skill: registryLock(exactVersion("1.0.0")) },
      );
      expect(unchanged).toBe("already up to date");
      expect(changed).toBe("executed install-skill");
    }),
  );

  it.effect("dispatches local, missing, and forced resolutions", () =>
    Effect.gen(function* () {
      const local = yield* firstMessage(makeOp("local", { type: "local" }), {
        local: { type: "local", path: "source", contentIdentity: CONTENT_IDENTITY },
      });
      const missing = yield* firstMessage(makeOp("missing", { type: "github", tree: "tree" }), {});
      const forced = yield* firstMessage(makeOp("forced", { type: "github", tree: "tree" }, true), {
        forced: githubLock("tree"),
      });
      expect([local, missing, forced]).toEqual([
        "executed install-skill",
        "executed install-skill",
        "executed install-skill",
      ]);
    }),
  );

  it("preserves the plan envelope for empty work", () => {
    const plan = buildUpdatePlan(
      [],
      {},
      "Update skills",
      Option.some("description"),
      stubRunClosure,
    );
    expect(plan._tag).toBe("Plan");
    expect(plan.name).toBe("Update skills");
    expect(plan.description).toEqual(Option.some("description"));
    expect(plan.jobs[0]?.concurrency).toBe("unbounded");
    expect(plan.jobs[0]?.steps).toEqual([]);
  });
});
