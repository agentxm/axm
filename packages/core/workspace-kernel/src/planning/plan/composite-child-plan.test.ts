/**
 * A composite child plan is augmented exactly as an execution candidate is,
 * and only its seal differs: without an external execution review the child
 * derives no identity and leaves the workspace settings and lockfile to the
 * composite's own seal, while its other materials are still observed; with a
 * review, the child's own seal still brackets it.
 *
 * Each case prepares the same plan both ways over real files and compares the
 * results; hashes are counted through work observations.
 */
import * as fs from "node:fs";

import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import type { WorkFact } from "@agentxm/host-primitives/work-observation";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import {
  decodeExtensionNameSync,
  decodeHandleSync,
} from "@agentxm/extension-model/unstable/extensions";
import type { HookExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import { OfflineHttpClient, RegistryClientFactoryTest } from "@agentxm/registry-client/testing";

import type { NativeLocationOutcome } from "../../locations/index.js";
import { NativePlatformTest, workObservations } from "../../locations/testing.js";
import type { ConfiguredAgentOperation, Plan, ReadyJobStep } from "../../operations/index.js";
import { WorkspaceFileWriteLocksLive } from "../../settlement/live.js";
import { SourceHostProvidersTest } from "../../sources/testing.js";
import { ConfiguredAgentOutcomesProvider } from "../../workspace-state/index.js";
import { WorkspaceStateLive } from "../../workspace-state/live.js";
import { ConfiguredAgentOutcomesProviderTest } from "../../workspace-state/testing.js";
import { prepareCompositeChildPlan, prepareExecutionCandidate } from "../index.js";

const identities = (facts: ReadonlyArray<WorkFact>) =>
  facts.filter((fact) => fact.kind === "axm.hash.execution-candidate").length;

/** A plan's data, with every function (step bodies) reduced to a marker. */
const planData = (plan: Plan<unknown, unknown>): unknown =>
  JSON.parse(
    JSON.stringify(plan, (_key, value: unknown) =>
      typeof value === "function" ? "<function>" : value,
    ),
  );

/** A project workspace on disk with settings, a lockfile and the given files. */
const workspace = (files: Readonly<Record<string, string>> = {}) =>
  Effect.gen(function* () {
    const live = yield* FileSystem.FileSystem;
    const root = yield* live.makeTempDirectoryScoped();
    yield* live.writeFileString(`${root}/axm.json`, JSON.stringify({ agents: ["claude-code"] }));
    yield* live.writeFileString(`${root}/axm.lock`, "version = 1\n");
    for (const [relative, contents] of Object.entries(files)) {
      const target = `${root}/${relative}`;
      yield* live.makeDirectory(target.slice(0, target.lastIndexOf("/")), { recursive: true });
      yield* live.writeFileString(target, contents);
    }
    return root;
  });

const workspaceState = (root: string, fileSystem?: FileSystem.FileSystem) => {
  const state = WorkspaceStateLive({
    projectRoot: decodeAbsolutePathSync(root),
    scope: "project",
    allowUninitialized: true,
  }).pipe(
    Layer.provide(RegistryClientFactoryTest(OfflineHttpClient)),
    Layer.provide(
      ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: `${root}/home` } })),
    ),
  );
  return fileSystem === undefined
    ? state
    : state.pipe(Layer.provide(Layer.succeed(FileSystem.FileSystem, fileSystem)));
};

const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.scoped,
    Effect.provide(Layer.provideMerge(WorkspaceFileWriteLocksLive, NativePlatformTest)),
  );

/** Prepare one plan as a sealed candidate and as a composite child, counting identities. */
const prepareBoth = <Requirements, Output>(
  plan: Plan<Requirements, Output>,
  configuredAgentOperations?: ReadonlyArray<ConfiguredAgentOperation>,
) =>
  Effect.gen(function* () {
    const options =
      configuredAgentOperations === undefined ? undefined : { configuredAgentOperations };
    const sealedWork = workObservations(false);
    const sealed = yield* sealedWork.provide(
      prepareExecutionCandidate(plan, options).pipe(Effect.result),
    );
    const compositeWork = workObservations(false);
    const composite = yield* compositeWork.provide(
      prepareCompositeChildPlan(plan, options).pipe(Effect.result),
    );
    return {
      sealed,
      composite,
      sealedIdentities: identities(sealedWork.facts),
      compositeIdentities: identities(compositeWork.facts),
    };
  });

