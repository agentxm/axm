import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { defineSpecification } from "@agentxm/specification-metadata";
import {
  FootprintRecorder,
  WorkspaceTransactionScope,
  makeFootprintRecorder,
  protectWorkspacePath,
} from "@agentxm/workspace-transactions";
import { injectWriteFaults } from "@agentxm/workspace-transactions/testing";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import {
  ConfiguredAgentOutcomesProviderTest,
  makeBaseWorkspaceMock,
} from "@agentxm/workspace-state/testing";

import { StepFailure } from "./errors.js";
import { OperationJournal, makeOperationJournal } from "./operation-journal.js";
import { deriveOperationOutcome } from "./operation-resolution.js";
import type { Plan } from "./plan.js";
import { preapprovedPlanExecution, promptablePlanExecution } from "./plan-execution-fixtures.js";
import { ResolvePlanInteractionTest, type ApplyConfirmation } from "./resolve-plan-interaction.js";
import { prepareExecutionCandidate, resolveExecutionCandidate } from "./resolve-plan.js";
import { workspaceTransactionFailureToStepFailure } from "./step-failure-conversions.js";
import type { PlanInteractionFailed } from "./errors.js";

export const specification = defineSpecification({
  requirement: "cli/mutations-are-closure-atomic",
  title:
    "A workspace change that cannot complete leaves each semantic closure either fully committed or fully restored",
  statement:
    "When a workspace change cannot complete, AXM shall write nothing for a request refused before application or whose prepared candidate is found stale under the workspace lock, shall restore the settings, lockfile, canonical content, and owned projections that a failed semantic closure had changed while leaving independently settled closures committed, and shall report every closure's outcome and any retained state as a failed operation outcome that automation can distinguish.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  boundary: "memory",
  boundaryRationale:
    "Closure execution, rollback, and settlement are decided by the plan pipeline over a real temporary workspace; the durable-file effects the rule is about are observable there without a process boundary.",
  methods: ["decision-table", "example"],
  derivedFrom: [
    "docs/architecture/workspace/execution.md",
    "docs/architecture/decisions/closure-atomicity-and-recovery.md",
  ],
  supersedes: [],
  assumptions: [
    "The nonzero exit an operator observes is the CLI's mapping of these outcomes; cli/exit-codes-match-published-reference owns that mapping and carries the partial and interrupted rows.",
    "The three refusal rows carry the refusal facts of the routes that produce them; the route-level admission grammar is owned by cli/install/non-installable-sources-do-not-mutate.",
  ],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "Remote Registry effects are not restored; cli/publish/outcomes-distinguish-unresolved-uploads owns their reporting.",
      retirementCondition: "The Registry gains a transactional publish contract.",
    },
  ],
});

/** A workspace on disk whose authoritative files can be compared byte for byte. */
const makeWorkspace = (prefix: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix });
    const workspaceDir = path.join(root, ".axm");
    yield* fs.makeDirectory(workspaceDir, { recursive: true });
    const settingsPath = path.join(root, "axm.json");
    const lockPath = path.join(root, "axm-lock.yaml");
    yield* fs.writeFileString(settingsPath, '{\n  "skills": {\n    "alpha": "workspace"\n  }\n}\n');
    yield* fs.writeFileString(lockPath, "lockfileVersion: 7\nskills: {}\n");
    return { root, workspaceDir, settingsPath, lockPath };
  });

/** Every authoritative file and canonical tree entry, by relative path. */
const snapshot = (root: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = [...(yield* fs.readDirectory(root, { recursive: true }))].sort();
    const content: Record<string, string> = {};
    for (const entry of entries) {
      const absolute = path.join(root, entry);
      const info = yield* fs.stat(absolute);
      content[entry] =
        info.type === "File" ? yield* fs.readFileString(absolute) : `<${info.type.toLowerCase()}>`;
    }
    return content;
  });

const context = (
  workspaceDir: string,
  options?: {
    readonly confirmApplyChanges?: () => Effect.Effect<ApplyConfirmation, PlanInteractionFailed>;
    readonly confirmationAvailable?: boolean;
  },
) => {
  const interaction = ResolvePlanInteractionTest({
    ...(options?.confirmationAvailable === undefined
      ? {}
      : { isConfirmationAvailable: options.confirmationAvailable }),
    ...(options?.confirmApplyChanges === undefined
      ? {}
      : { confirmApplyChanges: options.confirmApplyChanges }),
  });
  return {
    interaction,
    layer: Layer.mergeAll(
      Layer.succeed(WorkspaceMutations, makeBaseWorkspaceMock(workspaceDir)),
      interaction.layer,
      ConfiguredAgentOutcomesProviderTest,
      Layer.effect(OperationJournal, makeOperationJournal),
      Layer.effect(FootprintRecorder, makeFootprintRecorder),
      Layer.unwrap(
        Effect.map(Path.Path, (path) =>
          WorkspaceTransactionScope.layer({
            workspaceDir,
            settingsPath: path.join(path.dirname(workspaceDir), "axm.json"),
            lockPath: path.join(path.dirname(workspaceDir), "axm-lock.yaml"),
          }),
        ),
      ),
    ),
  };
};

