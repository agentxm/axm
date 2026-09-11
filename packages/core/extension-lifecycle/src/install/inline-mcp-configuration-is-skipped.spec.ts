import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import { applyInstall, installRequest, makeInstallWorld, readSettings } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/install/inline-mcp-configuration-is-skipped",
  title: "Workspace install skips inline MCP configuration without failing",
  statement:
    "When the workspace's configured extensions are installed and workspace settings configure an MCP server inline, the install shall report that entry as a skipped unit carrying guidance, shall complete without failure, shall not record the entry in the lockfile, and shall leave the inline configuration unchanged.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["cli/install/inline-mcp-configuration-not-acquirable"],
  supersedes: ["cli/install/inline-mcp-configuration-not-acquirable"],
  assumptions: [],
  openQuestions: [
    "The resolution names the entry's state (skipped) but carries the reason only as prose in the unit's message; no structured field says the entry is inline workspace configuration that sync reconciles. Until the resolution contract names that reason, this specification asserts the skipped state and the presence of guidance and leaves the message wording non-normative.",
  ],
});

describe("Inline MCP configuration during workspace install", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "reports the inline entry as a skipped unit and leaves it unlocked and unchanged",
    () => {
      const { workspace, cleanup } = makeInstallWorld({
        settings: { mcpServers: { "local-tool": { command: "echo local-tool" } } },
      });
      cleanups.push(cleanup);
      const lockBefore = workspace.readFile("axm-lock.yaml");
      return workspace
        .provide(
          Effect.gen(function* () {
            const resolution = yield* applyInstall(
              installRequest({
                subject: { kind: "configured" },
                planName: "Install configured extensions",
              }),
            );

            expect(resolution.name).toBe("Install configured extensions");
            expect(deriveOperationOutcome(resolution)).toBe("no-op");
            expect(resolution.units).toEqual([
              expect.objectContaining({
                label: "local-tool",
                state: "skipped",
                message: expect.any(String),
              }),
            ]);

            expect(workspace.readFile("axm-lock.yaml")).toBe(lockBefore);
            expect(workspace.readFile("axm-lock.yaml")).not.toContain("local-tool");
            expect(readSettings(workspace)).toMatchObject({
              mcpServers: { "local-tool": { command: "echo local-tool" } },
            });
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
