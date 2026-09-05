import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { expectNoOpPlanResult, handleInstall, planResultUnits } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/install/inline-mcp-configuration-is-skipped",
  title: "Workspace install skips inline MCP configuration without failing",
  statement:
    "When the workspace's configured extensions are installed and workspace settings configure an MCP server inline, the install command shall report that entry as a skipped unit carrying guidance, shall complete without failure, shall not record the entry in the lockfile, and shall leave the inline configuration unchanged.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["cli/install/inline-mcp-configuration-not-acquirable"],
  supersedes: ["cli/install/inline-mcp-configuration-not-acquirable"],
  assumptions: [],
  openQuestions: [
    "The plan result names the entry's state (skipped) but carries the reason only as prose in the unit's message; no structured field says the entry is inline workspace configuration that sync reconciles. Until the plan-result contract names that reason, this specification asserts the skipped state and the presence of guidance and leaves the message wording non-normative.",
  ],
});

describe("Inline MCP configuration during workspace install", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("reports the inline entry as a skipped unit and leaves it unlocked and unchanged", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: {
          mcps: { "local-tool": { command: "echo local-tool" } },
        },
      });
      cleanups.push(workspace.cleanup);
      const lockBefore = workspace.readLockfileText();

      yield* handleInstall({
        source: Option.none(),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));

      const [entry] = workspace.rendererState.results;
      expect(entry?.ok).toBe(true);
      const result = expectNoOpPlanResult(entry?.data, {
        planName: "Install configured extensions",
        totalSteps: 1,
      });
      expect(planResultUnits(result)).toEqual([
        expect.objectContaining({
          label: "local-tool",
          state: "skipped",
          message: expect.any(String),
        }),
      ]);

      expect(workspace.readLockfileText()).toBe(lockBefore);
      expect(workspace.readLockfileText()).not.toContain("local-tool");
      expect(workspace.readSettings()).toMatchObject({
        mcpServers: { "local-tool": { command: "echo local-tool" } },
      });
    }),
  );
});
