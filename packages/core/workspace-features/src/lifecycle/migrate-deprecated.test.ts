/**
 * A migration settles its replacement install and its removal as child plans
 * and seals one candidate over their steps. The children's own identities are
 * never used, and the migration's seal always fingerprints the workspace
 * settings and lockfile, so a child derives no identity and leaves those two
 * documents to the migration's seal, while every other child material is
 * still observed before the migration is sealed.
 *
 * Physical reads are counted with a recording filesystem over a real
 * temporary workspace; hashes are counted through work observations.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach } from "vitest";

import type { WorkFact } from "@agentxm/host-primitives/work-observation";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import {
  deriveOperationOutcome,
  previewPlanExecution,
  type OperationResolution,
  type Plan,
} from "@agentxm/workspace-kernel/operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";

import {
  applyInstallAcceptingExecutionChanges,
  applyInstall,
  fileRegistryPackagePath,
  installRequest,
  makeInstallWorld,
  type InstallWorld,
} from "../testing/install-world.js";
import { InstallExtensions } from "./install/install-extensions.js";
import { MigrateDeprecated } from "./migrate-deprecated.js";
import { UninstallExtensions } from "./uninstall/uninstall-extensions.js";

const SOURCE = "@acme/skills/old";
const REPLACEMENT = "@acme/skills/new";

type Reason = "obsolete" | "superseded";

const deprecate = (
  world: InstallWorld,
  subject: { readonly plural: string; readonly name: string },
  reason: Reason,
): void => {
  const index = path.join(
    world.registry.root,
    "extensions",
    "@acme",
    subject.plural,
    subject.name,
    "index.json",
  );
  const previous = fs.readFileSync(index, "utf8");
  expect(previous).toContain('"deprecation": null');
  fs.writeFileSync(
    index,
    previous.replace(
      '"deprecation": null',
      `"deprecation": ${JSON.stringify({
        deprecatedAt: "2026-03-01T00:00:00.000Z",
        reason,
        message: "Retired guidance",
        ...(reason === "superseded"
          ? { replacement: { status: "available", fqn: REPLACEMENT } }
          : {}),
      })}`,
    ),
  );
};

/** The host services, with a recording filesystem in place of the plain one. */
const recordingHost = Layer.merge(
  NodeServices.layer,
  layerRecordingFileSystem(NodeFileSystem.layer),
);

/** The replacement install and the removal a superseded migration settles. */
const replacementInstall = installRequest({
  subject: { kind: "source", source: REPLACEMENT },
  all: false,
  planName: `Install ${REPLACEMENT}`,
});
const sourceRemoval = { type: Option.none(), selector: SOURCE } as const;

/** A workspace with the deprecated skill installed and its successor published. */
const deprecatedWorld = (cleanups: Array<() => void>) => {
  const world = makeInstallWorld({ settings: { agents: ["claude-code", "codex"] } });
  cleanups.push(world.cleanup);
  world.registry.writeSkill("old", [{ version: "1.0.0", body: "Old guidance" }]);
  world.registry.writeSkill("new", [{ version: "1.0.0", body: "New guidance" }]);
  return world;
};

const documents = (world: InstallWorld) => ({
  settings: path.join(world.workspace.workspaceRoot, "axm.json"),
  lock: path.join(world.workspace.workspaceRoot, "axm.lock"),
});

const ofKind = (facts: ReadonlyArray<WorkFact>, kind: string) =>
  facts.filter((fact) => fact.kind === kind);

const numberAttribute = (
  fact: WorkFact | undefined,
  name: "axm.work.bytes" | "axm.work.count",
): number => fact?.attributes[name] ?? Number.NaN;

/**
 * The bytes and parts one regular file contributes to a material fingerprint:
 * its relative label, its kind, its executable bits, and its content, each
 * length-framed and terminated.
 */
const fileFraming = (baseDir: string, target: string) => {
  const parts = [
    Buffer.from(path.relative(baseDir, target)),
    Buffer.from("file"),
    Buffer.from(String(fs.statSync(target).mode & 0o111)),
    fs.readFileSync(target),
  ];
  return {
    bytes: parts.reduce(
      (total, part) => total + Buffer.byteLength(`${part.byteLength}\0`) + part.byteLength + 1,
      0,
    ),
    parts: parts.length,
  };
};

/** A plan's data, with every function (step bodies, validators) reduced to a marker. */
const planData = (plan: Plan<unknown, unknown>): unknown =>
  JSON.parse(
    JSON.stringify(plan, (_key, value: unknown) =>
      typeof value === "function" ? "<function>" : value,
    ),
  );

