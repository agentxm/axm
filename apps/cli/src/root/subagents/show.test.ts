import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { makeWorkspaceHandlerTestContext } from "../../test-support/test-helpers.js";
import { writeWorkspaceFiles } from "../../test-support/test-stubs.js";
import { collectHelpFiles } from "../../test-support/command-tree-test-helpers.js";
import { handleSubagentRender } from "./show.js";

describe("subagents show --render", () => {
  let root: string;
  let previous: string;
  beforeEach(() => {
    previous = process.cwd();
    root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-render-subagent-"));
    process.chdir(root);
    writeWorkspaceFiles(path.join(root, ".axm"), {
      owner: "@acme",
      agents: [],
      subagents: { review: { source: "workspace", enabled: false } },
    });
    fs.mkdirSync(path.join(root, "subagents/review"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "subagents/review/subagent.json"),
      JSON.stringify({
        owner: "@acme",
        type: "subagent",
        name: "review",
        version: "1.0.0",
        description: "Review carefully",
        core: { instructions: "core.md" },
      }),
    );
    fs.writeFileSync(path.join(root, "subagents/review/core.md"), "Review evidence.\n");
  });
  afterEach(() => {
    process.chdir(previous);
    fs.rmSync(root, { recursive: true, force: true });
  });

  for (const agentId of ["claude-code", "windsurf", "chatgpt"] as const)
    it.effect(`emits schema-backed ${agentId} result and matching exit outcome`, () => {
      const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
      return provide(
        Effect.gen(function* () {
          const outcome = yield* handleSubagentRender({ name: "review", agentId });
          expect(outcome.exitCode).toBe(agentId === "claude-code" ? 0 : 1);
          const result = rendererState.results[0]?.data;
          expect(result).toMatchObject({
            agentId,
            status: agentId === "claude-code" ? "rendered" : "unsupported",
          });
          expect(fs.existsSync(path.join(root, ".claude/agents/review.md"))).toBe(false);
          if (agentId === "claude-code")
            expect(result).toMatchObject({
              mode: "portable",
              nativeName: "review",
              artifacts: [
                {
                  path: ".claude/agents/review.md",
                  content: expect.stringContaining("Review evidence."),
                },
              ],
            });
        }),
      );
    });

  it.effect("limits source-agent to subagent import and render to subagent show", () =>
    Effect.gen(function* () {
      const help = yield* collectHelpFiles();
      const owners = (flag: string) =>
        [...help]
          .filter(([, document]) => document.flags.some((item) => item.name === flag))
          .map(([command]) => command);
      expect(owners("source-agent")).toEqual(["axm subagents import"]);
      expect(owners("render")).toEqual(["axm subagents show"]);
    }),
  );
});
