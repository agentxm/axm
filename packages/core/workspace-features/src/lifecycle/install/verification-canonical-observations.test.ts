/**
 * After an apply, configured-agent verification observes each enabled
 * subject's canonical package once inside its fresh observation phase: the
 * native observer of that subject's type takes the verification's own
 * observation of the identical desired node and accepted row instead of
 * hashing and decoding the same tree again. Every other package, and every
 * subject the verification found unusable, is still observed by the observer.
 *
 * An apply that leaves an extension enabled through activation, update or
 * a retained uninstall runs this verification after its writes; an install
 * does not. Counts are exact for these fixtures and cover only the counted call.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";

import type { FileRegistry } from "@agentxm/registry-client/testing";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  ConfiguredAgentOutcomesProvider,
  CurrentWorkspaceReadPhase,
  DesiredStateReader,
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
  observeCanonicalExtensionCapturing,
  observeConfiguredTargets,
  resolveConfiguredExtensionObservations,
  withFreshWorkspaceObservationReadView,
} from "@agentxm/workspace-kernel/workspace-state";
import { withMcpInspectionReadView } from "@agentxm/workspace-kernel/projection";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";

import {
  applyInstallAcceptingExecutionChanges,
  fileRegistryPackagePath,
  installRequest,
  makeInstallWorld,
} from "../../testing/install-world.js";
import { applyActivationAcceptingExecutionChanges } from "../activation/test-helpers.js";

const AGENTS = ["claude-code"];

const treeHashes = (work: ReturnType<typeof workObservations>) =>
  work.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree").length;

/** The verification phase's readback of the given targets, as the apply runs it. */
const verify = (
  targets: ReadonlyArray<{ readonly type: InstallableExtensionType; readonly name: string }>,
) =>
  withFreshWorkspaceObservationReadView(
    withMcpInspectionReadView(observeConfiguredTargets(targets, AGENTS)),
  );

/**
 * The observer's answer for one enabled row, in the caller's read phase.
 * Without `canonicalObservation` it is the answer the verification gave
 * before it handed its observations over.
 */
const answerFor = (
  type: InstallableExtensionType,
  name: string,
  installed: boolean,
  canonicalObservation?: RowObservation,
) =>
  Effect.gen(function* () {
    const desired = yield* DesiredStateReader;
    const observations = yield* resolveConfiguredExtensionObservations(
      yield* ConfiguredAgentOutcomesProvider,
      {
        readers: { settings: yield* SettingsReader, locks: yield* LockfileReader, desired },
        desiredGraph: yield* desired.graph(),
        type,
        state: "current",
        scope: (yield* WorkspaceLocation).scope,
        agentIds: AGENTS,
        rows: [
          {
            name,
            targetState: "enabled",
            installed,
            ...(canonicalObservation === undefined ? {} : { canonicalObservation }),
          },
        ],
      },
    );
    return observations.get(name);
  });

/** The observer's own answer for one row, in a fresh observation phase of its own. */
const ownAnswer = (type: InstallableExtensionType, name: string, installed: boolean) =>
  withFreshWorkspaceObservationReadView(answerFor(type, name, installed));

type RowObservation = NonNullable<
  Parameters<
    typeof resolveConfiguredExtensionObservations
  >[1]["rows"][number]["canonicalObservation"]
>;

/** One canonical observation of the named node, made in the caller's observation phase. */
const rowObservation = (type: InstallableExtensionType, name: string) =>
  Effect.gen(function* () {
    const phase = yield* CurrentWorkspaceReadPhase;
    if (phase === undefined) return yield* Effect.die("no observation phase");
    const desired = (yield* (yield* DesiredStateReader).graph()).nodes.find(
      (node) => node.type === type && node.name === name,
    );
    if (desired === undefined) return yield* Effect.die(`no desired ${type} ${name}`);
    const accepted = Option.getOrUndefined(
      yield* (yield* LockfileReader).acceptedEntry(type, name),
    );
    const layout = yield* Ref.get((yield* WorkspaceLocation).layout);
    const { observation, manifest } = yield* observeCanonicalExtensionCapturing({
      layout,
      desired,
      accepted,
    });
    return { phase, desired, accepted, layout, observation, manifest } satisfies RowObservation;
  });

const install = (type: InstallableExtensionType, name: string) =>
  Effect.gen(function* () {
    const installed = yield* applyInstallAcceptingExecutionChanges(
      installRequest({
        type,
        subject: {
          kind: "source",
          source: `@acme/${type === "knowledge" ? type : `${type}s`}/${name}@1.0.0`,
        },
      }),
    );
    expect(deriveOperationOutcome(installed)).toBe("applied");
  });