describe("migration child plans", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect.each([
    // Sealing each child as its own candidate derived one identity per child
    // besides the migration's (2 obsolete, 3 superseded), and each child's
    // pass read the settings and lockfile once more (4 and 6 reads each).
    { reason: "obsolete", identities: 1, materialPasses: 2, documentReads: 3 },
    { reason: "superseded", identities: 1, materialPasses: 3, documentReads: 4 },
  ] as const)(
    "a $reason migration derives one identity and reads settings and lockfile $documentReads times",
    ({ reason, identities, materialPasses, documentReads }) => {
      const world = deprecatedWorld(cleanups);
      const { settings, lock } = documents(world);
      return world.workspace
        .provide(
          Effect.gen(function* () {
            const recording = yield* FileSystemRecorder;
            yield* applyInstall(
              installRequest({ type: "skill", subject: { kind: "source", source: SOURCE } }),
            );
            deprecate(world, { plural: "skills", name: "old" }, reason);
            const work = workObservations(false);
            recording.reset();
            yield* work.provide(MigrateDeprecated.prepare(SOURCE));
            expect({
              identities: ofKind(work.facts, "axm.hash.execution-candidate").length,
              materialPasses: ofKind(work.facts, "axm.hash.execution-materials").length,
              settingsReads: recording.contentReads(settings),
              lockReads: recording.contentReads(lock),
            }).toEqual({
              identities,
              materialPasses,
              settingsReads: documentReads,
              lockReads: documentReads,
            });
          }),
        )
        .pipe(Effect.provide(recordingHost));
    },
  );

  it.effect.each(["install", "uninstall"] as const)(
    "a composite %s child keeps the sealed child's plan and drops only its identity and settings coverage",
    (child) => {
      const world = deprecatedWorld(cleanups);
      const { settings, lock } = documents(world);
      return world.workspace
        .provide(
          Effect.gen(function* () {
            const recording = yield* FileSystemRecorder;
            yield* applyInstall(
              installRequest({ type: "skill", subject: { kind: "source", source: SOURCE } }),
            );
            const settle = (composite: boolean) =>
              Effect.gen(function* () {
                const work = workObservations(false);
                recording.reset();
                const execution =
                  child === "install"
                    ? (yield* work.provide(
                        composite
                          ? InstallExtensions.prepareForComposite(replacementInstall)
                          : InstallExtensions.prepare(replacementInstall),
                      )).execution
                    : (yield* work.provide(
                        composite
                          ? UninstallExtensions.prepareForComposite(sourceRemoval)
                          : UninstallExtensions.prepare(sourceRemoval),
                      )).execution;
                const materials = ofKind(work.facts, "axm.hash.execution-materials");
                expect(materials).toHaveLength(1);
                return {
                  plan: planData(execution.plan),
                  operations: execution.configuredAgentOperations,
                  identities: ofKind(work.facts, "axm.hash.execution-candidate").length,
                  bytes: numberAttribute(materials[0], "axm.work.bytes"),
                  parts: numberAttribute(materials[0], "axm.work.count"),
                  settingsReads: recording.contentReads(settings),
                  lockReads: recording.contentReads(lock),
                };
              });
            const sealed = yield* settle(false);
            const composite = yield* settle(true);
            const settingsFraming = fileFraming(world.workspace.workspaceRoot, settings);
            const lockFraming = fileFraming(world.workspace.workspaceRoot, lock);

            expect(composite.plan).toEqual(sealed.plan);
            expect(composite.operations).toEqual(sealed.operations);
            expect(sealed.identities).toBe(1);
            expect(composite.identities).toBe(0);
            expect(sealed.bytes - composite.bytes).toBe(settingsFraming.bytes + lockFraming.bytes);
            expect(sealed.parts - composite.parts).toBe(settingsFraming.parts + lockFraming.parts);
            expect(composite.settingsReads).toBe(sealed.settingsReads - 1);
            expect(composite.lockReads).toBe(sealed.lockReads - 1);
          }),
        )
        .pipe(Effect.provide(recordingHost));
    },
  );

  it.effect.each(["obsolete", "superseded"] as const)(
    "a %s migration previews the removal and its configured-agent outcomes as before",
    (reason) => {
      const world = deprecatedWorld(cleanups);
      const root = world.workspace.root;
      return world.workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(
              installRequest({ type: "skill", subject: { kind: "source", source: SOURCE } }),
            );
            deprecate(world, { plural: "skills", name: "old" }, reason);
            const candidate = yield* MigrateDeprecated.prepare(SOURCE);
            const preview = yield* MigrateDeprecated.previewOrApply(
              candidate,
              previewPlanExecution,
            );
            expect(preview.candidateId).toBe(candidate.execution.id);
            expect({
              outcome: deriveOperationOutcome(preview),
              name: preview.name,
              riskConditions: preview.riskConditions,
              preconditions: preview.preconditions,
              units: preview.units.map((unit) => ({
                id: unit.id,
                state: unit.state,
                outcomes: (unit.agentOutcomes ?? []).map(
                  (outcome) => `${outcome.name}:${outcome.agentId}:${outcome.outcome}`,
                ),
                nativeLocations: (unit.artifact?.nativeLocations ?? []).map(
                  (location) => `${path.relative(root, location.address.path)}:${location.state}`,
                ),
              })),
            }).toEqual({
              outcome: "previewed",
              name: `Migrate ${SOURCE}`,
              riskConditions: undefined,
              preconditions: undefined,
              units: [
                {
                  id: SOURCE,
                  state: "ready",
                  outcomes: ["old:claude-code:not-applicable", "old:codex:not-applicable"],
                  nativeLocations: [".agents/skills/old:removed", ".claude/skills/old:removed"],
                },
              ],
            });
            expect(candidate.execution.configuredAgentOperations).toEqual([
              { extensionType: "skill", name: "old", plannedState: "absent" },
            ]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect.each([
    { reason: "obsolete", document: "axm.json", tag: "SettingsIoError" },
    { reason: "obsolete", document: "axm.lock", tag: "LockfileIoError" },
    { reason: "superseded", document: "axm.json", tag: "SettingsIoError" },
    { reason: "superseded", document: "axm.lock", tag: "LockfileIoError" },
  ] as const)(
    "a $reason migration with an unreadable $document fails reading it, as before",
    ({ reason, document, tag }) => {
      const world = deprecatedWorld(cleanups);
      const target = path.join(world.workspace.workspaceRoot, document);
      return world.workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(
              installRequest({ type: "skill", subject: { kind: "source", source: SOURCE } }),
            );
            deprecate(world, { plural: "skills", name: "old" }, reason);
            fs.chmodSync(target, 0o000);
            const failure = yield* MigrateDeprecated.prepare(SOURCE).pipe(
              Effect.flip,
              Effect.ensuring(Effect.sync(() => fs.chmodSync(target, 0o644))),
            );
            expect(failure).toMatchObject({
              _tag: tag,
              path: target,
              cause: { reason: { _tag: "PermissionDenied", method: "readFile" } },
            });
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("a migration whose replacement cannot be placed carries each placement blocker", () => {
    const world = deprecatedWorld(cleanups);
    // A leftover staging directory beside the replacement's retained address
    // fails the replacement's placement preflight.
    const staging = path.join(
      world.workspace.root,
      `${fileRegistryPackagePath(world.registry, "skills", "new")}.axm-staging`,
    );
    return world.workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(
            installRequest({ type: "skill", subject: { kind: "source", source: SOURCE } }),
          );
          deprecate(world, { plural: "skills", name: "old" }, "superseded");
          fs.mkdirSync(staging, { recursive: true });
          fs.writeFileSync(path.join(staging, "SKILL.md"), "partial\n");
          const candidate = yield* MigrateDeprecated.prepare(SOURCE);
          const detail = `Retained package destination ${path.relative(
            path.join(world.workspace.root, "agent_extensions"),
            staging,
          )} contains content without accepted ownership; move it before installing this source`;
          const blocker = {
            level: "blocked",
            id: "retained-package-placement",
            detail,
            errorCode: "conflict",
          };
          // The replacement's own blocker, then the migration's own.
          expect(candidate.execution.plan.riskConditions).toEqual([blocker, blocker]);
          expect(candidate.execution.plan.preconditions).toEqual([
            {
              id: "retained-package-placement",
              label: "Retained package placement",
              status: "unmet",
              detail,
            },
          ]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("an obsolete Hook's migration reports its execution withdrawal", () => {
    const world = makeInstallWorld({ settings: { agents: ["claude-code"] } });
    cleanups.push(world.cleanup);
    world.registry.writeHook("audit", [{ version: "1.0.0" }]);
    const hook = "@acme/hooks/audit";
    return world.workspace
      .provide(
        Effect.gen(function* () {
          expect(
            deriveOperationOutcome(
              yield* applyInstallAcceptingExecutionChanges(
                installRequest({ type: "hook", subject: { kind: "source", source: hook } }),
              ),
            ),
          ).toBe("applied");
          deprecate(world, { plural: "hooks", name: "audit" }, "obsolete");
          const withdrawals = (resolution: OperationResolution) =>
            resolution.units.flatMap((unit) =>
              (unit.artifact?.executionChanges ?? []).map((change) => ({
                extensionType: change.extensionType,
                name: change.name,
                registrations: change.registrations,
              })),
            );
          const expected = [
            {
              extensionType: "hook",
              name: "audit",
              registrations: [{ target: "claude-code", change: "removed" }],
            },
          ];
          const preview = yield* MigrateDeprecated.previewOrApply(
            yield* MigrateDeprecated.prepare(hook),
            previewPlanExecution,
          );
          expect(withdrawals(preview)).toEqual(expected);
          const applied = yield* MigrateDeprecated.previewOrApply(
            yield* MigrateDeprecated.prepare(hook),
            preapprovedPlanExecution,
          );
          expect(deriveOperationOutcome(applied), JSON.stringify(applied)).toBe("applied");
          expect(withdrawals(applied)).toEqual(expected);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