const step = (overrides: Partial<Omit<ReadyJobStep, "readiness">> = {}): ReadyJobStep => ({
  readiness: "ready",
  label: "Install review",
  key: "skill:review",
  run: Effect.die("Preparation never applies"),
  ...overrides,
});

const planOf = (steps: ReadonlyArray<ReadyJobStep>, extra: Partial<Plan> = {}): Plan => ({
  _tag: "Plan",
  name: "Install review",
  description: Option.none(),
  jobs: [{ concurrency: 1, steps }],
  ...extra,
});

describe("composite child plans", () => {
  it.effect("keep the candidate's plan and operations and derive no identity", () =>
    run(
      Effect.gen(function* () {
        const root = yield* workspace({ "source/review/SKILL.md": "# Review\n" });
        const operations: ReadonlyArray<ConfiguredAgentOperation> = [
          { extensionType: "skill", name: "review", plannedState: "enabled" },
        ];
        const plan = planOf([
          step({
            materialPaths: [`${root}/source/review`],
            artifact: { path: "skills/review", scope: "project", change: "created" },
          }),
        ]);
        const prepared = yield* prepareBoth(plan, operations).pipe(
          Effect.provide(Layer.merge(workspaceState(root), ConfiguredAgentOutcomesProviderTest)),
        );
        expect(prepared.sealed._tag).toBe("Success");
        expect(prepared.composite._tag).toBe("Success");
        if (prepared.sealed._tag !== "Success" || prepared.composite._tag !== "Success") return;
        expect(planData(prepared.composite.success.plan)).toEqual(
          planData(prepared.sealed.success.plan),
        );
        expect(prepared.composite.success.configuredAgentOperations).toEqual(
          prepared.sealed.success.configuredAgentOperations,
        );
        expect(prepared.composite.success).not.toHaveProperty("id");
        expect({
          sealed: prepared.sealedIdentities,
          composite: prepared.compositeIdentities,
        }).toEqual({ sealed: 1, composite: 0 });
      }),
    ),
  );

  it.effect("fail on a material they cannot read, as a candidate does", () =>
    run(
      Effect.gen(function* () {
        const root = yield* workspace({ "source/review/SKILL.md": "# Review\n" });
        const unreadable = `${root}/source/review`;
        const plan = planOf([step({ materialPaths: [unreadable] })]);
        fs.chmodSync(unreadable, 0o000);
        const prepared = yield* prepareBoth(plan).pipe(
          Effect.ensuring(Effect.sync(() => fs.chmodSync(unreadable, 0o755))),
          Effect.provide(Layer.merge(workspaceState(root), ConfiguredAgentOutcomesProviderTest)),
        );
        const failure = (result: (typeof prepared)["sealed" | "composite"]) =>
          result._tag === "Failure"
            ? {
                _tag: result.failure._tag,
                target: "target" in result.failure ? result.failure.target : undefined,
              }
            : undefined;
        expect(failure(prepared.sealed)).toEqual({
          _tag: "CandidateFingerprintFailed",
          target: unreadable,
        });
        expect(failure(prepared.composite)).toEqual(failure(prepared.sealed));
      }),
    ),
  );

  it.effect("keep a foreign obstruction's error step", () =>
    run(
      Effect.gen(function* () {
        const root = yield* workspace();
        const location = (
          ownership: NativeLocationOutcome["ownership"],
        ): NativeLocationOutcome => ({
          scope: "project",
          address: { kind: "entry", path: `${root}/.claude/skills/review` },
          aliases: [`${root}/.claude/skills/review`],
          configuredConsumers: ["claude-code"],
          potentialReaders: ["claude-code"],
          policyReasons: [],
          ownership,
          state: ownership === "absent" ? "created" : "blocked",
          availability: [],
        });
        const plan = planOf([
          step({
            artifact: {
              path: "skills/review",
              scope: "project",
              change: "created",
              nativeLocations: [location("absent")],
            },
          }),
        ]);
        const prepared = yield* prepareBoth(plan, [
          { extensionType: "skill", name: "review", plannedState: "enabled" },
        ]).pipe(
          Effect.provide(workspaceState(root)),
          Effect.provideService(ConfiguredAgentOutcomesProvider, {
            byExtensionType: {
              skill: (request) =>
                Effect.succeed(
                  new Map(
                    request.rows.map((row) => [
                      row.name,
                      {
                        agentOutcomes: [
                          {
                            extensionType: "skill",
                            name: row.name,
                            agentId: "claude-code",
                            outcome: "blocked",
                            reasonCode: "native-content-conflict",
                            reason: "Foreign primary entry",
                          },
                        ],
                        nativeLocations: [location("unowned")],
                      },
                    ]),
                  ),
                ),
            },
          }),
        );
        if (prepared.sealed._tag !== "Success" || prepared.composite._tag !== "Success")
          return expect.unreachable("Expected both preparations to succeed");
        const steps = prepared.composite.success.plan.jobs.flatMap((job) => job.steps);
        expect(steps.map((planned) => planned.readiness)).toEqual(["error"]);
        expect(planData(prepared.composite.success.plan)).toEqual(
          planData(prepared.sealed.success.plan),
        );
      }),
    ),
  );

  it.effect.each([false, true])(
    "keep both seals around an external execution review (edit during review: %s)",
    (edit) =>
      run(
        Effect.gen(function* () {
          const live = yield* FileSystem.FileSystem;
          const root = yield* workspace({ "source/src/hook.sh": "echo original\n" });
          const source = `${root}/source`;
          const manifest = `${source}/hook.json`;
          const script = `${source}/src/hook.sh`;
          yield* live.writeFileString(
            manifest,
            JSON.stringify({
              owner: "@acme",
              type: "hook",
              name: "audit",
              version: "1.0.0",
              implementations: [
                {
                  id: "claude",
                  protocol: "claude-code",
                  bindings: [
                    {
                      id: "stop",
                      event: "Stop",
                      handler: { type: "command", runtime: "bash", entrypoint: "src/hook.sh" },
                    },
                  ],
                },
              ],
            }),
          );
          // The review reads the hook from its own captured copy: an edit at
          // that moment lands between the two seals around the review.
          let reviewed = false;
          const filesystem: FileSystem.FileSystem = {
            ...live,
            readFileString: (target, encoding) =>
              live.readFileString(target, encoding).pipe(
                Effect.tap(() =>
                  target.endsWith("hook.json") && target !== manifest
                    ? Effect.gen(function* () {
                        reviewed = true;
                        if (edit) yield* live.writeFileString(script, "echo changed!\n");
                      })
                    : Effect.void,
                ),
              ),
          };
          const hook = decodeExtensionNameSync("audit");
          const ref: HookExtensionRef = {
            type: "hook",
            name: hook,
            owner: decodeHandleSync("@acme"),
            hook: { name: hook },
            refType: "local",
            source: { type: "local", path: source },
            location: `file://${source}`,
          };
          const plan = planOf(
            [
              step({
                label: "audit",
                key: "hook:audit",
                exposureRefs: [ref],
                artifact: {
                  path: ".claude/settings.json",
                  change: "created",
                  scope: "project",
                  agents: ["claude-code"],
                },
              }),
            ],
            { name: "Expose audit", materialPaths: [source] },
          );
          const work = workObservations(false);
          const prepared = yield* work
            .provide(prepareCompositeChildPlan(plan).pipe(Effect.result))
            .pipe(
              Effect.provide(
                Layer.mergeAll(
                  workspaceState(root, filesystem),
                  ConfiguredAgentOutcomesProviderTest,
                  SourceHostProvidersTest({}),
                ),
              ),
            );
          expect(reviewed).toBe(true);
          expect(identities(work.facts)).toBe(2);
          if (edit) {
            expect(prepared._tag === "Failure" ? prepared.failure._tag : prepared._tag).toBe(
              "StaleExecutionCandidate",
            );
            return;
          }
          if (prepared._tag !== "Success")
            return expect.unreachable("Expected the reviewed child to be prepared");
          expect(
            prepared.success.plan.riskConditions?.some(
              (risk) =>
                risk.level === "override-required" &&
                risk.executionChanges?.some((change) => change.name === "audit"),
            ),
          ).toBe(true);
        }),
      ),
  );
});
