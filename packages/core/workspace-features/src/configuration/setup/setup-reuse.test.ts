/**
 * What one setup run reads once instead of twice. The report checks whether
 * the workspace is Git-managed only for the already-initialized view that
 * lists the ignore file from it. An unattended run, which nothing prompts or
 * writes between planning and applying, applies the instruction rows its plan
 * read from the lockfile under the same transaction instead of reading and
 * decoding the lockfile again; a run that asks for approval reads them again
 * after approval.
 *
 * Counts are exact for these fixtures and are taken after preparation.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import { afterEach } from "vitest";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import {
  ProjectionDigestSchema,
  ProjectionUnitPathSchema,
  recordedProjectionRows,
  type Projections,
} from "@agentxm/workspace-kernel/workspace-state";
import { NativePlatformTest, workObservations } from "@agentxm/workspace-kernel/locations/testing";

import {
  WorkspaceInitializationInteractionTest,
  makeSetupFixture,
  type SetupFixture,
  type SetupFixtureOptions,
} from "../testing.js";
import { transferredInstructionRows } from "./initialization.js";
import { SetupWorkspace, type SetupWorkspaceRequest } from "./setup-workspace.js";
import { setupWorkspaceTestLayer } from "./test-helpers.js";

/** The native platform, with its filesystem recorded. */
const recordingPlatform = Layer.merge(
  NativePlatformTest,
  layerRecordingFileSystem(NativePlatformTest),
);

const request = (
  root: string,
  overrides: Partial<Omit<SetupWorkspaceRequest, "projectRoot">> = {},
): SetupWorkspaceRequest => ({
  scope: "project",
  scopeExplicit: true,
  yes: true,
  nonInteractive: true,
  agents: ["claude-code"],
  ...overrides,
  projectRoot: decodeAbsolutePathSync(root),
  telemetryEnabled: false,
});

const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;

/** A lockfile recording one instruction alias AXM wrote earlier. */
const LOCK_WITH_ROWS = `version = 1

[projections.instructions]
contract = 1

[projections.instructions.units."CLAUDE.md"]
gen = "${DIGEST_B}"
output = "${DIGEST_A}"
`;

const GIT = { ".git/HEAD": "ref: refs/heads/main\n" };
const SOURCE = { "AGENTS.md": "# Team instructions\n" };

const WORKSPACE_WRITES: ReadonlySet<string> = new Set([
  "writeFile",
  "file.write",
  "file.writeAll",
  "rename",
  "copy",
  "copyFile",
  "symlink",
  "remove",
]);

/**
 * Prepare setup, then count what applying and reporting it do: accesses of
 * `<workspace>/.git`, lockfile content reads before the first write to a
 * workspace file (writes under `.axm/` coordinate the transaction, not the
 * workspace), and lockfile parses.
 */
const observeSetup = (
  fixture: SetupFixture,
  setupRequest: SetupWorkspaceRequest,
  interaction?: ReturnType<typeof WorkspaceInitializationInteractionTest>,
) =>
  fixture
    .provide(
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const observations = workObservations(false);
        const git = path.join(fixture.root, ".git");
        const lockfile = path.join(fixture.root, "axm.lock");
        recording.reset();
        const prepared = yield* SetupWorkspace.prepare(setupRequest);
        if (prepared._tag !== "SetupWorkspace") return yield* Effect.die("approval required");
        const preparing = recording.calls();
        recording.reset();
        const transition = yield* SetupWorkspace.previewOrApply(prepared).pipe(
          observations.provide,
          Effect.exit,
        );
        const applied = recording.calls();
        recording.reset();
        const outcome = Exit.isSuccess(transition)
          ? yield* SetupWorkspace.report({
              candidate: prepared,
              transition: transition.value,
              bundledSkill: { installed: false, version: "0.0.0-fixture" },
            })
          : undefined;
        const reported = recording.calls();
        const firstWrite = applied.findIndex((call) => {
          const relative = path.relative(fixture.root, call.path);
          return (
            WORKSPACE_WRITES.has(call.method) &&
            !relative.startsWith("..") &&
            !relative.startsWith(".axm")
          );
        });
        return {
          transition,
          outcome,
          calls: { preparing, applied, reported },
          counts: {
            gitChecks:
              applied.filter((call) => call.path === git).length +
              reported.filter((call) => call.path === git).length,
            reportGitChecks: reported.filter((call) => call.path === git).length,
            lockfileReadsBeforeWrite: (firstWrite === -1
              ? applied
              : applied.slice(0, firstWrite)
            ).filter((call) => call.path === lockfile && call.method === "readFile").length,
            lockfileAccess: applied.filter(
              (call) => call.path === lockfile && call.method === "access",
            ).length,
            lockfileParses: observations.facts.filter((fact) => fact.kind === "axm.parse.lockfile")
              .length,
          },
        };
      }).pipe(Effect.provide(setupWorkspaceTestLayer(setupRequest)), (effect) =>
        interaction === undefined ? effect : Effect.provide(effect, interaction.layer),
      ),
    )
    .pipe(Effect.provide(recordingPlatform));

