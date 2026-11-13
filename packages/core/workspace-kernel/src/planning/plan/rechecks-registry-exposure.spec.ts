import { WorkspaceTransactionScope } from "../../settlement/index.js";
import { startWorkspaceTransitionProcess } from "../../settlement/testing.js";
import { PlanSources, makePlanSources } from "./plan-sources.js";
import {
  AxmSkillCandidateGateTest,
  RegistryResolutionPolicyTest,
  SourceHostProvidersTest,
} from "../../sources/testing.js";
import { NativePlatformTest } from "../../locations/testing.js";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ConfigProvider from "effect/ConfigProvider";
import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import {
  RegistryClientFactory,
  makeRegistryClientFactory,
  makeUserArchiveCache,
} from "@agentxm/registry-client";
import {
  createRemoteRegistrySourceHostProvider,
  SourceNotResolvable,
} from "../../sources/index.js";
import * as Tracer from "effect/Tracer";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { ExactContentRequestSchema } from "@agentxm/registry-protocol/unstable/registry/resolutions";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import {
  passThroughRegistryAuthorization,
  testRegistryEndpoint,
} from "@agentxm/registry-client/testing";
import {
  decodeExtensionNameSync,
  decodeHandleSync,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import type { RegistrySkillRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { defineSpecification } from "@agentxm/specification-metadata";
import { applyPlanExecution, type Plan } from "../../operations/index.js";
import { prepareExecutionCandidate, resolveExecutionCandidate } from "./resolve-plan.js";
import { makeSpecContext, makeSpecWorkspace } from "./__tests__/plan-spec-support.js";

export const specification = defineSpecification({
  requirement: "workspace/recheck-registry-exposure",
  title: "Registry exposure requires current exact content eligibility",
  statement:
    "AXM shall check current exact Registry publisher, integrity and content eligibility before acquiring or exposing Registry content, including retained contributors, repeat the check after confirmation and outside the transition lock after contention, and refuse each affected semantic closure while preserving independent work and operations that acquire or expose no Registry content.",
  class: "functional",
  role: "supporting",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  boundary: "process",
  boundaryRationale:
    "The real candidate pipeline, Registry client, filesystem cache and archive extraction execute over a temporary workspace and controlled HTTP port. A separate process holds the production transition lock during revocation or source mutation. Request ordering, lock ownership and closure outcomes are observed; deployed Registry policy and compiled CLI behavior remain separate evidence.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const ref: RegistrySkillRef = {
  type: "skill",
  refType: "registry",
  name: decodeExtensionNameSync("review"),
  owner: decodeHandleSync("@acme"),
  skill: {
    name: decodeExtensionNameSync("review"),
    description: Option.none(),
    metadata: Option.none(),
  },
  version: decodeVersionSync("1.0.0"),
  integrity: Option.some(`sha512-${"A".repeat(86)}==`),
  publisherBindingId: "publisher-1",
  packages: [],
  source: { type: "registry", name: "test", location: testRegistryEndpoint, owner: Option.none() },
};

describe("Registry eligibility at exposure", () => {
  for (const scenario of [
    "eligible",
    "denied",
    "revoked-during-confirmation",
    "revoked-during-contention",
    "revoked-during-process-contention",
    "source-changed-during-process-contention",
    "repeated-contention",
    "no-registry-exposure",
    "local-contention",
    "ten-distinct",
    "ten-warm",
    "ten-warm-revoked",
    "hundred-and-one-distinct",
  ] as const) {
    const processContention =
      scenario === "revoked-during-process-contention" ||
      scenario === "source-changed-during-process-contention";
    const test = processContention ? it.live : it.effect;
    test(scenario, () =>
      Effect.gen(function* () {
        const workspace = yield* makeSpecWorkspace("axm-registry-exposure-");
        const sourceChanges = scenario === "source-changed-during-process-contention";
        const contentionRevokes =
          scenario === "revoked-during-contention" ||
          scenario === "revoked-during-process-contention";
        const noExposure = scenario === "no-registry-exposure" || scenario === "local-contention";
        const requests: string[] = [];
        const batchSizes: number[] = [];
        const warm = scenario === "ten-warm" || scenario === "ten-warm-revoked";
        const revokes =
          scenario === "revoked-during-confirmation" || scenario === "ten-warm-revoked";
        const distinct =
          warm || scenario === "ten-distinct"
            ? 10
            : scenario === "hundred-and-one-distinct"
              ? 101
              : 1;
        const archives = new Map<string, Uint8Array>();
        const acquired: string[] = [];
        const exposureRefs =
          distinct === 1
            ? [ref, ref]
            : Array.from({ length: distinct }, (_, i) => {
                const name = decodeExtensionNameSync(`review-${i}`);
                const archive = zipSync({
                  "SKILL.md": strToU8(`---\nname: ${name}\ndescription: Test\n---\n# ${name}\n`),
                });
                archives.set(name, archive);
                return {
                  ...ref,
                  name,
                  skill: { ...ref.skill, name },
                  integrity: warm
                    ? Option.some(`sha512-${createHash("sha512").update(archive).digest("base64")}`)
                    : ref.integrity,
                };
              });
        let denied = scenario === "denied";
        let exposed = 0;
        let independent = 0;
        let lockHeld: Effect.Effect<boolean> = Effect.succeed(false);
        let lockAttempts = 0;
        const http = HttpClient.make((request) =>
          Effect.gen(function* () {
            expect(yield* lockHeld).toBe(false);
            requests.push(request.method);
            if (request.body._tag !== "Uint8Array") throw new Error("Expected JSON admission");
            const input = Schema.decodeUnknownSync(
              Schema.fromJsonString(ExactContentRequestSchema),
            )(new TextDecoder().decode(request.body.body));
            batchSizes.push(input.items.length);
            const response = Response.json({
              schemaVersion: 2,
              purpose: "authorize-exact",
              observedAt: "2026-09-22T00:00:00.000Z",
              results: input.items
                .map((item) =>
                  denied
                    ? { key: item.key, outcome: "unavailable" }
                    : {
                        key: item.key,
                        outcome: "allowed",
                        identity: item.identity,
                        publisherBindingId: item.expectedPublisherBinding,
                        accepted: item.accepted,
                        yanked: false,
                        observedAt: "2026-09-22T00:00:00.000Z",
                      },
                )
                .reverse(),
            });
            return HttpClientResponse.fromWeb(request, response);
          }),
        );
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const materialSource = path.join(workspace.root, "reviewed-source.md");
        if (sourceChanges) yield* fs.writeFileString(materialSource, "Reviewed guidance.");
        const holder = processContention
          ? yield* Effect.gen(function* () {
              yield* fs.writeFileString(path.join(workspace.root, "state.json"), "[]");
              yield* fs.writeFileString(path.join(workspace.root, "mirror.json"), "[]");
              const worker = startWorkspaceTransitionProcess(workspace.root, "first");
              yield* Effect.addFinalizer(() =>
                Effect.promise(async () => {
                  worker.stop();
                  await worker.completion;
                }),
              );
              const entered = yield* Effect.promise(() => worker.waitFor("entered"));
              expect(entered.pid).not.toBe(process.pid);
              return worker;
            })
          : undefined;
        let observedHolder = false;
        const configuration = ConfigProvider.layer(
          ConfigProvider.fromUnknown({ AXM_USER_HOME: workspace.root }),
        );
        const factory = yield* makeRegistryClientFactory({
          httpClient: http,
          fileSystem: fs,
          path,
          authorization: passThroughRegistryAuthorization,
        }).pipe(Effect.provide(configuration));
        if (warm) {
          const cache = yield* makeUserArchiveCache().pipe(Effect.provide(configuration));
          for (const reference of exposureRefs) {
            const archive = archives.get(reference.name);
            if (archive === undefined || Option.isNone(reference.integrity))
              throw new Error("Expected warm fixture archive");
            yield* cache.write(reference.integrity.value, archive);
          }
        }
        const provider = createRemoteRegistrySourceHostProvider(
          yield* factory.forEndpoint(testRegistryEndpoint),
        );
        const sourceProviders = SourceHostProvidersTest(
          warm
            ? {
                acquireForTransition: (reference) =>
                  Effect.gen(function* () {
                    if (reference.refType !== "registry")
                      return yield* Effect.die("Unexpected non-Registry source");
                    const files = yield* provider.fetch(reference.source, reference);
                    const document = yield* fs
                      .readFileString(path.join(files.directory, "SKILL.md"))
                      .pipe(
                        Effect.mapError(
                          (cause) =>
                            new SourceNotResolvable({
                              category: "internal",
                              detail: "Fixture archive content could not be read.",
                              cause,
                            }),
                        ),
                      );
                    expect(document).toContain(reference.name);
                    acquired.push(reference.name);
                    return files;
                  }).pipe(
                    Effect.provide(
                      Layer.mergeAll(
                        Layer.succeed(FileSystem.FileSystem, fs),
                        Layer.succeed(Path.Path, path),
                        AxmSkillCandidateGateTest(),
                        RegistryResolutionPolicyTest,
                      ),
                    ),
                  ),
              }
            : {},
        );
        const context = makeSpecContext(workspace.workspaceDir, {
          confirmationAvailable: true,
          confirmApplyChanges: () =>
            Effect.sync(() => {
              if (revokes) denied = true;
              return "approved" as const;
            }),
        });
        const plan: Plan = {
          _tag: "Plan",
          name: "Reconcile retained sources",
          description: Option.none(),
          ...(sourceChanges ? { materialPaths: [materialSource] } : {}),
          riskConditions: [
            { level: "confirmable", id: "fixture-review", detail: "Review this candidate" },
          ],
          jobs: [
            {
              concurrency: 1,
              executionPolicy: "best-effort",
              steps: [
                ...exposureRefs.map((exposureRef, index) => ({
                  readiness: "ready" as const,
                  key: `skill:${index}`,
                  label: `step-${index}`,
                  acquisitionRefs: warm ? [exposureRef] : [],
                  exposureRefs: noExposure ? [] : [exposureRef],
                  run: Effect.sync(() => {
                    exposed += 1;
                    return { result: "success" as const, message: "exposed" };
                  }),
                })),
                {
                  readiness: "ready",
                  key: "authored:independent",
                  label: "independent",
                  run: Effect.sync(() => {
                    independent += 1;
                    return { result: "success" as const, message: "authored" };
                  }),
                },
              ],
            },
          ],
        };
        const candidate = yield* prepareExecutionCandidate(plan).pipe(
          Effect.provide(context.layer),
        );
        const spans: Tracer.NativeSpan[] = [];
        const tracer = Tracer.make({
          span(options) {
            const span = new Tracer.NativeSpan(options);
            spans.push(span);
            return span;
          },
        });
        const result = yield* resolveExecutionCandidate(
          candidate,
          applyPlanExecution({
            approval: "prompt-if-interactive",
            recovery: { command: ["sync"], arguments: [] },
          }),
        ).pipe(
          Effect.withTracer(tracer),
          Effect.provideServiceEffect(
            WorkspaceTransactionScope,
            Effect.map(WorkspaceTransactionScope, (scope) => {
              lockHeld = scope.isHeld;
              return WorkspaceTransactionScope.of({
                ...scope,
                acquire: (request) =>
                  Effect.gen(function* () {
                    lockAttempts += 1;
                    if (
                      (scenario === "revoked-during-contention" && lockAttempts === 1) ||
                      scenario === "repeated-contention" ||
                      scenario === "local-contention"
                    ) {
                      yield* request.onWaiting?.(Option.none()) ?? Effect.void;
                      denied = scenario === "revoked-during-contention";
                    }
                    return yield* scope.acquire({
                      ...request,
                      ...(holder === undefined
                        ? {}
                        : {
                            onWaiting: (owner) =>
                              Effect.gen(function* () {
                                expect(Option.isSome(owner) ? owner.value.pid : undefined).toBe(
                                  holder.child.pid,
                                );
                                observedHolder = true;
                                yield* request.onWaiting?.(owner) ?? Effect.void;
                                denied = contentionRevokes;
                                if (sourceChanges)
                                  yield* fs
                                    .writeFileString(materialSource, "Changed guidance.")
                                    .pipe(Effect.orDie);
                                holder.release();
                                expect(yield* Effect.promise(() => holder.completion)).toBe(0);
                              }),
                          }),
                    });
                  }),
              });
            }),
          ),
          Effect.provide(
            Layer.merge(
              context.layer,
              Layer.effect(PlanSources, makePlanSources).pipe(
                Layer.provide(
                  Layer.merge(sourceProviders, Layer.succeed(RegistryClientFactory, factory)),
                ),
              ),
            ),
          ),
        );
        const eligibility = spans.filter((span) => span.name === "axm.registry.eligibility");
        if (sourceChanges) {
          expect(observedHolder).toBe(true);
          expect(lockAttempts).toBe(2);
          expect(yield* lockHeld).toBe(false);
          expect(batchSizes).toEqual([1, 1, 1]);
          expect(exposed).toBe(0);
          expect(independent).toBe(0);
          expect(result.blocking?.class).toBe("stale-candidate");
          expect(yield* fs.readFileString(materialSource)).toBe("Changed guidance.");
          return;
        }
        if (scenario === "repeated-contention") {
          expect(lockAttempts).toBe(3);
          expect(yield* lockHeld).toBe(false);
          expect(exposed).toBe(0);
          expect(independent).toBe(0);
          expect(result.failure).toMatchObject({
            category: "conflict",
            detail: expect.stringContaining("contention"),
          });
          expect(batchSizes).toEqual([1, 1, 1, 1]);
          expect(eligibility.map((span) => span.attributes.get("axm.eligibility.phase"))).toEqual([
            "before-acquisition",
            "after-confirmation",
            "after-contention",
            "after-contention",
          ]);
          return;
        }

        expect(eligibility.map((span) => span.attributes.get("axm.eligibility.phase"))).toEqual([
          "before-acquisition",
          "after-confirmation",
          ...(contentionRevokes ? ["after-contention"] : []),
        ]);
        expect(eligibility.map((span) => span.attributes.get("axm.work.executed"))).toEqual(
          noExposure ? [0, 0] : contentionRevokes ? [1, 1, 1] : [distinct, distinct],
        );
        expect(eligibility.map((span) => span.attributes.get("axm.registry.denied"))).toEqual(
          scenario === "denied"
            ? [1, 1]
            : revokes
              ? [0, distinct]
              : contentionRevokes
                ? [0, 0, 1]
                : [0, 0],
        );
        expect(acquired.sort()).toEqual(warm ? exposureRefs.map((entry) => entry.name).sort() : []);
        expect(independent).toBe(1);
        expect(exposed).toBe(denied ? 0 : exposureRefs.length);
        expect(result.units.map((unit) => unit.state)).toEqual([
          ...exposureRefs.map(() => (denied ? "failed" : "committed")),
          "committed",
        ]);
        const expectedBatches = noExposure
          ? []
          : distinct === 101
            ? [100, 1, 100, 1]
            : contentionRevokes
              ? [1, 1, 1]
              : [distinct, distinct];
        if (contentionRevokes) expect(lockAttempts).toBe(2);
        if (processContention) expect(observedHolder).toBe(true);
        if (scenario === "local-contention") expect(lockAttempts).toBe(1);
        expect(batchSizes).toEqual(expectedBatches);
        expect(requests).toEqual(expectedBatches.map(() => "POST"));
      }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
    );
  }
});
