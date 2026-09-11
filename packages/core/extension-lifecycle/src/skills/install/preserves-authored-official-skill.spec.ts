import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome, type OperationResolution } from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import { workspaceWithAuthoredExtension } from "../../activation/test-helpers.js";
import { applyInstall, installRequest, previewInstall } from "../../install/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/skills/install/preserves-authored-official-skill",
  title: "Bundled official-skill recovery never overwrites a workspace-authored official skill",
  statement:
    "When the workspace authors a skill named axm, installing the bundled official AXM skill shall be blocked before any change in preview and in a forced apply, shall name the authored skill as the cause, and shall leave configuration, lock state, and the authored source byte-for-byte intact.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["cli/skills/install/bundled-recovery-converges"],
  supersedes: ["cli/skills/install/bundled-recovery-converges"],
  assumptions: [],
  openQuestions: [],
});

const bundledRequest = (reinstall: boolean) =>
  installRequest({
    type: "skill",
    subject: { kind: "bundled" },
    reinstall,
    planName: "Install bundled AXM skill",
  });

describe("Bundled official-skill recovery over an authored official skill", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("is blocked in preview and forced apply before any change", () => {
    const workspace = workspaceWithAuthoredExtension({
      type: "skill",
      name: "axm",
      enabled: true,
    });
    cleanups.push(workspace.cleanup);
    const authoredPath = nodePath.join(workspace.root, "skills", "axm", "src", "SKILL.md");
    const before = {
      settings: workspace.readFile("axm.json"),
      lock: workspace.readFile("axm-lock.yaml"),
      authored: fs.readFileSync(authoredPath, "utf8"),
    };
    const expectBlocked = (resolution: OperationResolution): void => {
      expect(deriveOperationOutcome(resolution)).toBe("blocked");
      expect(resolution.blocking).toMatchObject({
        class: "precondition-unmet",
        causeCode: "conflict",
        subject: "bundled-axm-skill-authored",
      });
      // The refusal names the authored skill as the cause a person must act on.
      expect(JSON.stringify(resolution)).toContain("workspace-authored");
      const counts = resolution.units.map((unit) => unit.state);
      expect(counts.filter((state) => state === "committed")).toEqual([]);
      expect(counts).toContain("blocked");
    };

    return workspace
      .provide(
        Effect.gen(function* () {
          expectBlocked(yield* previewInstall(bundledRequest(false)));
          expectBlocked(yield* applyInstall(bundledRequest(true)));

          expect(workspace.readFile("axm.json")).toBe(before.settings);
          expect(workspace.readFile("axm-lock.yaml")).toBe(before.lock);
          expect(fs.readFileSync(authoredPath, "utf8")).toBe(before.authored);
          expect(workspace.exists("agent_extensions/agentxm/@agentxm/skills/axm")).toBe(false);
          expect(workspace.exists(".claude/skills/axm")).toBe(false);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