/** Make an accepted package's tree differ from its accepted integrity. */
const drift = (
  world: ReturnType<typeof makeInstallWorld>,
  plural: Parameters<typeof fileRegistryPackagePath>[1],
  name: string,
) =>
  fs.writeFileSync(
    path.join(
      world.workspace.root,
      fileRegistryPackagePath(world.registry, plural, name),
      "drift.txt",
    ),
    "Changed locally.",
  );

describe("After-apply verification of a Subagent observes its canonical package once", () => {
  it.effect.each(["usable", "drifted"] as const)(
    "a %s accepted Registry Subagent",
    (state) => {
      const world = makeInstallWorld();
      world.registry.writeSubagent("reviewer", [{ version: "1.0.0" }]);
      return world.workspace
        .provide(
          Effect.gen(function* () {
            yield* install("subagent", "reviewer");
            if (state === "drifted") drift(world, "subagents", "reviewer");
            const work = workObservations(false);
            const readback = yield* verify([{ type: "subagent", name: "reviewer" }]).pipe(
              work.provide,
            );
            const answer = readback.get("subagent:reviewer");
            // Before the observer took the verification's observation, each
            // verification of the Subagent hashed its tree twice; a package
            // the verification found unusable is still observed again.
            expect(treeHashes(work)).toBe(state === "usable" ? 1 : 2);
            expect(JSON.stringify(answer)).toBe(
              JSON.stringify(yield* ownAnswer("subagent", "reviewer", state === "usable")),
            );
            expect(
              answer !== undefined &&
                answer.nativeLocations.length > 0 &&
                answer.agentOutcomes.every((outcome) => outcome.outcome === "current"),
            ).toBe(state === "usable");
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(world.cleanup)));
    },
    { timeout: 60_000 },
  );
});

const publishers: Record<
  "rule" | "knowledge" | "hook",
  (registry: FileRegistry, name: string) => void
> = {
  rule: (registry, name) =>
    registry.writeRule(name, [{ version: "1.0.0", body: `Follow the ${name} rule.\n` }]),
  knowledge: (registry, name) =>
    registry.writeKnowledge(name, [{ version: "1.0.0", body: `# ${name}\n\nTeam knowledge.\n` }]),
  hook: (registry, name) => registry.writeHook(name, [{ version: "1.0.0" }]),
};

const plurals = { rule: "rules", knowledge: "knowledge", hook: "hooks" } as const;

describe("After-apply verification of an aggregate contributor observes its canonical package once", () => {
  // Each verification below selects `subject`; `other` is an enabled
  // contributor of the same type that the verification does not select.
  const rows: ReadonlyArray<{
    readonly type: "rule" | "knowledge" | "hook";
    /** Tree hashes when the contributor selection observed the subject again. */
    readonly repeated: number;
    readonly observed: number;
  }> = [
    // Verification, then the Rules region's contributor selection (subject and other).
    { type: "rule", repeated: 3, observed: 2 },
    // Verification, then the Knowledge discovery selection (subject and other).
    { type: "knowledge", repeated: 3, observed: 2 },
    // Verification, the Hook projection's selection, then the Hook outcomes'
    // own selection, which still observes both contributors.
    { type: "hook", repeated: 5, observed: 4 },
  ];

  for (const { type, repeated, observed } of rows) {
    it.effect(
      `an acquired ${type} beside another enabled ${type}`,
      () => {
        const world = makeInstallWorld({
          settings: { instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false } },
        });
        publishers[type](world.registry, "subject");
        publishers[type](world.registry, "other");
        return world.workspace
          .provide(
            Effect.gen(function* () {
              yield* install(type, "subject");
              yield* install(type, "other");
              const work = workObservations(false);
              const readback = yield* verify([{ type, name: "subject" }]).pipe(work.provide);
              expect(treeHashes(work), `repeated observations: ${repeated}`).toBe(observed);
              const answer = readback.get(`${type}:subject`);
              expect(JSON.stringify(answer)).toBe(
                JSON.stringify(yield* ownAnswer(type, "subject", true)),
              );
              expect(
                answer !== undefined &&
                  answer.agentOutcomes.length > 0 &&
                  answer.agentOutcomes.every((outcome) => outcome.outcome === "current"),
              ).toBe(true);
            }),
          )
          .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(world.cleanup)));
      },
      { timeout: 60_000 },
    );
  }

  it.effect.each(["rule", "knowledge", "hook"] as const)(
    "a drifted acquired %s fails or answers exactly as its observer does alone",
    (type) => {
      const world = makeInstallWorld({
        settings: { instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false } },
      });
      publishers[type](world.registry, "subject");
      return world.workspace
        .provide(
          Effect.gen(function* () {
            yield* install(type, "subject");
            drift(world, plurals[type], "subject");
            const readback = yield* Effect.exit(verify([{ type, name: "subject" }]));
            const own = yield* Effect.exit(ownAnswer(type, "subject", false));
            expect(
              JSON.stringify(
                readback._tag === "Success" ? readback.value.get(`${type}:subject`) : readback,
              ),
            ).toBe(JSON.stringify(own._tag === "Success" ? own.value : own));
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(world.cleanup)));
    },
    { timeout: 60_000 },
  );

  it.effect("a verification with no enabled subject observes nothing", () => {
    const world = makeInstallWorld();
    publishers.rule(world.registry, "subject");
    return world.workspace
      .provide(
        Effect.gen(function* () {
          yield* install("rule", "subject");
          const work = workObservations(false);
          const readback = yield* verify([]).pipe(work.provide);
          expect(readback.size).toBe(0);
          expect(treeHashes(work)).toBe(0);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(world.cleanup)));
  });

  it.effect.each(["same-phase", "copied-accepted-row", "earlier-phase"] as const)(
    "a Rule selection takes a row's observation only from its own phase, for the identical row (%s)",
    (handed) => {
      const world = makeInstallWorld({
        settings: { instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false } },
      });
      publishers.rule(world.registry, "subject");
      return world.workspace
        .provide(
          Effect.gen(function* () {
            yield* install("rule", "subject");
            const earlier = yield* withFreshWorkspaceObservationReadView(
              rowObservation("rule", "subject"),
            );
            const work = workObservations(false);
            const answer = yield* withFreshWorkspaceObservationReadView(
              Effect.gen(function* () {
                const current = yield* rowObservation("rule", "subject");
                const row =
                  handed === "earlier-phase"
                    ? earlier
                    : handed === "same-phase"
                      ? current
                      : {
                          ...current,
                          ...(current.accepted === undefined
                            ? {}
                            : { accepted: { ...current.accepted } }),
                        };
                return yield* answerFor("rule", "subject", true, row).pipe(work.provide);
              }),
            );
            expect(treeHashes(work)).toBe(handed === "same-phase" ? 0 : 1);
            expect(JSON.stringify(answer)).toBe(
              JSON.stringify(yield* ownAnswer("rule", "subject", true)),
            );
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(world.cleanup)));
    },
    { timeout: 60_000 },
  );
});

