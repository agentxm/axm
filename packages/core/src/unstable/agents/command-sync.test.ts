import { rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { claudeCodeCodingAgent } from "./claude-code/service.js";
import { codexCodingAgent } from "./codex/service.js";
import { cursorCodingAgent } from "./cursor/service.js";
import { opencodeCodingAgent } from "./opencode/service.js";
import { geminiCliCodingAgent } from "./gemini-cli/service.js";
import { githubCopilotCliCodingAgent } from "./github-copilot-cli/service.js";
import { augmentCodingAgent } from "./augment/service.js";
import { junieCodingAgent } from "./junie/service.js";
import { kiloCodingAgent } from "./kilo/service.js";
import { rooCodingAgent } from "./roo/service.js";
import { kiroCliCodingAgent } from "./kiro-cli/service.js";
import * as Option from "effect/Option";
import type { AddCommandArgs, CodingAgent, RemoveCommandArgs } from "./coding-agent.js";
import { addCommandViaResolve, writeCommandFile } from "./command-sync.js";

const TestLayer = NodeServices.layer;
const withNode = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(TestLayer));

const makeAddArgs = (workspaceRoot: string, commandName = "test-cmd"): AddCommandArgs => ({
  workspaceRoot,
  scope: "project",
  commandName,
  editSourcePath: `.axm/extensions/@acme/commands/${commandName}/src/${commandName}.md`,
  frontmatter: Option.none(),
  body: "This is a test command body.",
  manifest: {
    type: "command",
    name: "test-cmd",
    version: "0.1.0",
  } as AddCommandArgs["manifest"],
  agentOverrides: Option.none(),
  force: false,
});

const makeRemoveArgs = (workspaceRoot: string, commandName = "test-cmd"): RemoveCommandArgs => ({
  workspaceRoot,
  scope: "project",
  commandName,
});

