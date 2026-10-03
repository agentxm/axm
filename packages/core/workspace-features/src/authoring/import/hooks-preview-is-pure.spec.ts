import * as nodePath from "node:path";
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
import { ImportNativeExtension } from "./import-native-extension.js";

export const specification = defineSpecification({
  requirement: "cli/hooks/import/preview-is-pure",
  title: "Native Hook import preview changes no state",
  statement:
    "Hook import preview shall validate the native source and describe the inactive authored package without executing package code or changing native source, settings, accepted state, authored content, or agent configuration.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "authoring-and-creation"],
  boundary: "memory",
  boundaryRationale:
    "A real temporary project records every byte before and after the production import preview.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Native Hook import preview", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  it.effect("describes import without mutating or executing native content", () =>
    Effect.gen(function* () {
      const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
      cleanups.push(created.cleanup);
      created.write("native/hook.sh", "#!/bin/bash\ntouch executed-sentinel\n");
      created.write(
        "native/hooks.json",
        JSON.stringify({
          hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "bash hook.sh" }] }] },
        }),
      );
      const before = created.snapshot();
      const result = yield* Effect.gen(function* () {
        const candidate = yield* ImportNativeExtension.prepare({
          type: "hook",
          source: nodePath.join(created.root, "native"),
          target: "@acme/hooks/audit",
          protocol: "claude-code",
          enable: false,
        });
        return yield* ImportNativeExtension.previewOrApply(candidate, previewExecution);
      }).pipe(Effect.scoped, Effect.provide(authoringWorkspaceLayer(created)));
      expect(deriveOperationOutcome(result)).toBe("previewed");
      expect(created.snapshot()).toEqual(before);
    }),
  );
});