describe("Enabling an acquired extension verifies its canonical package once less", () => {
  // Tree hashes of the whole enable apply, including its verification phase.
  const rows: ReadonlyArray<{
    readonly type: "subagent" | "rule" | "knowledge" | "hook";
    readonly repeated: number;
    readonly observed: number;
  }> = [
    { type: "subagent", repeated: 5, observed: 4 },
    { type: "rule", repeated: 5, observed: 4 },
    { type: "knowledge", repeated: 5, observed: 4 },
    { type: "hook", repeated: 8, observed: 7 },
  ];
  for (const { type, repeated, observed } of rows) {
    it.effect(
      `enables a disabled acquired ${type}`,
      () => {
        const world = makeInstallWorld({
          settings: { instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false } },
        });
        if (type === "subagent") world.registry.writeSubagent("subject", [{ version: "1.0.0" }]);
        else publishers[type](world.registry, "subject");
        return world.workspace
          .provide(
            Effect.gen(function* () {
              yield* install(type, "subject");
              const disabled = yield* applyActivationAcceptingExecutionChanges({
                type,
                name: "subject",
                enabled: false,
              });
              expect(disabled._tag === "Resolved" && disabled.outcome).toBe("applied");
              const work = workObservations(false);
              const enabled = yield* applyActivationAcceptingExecutionChanges({
                type,
                name: "subject",
                enabled: true,
              }).pipe(work.provide);
              expect(enabled._tag === "Resolved" && enabled.outcome).toBe("applied");
              expect(treeHashes(work), `repeated observations: ${repeated}`).toBe(observed);
            }),
          )
          .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(world.cleanup)));
      },
      { timeout: 60_000 },
    );
  }
});
