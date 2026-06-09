import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";
import {
  getInstructionsGitignoreStatus,
  getInstructionsStatus,
  listInstructionAliases,
  normalizeMarkdownBody,
  probeSymlinkSupport,
  resolveInstructionMechanism,
  syncInstructions,
} from "./instructions.js";
import { AGENTS } from "./registry.js";

describe("agent instructions", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-instructions-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
    effect.pipe(Effect.provide(NodeServices.layer));

  it("normalizes markdown bodies without frontmatter or trailing whitespace", () => {
    expect(normalizeMarkdownBody("---\ntitle: Local\n---\n\n# Rules  \r\n")).toBe("# Rules");
    expect(normalizeMarkdownBody("# Rules\n")).toBe("# Rules");
  });

  it("resolves own-file fallback mechanisms", () => {
    expect(
      resolveInstructionMechanism(
        { kind: "own-file", file: "CLAUDE.md", importSyntax: "at-path" },
        false,
      ),
    ).toBe("copy");
    expect(resolveInstructionMechanism({ kind: "own-file", file: "GEMINI.md" }, false)).toBe(
      "copy",
    );
  });

  it("lists per-agent instruction aliases from agent descriptors", () => {
    expect(
      listInstructionAliases(
        [AGENTS["claude-code"], AGENTS["gemini-cli"], AGENTS.codex],
        "AGENTS.md",
      ),
    ).toEqual(["CLAUDE.md", "GEMINI.md"]);
  });

  it.effect("does not leave a .axm/tmp directory behind after probing symlinks", () =>
    run(
      Effect.gen(function* () {
        const supported = yield* probeSymlinkSupport(tempDir);
        expect(typeof supported).toBe("boolean");
        expect(fs.existsSync(path.join(tempDir, ".axm", "tmp"))).toBe(false);
      }),
    ),
  );

  it.effect("preserves pre-existing .axm/tmp contents when probing symlinks", () =>
    run(
      Effect.gen(function* () {
        const tmpDir = path.join(tempDir, ".axm", "tmp");
        fs.mkdirSync(tmpDir, { recursive: true });
        fs.writeFileSync(path.join(tmpDir, "keep.txt"), "keep\n");

        yield* probeSymlinkSupport(tempDir);

        expect(fs.readFileSync(path.join(tmpDir, "keep.txt"), "utf-8")).toBe("keep\n");
      }),
    ),
  );

  it.effect("syncs configured own-file agents from AGENTS.md as symlinks", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, ".git"));
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

        const result = yield* syncInstructions({
          workspaceRoot: tempDir,
          configuredAgents: ["claude-code", "gemini-cli", "codex"],
          config: { fileName: "AGENTS.md", gitignoreAliases: true },
          force: false,
          dryRun: false,
        });

        expect(result.written).toEqual(
          expect.arrayContaining([
            path.join(tempDir, "CLAUDE.md"),
            path.join(tempDir, "GEMINI.md"),
            path.join(tempDir, ".gitignore"),
          ]),
        );
        expect(fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf-8")).toBe("# Workspace\n");
        expect(fs.readFileSync(path.join(tempDir, "GEMINI.md"), "utf-8")).toBe("# Workspace\n");
        expect(fs.lstatSync(path.join(tempDir, "CLAUDE.md")).isSymbolicLink()).toBe(true);
        expect(fs.lstatSync(path.join(tempDir, "GEMINI.md")).isSymbolicLink()).toBe(true);
        expect(fs.readlinkSync(path.join(tempDir, "CLAUDE.md"))).toBe("AGENTS.md");
        expect(fs.readlinkSync(path.join(tempDir, "GEMINI.md"))).toBe("AGENTS.md");
        const gitignore = fs.readFileSync(path.join(tempDir, ".gitignore"), "utf-8");
        expect(gitignore).toContain("**/CLAUDE.md");
        expect(gitignore).toContain("**/GEMINI.md");
        expect(gitignore).not.toContain("**/AGENTS.md");
      }),
    ),
  );

  it.effect("does not write gitignore entries outside a git workspace", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

        const result = yield* syncInstructions({
          workspaceRoot: tempDir,
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: true },
          force: false,
          dryRun: false,
        });
        const status = yield* getInstructionsGitignoreStatus({
          workspaceRoot: tempDir,
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: true },
        });

        expect(result.written).not.toContain(path.join(tempDir, ".gitignore"));
        expect(fs.existsSync(path.join(tempDir, ".gitignore"))).toBe(false);
        expect(status).toEqual({
          file: path.join(tempDir, ".gitignore"),
          desired: false,
          current: true,
        });
      }),
    ),
  );

  it.effect("does not report a dry-run gitignore write outside a git workspace", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

        const result = yield* syncInstructions({
          workspaceRoot: tempDir,
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: true },
          force: false,
          dryRun: true,
        });

        expect(result.written).not.toContain(path.join(tempDir, ".gitignore"));
        expect(fs.existsSync(path.join(tempDir, ".gitignore"))).toBe(false);
      }),
    ),
  );

  it.effect("writes gitignore entries when the workspace has a .git file", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, ".git"), "gitdir: ../.git/worktrees/demo\n");
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

        const result = yield* syncInstructions({
          workspaceRoot: tempDir,
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: true },
          force: false,
          dryRun: false,
        });

        expect(result.written).toEqual(expect.arrayContaining([path.join(tempDir, ".gitignore")]));
        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf-8")).toContain(
          "**/CLAUDE.md",
        );
      }),
    ),
  );

  it.effect("writes gitignore entries when the git root is an ancestor", () =>
    run(
      Effect.gen(function* () {
        const nested = path.join(tempDir, "packages", "demo");
        fs.mkdirSync(path.join(tempDir, ".git"));
        fs.mkdirSync(nested, { recursive: true });
        fs.writeFileSync(path.join(nested, "AGENTS.md"), "# Workspace\n");

        const result = yield* syncInstructions({
          workspaceRoot: nested,
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: true },
          force: false,
          dryRun: false,
        });

        expect(result.written).toEqual(expect.arrayContaining([path.join(nested, ".gitignore")]));
        expect(fs.readFileSync(path.join(nested, ".gitignore"), "utf-8")).toContain("**/CLAUDE.md");
      }),
    ),
  );

  it.effect("writes idempotent managed copies when symlinks are unavailable", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

        yield* syncInstructions({
          workspaceRoot: tempDir,
          configuredAgents: ["claude-code", "gemini-cli"],
          config: { fileName: "AGENTS.md", gitignoreAliases: false },
          force: false,
          dryRun: false,
          symlinkSupported: false,
        });

        const first = fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf-8");

        const secondResult = yield* syncInstructions({
          workspaceRoot: tempDir,
          configuredAgents: ["claude-code", "gemini-cli"],
          config: { fileName: "AGENTS.md", gitignoreAliases: false },
          force: false,
          dryRun: false,
          symlinkSupported: false,
        });

        const second = fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf-8");

        expect(fs.lstatSync(path.join(tempDir, "CLAUDE.md")).isSymbolicLink()).toBe(false);
        expect(first).toContain("AXM managed file");
        expect(first).toContain("Edit: AGENTS.md");
        expect(first).toContain("# Workspace\n");
        expect(second).toBe(first);
        expect(second.match(/AXM managed file/g)?.length).toBe(1);
        expect(secondResult.written).toEqual([]);
        expect(secondResult.status.items.every((item) => item.health === "ok")).toBe(true);
      }),
    ),
  );

  it.effect("reports copy drift without overwriting it", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        fs.writeFileSync(path.join(tempDir, "GEMINI.md"), "# Local edit\n");

        yield* syncInstructions({
          workspaceRoot: tempDir,
          configuredAgents: ["gemini-cli"],
          config: { fileName: "AGENTS.md", gitignoreAliases: false },
          force: false,
          dryRun: false,
        });
        const status = yield* getInstructionsStatus({
          workspaceRoot: tempDir,
          configuredAgents: ["gemini-cli"],
          config: { fileName: "AGENTS.md", gitignoreAliases: false },
        });

        expect(fs.readFileSync(path.join(tempDir, "GEMINI.md"), "utf-8")).toBe("# Local edit\n");
        expect(status.items[0]?.health).toBe("drift");
      }),
    ),
  );

  it.effect("removes the managed gitignore block when gitignoreAliases is disabled", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, ".git"));
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

        yield* syncInstructions({
          workspaceRoot: tempDir,
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: true },
          force: false,
          dryRun: false,
        });
        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf-8")).toContain(
          "# >>> axm:instructions >>>",
        );

        yield* syncInstructions({
          workspaceRoot: tempDir,
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: false },
          force: false,
          dryRun: false,
        });

        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf-8")).not.toContain(
          "# >>> axm:instructions >>>",
        );
      }),
    ),
  );
});
