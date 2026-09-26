/**
 * `axm subagents update` is `axm update` narrowed to subagents. These
 * examples pin the route's own concerns — its plan name, its no-op message,
 * how `--name` narrows the sweep, and how a held release is reported — and
 * leave what an update decides to the update specifications.
 */

import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach } from "vitest";

import { makeFileRegistry } from "@agentxm/registry-client/testing";

import { handleInstall } from "../install/handler.js";
import { handleWorkspaceUpdate } from "./workspace-update-handler.js";
import { makeSpecWorkspace } from "../../test-support/install-harness.js";
import {
  expectNoOpPlanResult,
  expectPreviewedPlanResult,
  planResultUnits,
} from "../../test-support/test-helpers.js";

const RESEARCHER = "researcher";
const REVIEWER = "reviewer";

const subagentsUpdate = (args: {
  readonly names?: ReadonlyArray<string>;
  readonly preview?: boolean;
}) =>
  handleWorkspaceUpdate({
    command: "subagents.update",
    type: Option.some("subagent"),
    planName: "Update subagents",
    planDescription: Option.some("Update configured subagents"),
    flags: { preview: args.preview ?? false },
    selector: {
      resourceType: "subagent",
      source: Option.none(),
      nameFilters: args.names ?? [],
    },
  });

const installSubagent = (fqn: string) =>
  handleInstall({
    type: Option.none(),
    source: Option.some(fqn),
    selectors: {},
    all: false,
    force: false,
    preview: false,
    env: [],
    localName: Option.none(),
    bundled: false,
  });

describe("subagents update route", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("reports the sweep's no-op when no subagents are configured", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);

      yield* subagentsUpdate({}).pipe(Effect.provide(workspace.layer));

      expectNoOpPlanResult(workspace.rendererState.results[0]?.data, {
        planName: "Update subagents",
        message: "No configured subagents.",
      });
    }),
  );

  it.effect("--name narrows the sweep to the subagents it names", () =>
    Effect.gen(function* () {
      const registry = makeFileRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSubagent(RESEARCHER, [{ version: "1.0.0", body: "First research." }]);
      registry.writeSubagent(REVIEWER, [{ version: "1.0.0", body: "First review." }]);
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: { sources: [registry.source] },
      });
      cleanups.push(workspace.cleanup);
      yield* installSubagent(`@acme/subagents/${RESEARCHER}`).pipe(Effect.provide(workspace.layer));
      yield* installSubagent(`@acme/subagents/${REVIEWER}`).pipe(Effect.provide(workspace.layer));
      registry.writeSubagent(RESEARCHER, [
        { version: "1.0.0", body: "First research." },
        { version: "2.0.0", body: "Second research." },
      ]);
      registry.writeSubagent(REVIEWER, [
        { version: "1.0.0", body: "First review." },
        { version: "2.0.0", body: "Second review." },
      ]);
      workspace.rendererState.results.splice(0);

      yield* subagentsUpdate({ names: [RESEARCHER], preview: true }).pipe(
        Effect.provide(workspace.layer),
      );

      const result = expectPreviewedPlanResult(workspace.rendererState.results[0]?.data, {
        planName: "Update subagents",
        totalSteps: 1,
      });
      expect(planResultUnits(result)).toEqual([
        expect.objectContaining({ label: `subagents/${RESEARCHER}`, state: "ready" }),
      ]);
    }),
  );

  it.effect(
    "keeps the accepted release when the minimum age holds the newer one, with evidence",
    () =>
      Effect.gen(function* () {
        const registry = makeFileRegistry();
        cleanups.push(registry.cleanup);
        registry.writeSubagent(RESEARCHER, [{ version: "1.0.0", body: "First research." }]);
        const workspace = makeSpecWorkspace({
          machine: true,
          flags: { json: true },
          settings: { sources: [registry.source] },
        });
        cleanups.push(workspace.cleanup);
        yield* installSubagent(`@acme/subagents/${RESEARCHER}`).pipe(
          Effect.provide(workspace.layer),
        );
        const publishedAt = DateTime.formatIso(yield* DateTime.now);
        registry.writeSubagent(RESEARCHER, [
          { version: "1.0.0", body: "First research." },
          { version: "2.0.0", body: "Fresh research.", published: publishedAt },
        ]);
        const lockBefore = workspace.readLockfileText();
        workspace.rendererState.results.splice(0);

        yield* subagentsUpdate({}).pipe(Effect.provide(workspace.layer));

        const result = expectNoOpPlanResult(workspace.rendererState.results[0]?.data, {
          planName: "Update subagents",
          totalSteps: 1,
        });
        expect(planResultUnits(result)).toEqual([
          expect.objectContaining({
            id: `subagent:${RESEARCHER}`,
            label: `subagents/${RESEARCHER}`,
          }),
        ]);
        expect(result).toMatchObject({
          holdbackCount: 1,
          holdbacks: [{ target: `@acme/subagents/${RESEARCHER}`, candidateVersion: "2.0.0" }],
        });
        expect(workspace.readLockfileText()).toBe(lockBefore);
      }),
  );
});
