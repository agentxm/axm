import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import { NativeWriteAuthorityPermissive } from "../../agent-adapters/testing.js";
import { WorkspaceReadTest } from "../../workspace-state/testing.js";
import { applyInstructionSurfacePlans, planAggregateProjection } from "../index.js";

export const specification = defineSpecification({
  requirement: "workspace/instructions/native-only-hooks-preserve-routing",
  title: "Native Hook changes preserve existing instruction routing state",
  statement:
    "A Hook transition shall preserve absent and preexisting instruction aliases; shared Rule and Knowledge instruction content changes shall reconcile their dependent aliases.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Real authored files and links establish whether projection application changes unrelated routing state.",
  methods: ["decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("native Hook instruction routing", () => {
  for (const existingAlias of [false, true]) {
    it.effect(
      `preserves ${existingAlias ? "preexisting" : "absent"} aliases through native Hook introduction and withdrawal`,
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const source = path.join(root, "AGENTS.md");
          const alias = path.join(root, "CLAUDE.md");
          const native = path.join(root, ".claude", "settings.json");
          const authored = "# Authored instructions\r\n\r\nKeep this exact text.";
          const nativeBefore = '{\r\n  "keep": true, "hooks": {}\r\n}\r\n';
          yield* fs.writeFileString(source, authored);
          yield* fs.makeDirectory(path.dirname(native));
          yield* fs.writeFileString(native, nativeBefore);
          if (existingAlias) yield* fs.symlink("AGENTS.md", alias);
          const workspace = WorkspaceReadTest({
            baseDir: root,
            settings: { agents: ["claude-code"], instructionFiles: {} },
          });
          yield* Effect.gen(function* () {
            for (const after of ['{"hooks":{"SessionStart":[{"command":"hook"}]}}', nativeBefore]) {
              const nativePlan = yield* planAggregateProjection({
                unitId: "hook:agent-hook-entries",
                targetFile: native,
                graph: { nodes: [], mcpSourceClosures: [], problems: [], packMembership: [] },
                select: () => Effect.succeed({ contributors: [], exclusions: [] }),
                adapter: {
                  observe: () =>
                    Effect.succeed({
                      unitId: "hook:agent-hook-entries",
                      path: native,
                      present: true,
                      current: false,
                      expectedContributors: [],
                    }),
                  apply: () => fs.writeFileString(native, after),
                },
              });
              yield* applyInstructionSurfacePlans([nativePlan]);
              expect(yield* fs.exists(alias)).toBe(existingAlias);
              expect(yield* fs.readFileString(source)).toBe(authored);
              if (existingAlias) expect(yield* fs.readLink(alias)).toBe("AGENTS.md");
            }
            expect(yield* fs.readFileString(native)).toBe(nativeBefore);
          }).pipe(Effect.provide(Layer.merge(workspace, NativeWriteAuthorityPermissive)));
        }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }

  it.effect("reconciles aliases after a shared instruction region changes", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const source = path.join(root, "AGENTS.md");
      yield* fs.writeFileString(source, "# Authored\n");
      const workspace = WorkspaceReadTest({
        baseDir: root,
        settings: { agents: ["claude-code"], instructionFiles: {} },
      });
      yield* Effect.gen(function* () {
        const plan = yield* planAggregateProjection({
          unitId: "rule:instructions-region",
          targetFile: source,
          graph: { nodes: [], mcpSourceClosures: [], problems: [], packMembership: [] },
          select: () => Effect.succeed({ contributors: ["rule"], exclusions: [] }),
          adapter: {
            observe: () =>
              Effect.succeed({
                unitId: "rule:instructions-region",
                path: source,
                present: false,
                current: false,
                expectedContributors: ["rule"],
              }),
            apply: () => fs.writeFileString(source, "# Authored\n\nRule instructions\n"),
          },
        });
        yield* applyInstructionSurfacePlans([plan]);
        expect(yield* fs.readFileString(path.join(root, "CLAUDE.md"))).toBe(
          "# Authored\n\nRule instructions\n",
        );
      }).pipe(Effect.provide(Layer.merge(workspace, NativeWriteAuthorityPermissive)));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