/**
 * One protected durable write inside a closure. It takes its file system from
 * the environment, so a fault injected at the port is the one the closure hits.
 */
const write = (
  target: string,
  content: string,
): Effect.Effect<void, StepFailure, FileSystem.FileSystem | WorkspaceTransactionScope> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* protectWorkspacePath(target).pipe(
      Effect.mapError(workspaceTransactionFailureToStepFailure),
    );
    yield* fs
      .writeFileString(target, content)
      .pipe(
        Effect.mapError(
          (cause) => new StepFailure({ category: "internal", detail: "write refused", cause }),
        ),
      );
  });

const plan = <Requirements = never>(
  over: Partial<Plan<Requirements>> & Pick<Plan<Requirements>, "jobs">,
): Plan<Requirements> => ({
  _tag: "Plan",
  name: "Install extensions",
  description: Option.none(),
  ...over,
});

/**
 * A request AXM refuses. Each row is a real refusal a route reaches: the
 * source is not there, the package cannot be read, or desired state names an
 * extension nothing resolves. None of them may leave a trace.
 */
const refusals = [
  {
    label: "a source path that does not exist",
    detail: "./vendor/gone does not exist",
  },
  {
    label: "a package whose manifest is not readable as JSON",
    detail: "./vendor/malformed/skill.json is not readable as JSON",
  },
  {
    label: "a desired extension nothing resolves",
    detail: "skills.gone: ./vendor/gone could not be resolved",
  },
] as const;

