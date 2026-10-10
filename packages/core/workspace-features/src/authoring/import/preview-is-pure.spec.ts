import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";

import {
  authoringWorkspaceEnvironment,
  makeAuthoringWorkspace,
  previewExecution,
} from "../test-support/authoring-workspace.js";
import { nativeMcpDiscovery, writeNativeRemoteMcp } from "../test-support/native-mcp.js";
import { ImportNativeExtension } from "./import-native-extension.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/import/preview-is-pure",
  title: "MCP package conversion preview describes the change without changing workspace state",
  statement:
    "When mcps import previews conversion of a native server into an authored package, whether or not it would enable the package, it shall describe the package, settings declaration, and native file changes without writing any workspace state or requesting confirmation.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  derivedFrom: ["cli/mcps/import/creates-authored-package-from-native-server"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("MCP package conversion preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  // Activation is the only decision --enable changes, so purity is stated
  // once per value rather than over the enabled conversion alone.
  for (const enable of [true, false])
    it.effect(
      `previewing the ${enable ? "enabled" : "disabled"} conversion writes nothing and asks no one`,
      () =>
        Effect.gen(function* () {
          const created = makeAuthoringWorkspace({
            owner: "@acme",
            agents: ["claude-code"],
          });
          cleanups.push(created.cleanup);
          writeNativeRemoteMcp(created);
          const environment = authoringWorkspaceEnvironment(created);
          const before = created.snapshot();

          const { candidate, resolution } = yield* Effect.gen(function* () {
            const candidate = yield* ImportNativeExtension.prepare({
              type: "mcp-server",
              target: "@acme/mcps/context",
              enable,
              nonInteractive: true,
              discovery: nativeMcpDiscovery(created),
            });
            return {
              candidate,
              resolution: yield* ImportNativeExtension.previewOrApply(candidate, previewExecution),
            };
          }).pipe(Effect.scoped, Effect.provide(environment.layer));

          expect(deriveOperationOutcome(resolution)).toBe("previewed");
          expect(candidate.enabled).toBe(enable);

          // The preview names the package, the declaration, and the native
          // file the conversion would retire the connection from.
          expect(
            resolution.units.flatMap((unit) =>
              (unit.artifact?.targets ?? []).map((target) => target.path),
            ),
          ).toEqual(["mcps/context", "axm.json", ".mcp.json"]);

          expect(created.exists("mcps/context/mcp.json")).toBe(false);
          expect(created.snapshot()).toEqual(before);
          expect(environment.interaction.confirmApplyChangesCalls).toEqual([]);
        }),
    );
});
