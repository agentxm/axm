import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { applySync, expectResolved, makeSyncFixture } from "../testing/sync-fixture.js";

export const specification = defineSpecification({
  requirement: "skills/projection/no-per-agent-rendering",
  title: "All agents receive the same skill content",
  statement:
    "AXM shall place the selected skill directory unchanged at every applicable agent destination and shall not render or translate its frontmatter, instructions, hooks, tool names, conditional text, or supporting files per agent.",
  class: "constraint",
  role: "experience",
  goals: ["workspace-intent-fidelity", "agent-interoperability"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const payload = [
  "---",
  "name: review",
  "description: Review changes",
  "allowed-tools: [Read, Bash]",
  "disable-model-invocation: true",
  "agentOverrides: { cursor: { description: Must remain literal } }",
  "hooks: { PreToolUse: [{ hooks: [{ type: command, command: '${CLAUDE_SKILL_DIR}/scripts/check.sh' }] }] }",
  "future: { revision: 3 }",
  "---",
  "<!-- if agent=cursor -->",
  "Use Read and scripts/check.sh; preserve this instruction verbatim.",
  "<!-- endif -->",
  "",
].join("\r\n");

describe("Agent-independent skill content", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "keeps native metadata, relative resources, executable modes and links across destinations",
    () => {
      const workspace = makeSyncFixture({
        settings: {
          owner: "@acme",
          agents: ["claude-code", "cursor"],
          skills: { "review-package": "workspace" },
        },
        files: {
          "skills/review-package/skill.json": JSON.stringify({
            owner: "@acme",
            type: "skill",
            name: "review-package",
            version: "1.0.0",
          }),
          "skills/review-package/src/SKILL.md": payload,
          "skills/review-package/src/scripts/check.sh": "#!/bin/sh\nexit 0\n",
          "skills/review-package/src/references/context.md": "# Context\n",
        },
      });
      cleanups.push(workspace.cleanup);
      return workspace
        .provide(
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const path = yield* Path.Path;
            const source = path.join(workspace.root, "skills/review-package/src");
            yield* fs.chmod(path.join(source, "scripts/check.sh"), 0o755);
            yield* fs.symlink("scripts/check.sh", path.join(source, "check"));
            const result = expectResolved(yield* applySync());
            expect(deriveOperationOutcome(result)).toBe("applied");
            for (const directory of [
              ".agents/skills/review",
              ".claude/skills/review",
              ".cursor/skills/review",
            ]) {
              const target = path.join(workspace.root, directory);
              expect(new Uint8Array(yield* fs.readFile(path.join(target, "SKILL.md")))).toEqual(
                new TextEncoder().encode(payload),
              );
              expect(yield* fs.readFileString(path.join(target, "scripts/check.sh"))).toBe(
                "#!/bin/sh\nexit 0\n",
              );
              expect(yield* fs.readFileString(path.join(target, "references/context.md"))).toBe(
                "# Context\n",
              );
              expect((yield* fs.stat(path.join(target, "scripts/check.sh"))).mode & 0o777).toBe(
                0o755,
              );
              expect(yield* fs.readLink(path.join(target, "check"))).toBe("scripts/check.sh");
            }
            expect(
              yield* fs.exists(path.join(workspace.root, ".agents/skills/review-package")),
            ).toBe(false);
            expect((yield* applySync())._tag).toBe("AlreadyReconciled");
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