describe("Setup reads once what nothing changes between its plan and its apply", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const fixtureWith = (options: SetupFixtureOptions) => {
    const fixture = makeSetupFixture(options);
    cleanups.push(fixture.cleanup);
    return fixture;
  };

  it.effect("an unattended first setup checks for Git only where it is used", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({ files: { ...GIT, ...SOURCE } });
      const observed = yield* observeSetup(fixture, request(fixture.root));
      expect(Exit.isSuccess(observed.transition)).toBe(true);
      // Before, the report checked once more and discarded the answer: 9 and 1.
      // With no lockfile, the apply no longer looks again for one to read rows
      // from: before, 8 lockfile accesses.
      expect(observed.counts).toEqual({
        gitChecks: 8,
        reportGitChecks: 0,
        lockfileReadsBeforeWrite: 0,
        lockfileAccess: 7,
        lockfileParses: 2,
      });
      expect(fixture.readFile(".gitignore")).toContain(".axm/");
    }),
  );

  it.effect("an unattended setup applies the instruction rows its plan read", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({ files: { ...GIT, ...SOURCE, "axm.lock": LOCK_WITH_ROWS } });
      const observed = yield* observeSetup(fixture, request(fixture.root));
      expect(Exit.isSuccess(observed.transition)).toBe(true);
      // Before, the apply read and decoded the lockfile again: 2 reads, 4 parses.
      expect(observed.counts).toMatchObject({ lockfileReadsBeforeWrite: 1, lockfileParses: 3 });
      expect(fs.readlinkSync(path.join(fixture.root, "CLAUDE.md"))).toBe("AGENTS.md");
    }),
  );

  it.effect("an approved interactive setup reads the instruction rows again after approval", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({
        confirmSetupPlan: true,
        files: { ...GIT, ...SOURCE, "axm.lock": LOCK_WITH_ROWS },
      });
      const observed = yield* observeSetup(
        fixture,
        request(fixture.root, { yes: false, nonInteractive: false }),
      );
      expect(Exit.isSuccess(observed.transition)).toBe(true);
      expect(fixture.promptState().confirmSetupPlanCalls).toHaveLength(1);
      expect(observed.counts).toMatchObject({ lockfileReadsBeforeWrite: 2, lockfileParses: 4 });
    }),
  );

  it.effect("a setup preview reads the instruction rows once and checks for Git where used", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({ files: { ...GIT, ...SOURCE, "axm.lock": LOCK_WITH_ROWS } });
      const before = fixture.snapshot();
      const observed = yield* observeSetup(fixture, request(fixture.root, { preview: true }));
      expect(Exit.isSuccess(observed.transition)).toBe(true);
      // Before, the report checked for Git once more: 3 and 1.
      expect(observed.counts).toMatchObject({
        gitChecks: 2,
        reportGitChecks: 0,
        lockfileReadsBeforeWrite: 1,
        lockfileParses: 1,
      });
      expect(fixture.snapshot()).toEqual(before);
    }),
  );

  it.effect("an already-initialized Git workspace still reports its ignore file", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({ files: { ...GIT, ...SOURCE } });
      yield* observeSetup(fixture, request(fixture.root));
      const rerun = yield* observeSetup(fixture, request(fixture.root));
      expect(rerun.outcome?.message).toBe(
        "Workspace already initialized; use `axm agents add` or `axm agents remove` to change coding agents",
      );
      expect(rerun.outcome?.steps[0]?.artifact?.targets?.map((target) => target.path)).toEqual([
        "axm.json",
        "axm.lock",
        ".gitignore",
      ]);
      expect(rerun.counts.reportGitChecks).toBe(1);
    }),
  );

  it.effect("a lockfile version changed while setup awaits approval refuses before writing", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({ files: { ...GIT, ...SOURCE, "axm.lock": LOCK_WITH_ROWS } });
      const newer = "version = 99\n";
      const interaction = WorkspaceInitializationInteractionTest({
        confirmSetupPlan: () =>
          Effect.sync(() => {
            fixture.writeFile("axm.lock", newer);
            return true;
          }),
      });
      const observed = yield* observeSetup(
        fixture,
        request(fixture.root, { yes: false, nonInteractive: false }),
        interaction,
      );
      expect(interaction.state.confirmSetupPlanCalls).toHaveLength(1);
      expect(Exit.isFailure(observed.transition)).toBe(true);
      if (Exit.isFailure(observed.transition)) {
        expect(Exit.findErrorOption(observed.transition)).toMatchObject({
          value: { _tag: "LockfileVersionUnsupported" },
        });
      }
      expect(fixture.exists("axm.json")).toBe(false);
      expect(fixture.exists("CLAUDE.md")).toBe(false);
      expect(fixture.readFile("axm.lock")).toBe(newer);
    }),
  );

  it.effect("a Git repository created while setup awaits approval gets the transient ignores", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({ files: { ...SOURCE } });
      const interaction = WorkspaceInitializationInteractionTest({
        confirmSetupPlan: () =>
          Effect.sync(() => {
            fixture.writeFile(".git/HEAD", "ref: refs/heads/main\n");
            return true;
          }),
      });
      const observed = yield* observeSetup(
        fixture,
        request(fixture.root, { yes: false, nonInteractive: false }),
        interaction,
      );
      expect(Exit.isSuccess(observed.transition)).toBe(true);
      expect(fixture.readFile(".gitignore")).toContain(".axm/");
    }),
  );

  it("the applied instruction rows share nothing with the rows the plan observed", () => {
    const key = ProjectionUnitPathSchema.make("CLAUDE.md");
    const recorded: NonNullable<Projections["instructions"]> = {
      contract: 1,
      units: {
        [key]: {
          gen: ProjectionDigestSchema.make(DIGEST_B),
          output: ProjectionDigestSchema.make(DIGEST_A),
        },
      },
    };
    const planned = recordedProjectionRows({ instructions: recorded }, "instructions");
    const applied = transferredInstructionRows(recorded);
    expect(applied).toEqual(planned);
    const appliedRow = applied.get(key)?.row;
    if (appliedRow === undefined) throw new Error("Expected the applied row");
    Object.assign(appliedRow, { output: DIGEST_B });
    expect(planned.get(key)?.row.output).toBe(DIGEST_A);
    expect(recorded.units[key]?.output).toBe(DIGEST_A);
  });
});

