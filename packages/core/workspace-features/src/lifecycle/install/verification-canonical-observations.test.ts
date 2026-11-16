/**
 * After an apply, configured-agent verification observes each enabled
 * subject's canonical package once inside its fresh observation phase: the
 * native observer of that subject's type takes the verification's own
 * observation of the identical desired node and accepted row instead of
 * hashing and decoding the same tree again. A subject the verification found
 * unusable is still observed by the observer.
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

import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  ConfiguredAgentOutcomesProvider,
  DesiredStateReader,
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
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
 * The observer's answer for one enabled row that carries no observation, in
 * the caller's read phase: the answer the verification gave before it handed
 * its observations over.
 */
const answerFor = (type: InstallableExtensionType, name: string, installed: boolean) =>
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
        rows: [{ name, targetState: "enabled", installed }],
      },
    );
    return observations.get(name);
  });

/** The observer's own answer for one row, in a fresh observation phase of its own. */
const ownAnswer = (type: InstallableExtensionType, name: string, installed: boolean) =>
  withFreshWorkspaceObservationReadView(answerFor(type, name, installed));

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

describe("Enabling an acquired extension verifies its canonical package once less", () => {
  // Tree hashes of the whole enable apply, including its verification phase.
  const rows: ReadonlyArray<{
    readonly type: "subagent";
    readonly repeated: number;
    readonly observed: number;
  }> = [
    { type: "subagent", repeated: 5, observed: 4 },
  ];
  for (const { type, repeated, observed } of rows) {
    it.effect(
      `enables a disabled acquired ${type}`,
      () => {
        const world = makeInstallWorld();
        world.registry.writeSubagent("subject", [{ version: "1.0.0" }]);
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
