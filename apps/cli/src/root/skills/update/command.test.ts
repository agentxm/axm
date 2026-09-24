/**
 * `axm skills update` is `axm update` narrowed to skills: what the route
 * reports is what the configured sweep settled, narrowed by the selectors the
 * route parsed. These examples pin the route's own concerns — its plan name,
 * its no-op message, and how a selector narrows the sweep — and leave what an
 * update decides to the update specifications.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach } from "vitest";

import { makeLifecycleRegistry } from "@agentxm/workspace/lifecycle/testing";

import { handleInstall } from "../../install/handler.js";
import { handleWorkspaceUpdate } from "../../update/workspace-update-handler.js";
import { makeSpecWorkspace } from "../../../test-support/install-harness.js";
import {
  expectNoOpPlanResult,
  expectPreviewedPlanResult,
  expectRecord,
  planResultUnits,
  property,
} from "../../../test-support/test-helpers.js";

const REVIEW = "code-review";
const TRIAGE = "triage";

const skillsUpdate = (args: {
  readonly source?: string;
  readonly names?: ReadonlyArray<string>;
  readonly preview?: boolean;
}) =>
  handleWorkspaceUpdate({
    command: "skills.update",
    type: Option.some("skill"),
    planName: "Update skills",
    planDescription: Option.some("Update configured skills"),
    flags: { preview: args.preview ?? false },
    selector: {
      resourceType: "skill",
      source: Option.fromUndefinedOr(args.source),
      nameFilters: args.names ?? [],
    },
  });

const installSkill = (fqn: string) =>
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

describe("skills update route", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("reports the sweep's no-op when no skills are configured", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);

      yield* skillsUpdate({}).pipe(Effect.provide(workspace.layer));

      expectNoOpPlanResult(workspace.rendererState.results[0]?.data, {
        planName: "Update skills",
        message: "No configured skills.",
      });
      expect(workspace.logs.warn).toEqual([]);
    }),
  );

  it.effect("a positional that names an installed skill narrows the sweep to that skill", () =>
    Effect.gen(function* () {
      const registry = makeLifecycleRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill(REVIEW, [{ version: "1.0.0", body: "First guidance." }]);
      registry.writeSkill(TRIAGE, [{ version: "1.0.0", body: "First triage." }]);
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: { sources: [registry.source] },
      });
      cleanups.push(workspace.cleanup);
      yield* installSkill(`@acme/skills/${REVIEW}`).pipe(Effect.provide(workspace.layer));
      yield* installSkill(`@acme/skills/${TRIAGE}`).pipe(Effect.provide(workspace.layer));
      registry.writeSkill(REVIEW, [
        { version: "1.0.0", body: "First guidance." },
        { version: "2.0.0", body: "Second guidance." },
      ]);
      registry.writeSkill(TRIAGE, [
        { version: "1.0.0", body: "First triage." },
        { version: "2.0.0", body: "Second triage." },
      ]);
      const lockBefore = workspace.readLockfileText();
      workspace.rendererState.results.splice(0);

      yield* skillsUpdate({ source: REVIEW, preview: true }).pipe(Effect.provide(workspace.layer));

      const result = expectPreviewedPlanResult(workspace.rendererState.results[0]?.data, {
        planName: "Update skills",
        totalSteps: 1,
      });
      expect(planResultUnits(result)).toEqual([
        expect.objectContaining({ label: `skills/${REVIEW}`, state: "ready" }),
      ]);
      expect(workspace.readLockfileText()).toBe(lockBefore);
    }),
  );

  it.effect("an unreachable source blocks that one unit instead of failing the command", () =>
    Effect.gen(function* () {
      const registry = makeLifecycleRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill(REVIEW, [{ version: "1.0.0", body: "First guidance." }]);
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: { sources: [registry.source] },
      });
      cleanups.push(workspace.cleanup);
      yield* installSkill(`@acme/skills/${REVIEW}`).pipe(Effect.provide(workspace.layer));
      registry.writeSkill(REVIEW, [
        { version: "1.0.0", body: "First guidance." },
        { version: "2.0.0", body: "Second guidance." },
      ]);
      workspace.writeSettings({
        ...workspace.readSettingsRecord(),
        skills: {
          ...expectRecord(property(workspace.readSettingsRecord(), "skills")),
          missing: "./no-such-source-directory",
        },
      });
      workspace.rendererState.results.splice(0);

      yield* skillsUpdate({}).pipe(Effect.provide(workspace.layer));

      const result = expectRecord(property(workspace.rendererState.results[0]?.data, "result"));
      const units = planResultUnits(result);
      expect(units).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: `skills/${REVIEW}`, state: "committed" }),
          expect.objectContaining({ label: "skills/missing", state: "failed" }),
        ]),
      );
      expect(workspace.logs.warn).toEqual([]);
      expect(workspace.readLockfileText()).toContain("version: 2.0.0");
    }),
  );
});
