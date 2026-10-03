import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
} from "../test-support/authoring-workspace.js";
import { ImportNativeExtension } from "./import-native-extension.js";

export const specification = defineSpecification({
  requirement: "cli/hooks/import/preserves-native-source",
  title: "Native Hook import preserves its source and creates an inactive package",
  statement:
    "Importing a supported native command bundle shall preserve original registrations and declared resource bytes without executing them, create an inactive authored Hook with native protocol and source provenance, and report the duplicate-execution risk of enabling it. Unsupported commands and escaping resources shall be refused before package creation.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity", "safe-repetition"],
  boundary: "memory",
  boundaryRationale:
    "The production import use case runs against a temporary project directory; byte snapshots distinguish source preservation, pure preview, and create-only inactive authorship.",
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Native Hook import", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "imports without executing or changing the native source",
    () =>
      Effect.gen(function* () {
        const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
        cleanups.push(created.cleanup);
        const script = "#!/bin/bash\ntouch executed-sentinel\n";
        created.write("native/src/audit.sh", script);
        created.write("native/data/config.txt", "shared resource\n");
        created.write(
          "native/hooks.json",
          JSON.stringify({
            hooks: {
              PreToolUse: [
                {
                  matcher: "Bash",
                  hooks: [{ type: "command", command: "bash src/audit.sh", timeout: 5 }],
                },
              ],
            },
          }),
        );
        const sourceBefore = created.snapshot("native");
        const resolution = yield* Effect.gen(function* () {
          const candidate = yield* ImportNativeExtension.prepare({
            type: "hook",
            source: nodePath.join(created.root, "native"),
            target: "@acme/hooks/audit",
            protocol: "claude-code",
            resources: ["data/config.txt"],
            enable: false,
          });
          return yield* ImportNativeExtension.previewOrApply(candidate, applyExecution);
        }).pipe(Effect.scoped, Effect.provide(authoringWorkspaceLayer(created)));
        expect(deriveOperationOutcome(resolution), JSON.stringify(resolution)).toBe("applied");
        expect(created.snapshot("native")).toEqual(sourceBefore);
        expect(created.exists("executed-sentinel")).toBe(false);
        expect(created.exists(".claude/settings.json")).toBe(false);

        expect(created.settings()).toMatchObject({
          hooks: { audit: { source: "workspace", enabled: false } },
        });
        expect(created.read("hooks/audit/src/audit.sh")).toBe(script);
        expect(created.read("hooks/audit/data/config.txt")).toBe("shared resource\n");
        expect(JSON.parse(created.read("hooks/audit/hook.json") ?? "null")).toMatchObject({
          implementations: [
            {
              protocol: "claude-code",
              bindings: [
                {
                  event: "PreToolUse",
                  matcher: "Bash",
                  handler: { runtime: "bash", entrypoint: "src/audit.sh", timeoutMs: 5000 },
                },
              ],
            },
          ],
          metadata: { nativeImport: { protocol: "claude-code", config: "hooks.json" } },
        });
        expect(
          resolution.units.some((unit) =>
            unit.message?.includes("may execute the same hook twice"),
          ),
        ).toBe(true);
      }),
    30_000,
  );

  for (const command of [
    "bash ../outside.sh",
    "bash src/audit.sh && echo injected",
    "bash /private/audit.sh",
    "python src/audit.py",
  ]) {
    it.effect(`refuses unsupported command ${command} without mutations`, () =>
      Effect.gen(function* () {
        const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
        cleanups.push(created.cleanup);
        created.write(
          "native/hooks.json",
          JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: "command", command }] }] } }),
        );
        const before = created.snapshot();
        yield* ImportNativeExtension.prepare({
          type: "hook",
          source: nodePath.join(created.root, "native"),
          target: "@acme/hooks/audit",
          protocol: "claude-code",
          enable: false,
        }).pipe(Effect.flip, Effect.scoped, Effect.provide(authoringWorkspaceLayer(created)));
        expect(created.snapshot()).toEqual(before);
      }),
    );
  }
});