describe("resolveEffectiveCommandsDir", () => {
  describe("claude-code", () => {
    it.effect("resolves project-scope commands dir", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* claudeCodeCodingAgent.resolveEffectiveCommandsDir({
            workspaceRoot: "/workspace",
            scope: "project",
          });
          expect(outcome._tag).toBe("supported");
          if (outcome._tag === "supported") {
            expect(outcome.dir).toContain(".claude/commands");
          }
        }),
      ),
    );

    it.effect("resolves user-scope commands dir", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* claudeCodeCodingAgent.resolveEffectiveCommandsDir({
            workspaceRoot: "/workspace",
            scope: "user",
          });
          expect(outcome._tag).toBe("supported");
          if (outcome._tag === "supported") {
            expect(outcome.dir).toContain(".claude/commands");
          }
        }),
      ),
    );
  });

  describe("codex", () => {
    it.effect("forces user scope and warns when project scope requested", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* codexCodingAgent.resolveEffectiveCommandsDir({
            workspaceRoot: "/workspace",
            scope: "project",
          });
          expect(outcome._tag).toBe("supported");
          if (outcome._tag === "supported") {
            expect(outcome.dir).toContain(".codex/prompts");
            expect(outcome.warnings.length).toBeGreaterThan(0);
            expect(outcome.warnings[0]).toContain("user-scope");
          }
        }),
      ),
    );

    it.effect("resolves user scope without warnings", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* codexCodingAgent.resolveEffectiveCommandsDir({
            workspaceRoot: "/workspace",
            scope: "user",
          });
          expect(outcome._tag).toBe("supported");
          if (outcome._tag === "supported") {
            expect(outcome.dir).toContain(".codex/prompts");
            expect(outcome.warnings).toHaveLength(0);
          }
        }),
      ),
    );
  });

  describe("cursor", () => {
    it.effect("resolves project scope", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* cursorCodingAgent.resolveEffectiveCommandsDir({
            workspaceRoot: "/workspace",
            scope: "project",
          });
          expect(outcome._tag).toBe("supported");
          if (outcome._tag === "supported") {
            expect(outcome.dir).toContain(".cursor/commands");
          }
        }),
      ),
    );

    it.effect("returns unsupported for user scope", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* cursorCodingAgent.resolveEffectiveCommandsDir({
            workspaceRoot: "/workspace",
            scope: "user",
          });
          expect(outcome._tag).toBe("unsupported");
        }),
      ),
    );
  });

  describe("opencode", () => {
    it.effect("resolves project scope", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* opencodeCodingAgent.resolveEffectiveCommandsDir({
            workspaceRoot: "/workspace",
            scope: "project",
          });
          expect(outcome._tag).toBe("supported");
          if (outcome._tag === "supported") {
            expect(outcome.dir).toContain(".opencode/commands");
          }
        }),
      ),
    );

    it.effect("returns unsupported for user scope", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* opencodeCodingAgent.resolveEffectiveCommandsDir({
            workspaceRoot: "/workspace",
            scope: "user",
          });
          expect(outcome._tag).toBe("unsupported");
        }),
      ),
    );
  });

  describe("github-copilot-cli", () => {
    it.effect("returns unsupported for project scope", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* githubCopilotCliCodingAgent.resolveEffectiveCommandsDir({
            workspaceRoot: "/workspace",
            scope: "project",
          });
          expect(outcome._tag).toBe("unsupported");
        }),
      ),
    );

    it.effect("returns unsupported for user scope", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* githubCopilotCliCodingAgent.resolveEffectiveCommandsDir({
            workspaceRoot: "/workspace",
            scope: "user",
          });
          expect(outcome._tag).toBe("unsupported");
        }),
      ),
    );
  });

  describe("gemini-cli", () => {
    it.effect("resolves project scope", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* geminiCliCodingAgent.resolveEffectiveCommandsDir({
            workspaceRoot: "/workspace",
            scope: "project",
          });
          expect(outcome._tag).toBe("supported");
          if (outcome._tag === "supported") {
            expect(outcome.dir).toContain(".gemini/commands");
          }
        }),
      ),
    );
  });

  describe("augment", () => {
    it.effect("resolves project scope", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* augmentCodingAgent.resolveEffectiveCommandsDir({
            workspaceRoot: "/workspace",
            scope: "project",
          });
          expect(outcome._tag).toBe("supported");
          if (outcome._tag === "supported") {
            expect(outcome.dir).toContain(".augment/commands");
          }
        }),
      ),
    );

    it.effect("returns unsupported for user scope", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* augmentCodingAgent.resolveEffectiveCommandsDir({
            workspaceRoot: "/workspace",
            scope: "user",
          });
          expect(outcome._tag).toBe("unsupported");
        }),
      ),
    );
  });

  describe("junie", () => {
    it.effect("resolves project scope", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* junieCodingAgent.resolveEffectiveCommandsDir({
            workspaceRoot: "/workspace",
            scope: "project",
          });
          expect(outcome._tag).toBe("supported");
          if (outcome._tag === "supported") {
            expect(outcome.dir).toContain(".junie/commands");
          }
        }),
      ),
    );
  });

  describe("kilo", () => {
    it.effect("falls back to .kilo/commands when .opencode/commands does not exist", () =>
      withNode(
        Effect.gen(function* () {
          const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-kilo-test-"));
          try {
            const outcome = yield* kiloCodingAgent.resolveEffectiveCommandsDir({
              workspaceRoot,
              scope: "project",
            });
            expect(outcome._tag).toBe("supported");
            if (outcome._tag === "supported") {
              expect(outcome.dir).toContain(".kilo/commands");
            }
          } finally {
            rmSync(workspaceRoot, { recursive: true, force: true });
          }
        }),
      ),
    );

    it.effect("uses .opencode/commands when it exists", () =>
      withNode(
        Effect.gen(function* () {
          const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-kilo-test-"));
          try {
            const fs = yield* FileSystem.FileSystem;
            yield* fs.makeDirectory(nodePath.join(workspaceRoot, ".opencode/commands"), {
              recursive: true,
            });
            const outcome = yield* kiloCodingAgent.resolveEffectiveCommandsDir({
              workspaceRoot,
              scope: "project",
            });
            expect(outcome._tag).toBe("supported");
            if (outcome._tag === "supported") {
              expect(outcome.dir).toContain(".opencode/commands");
            }
          } finally {
            rmSync(workspaceRoot, { recursive: true, force: true });
          }
        }),
      ),
    );

    it.effect("returns unsupported for user scope", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* kiloCodingAgent.resolveEffectiveCommandsDir({
            workspaceRoot: "/workspace",
            scope: "user",
          });
          expect(outcome._tag).toBe("unsupported");
        }),
      ),
    );
  });

  describe("roo", () => {
    it.effect("resolves project scope", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* rooCodingAgent.resolveEffectiveCommandsDir({
            workspaceRoot: "/workspace",
            scope: "project",
          });
          expect(outcome._tag).toBe("supported");
          if (outcome._tag === "supported") {
            expect(outcome.dir).toContain(".roo/commands");
          }
        }),
      ),
    );
  });

  describe("kiro-cli", () => {
    it.effect("resolves project scope to .kiro/prompts", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* kiroCliCodingAgent.resolveEffectiveCommandsDir({
            workspaceRoot: "/workspace",
            scope: "project",
          });
          expect(outcome._tag).toBe("supported");
          if (outcome._tag === "supported") {
            expect(outcome.dir).toContain(".kiro/prompts");
          }
        }),
      ),
    );
  });
});

