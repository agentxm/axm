import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import {
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
  previewExecution,
} from "../test-support/authoring-workspace.js";
import { ExportHook } from "./export-hook.js";

export const specification = defineSpecification({
  requirement: "cli/hooks/export/preview-is-pure",
  title: "Native Hook export preview changes no state",
  statement:
    "Hook export preview shall validate the selected implementation and destination and describe the native bundle without executing package code or changing package content, workspace state, native registrations, or destination files.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "authoring-and-creation"],
  boundary: "memory",
  boundaryRationale:
    "A real temporary project records every byte before and after the production export preview.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Native Hook export preview", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  it.effect("describes the bundle without mutations or execution", () =>
    Effect.gen(function* () {
      const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
      cleanups.push(created.cleanup);
      created.write("hooks/audit/hook.sh", "#!/bin/bash\ntouch executed-sentinel\n");
      created.write(
        "hooks/audit/hook.json",
        JSON.stringify({
          owner: "@acme",
          type: "hook",
          name: "audit",
          version: "1.0.0",
          implementations: [
            {
              id: "claude",
              protocol: "claude-code",
              bindings: [
                {
                  id: "audit",
                  event: "PreToolUse",
                  handler: { type: "command", runtime: "bash", entrypoint: "hook.sh" },
                },
              ],
            },
          ],
        }),
      );
      const before = created.snapshot();
      const result = yield* Effect.gen(function* () {
        const candidate = yield* ExportHook.prepare({
          directory: "hooks/audit",
          implementation: "claude",
          destination: "native-export",
        });
        return yield* ExportHook.previewOrApply(candidate, previewExecution);
      }).pipe(Effect.scoped, Effect.provide(authoringWorkspaceLayer(created)));
      expect(deriveOperationOutcome(result)).toBe("previewed");
      expect(created.snapshot()).toEqual(before);
    }),
  );
});