describe("A workspace change that cannot complete", () => {
  it.effect.each(refusals)("writes nothing when it refuses $label", (row) =>
    Effect.gen(function* () {
      const workspace = yield* makeWorkspace("axm-atomicity-refusal-");
      const before = yield* snapshot(workspace.root);
      const services = context(workspace.workspaceDir);

      const refused = plan({
        jobs: [
          {
            concurrency: 1,
            steps: [{ readiness: "error", label: "alpha", errorMessage: row.detail }],
          },
        ],
      });
      const candidate = yield* prepareExecutionCandidate(refused).pipe(
        Effect.provide(services.layer),
      );
      const resolution = yield* resolveExecutionCandidate(candidate, preapprovedPlanExecution).pipe(
        Effect.provide(services.layer),
      );

      expect(deriveOperationOutcome(resolution)).toBe("blocked");
      expect(resolution.units.map((unit) => unit.state)).toEqual(["blocked"]);
      expect(yield* snapshot(workspace.root)).toEqual(before);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("writes nothing when the prepared candidate turns stale before apply", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const workspace = yield* makeWorkspace("axm-atomicity-stale-");
      const target = path.join(workspace.root, "managed.txt");
      yield* fs.writeFileString(target, "original");
      let applied = 0;
      // Another writer changes the workspace while the person is deciding.
      const services = context(workspace.workspaceDir, {
        confirmationAvailable: true,
        confirmApplyChanges: () =>
          fs
            .writeFileString(workspace.settingsPath, '{\n  "skills": {}\n}\n')
            .pipe(Effect.as("approved" as const), Effect.orDie),
      });

      const install = plan({
        name: "Install @acme/skills/alpha",
        materialPaths: [workspace.settingsPath],
        riskConditions: [
          { level: "confirmable", id: "publisher-change", detail: "Publisher changed" },
        ],
        jobs: [
          {
            concurrency: 1,
            steps: [
              {
                readiness: "ready",
                label: "alpha",
                run: Effect.sync(() => {
                  applied += 1;
                  return { result: "success" as const, message: "installed" };
                }),
              },
            ],
          },
        ],
      });

      const candidate = yield* prepareExecutionCandidate(install).pipe(
        Effect.provide(services.layer),
      );
      const previewed = yield* resolveExecutionCandidate(candidate, {
        request: { mode: "preview" },
      }).pipe(Effect.provide(services.layer));
      const resolution = yield* resolveExecutionCandidate(
        candidate,
        promptablePlanExecution({ command: ["install"], arguments: [] }),
      ).pipe(Effect.provide(services.layer));

      expect(deriveOperationOutcome(resolution)).toBe("blocked");
      expect(resolution.blocking?.class).toBe("stale-candidate");
      // The blocked report is about the very candidate the person saw.
      expect(resolution.candidateId).toBe(previewed.candidateId);
      expect(applied).toBe(0);
      expect(yield* fs.readFileString(target)).toBe("original");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("restores a closure that fails after it has already written", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const workspace = yield* makeWorkspace("axm-atomicity-after-write-");
      const canonical = path.join(workspace.root, "agent_extensions", "acme", "skills", "alpha");
      const projection = path.join(workspace.root, ".claude", "skills", "alpha");
      yield* fs.makeDirectory(canonical, { recursive: true });
      yield* fs.makeDirectory(path.dirname(projection), { recursive: true });
      yield* fs.writeFileString(path.join(canonical, "SKILL.md"), "# alpha 1.0.0\n");
      const before = yield* snapshot(workspace.root);
      const services = context(workspace.workspaceDir);

      const install: Plan<FileSystem.FileSystem | WorkspaceTransactionScope> = plan({
        name: "Install @acme/skills/alpha",
        jobs: [
          {
            concurrency: 1,
            steps: [
              {
                readiness: "ready",
                key: "skill:alpha",
                label: "alpha",
                // Settings, lock, and canonical content are written first;
                // the projection write is the one the fault refuses.
                run: Effect.gen(function* () {
                  yield* write(
                    workspace.settingsPath,
                    '{\n  "skills": {\n    "alpha": "1.1.0"\n  }\n}\n',
                  );
                  yield* write(workspace.lockPath, "lockfileVersion: 7\nskills:\n  alpha: 1.1.0\n");
                  yield* write(path.join(canonical, "SKILL.md"), "# alpha 1.1.0\n");
                  yield* write(projection, "# alpha 1.1.0\n");
                  return { result: "success" as const, message: "installed" };
                }).pipe(
                  Effect.catch((error: StepFailure) =>
                    Effect.succeed({
                      result: "error" as const,
                      message: "projection write refused",
                      error,
                    }),
                  ),
                ),
              },
            ],
          },
        ],
      });

      const resolution = yield* prepareExecutionCandidate(install).pipe(
        Effect.flatMap((candidate) =>
          resolveExecutionCandidate(candidate, preapprovedPlanExecution),
        ),
        // The fault is injected at the port, not by patching a module: the
        // one projection write fails, every other write succeeds.
        Effect.provide(
          Layer.provideMerge(
            services.layer,
            injectWriteFaults(
              (operation) => operation.kind === "writeFileString" && operation.path === projection,
              "projection write refused",
            ),
          ),
        ),
      );

      expect(deriveOperationOutcome(resolution)).toBe("failed");
      expect(resolution.units.map((unit) => [unit.id, unit.state, unit.disposition])).toEqual([
        ["skill:alpha", "failed", "restored"],
      ]);
      expect(resolution.atomicity.applied).toBe("closure-atomic");
      // Every family the closure had already written is back as it was.
      expect(yield* snapshot(workspace.root)).toEqual(before);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "keeps independently settled closures committed and converges the rest on a retry",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const workspace = yield* makeWorkspace("axm-atomicity-independent-");
        const alpha = path.join(workspace.root, "alpha.txt");
        const beta = path.join(workspace.root, "beta.txt");
        yield* fs.writeFileString(alpha, "alpha-original");
        yield* fs.writeFileString(beta, "beta-original");
        const services = context(workspace.workspaceDir);

        const realize = (target: string, content: string) =>
          write(target, content).pipe(
            Effect.map(() => ({ result: "success" as const, message: "realized" })),
            Effect.catch((error: StepFailure) =>
              Effect.succeed({ result: "error" as const, message: "write refused", error }),
            ),
          );

        const sync: Plan<FileSystem.FileSystem | WorkspaceTransactionScope> = plan({
          name: "Reconcile workspace",
          jobs: [
            {
              concurrency: 1,
              executionPolicy: "best-effort",
              steps: [
                {
                  readiness: "ready",
                  key: "skill:alpha",
                  label: "alpha",
                  run: realize(alpha, "alpha-realized"),
                },
                {
                  readiness: "ready",
                  key: "skill:beta",
                  label: "beta",
                  run: realize(beta, "beta-realized"),
                },
              ],
            },
          ],
        });

        const first = yield* prepareExecutionCandidate(sync).pipe(
          Effect.flatMap((candidate) =>
            resolveExecutionCandidate(candidate, preapprovedPlanExecution),
          ),
          Effect.provide(
            Layer.provideMerge(
              services.layer,
              injectWriteFaults(
                (operation) => operation.kind === "writeFileString" && operation.path === beta,
              ),
            ),
          ),
        );

        expect(deriveOperationOutcome(first)).toBe("partial");
        expect(first.units.map((unit) => [unit.id, unit.state])).toEqual([
          ["skill:alpha", "committed"],
          ["skill:beta", "failed"],
        ]);
        expect(first.units[1]?.disposition).toBe("restored");
        expect(yield* fs.readFileString(alpha)).toBe("alpha-realized");
        expect(yield* fs.readFileString(beta)).toBe("beta-original");

        // With the fault removed, a second reconciliation converges beta and
        // reports the closure that already settled as unchanged.
        const retry = yield* prepareExecutionCandidate(sync).pipe(
          Effect.flatMap((candidate) =>
            resolveExecutionCandidate(candidate, preapprovedPlanExecution),
          ),
          Effect.provide(services.layer),
        );

        expect(deriveOperationOutcome(retry)).toBe("applied");
        expect(yield* fs.readFileString(alpha)).toBe("alpha-realized");
        expect(yield* fs.readFileString(beta)).toBe("beta-realized");
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("blocks a dependent closure and writes nothing for it", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const workspace = yield* makeWorkspace("axm-atomicity-dependent-");
      const member = path.join(workspace.root, "beta.txt");
      const dependent = path.join(workspace.root, "tools-pack.txt");
      yield* fs.writeFileString(member, "beta-original");
      const services = context(workspace.workspaceDir);

      const packInstall = plan({
        name: "Install @acme/packs/tools",
        jobs: [
          {
            concurrency: 1,
            steps: [
              {
                readiness: "ready",
                key: "skill:beta",
                label: "beta",
                run: Effect.succeed({
                  result: "error" as const,
                  message: "member could not be materialized",
                  error: new StepFailure({
                    category: "internal",
                    detail: "member could not be materialized",
                  }),
                }),
              },
              {
                readiness: "ready",
                key: "pack:tools",
                label: "tools",
                run: fs
                  .writeFileString(dependent, "pack recorded")
                  .pipe(
                    Effect.orDie,
                    Effect.as({ result: "success" as const, message: "recorded" }),
                  ),
              },
            ],
          },
        ],
      });

      const candidate = yield* prepareExecutionCandidate(packInstall).pipe(
        Effect.provide(services.layer),
      );
      const resolution = yield* resolveExecutionCandidate(candidate, preapprovedPlanExecution).pipe(
        Effect.provide(services.layer),
      );

      expect(deriveOperationOutcome(resolution)).toBe("failed");
      const pack = resolution.units.find((unit) => unit.id === "pack:tools");
      expect(pack?.state).toBe("blocked");
      expect(pack?.blocking?.reference).toBe("skill:beta");
      expect(yield* fs.exists(dependent)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("names the retained paths when a restoration cannot complete", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const workspace = yield* makeWorkspace("axm-atomicity-restore-fail-");
      const managedDir = path.join(workspace.root, "managed");
      const movedDir = `${managedDir}-moved`;
      const target = path.join(managedDir, "managed.txt");
      yield* fs.makeDirectory(managedDir, { recursive: true });
      yield* fs.writeFileString(target, "original");
      const services = context(workspace.workspaceDir);

      const update = plan({
        name: "Update managed files",
        jobs: [
          {
            concurrency: 1,
            steps: [
              {
                readiness: "ready",
                key: "skill:first",
                label: "first",
                run: Effect.succeed({ result: "success" as const, message: "unrelated commit" }),
              },
              {
                readiness: "ready",
                key: "skill:second",
                label: "second",
                // The failing closure changed the target and then made its
                // own restoration impossible.
                run: protectWorkspacePath(target).pipe(
                  Effect.mapError(workspaceTransactionFailureToStepFailure),
                  Effect.andThen(fs.writeFileString(target, "changed").pipe(Effect.orDie)),
                  Effect.andThen(fs.rename(managedDir, movedDir).pipe(Effect.orDie)),
                  Effect.andThen(
                    fs.writeFileString(managedDir, "blocks restoration").pipe(Effect.orDie),
                  ),
                  Effect.as({
                    result: "error" as const,
                    message: "second step failed",
                    error: new StepFailure({ category: "internal", detail: "second step failed" }),
                  }),
                ),
              },
            ],
          },
        ],
      });

      const candidate = yield* prepareExecutionCandidate(update).pipe(
        Effect.provide(services.layer),
      );
      const resolution = yield* resolveExecutionCandidate(candidate, preapprovedPlanExecution).pipe(
        Effect.provide(services.layer),
      );

      expect(deriveOperationOutcome(resolution)).toBe("partial");
      expect(resolution.atomicity.applied).toBe("non-rollbackable");
      expect(resolution.units.find((unit) => unit.id === "skill:second")?.disposition).toBe(
        "retained",
      );
      expect(resolution.recovery?.retained).toEqual([path.join("managed", "managed.txt")]);
      const snapshotDir = resolution.recovery?.snapshotDir ?? "";
      expect(snapshotDir.length).toBeGreaterThan(0);
      expect(yield* fs.readFileString(path.join(snapshotDir, "0.snap"))).toBe("original");
      yield* fs.remove(snapshotDir, { recursive: true, force: true });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