const callCount = (
  calls: ReadonlyArray<{ readonly method: string; readonly path: string }>,
  method: string,
  target: string,
) => calls.filter((call) => call.method === method && call.path === target).length;

/**
 * A setup plan resolves each bundled-skill native entry once and hands that
 * resolution to its output-concern observation; a preview's report describes
 * the same entries from that planning. An applied run's report still resolves
 * every entry again after the writes. An absent leaf costs two `readLink`
 * calls per resolution; the plan's admission checks resolve the entry again
 * on their own.
 */
describe("Setup resolves each bundled-skill entry once for its plan", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const fixtureWith = (options: SetupFixtureOptions) => {
    const fixture = makeSetupFixture(options);
    cleanups.push(fixture.cleanup);
    return fixture;
  };
  const skillStep = (outcome: Effect.Success<ReturnType<typeof observeSetup>>["outcome"]) =>
    outcome?.steps.find((step) => step.label === "@agentxm/skills/axm");
  const canonicalOf = (
    root: string,
    observed: Effect.Success<ReturnType<typeof observeSetup>>,
  ): string => {
    const row = Exit.isSuccess(observed.transition)
      ? observed.transition.value.plan?.find(
          (row) => row.detail._tag === "bundledSkill" && row.agentIds === undefined,
        )
      : undefined;
    if (row === undefined) throw new Error("Expected the canonical bundled-skill row");
    return path.resolve(root, row.target);
  };

  it.effect("a project preview plans and reports the agent entry from one resolution", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({ files: { ...SOURCE } });
      const leaf = path.join(fixture.root, ".claude", "skills", "axm");
      const before = fixture.snapshot();
      const observed = yield* observeSetup(fixture, request(fixture.root, { preview: true }));
      expect(Exit.isSuccess(observed.transition)).toBe(true);
      const canonical = canonicalOf(fixture.root, observed);
      // Before: 10 while planning (plan rows, admission, concerns) and 2 in the report.
      expect(callCount(observed.calls.applied, "readLink", leaf)).toBe(8);
      expect(callCount(observed.calls.reported, "readLink", leaf)).toBe(0);
      // Before: 2 in the report.
      expect(callCount(observed.calls.reported, "readLink", canonical)).toBe(0);
      expect(skillStep(observed.outcome)?.artifact?.targets).toEqual([
        {
          action: "create",
          detail: { _tag: "bundledSkill" },
          path: path.relative(fixture.root, canonical),
          change: "created",
        },
        {
          action: "create",
          detail: { _tag: "bundledSkill" },
          path: path.join(".agents", "skills", "axm"),
          change: "created",
        },
        {
          action: "create",
          detail: { _tag: "bundledSkill" },
          agentIds: ["claude-code"],
          path: path.join(".claude", "skills", "axm"),
          change: "created",
        },
      ]);
      expect(fixture.snapshot()).toEqual(before);
    }),
  );

  it.effect("a user preview plans and reports the agent entry from one resolution", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({});
      const leaf = path.join(fixture.home, ".claude", "skills", "axm");
      const observed = yield* observeSetup(
        fixture,
        request(fixture.root, { scope: "user", preview: true }),
      );
      expect(Exit.isSuccess(observed.transition)).toBe(true);
      // Before: 10 while planning and 2 in the report.
      expect(callCount(observed.calls.applied, "readLink", leaf)).toBe(8);
      expect(callCount(observed.calls.reported, "readLink", leaf)).toBe(0);
      expect(
        skillStep(observed.outcome)?.artifact?.targets?.map((target) => target.change),
      ).toEqual(["created", "created", "created"]);
    }),
  );

  it.effect("an applied setup's report resolves the agent entry again after writing", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({ files: { ...SOURCE } });
      const leaf = path.join(fixture.root, ".claude", "skills", "axm");
      const observed = yield* observeSetup(fixture, request(fixture.root));
      expect(Exit.isSuccess(observed.transition)).toBe(true);
      // Before: 10 while planning.
      expect(callCount(observed.calls.applied, "readLink", leaf)).toBe(8);
      expect(callCount(observed.calls.reported, "readLink", leaf)).toBe(4);
    }),
  );

  it.effect("an applied user setup's report resolves the agent entry again after writing", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({});
      const leaf = path.join(fixture.home, ".claude", "skills", "axm");
      const observed = yield* observeSetup(fixture, request(fixture.root, { scope: "user" }));
      expect(Exit.isSuccess(observed.transition)).toBe(true);
      expect(Exit.isSuccess(observed.transition) && observed.transition.value.initialized).toBe(
        true,
      );
      // Before: 10 while planning.
      expect(callCount(observed.calls.applied, "readLink", leaf)).toBe(8);
      expect(callCount(observed.calls.reported, "readLink", leaf)).toBe(4);
    }),
  );

  it.effect("an already-initialized setup plans nothing and reports as before", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({ files: { ...SOURCE } });
      const leaf = path.join(fixture.root, ".claude", "skills", "axm");
      yield* observeSetup(fixture, request(fixture.root));
      const rerun = yield* observeSetup(fixture, request(fixture.root));
      expect(callCount(rerun.calls.applied, "readLink", leaf)).toBe(0);
      expect(callCount(rerun.calls.reported, "readLink", leaf)).toBe(2);
    }),
  );

  it.effect("a preview that settles an existing instruction choice plans no skill entry", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({
        files: { ...SOURCE, "axm.json": `${JSON.stringify({ agents: ["claude-code"] })}\n` },
      });
      const leaf = path.join(fixture.root, ".claude", "skills", "axm");
      const observed = yield* observeSetup(fixture, request(fixture.root, { preview: true }));
      expect(Exit.isSuccess(observed.transition)).toBe(true);
      expect(callCount(observed.calls.applied, "readLink", leaf)).toBe(2);
      expect(callCount(observed.calls.reported, "readLink", leaf)).toBe(0);
    }),
  );

  it.effect("a preview reports a dangling agent entry it planned from one resolution", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({ files: { ...SOURCE } });
      const leaf = path.join(fixture.root, ".claude", "skills", "axm");
      fs.mkdirSync(path.dirname(leaf), { recursive: true });
      fs.symlinkSync(path.join(fixture.root, "missing"), leaf);
      const observed = yield* observeSetup(fixture, request(fixture.root, { preview: true }));
      expect(Exit.isSuccess(observed.transition)).toBe(true);
      // Before: 2.
      expect(callCount(observed.calls.reported, "readLink", leaf)).toBe(0);
      expect(skillStep(observed.outcome)?.artifact?.targets?.[2]).toEqual({
        action: "blocked",
        detail: { _tag: "bundledSkill", reason: `Preserved unowned skill artifact at ${leaf}` },
        agentIds: ["claude-code"],
        path: path.join(".claude", "skills", "axm"),
        change: "unchanged",
      });
      expect(
        observed.outcome?.steps.filter((step) => step.nativeOutputIssue !== undefined),
      ).toEqual([
        {
          label: leaf,
          status: "warning",
          nativeOutputIssue: "broken-link",
          message: `Link target '${path.join(fixture.root, "missing")}' is missing.`,
        },
      ]);
    }),
  );

  it.effect("a preview reports an existing agent copy it planned from one resolution", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({
        files: { ...SOURCE, ".claude/skills/axm/SKILL.md": "---\nname: axm\n---\n" },
      });
      const leaf = path.join(fixture.root, ".claude", "skills", "axm");
      const observed = yield* observeSetup(fixture, request(fixture.root, { preview: true }));
      expect(Exit.isSuccess(observed.transition)).toBe(true);
      // Before: 1.
      expect(callCount(observed.calls.reported, "readLink", leaf)).toBe(0);
      expect(skillStep(observed.outcome)?.artifact?.targets?.[2]).toEqual({
        action: "blocked",
        detail: { _tag: "bundledSkill", reason: `Preserved unowned skill artifact at ${leaf}` },
        agentIds: ["claude-code"],
        path: path.join(".claude", "skills", "axm"),
        change: "unchanged",
      });
    }),
  );

  it.effect("a preview through a linked project root reports what the physical root does", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({ files: { ...SOURCE } });
      const alias = `${fixture.root}-alias`;
      fs.symlinkSync(fixture.root, alias);
      cleanups.push(() => fs.rmSync(alias, { force: true }));
      const physical = yield* observeSetup(fixture, request(fixture.root, { preview: true }));
      const linked = yield* observeSetup(fixture, request(alias, { preview: true }));
      expect(linked.outcome?.steps).toEqual(physical.outcome?.steps);
      expect(
        callCount(
          linked.calls.reported,
          "readLink",
          path.join(fixture.root, ".claude", "skills", "axm"),
        ),
      ).toBe(0);
    }),
  );
});

