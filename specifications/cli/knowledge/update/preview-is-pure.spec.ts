import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleKnowledgeInstall, handleKnowledgeUpdate } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";
import { makeSpecRegistry } from "../../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/update/preview-is-pure",
  title: "Knowledge update preview describes the newer release without changing any state",
  statement:
    "When knowledge update runs in preview mode against a configured Registry bundle with a newer eligible release, it shall report the update it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/update/advances-resolution-within-intent"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Knowledge update preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const firstVersion = { version: "1.0.0", body: "First guidance." };

  /** A workspace holding the accepted first version after the Registry publishes a second. */
  const workspaceWithNewerPublication = Effect.gen(function* () {
    const registry = makeSpecRegistry();
    cleanups.push(registry.cleanup);
    registry.writeKnowledge("platform", [firstVersion]);
    const workspace = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      recordWrites: true,
      settings: { sources: [registry.source] },
    });
    cleanups.push(workspace.cleanup);
    yield* handleKnowledgeInstall({
      source: Option.some("@acme/knowledge/platform"),
      preview: false,
    }).pipe(Effect.provide(workspace.layer));
    expect(workspace.readLockfileText()).toContain("resolvedVersion: 1.0.0");
    registry.writeKnowledge("platform", [
      firstVersion,
      { version: "2.0.0", body: "Second guidance." },
    ]);
    return workspace;
  });

  it.effect("a previewed update to a newer release changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = yield* workspaceWithNewerPublication;
      const before = snapshotProtectedState(workspace.root);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);

      yield* handleKnowledgeUpdate({ source: Option.none(), names: [], preview: true }).pipe(
        Effect.provide(workspace.layer),
      );

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.readLockfileText()).toContain("resolvedVersion: 1.0.0");
      expect(workspace.readLockfileText()).not.toContain("resolvedVersion: 2.0.0");
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          units: expect.arrayContaining([
            expect.objectContaining({
              label: expect.stringContaining("platform"),
              state: "ready",
            }),
          ]),
        },
      });
    }),
  );

  it.effect(
    "a previewed update whose selection matches nothing reports that and changes nothing",
    () =>
      Effect.gen(function* () {
        const workspace = yield* workspaceWithNewerPublication;
        const before = snapshotProtectedState(workspace.root);
        workspace.writes.splice(0);
        workspace.rendererState.results.splice(0);

        yield* handleKnowledgeUpdate({
          source: Option.none(),
          names: ["absent-bundle"],
          preview: true,
        }).pipe(Effect.provide(workspace.layer));

        expectProtectedStateUntouched({
          root: workspace.root,
          before,
          writes: workspace.writes,
        });
        expect(workspace.readLockfileText()).toContain("resolvedVersion: 1.0.0");
        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
        const [entry] = workspace.rendererState.results;
        expect(entry?.data).toMatchObject({ result: { outcome: "no-op" } });
      }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["knowledge", "update"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["knowledge", "update"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["knowledge", "update"], "-y")).toBe("unrecognized");
    }),
  );
});
