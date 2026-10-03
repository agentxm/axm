import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { NativeWriteAuthority } from "../agent-adapters/index.js";
import { readContainerReceipts } from "../locations/index.js";
import { NativeWriteAuthorityLive } from "../projection/live.js";
import { codingAgentRepositoryLayer } from "../projection/testing.js";
import { reconcileAgentOutputs } from "./index.js";
import { WorkspaceFileWriteLocksLive } from "../settlement/live.js";
import { WorkspaceReadTest } from "../workspace-state/testing.js";

export const specification = defineSpecification({
  requirement: "workspace/locations/withdraws-native-artifact-parents",
  title: "Native artifact cleanup retires only proven empty created parents",
  statement:
    "When desired-state or membership reconciliation withdraws an owned Skill or Subagent artifact, AXM shall retire its proven empty created ancestors while preserving preexisting directories and foreign children.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Real links, directories and persisted receipts distinguish exact created-container withdrawal from unowned ancestor deletion.",
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("native artifact parent withdrawal", () => {
  for (const kind of ["skill", "subagent"] as const)
    for (const parentState of ["absent", "preexisting", "foreign-child"] as const)
      it.effect(`${kind} preserves ${parentState} parent authority`, () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const directory = path.join(root, kind === "skill" ? ".claude/skills" : ".claude/agents");
          const target = path.join(directory, kind === "skill" ? "review" : "review.md");
          const source = path.join(root, "source");
          yield* fs.makeDirectory(source);
          yield* fs.writeFileString(path.join(source, "SKILL.md"), "# Review\n");
          if (parentState === "preexisting")
            yield* fs.makeDirectory(directory, { recursive: true });
          const workspace = WorkspaceReadTest({ baseDir: root });
          const services = Layer.mergeAll(
            workspace,
            codingAgentRepositoryLayer([]),
            NativeWriteAuthorityLive.pipe(
              Layer.provide(Layer.merge(workspace, WorkspaceFileWriteLocksLive)),
            ),
          );
          yield* Effect.gen(function* () {
            const authority = yield* NativeWriteAuthority;
            const unit = JSON.stringify([
              kind === "skill" ? "skill-parent-directories" : "subagent-parent-directories",
              target,
            ]);
            const capture = yield* authority.captureCreatedDirectories({
              path: target,
              unit,
              eligible: true,
            });
            const createdDirectories = yield* authority.createParentDirectories(target);
            if (kind === "skill") yield* fs.symlink(source, target);
            else
              yield* fs.writeFileString(
                target,
                "<!-- axm:file v=1 ext=@acme/subagents/review src=subagents/review -->\n# Review\n",
              );
            yield* authority.recordCreatedDirectories({ capture, createdDirectories });
            if (parentState === "foreign-child")
              yield* fs.writeFileString(path.join(directory, "personal.txt"), "keep\n");
            const result = yield* reconcileAgentOutputs({
              desiredAgentIds: new Set(),
              expectedNames: {
                skill: new Set(),
                subagent: new Set(),
                hook: new Set(),
                "mcp-server": new Set(),
              },
              authority: {
                expectedSkillSources: { review: [source] },
                expectedSubagentFiles: {
                  review: [{ ext: "@acme/subagents/review", src: "subagents/review" }],
                },
                expectedMcpEntries: {},
                expectedHooks: [],
                expectedRegions: { rule: [], knowledge: [] },
              },
            });
            expect(result.removedPaths).toContain(target);
            expect(result.nativeLocations).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  address: { kind: kind === "skill" ? "entry" : "file", path: target },
                  state: "removed",
                  ownership: "absent",
                }),
              ]),
            );
            expect(yield* fs.exists(target)).toBe(false);
            expect(yield* fs.readFileString(path.join(source, "SKILL.md"))).toBe("# Review\n");
            expect(yield* fs.exists(directory)).toBe(parentState !== "absent");
            if (parentState === "foreign-child")
              expect(yield* fs.readFileString(path.join(directory, "personal.txt"))).toBe("keep\n");
            else
              expect((yield* readContainerReceipts(path.join(root, ".axm"))).entries).toEqual([]);
          }).pipe(Effect.provide(services));
        }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
      );
});