/**
 * Unattended planning takes the instruction source's presence from the
 * candidate read it has just made. A run that asked which source to use
 * checks for it again after the answer. Agent detection checks for the
 * default source once before planning, and an apply's instruction sync once
 * after it; neither is shared.
 */
describe("Unattended setup planning checks the instruction source once", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const fixtureWith = (options: SetupFixtureOptions) => {
    const fixture = makeSetupFixture(options);
    cleanups.push(fixture.cleanup);
    return fixture;
  };
  const sourceAccess = (
    fixture: SetupFixture,
    observed: Effect.Success<ReturnType<typeof observeSetup>>,
  ) => {
    const source = path.join(fixture.root, "AGENTS.md");
    return (
      callCount(observed.calls.preparing, "access", source) +
      callCount(observed.calls.applied, "access", source)
    );
  };
  const sourceRow = (observed: Effect.Success<ReturnType<typeof observeSetup>>) =>
    Exit.isSuccess(observed.transition)
      ? observed.transition.value.plan?.find((row) => row.detail._tag === "instructionSource")
      : undefined;

  it.effect("an approved unattended setup", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({ files: { ...SOURCE } });
      const observed = yield* observeSetup(fixture, request(fixture.root));
      // Before: 3.
      expect(sourceAccess(fixture, observed)).toBe(2);
      expect(sourceRow(observed)).toEqual({
        target: "AGENTS.md",
        action: "in sync",
        detail: { _tag: "instructionSource" },
      });
    }),
  );

  it.effect("a preview", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({ files: { ...SOURCE } });
      const observed = yield* observeSetup(fixture, request(fixture.root, { preview: true }));
      // Before: 2.
      expect(sourceAccess(fixture, observed)).toBe(1);
    }),
  );

  it.effect("an approved setup that asks nothing about its source", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({ files: { ...SOURCE } });
      const observed = yield* observeSetup(
        fixture,
        request(fixture.root, { nonInteractive: false }),
      );
      expect(fixture.promptState().selectInstructionSourceCalls).toHaveLength(0);
      // Before: 3.
      expect(sourceAccess(fixture, observed)).toBe(2);
    }),
  );

  it.effect("an interactive setup with an explicit source", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({ confirmSetupPlan: true, files: { ...SOURCE } });
      const observed = yield* observeSetup(
        fixture,
        request(fixture.root, {
          yes: false,
          nonInteractive: false,
          instructions: { fileName: "AGENTS.md" },
        }),
      );
      expect(fixture.promptState().selectInstructionSourceCalls).toHaveLength(0);
      // Before: 3.
      expect(sourceAccess(fixture, observed)).toBe(2);
    }),
  );

  it.effect("an interactive setup checks the source it was told to use", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({ confirmSetupPlan: true, files: { ...SOURCE } });
      const observed = yield* observeSetup(
        fixture,
        request(fixture.root, { yes: false, nonInteractive: false }),
      );
      expect(fixture.promptState().selectInstructionSourceCalls).toHaveLength(1);
      expect(sourceAccess(fixture, observed)).toBe(3);
    }),
  );

  it.effect("a setup without instruction sync never checks the source", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({ files: { ...SOURCE } });
      const observed = yield* observeSetup(fixture, request(fixture.root, { instructions: false }));
      // Only agent detection's check, before and after.
      expect(sourceAccess(fixture, observed)).toBe(1);
      expect(sourceRow(observed)).toBeUndefined();
    }),
  );

  it.effect("an absent source is still deferred", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({});
      const observed = yield* observeSetup(fixture, request(fixture.root, { preview: true }));
      // Before: 2.
      expect(sourceAccess(fixture, observed)).toBe(1);
      expect(sourceRow(observed)).toEqual({
        target: "AGENTS.md",
        action: "skip",
        detail: { _tag: "instructionSource", deferred: true },
      });
    }),
  );

  it.effect("an empty source is in sync, not deferred", () =>
    Effect.gen(function* () {
      const fixture = fixtureWith({ files: { "AGENTS.md": "" } });
      const observed = yield* observeSetup(fixture, request(fixture.root, { preview: true }));
      // Before: 2.
      expect(sourceAccess(fixture, observed)).toBe(1);
      expect(sourceRow(observed)).toEqual({
        target: "AGENTS.md",
        action: "in sync",
        detail: { _tag: "instructionSource" },
      });
    }),
  );
});