describe("addCommand", () => {
  const testAddCommand = (agent: CodingAgent, expectedSubpath: string) =>
    it.effect(`${agent.id} writes command file`, () =>
      withNode(
        Effect.gen(function* () {
          const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), `axm-${agent.id}-cmd-`));
          try {
            const outcome = yield* agent.addCommand(makeAddArgs(workspaceRoot));
            if (outcome._tag === "unsupported") {
              // Some agents don't support commands — that's valid
              return;
            }
            expect(outcome._tag).toBe("success");
            if (outcome._tag === "success") {
              expect(outcome.renderedFilePath).toContain(expectedSubpath);
              const fs = yield* FileSystem.FileSystem;
              const content = yield* fs.readFileString(outcome.renderedFilePath);
              expect(content).toContain("This is a test command body.");
              if (
                outcome.renderedFilePath.endsWith(".md") ||
                outcome.renderedFilePath.endsWith(".toml")
              ) {
                expect(content).toContain("AXM managed file");
                expect(content).toContain(
                  "1. Edit: .axm/extensions/@acme/commands/test-cmd/src/test-cmd.md",
                );
                expect(content).toContain("Learn more: `axm help commands`");
              }
              if (outcome.renderedFilePath.endsWith(".txt")) {
                expect(content).not.toContain("AXM managed file");
              }
            }
          } finally {
            rmSync(workspaceRoot, { recursive: true, force: true });
          }
        }),
      ),
    );

  testAddCommand(claudeCodeCodingAgent, ".claude/commands/test-cmd.md");
  testAddCommand(codexCodingAgent, ".codex/prompts/test-cmd.md");
  testAddCommand(cursorCodingAgent, ".cursor/commands/test-cmd.md");
  testAddCommand(opencodeCodingAgent, ".opencode/commands/test-cmd.md");
  testAddCommand(augmentCodingAgent, ".augment/commands/test-cmd.md");
  testAddCommand(junieCodingAgent, ".junie/commands/test-cmd.md");
  testAddCommand(rooCodingAgent, ".roo/commands/test-cmd.md");
  testAddCommand(kiloCodingAgent, ".kilo/commands/test-cmd.md");
  testAddCommand(kiroCliCodingAgent, ".kiro/prompts/test-cmd.txt");
  testAddCommand(geminiCliCodingAgent, ".gemini/commands/test-cmd.toml");

  it.effect("writes nested Gemini command paths from renderer relativePath", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-gemini-nested-cmd-"));
        try {
          const outcome = yield* geminiCliCodingAgent.addCommand(
            makeAddArgs(workspaceRoot, "git/commit"),
          );
          expect(outcome._tag).toBe("success");
          if (outcome._tag === "success") {
            expect(outcome.renderedFilePath).toContain(".gemini/commands/git/commit.toml");
            const fs = yield* FileSystem.FileSystem;
            const content = yield* fs.readFileString(outcome.renderedFilePath);
            expect(content).toContain('prompt = "This is a test command body."');
          }
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("github-copilot-cli returns unsupported for command writes", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-github-copilot-cli-cmd-"));
        try {
          const outcome = yield* githubCopilotCliCodingAgent.addCommand(makeAddArgs(workspaceRoot));
          expect(outcome._tag).toBe("unsupported");
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("overwrites existing file without marker checks", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-conflict-cmd-"));
        try {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(nodePath.join(workspaceRoot, ".claude/commands"), {
            recursive: true,
          });
          yield* fs.writeFileString(
            nodePath.join(workspaceRoot, ".claude/commands/test-cmd.md"),
            "user-owned content without marker",
          );
          const outcome = yield* claudeCodeCodingAgent.addCommand(makeAddArgs(workspaceRoot));
          expect(outcome._tag).toBe("success");
          if (outcome._tag !== "success") return;
          const content = yield* fs.readFileString(outcome.renderedFilePath);
          expect(content).toContain("This is a test command body.");
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("deep-merges command agent overrides", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-command-overrides-"));
        try {
          const outcome = yield* claudeCodeCodingAgent.addCommand({
            ...makeAddArgs(workspaceRoot),
            frontmatter: Option.some({
              description: "Original",
              config: {
                keep: true,
                drop: true,
                tools: ["Read", "Write"],
              },
            }),
            agentOverrides: Option.some({
              description: "Overridden",
              config: {
                drop: null,
                tools: ["Bash"],
                add: true,
              },
            }),
          });

          expect(outcome._tag).toBe("success");
          if (outcome._tag !== "success") return;
          const fs = yield* FileSystem.FileSystem;
          const content = yield* fs.readFileString(outcome.renderedFilePath);
          expect(content).toContain("description: Overridden");
          expect(content).toContain("keep: true");
          expect(content).toContain("add: true");
          expect(content).toContain("Bash");
          expect(content).not.toContain("drop:");
          expect(content).not.toContain("Write");
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("returns unsupported when an agent has no command renderer", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-unsupported-cmd-"));
        try {
          const outcome = yield* writeCommandFile(
            nodePath.join(workspaceRoot, ".unsupported/commands"),
            makeAddArgs(workspaceRoot),
            { agentId: "github-copilot-cli" },
          );
          expect(outcome._tag).toBe("unsupported");
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("addCommandViaResolve preserves resolve-dir warnings on the success outcome", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-warn-cmd-"));
        try {
          const outcome = yield* addCommandViaResolve(
            Effect.succeed({
              _tag: "supported" as const,
              dir: nodePath.join(workspaceRoot, ".codex/prompts"),
              warnings: ["Codex only supports user-scope commands; using ~/.codex/prompts/"],
            }),
            makeAddArgs(workspaceRoot),
          );
          expect(outcome._tag).toBe("success");
          if (outcome._tag === "success") {
            expect(outcome.warnings).toContain(
              "Codex only supports user-scope commands; using ~/.codex/prompts/",
            );
          }
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );
});

describe("removeCommand", () => {
  it.effect("removes existing command file", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-rm-cmd-"));
        try {
          // First add a command
          yield* claudeCodeCodingAgent.addCommand(makeAddArgs(workspaceRoot));
          // Then remove it
          const outcome = yield* claudeCodeCodingAgent.removeCommand(makeRemoveArgs(workspaceRoot));
          expect(outcome._tag).toBe("success");
          // Verify file is gone
          const fs = yield* FileSystem.FileSystem;
          const exists = yield* fs
            .exists(nodePath.join(workspaceRoot, ".claude/commands/test-cmd.md"))
            .pipe(Effect.catch(() => Effect.succeed(false)));
          expect(exists).toBe(false);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("handles file-not-found gracefully", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-rm-cmd-"));
        try {
          const outcome = yield* claudeCodeCodingAgent.removeCommand(makeRemoveArgs(workspaceRoot));
          expect(outcome._tag).toBe("success");
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );
});

describe("augment cross-tool dedup", () => {
  it.effect("skips Augment write when command already rendered to Claude Code", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-augment-dedup-"));
        try {
          // First render to Claude Code
          yield* claudeCodeCodingAgent.addCommand(makeAddArgs(workspaceRoot));

          // Now try Augment — should skip
          const outcome = yield* augmentCodingAgent.addCommand(makeAddArgs(workspaceRoot));
          expect(outcome._tag).toBe("skipped");
          if (outcome._tag === "skipped") {
            expect(outcome.reason).toContain("Claude Code");
          }
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("writes to Augment when Claude Code has no rendered file", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-augment-nodedup-"));
        try {
          const outcome = yield* augmentCodingAgent.addCommand(makeAddArgs(workspaceRoot));
          expect(outcome._tag).toBe("success");
          if (outcome._tag === "success") {
            expect(outcome.renderedFilePath).toContain(".augment/commands");
          }
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("writes to Augment when Claude Code file has different content", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-augment-unmanaged-"));
        try {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(nodePath.join(workspaceRoot, ".claude/commands"), {
            recursive: true,
          });
          yield* fs.writeFileString(
            nodePath.join(workspaceRoot, ".claude/commands/test-cmd.md"),
            "user-written content without marker",
          );
          const outcome = yield* augmentCodingAgent.addCommand(makeAddArgs(workspaceRoot));
          expect(outcome._tag).toBe("success");
          if (outcome._tag === "success") {
            expect(outcome.renderedFilePath).toContain(".augment/commands");
          }
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("re-syncs to Augment after Claude Code file removed", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-augment-resync-"));
        try {
          // Render to Claude Code
          yield* claudeCodeCodingAgent.addCommand(makeAddArgs(workspaceRoot));

          // Augment skips
          const skipOutcome = yield* augmentCodingAgent.addCommand(makeAddArgs(workspaceRoot));
          expect(skipOutcome._tag).toBe("skipped");

          // Remove from Claude Code
          yield* claudeCodeCodingAgent.removeCommand(makeRemoveArgs(workspaceRoot));

          // Now Augment should write
          const writeOutcome = yield* augmentCodingAgent.addCommand(makeAddArgs(workspaceRoot));
          expect(writeOutcome._tag).toBe("success");
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );
});
