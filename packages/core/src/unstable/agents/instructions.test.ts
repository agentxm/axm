import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";
import {
  assertInstructionTargetsSafe,
  getInstructionsGitignoreStatus,
  getInstructionsStatus,
  normalizeMarkdownBody,
  probeSymlinkSupport,
  reconcileInstructionTargets,
  removeManagedInstructionTargets,
  removeInstructionsGitignore,
  resolveInstructionMechanism,
  syncInstructions,
} from "./instructions.js";
import { AGENTS } from "./registry.js";

const git = (root: string, args: ReadonlyArray<string>) =>
  spawnSync("git", args, { cwd: root, encoding: "utf8" });

const isGitIgnored = (root: string, relativePath: string): boolean =>
  git(root, ["check-ignore", "--quiet", "--no-index", relativePath]).status === 0;

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

  it.effect("keeps user-scope instruction discovery at the home root", () =>
    run(
      Effect.gen(function* () {
        const cloudRoot = path.join(tempDir, "Library", "CloudStorage", "provider", "project");
        fs.mkdirSync(cloudRoot, { recursive: true });
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# User\n");
        fs.writeFileSync(path.join(cloudRoot, "AGENTS.md"), "# Cloud project\n");

        const status = yield* getInstructionsStatus({
          workspaceRoot: tempDir,
          scope: "user",
          configuredAgents: ["codex"],
          config: { fileName: "AGENTS.md", gitignoreAliases: false },
          symlinkSupported: true,
        });

        expect(status.roots).toEqual([tempDir]);
        expect(status.items.map((item) => item.sourceFile)).toEqual([
          path.join(tempDir, "AGENTS.md"),
        ]);
      }),
    ),
  );

  it.effect("stops instruction discovery at a nested separate working tree", () =>
    run(
      Effect.gen(function* () {
        const worktree = path.join(tempDir, ".claude", "worktrees", "feature");
        fs.mkdirSync(path.join(worktree, "docs"), { recursive: true });
        fs.mkdirSync(path.join(tempDir, "docs"), { recursive: true });
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        fs.writeFileSync(path.join(tempDir, "docs", "AGENTS.md"), "# Docs\n");
        // A registered worktree carries a `.git` file rather than a directory.
        fs.writeFileSync(path.join(worktree, ".git"), "gitdir: /elsewhere/worktrees/feature\n");
        fs.writeFileSync(path.join(worktree, "AGENTS.md"), "# Worktree\n");
        fs.writeFileSync(path.join(worktree, "docs", "AGENTS.md"), "# Worktree docs\n");

        const status = yield* getInstructionsStatus({
          workspaceRoot: tempDir,
          scope: "project",
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: false },
          symlinkSupported: true,
        });

        expect([...status.roots].sort()).toEqual([path.join(tempDir, "docs"), tempDir].sort());
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
          scope: "project",
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
        expect(gitignore).toContain("/CLAUDE.md");
        expect(gitignore).toContain("/GEMINI.md");
        expect(gitignore).not.toContain("/AGENTS.md");
      }),
    ),
  );

  it.effect("does not write gitignore entries outside a git workspace", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

        const result = yield* syncInstructions({
          workspaceRoot: tempDir,
          scope: "project",
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: true },
          force: false,
          dryRun: false,
        });
        const status = yield* getInstructionsGitignoreStatus({
          workspaceRoot: tempDir,
          scope: "project",
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: true },
        });

        expect(result.written).not.toContain(path.join(tempDir, ".gitignore"));
        expect(fs.existsSync(path.join(tempDir, ".gitignore"))).toBe(false);
        expect(status).toEqual({
          file: path.join(tempDir, ".gitignore"),
          desired: false,
          current: true,
          trackedAliases: [],
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
          scope: "project",
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
          scope: "project",
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: true },
          force: false,
          dryRun: false,
        });

        expect(result.written).toEqual(expect.arrayContaining([path.join(tempDir, ".gitignore")]));
        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf-8")).toContain("/CLAUDE.md");
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
          scope: "project",
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: true },
          force: false,
          dryRun: false,
        });

        expect(result.written).toEqual(expect.arrayContaining([path.join(nested, ".gitignore")]));
        expect(fs.readFileSync(path.join(nested, ".gitignore"), "utf-8")).toContain("/CLAUDE.md");
      }),
    ),
  );

  for (const ignoreCase of [true, false]) {
    it.effect(
      `limits managed patterns to exact projection targets with core.ignorecase=${ignoreCase}`,
      () =>
        run(
          Effect.gen(function* () {
            git(tempDir, ["init", "--quiet", "--initial-branch=main"]);
            git(tempDir, ["config", "core.ignorecase", String(ignoreCase)]);
            const roots = ["", "docs", "docs[old]", "docs "];
            for (const root of roots) {
              const directory = path.join(tempDir, root);
              fs.mkdirSync(directory, { recursive: true });
              fs.writeFileSync(path.join(directory, "AGENTS.md"), `# ${root || "root"}\n`);
            }
            for (const unrelated of ["content/claude.md", "other/CLAUDE.md", "docso/CLAUDE.md"]) {
              const target = path.join(tempDir, unrelated);
              fs.mkdirSync(path.dirname(target), { recursive: true });
              fs.writeFileSync(target, "# Authored\n");
            }

            yield* syncInstructions({
              workspaceRoot: tempDir,
              scope: "project",
              configuredAgents: ["claude-code", "junie"],
              config: { fileName: "AGENTS.md", gitignoreAliases: true },
              force: false,
              dryRun: false,
              symlinkSupported: true,
            });

            const gitignore = fs.readFileSync(path.join(tempDir, ".gitignore"), "utf8");
            expect(gitignore).toContain("/CLAUDE.md");
            expect(gitignore).toContain("/.junie/AGENTS.md");
            expect(gitignore).toContain("/docs/CLAUDE.md");
            expect(gitignore).toContain("/docs/.junie/AGENTS.md");
            expect(gitignore).toContain("/docs\\[old\\]/CLAUDE.md");
            expect(gitignore).toContain("/docs\\ /CLAUDE.md");
            expect(gitignore).not.toContain("**/");

            expect(isGitIgnored(tempDir, "CLAUDE.md")).toBe(true);
            expect(isGitIgnored(tempDir, "docs/CLAUDE.md")).toBe(true);
            expect(isGitIgnored(tempDir, "docs/.junie/AGENTS.md")).toBe(true);
            expect(isGitIgnored(tempDir, "docs[old]/CLAUDE.md")).toBe(true);
            expect(isGitIgnored(tempDir, "docs /CLAUDE.md")).toBe(true);
            expect(isGitIgnored(tempDir, "content/claude.md")).toBe(false);
            expect(isGitIgnored(tempDir, "other/CLAUDE.md")).toBe(false);
            expect(isGitIgnored(tempDir, "docso/CLAUDE.md")).toBe(false);
            expect(isGitIgnored(tempDir, "claude.md")).toBe(ignoreCase);

            const status = git(tempDir, ["status", "--short", "--untracked-files=all"]);
            expect(status.status).toBe(0);
            for (const projected of [
              "?? CLAUDE.md",
              "?? .junie/AGENTS.md",
              "?? docs/CLAUDE.md",
              "?? docs/.junie/AGENTS.md",
              "?? docs[old]/CLAUDE.md",
              "?? docs[old]/.junie/AGENTS.md",
            ]) {
              expect(status.stdout).not.toContain(projected);
            }
          }),
        ),
    );
  }

  it.effect("reconciles exact patterns as roots, agents, and the source filename change", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, ".git"));
        fs.mkdirSync(path.join(tempDir, "docs"));
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Root\n");
        fs.writeFileSync(path.join(tempDir, "docs", "AGENTS.md"), "# Docs\n");

        yield* syncInstructions({
          workspaceRoot: tempDir,
          scope: "project",
          configuredAgents: ["claude-code", "gemini-cli"],
          config: { fileName: "AGENTS.md", gitignoreAliases: true },
          force: false,
          dryRun: false,
          symlinkSupported: true,
        });
        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf8")).toContain(
          "/docs/GEMINI.md",
        );

        fs.rmSync(path.join(tempDir, "docs", "AGENTS.md"));
        yield* syncInstructions({
          workspaceRoot: tempDir,
          scope: "project",
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: true },
          force: false,
          dryRun: false,
          symlinkSupported: true,
        });
        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf8")).toBe(
          "# axm:start v=1 region=instruction-aliases ext=@agentxm/instructions/aliases\n/CLAUDE.md\n# axm:end v=1 region=instruction-aliases\n",
        );

        fs.rmSync(path.join(tempDir, "AGENTS.md"));
        fs.rmSync(path.join(tempDir, "CLAUDE.md"));
        fs.writeFileSync(path.join(tempDir, "CLAUDE.md"), "# Canonical Claude source\n");
        yield* syncInstructions({
          workspaceRoot: tempDir,
          scope: "project",
          configuredAgents: ["claude-code", "gemini-cli"],
          config: { fileName: "CLAUDE.md", gitignoreAliases: true },
          force: false,
          dryRun: false,
          symlinkSupported: true,
        });
        const gitignore = fs.readFileSync(path.join(tempDir, ".gitignore"), "utf8");
        expect(gitignore).toContain("/GEMINI.md");
        expect(gitignore).not.toContain("/CLAUDE.md");
        expect(fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf8")).toBe(
          "# Canonical Claude source\n",
        );
      }),
    ),
  );

  it.effect("reports exact tracked aliases at root and nested instruction roots", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, ".git"));
        fs.mkdirSync(path.join(tempDir, "docs"));
        for (const relative of ["AGENTS.md", "CLAUDE.md", "docs/AGENTS.md", "docs/CLAUDE.md"]) {
          fs.writeFileSync(path.join(tempDir, relative), "# Tracked snapshot\n");
        }

        const status = yield* getInstructionsGitignoreStatus({
          workspaceRoot: tempDir,
          scope: "project",
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: true },
          gitIndexView: true,
        });

        expect(status.trackedAliases).toEqual(["CLAUDE.md", "docs/CLAUDE.md"]);
      }),
    ),
  );

  it.effect("reports recursive managed patterns as stale and converges idempotently", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, ".git"));
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        fs.writeFileSync(
          path.join(tempDir, ".gitignore"),
          "keep/\n\n# axm:start v=1 region=instruction-aliases ext=@agentxm/instructions/aliases\n**/CLAUDE.md\n# axm:end v=1 region=instruction-aliases\n",
        );

        const stale = yield* getInstructionsGitignoreStatus({
          workspaceRoot: tempDir,
          scope: "project",
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: true },
        });
        expect(stale.current).toBe(false);

        const first = yield* syncInstructions({
          workspaceRoot: tempDir,
          scope: "project",
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: true },
          force: false,
          dryRun: false,
          symlinkSupported: true,
        });
        const second = yield* syncInstructions({
          workspaceRoot: tempDir,
          scope: "project",
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: true },
          force: false,
          dryRun: false,
          symlinkSupported: true,
        });

        expect(first.written).toEqual(
          expect.arrayContaining([
            path.join(tempDir, "CLAUDE.md"),
            path.join(tempDir, ".gitignore"),
          ]),
        );
        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf8")).toBe(
          "keep/\n\n# axm:start v=1 region=instruction-aliases ext=@agentxm/instructions/aliases\n/CLAUDE.md\n# axm:end v=1 region=instruction-aliases\n",
        );
        expect(second.written).toEqual([]);
      }),
    ),
  );

  it.effect("writes idempotent managed copies when symlinks are unavailable", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

        yield* syncInstructions({
          workspaceRoot: tempDir,
          scope: "project",
          configuredAgents: ["claude-code", "gemini-cli"],
          config: { fileName: "AGENTS.md", gitignoreAliases: false },
          force: false,
          dryRun: false,
          symlinkSupported: false,
        });

        const first = fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf-8");

        const secondResult = yield* syncInstructions({
          workspaceRoot: tempDir,
          scope: "project",
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
          scope: "project",
          configuredAgents: ["gemini-cli"],
          config: { fileName: "AGENTS.md", gitignoreAliases: false },
          force: false,
          dryRun: false,
        });
        const status = yield* getInstructionsStatus({
          workspaceRoot: tempDir,
          scope: "project",
          configuredAgents: ["gemini-cli"],
          config: { fileName: "AGENTS.md", gitignoreAliases: false },
        });

        expect(fs.readFileSync(path.join(tempDir, "GEMINI.md"), "utf-8")).toBe("# Local edit\n");
        expect(status.items[0]?.health).toBe("drift");
      }),
    ),
  );

  it.effect("restores an AXM-owned managed copy that has drifted", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        yield* syncInstructions({
          workspaceRoot: tempDir,
          scope: "project",
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: false },
          force: false,
          dryRun: false,
          symlinkSupported: false,
        });
        const targetPath = path.join(tempDir, "CLAUDE.md");
        const managed = fs.readFileSync(targetPath, "utf-8");
        fs.writeFileSync(targetPath, managed.replace("# Workspace", "# Drifted"));

        yield* assertInstructionTargetsSafe({
          workspaceRoot: tempDir,
          scope: "project",
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: false },
        });
        const result = yield* reconcileInstructionTargets({
          workspaceRoot: tempDir,
          scope: "project",
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: false },
          symlinkSupported: false,
        });

        expect(result.written).toContain(targetPath);
        expect(fs.readFileSync(targetPath, "utf-8")).toBe(managed);
      }),
    ),
  );

  it.effect("blocks an unowned alias even when its body matches the source", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        fs.writeFileSync(path.join(tempDir, "CLAUDE.md"), "# Workspace\n");

        const result = yield* Effect.result(
          assertInstructionTargetsSafe({
            workspaceRoot: tempDir,
            scope: "project",
            configuredAgents: ["claude-code"],
            config: { fileName: "AGENTS.md", gitignoreAliases: false },
          }),
        );

        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          expect(result.failure.code).toBe("conflict");
          expect(result.failure.detail).toContain("CLAUDE.md");
        }
        expect(fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf-8")).toBe("# Workspace\n");
      }),
    ),
  );

  it.effect("never replaces an unowned alias directory", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        fs.mkdirSync(path.join(tempDir, "CLAUDE.md"));
        fs.writeFileSync(path.join(tempDir, "CLAUDE.md", "keep.txt"), "keep\n");

        const result = yield* syncInstructions({
          workspaceRoot: tempDir,
          scope: "project",
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: false },
          force: true,
          dryRun: false,
          symlinkSupported: true,
        });

        expect(result.written).toEqual([]);
        expect(result.status.items[0]?.health).toBe("drift");
        expect(fs.readFileSync(path.join(tempDir, "CLAUDE.md", "keep.txt"), "utf-8")).toBe(
          "keep\n",
        );
      }),
    ),
  );

  it.effect("removes only current AXM-owned aliases", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        fs.symlinkSync("AGENTS.md", path.join(tempDir, "CLAUDE.md"));

        const removed = yield* removeManagedInstructionTargets({
          workspaceRoot: tempDir,
          scope: "project",
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: false },
          dryRun: false,
        });

        expect(removed).toEqual([path.join(tempDir, "CLAUDE.md")]);
        expect(fs.existsSync(path.join(tempDir, "CLAUDE.md"))).toBe(false);
        expect(fs.readFileSync(path.join(tempDir, "AGENTS.md"), "utf-8")).toBe("# Workspace\n");
      }),
    ),
  );

  it.effect("preflights every alias before removing any owned target", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        fs.symlinkSync("AGENTS.md", path.join(tempDir, "CLAUDE.md"));
        fs.writeFileSync(path.join(tempDir, "GEMINI.md"), "# Human content\n");

        const result = yield* Effect.result(
          removeManagedInstructionTargets({
            workspaceRoot: tempDir,
            scope: "project",
            configuredAgents: ["claude-code", "gemini-cli"],
            config: { fileName: "AGENTS.md", gitignoreAliases: false },
            dryRun: false,
          }),
        );

        expect(result._tag).toBe("Failure");
        expect(fs.lstatSync(path.join(tempDir, "CLAUDE.md")).isSymbolicLink()).toBe(true);
        expect(fs.readFileSync(path.join(tempDir, "GEMINI.md"), "utf-8")).toBe("# Human content\n");
      }),
    ),
  );

  it.effect("reports native rules directories AXM does not sync", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

        const status = yield* getInstructionsStatus({
          workspaceRoot: tempDir,
          scope: "project",
          // cursor: agents-md plus a secondary native rules directory.
          // roo: rules-dir, which AXM resolves to the unwritten adapter path.
          // codex: agents-md with no secondary directory.
          configuredAgents: ["cursor", "roo", "codex"],
          config: { fileName: "AGENTS.md", gitignoreAliases: false },
        });
        const detailsById = new Map(status.items.map((item) => [item.agentId, item.details]));

        expect(detailsById.get("cursor")).toBe(
          "Instruction file is current. Native rules directory .cursor/rules is not synced by AXM.",
        );
        expect(detailsById.get("roo")).toBe(
          "Native rules directory .roo/rules is not yet synced by AXM.",
        );
        expect(detailsById.get("codex")).toBe("Instruction file is current.");

        // Reporting is parity work only: the adapter mechanism stays unbuilt, so
        // rules-dir agents keep reporting unsupported and nothing is written.
        expect(status.items.find((item) => item.agentId === "roo")?.health).toBe("unsupported");
        expect(fs.existsSync(path.join(tempDir, ".roo"))).toBe(false);
        expect(fs.existsSync(path.join(tempDir, ".cursor"))).toBe(false);
      }),
    ),
  );

  it("carries every catalog secondary rules directory onto the descriptor", () => {
    const secondary = Object.values(AGENTS).flatMap((descriptor) => {
      const instructions = descriptor.instructions;
      if (instructions === undefined || instructions.kind === "rules-dir") return [];
      return instructions.rulesDir === undefined ? [] : [[descriptor.id, instructions.rulesDir]];
    });

    // windsurf's ".devin/rules" is very likely a catalog copy-paste error (Devin
    // is a different agent). Pinned rather than corrected: fixing it is a
    // catalog-verification change, and this test makes the value visible now
    // that status output shows it to users.
    expect(Object.fromEntries(secondary)).toEqual({
      antigravity: ".agents/rules",
      "antigravity-cli": ".agents/rules",
      codebuddy: ".codebuddy/rules",
      cursor: ".cursor/rules",
      "ibm-bob": ".bob/rules",
      windsurf: ".devin/rules",
    });
  });

  it.effect("removes the managed gitignore block when gitignoreAliases is disabled", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, ".git"));
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

        yield* syncInstructions({
          workspaceRoot: tempDir,
          scope: "project",
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: true },
          force: false,
          dryRun: false,
        });
        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf-8")).toContain(
          "# axm:start v=1 region=instruction-aliases ext=@agentxm/instructions/aliases",
        );

        yield* syncInstructions({
          workspaceRoot: tempDir,
          scope: "project",
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: false },
          force: false,
          dryRun: false,
        });

        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf-8")).not.toContain(
          "# axm:start v=1 region=instruction-aliases ext=@agentxm/instructions/aliases",
        );
      }),
    ),
  );

  it.effect("preserves gitignore bytes outside the managed block", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, ".git"));
        const before =
          "dist/  \r\n\r\n# axm:start v=1 region=instruction-aliases ext=@agentxm/instructions/aliases\r\n**/OLD.md\r\n# axm:end v=1 region=instruction-aliases\r\n\r\n# keep  \r\n";
        fs.writeFileSync(path.join(tempDir, ".gitignore"), before);

        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        yield* syncInstructions({
          workspaceRoot: tempDir,
          scope: "project",
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: true },
          force: false,
          dryRun: false,
          symlinkSupported: true,
        });

        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf-8")).toBe(
          "dist/  \r\n\r\n# axm:start v=1 region=instruction-aliases ext=@agentxm/instructions/aliases\r\n/CLAUDE.md\r\n# axm:end v=1 region=instruction-aliases\r\n\r\n# keep  \r\n",
        );

        yield* removeInstructionsGitignore({
          workspaceRoot: tempDir,
          dryRun: false,
        });

        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf-8")).toBe(
          "dist/  \r\n\r\n\r\n# keep  \r\n",
        );
      }),
    ),
  );

  it.effect("refuses to overwrite malformed gitignore ownership markers", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, ".git"));
        const malformed =
          "dist/\n# axm:start v=1 region=instruction-aliases ext=@agentxm/instructions/aliases\n**/CLAUDE.md\n";
        fs.writeFileSync(path.join(tempDir, ".gitignore"), malformed);

        const result = yield* Effect.result(
          syncInstructions({
            workspaceRoot: tempDir,
            scope: "project",
            configuredAgents: ["claude-code"],
            config: { fileName: "AGENTS.md", gitignoreAliases: true },
            force: false,
            dryRun: false,
            symlinkSupported: true,
          }),
        );

        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          expect(result.failure.code).toBe("conflict");
          expect(result.failure.detail).toContain("malformed AXM ownership markers");
        }
        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf-8")).toBe(malformed);
      }),
    ),
  );
});
