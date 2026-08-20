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
  instructionProjectionIsCurrent,
  observeInstructionProjection,
  probeSymlinkSupport,
  reconcileInstructionTargets,
  removeManagedInstructionTargets,
  removeInstructionsGitignore,
  resolveInstructionMechanism,
  syncInstructions,
  type InstructionStatusItem,
  type ResolvedInstructionsConfig,
} from "./instructions.js";
import { AGENTS } from "./registry.js";

const git = (root: string, args: ReadonlyArray<string>) =>
  spawnSync("git", args, { cwd: root, encoding: "utf8" });

const isGitIgnored = (root: string, relativePath: string): boolean =>
  git(root, ["check-ignore", "--quiet", "--no-index", relativePath]).status === 0;

const IGNORED: ResolvedInstructionsConfig = { fileName: "AGENTS.md", gitignoreAliases: true };
const TRACKED: ResolvedInstructionsConfig = { fileName: "AGENTS.md", gitignoreAliases: false };

const byTarget = (items: ReadonlyArray<InstructionStatusItem>, targetFile: string) =>
  items.find((item) => item.targetFile === targetFile);

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

  const observe = (args: {
    readonly configuredAgents: ReadonlyArray<string>;
    readonly config?: ResolvedInstructionsConfig;
    readonly scope?: "project" | "user";
    readonly symlinkSupported?: boolean;
    readonly gitIndexView?: boolean;
  }) =>
    observeInstructionProjection({
      workspaceRoot: tempDir,
      scope: args.scope ?? "project",
      configuredAgents: args.configuredAgents,
      config: args.config ?? TRACKED,
      ...(args.symlinkSupported === undefined ? {} : { symlinkSupported: args.symlinkSupported }),
      ...(args.gitIndexView === undefined ? {} : { gitIndexView: args.gitIndexView }),
    });

  const sync = (args: {
    readonly configuredAgents: ReadonlyArray<string>;
    readonly config?: ResolvedInstructionsConfig;
    readonly dryRun?: boolean;
    readonly symlinkSupported?: boolean;
  }) =>
    syncInstructions({
      workspaceRoot: tempDir,
      scope: "project",
      configuredAgents: args.configuredAgents,
      config: args.config ?? TRACKED,
      dryRun: args.dryRun ?? false,
      ...(args.symlinkSupported === undefined ? {} : { symlinkSupported: args.symlinkSupported }),
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
        fs.symlinkSync("AGENTS.md", path.join(cloudRoot, "GEMINI.md"));

        const { status } = yield* observe({
          configuredAgents: ["codex"],
          scope: "user",
          symlinkSupported: true,
        });

        expect(status.roots).toEqual([tempDir]);
        expect(status.items.map((item) => item.sourceFile)).toEqual([
          path.join(tempDir, "AGENTS.md"),
        ]);
        expect(status.staleTargets).toEqual([]);
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
        // An alias the foreign tree owns is never swept as this workspace's residue.
        fs.symlinkSync("AGENTS.md", path.join(worktree, "GEMINI.md"));

        const { status } = yield* observe({
          configuredAgents: ["claude-code"],
          symlinkSupported: true,
        });

        expect([...status.roots].sort()).toEqual([path.join(tempDir, "docs"), tempDir].sort());
        expect(status.staleTargets).toEqual([]);
      }),
    ),
  );

  it.effect("never rediscovers an agent configuration directory as a propagation root", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, ".git"));
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

        yield* sync({
          configuredAgents: ["claude-code", "junie"],
          config: IGNORED,
          symlinkSupported: true,
        });
        expect(fs.readlinkSync(path.join(tempDir, ".junie", "AGENTS.md"))).toBe(
          path.join("..", "AGENTS.md"),
        );
        // The alias `.junie/AGENTS.md` now matches the canonical filename; a
        // second observation must not turn `.junie` into a root of its own.
        const second = yield* sync({
          configuredAgents: ["claude-code", "junie"],
          config: IGNORED,
          symlinkSupported: true,
        });

        expect(second.snapshot.status.roots).toEqual([tempDir]);
        expect(second.written).toEqual([]);
        expect(second.removed).toEqual([]);
        expect(fs.existsSync(path.join(tempDir, ".junie", "CLAUDE.md"))).toBe(false);
        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf8")).not.toContain(
          "/.junie/CLAUDE.md",
        );
      }),
    ),
  );

  it.effect("syncs configured own-file agents from AGENTS.md as symlinks", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, ".git"));
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

        const result = yield* sync({
          configuredAgents: ["claude-code", "gemini-cli", "codex"],
          config: IGNORED,
        });

        expect(result.written).toEqual(
          expect.arrayContaining([
            path.join(tempDir, "CLAUDE.md"),
            path.join(tempDir, "GEMINI.md"),
            path.join(tempDir, ".gitignore"),
          ]),
        );
        expect(result.removed).toEqual([]);
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
        expect(
          result.snapshot.status.items.map((item) => [
            item.agentId,
            item.ownership,
            item.observedForm,
          ]),
        ).toEqual([
          ["claude-code", "owned-current", "symlink"],
          ["gemini-cli", "owned-current", "symlink"],
          ["codex", "owned-current", "file"],
        ]);
      }),
    ),
  );

  it.effect("does not write gitignore entries outside a git workspace", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

        const result = yield* sync({ configuredAgents: ["claude-code"], config: IGNORED });
        const { gitignore } = yield* observe({
          configuredAgents: ["claude-code"],
          config: IGNORED,
        });

        expect(result.written).not.toContain(path.join(tempDir, ".gitignore"));
        expect(fs.existsSync(path.join(tempDir, ".gitignore"))).toBe(false);
        expect(gitignore).toEqual({
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

        const result = yield* sync({
          configuredAgents: ["claude-code"],
          config: IGNORED,
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

        const result = yield* sync({ configuredAgents: ["claude-code"], config: IGNORED });

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
          config: IGNORED,
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

            const result = yield* sync({
              configuredAgents: ["claude-code", "junie"],
              config: IGNORED,
              symlinkSupported: true,
            });

            // Authored files at alias names outside the plan carry no proof and
            // are neither collisions nor residue.
            expect(result.snapshot.status.staleTargets).toEqual([]);
            expect(result.removed).toEqual([]);

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

        yield* sync({
          configuredAgents: ["claude-code", "gemini-cli"],
          config: IGNORED,
          symlinkSupported: true,
        });
        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf8")).toContain(
          "/docs/GEMINI.md",
        );

        fs.rmSync(path.join(tempDir, "docs", "AGENTS.md"));
        const narrowed = yield* sync({
          configuredAgents: ["claude-code"],
          config: IGNORED,
          symlinkSupported: true,
        });
        // The removed root's aliases and the removed agent's alias are swept
        // together with their ignore entries.
        expect([...narrowed.removed].sort()).toEqual(
          [
            path.join(tempDir, "GEMINI.md"),
            path.join(tempDir, "docs", "CLAUDE.md"),
            path.join(tempDir, "docs", "GEMINI.md"),
          ].sort(),
        );
        expect(fs.existsSync(path.join(tempDir, "GEMINI.md"))).toBe(false);
        expect(fs.existsSync(path.join(tempDir, "docs", "CLAUDE.md"))).toBe(false);
        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf8")).toBe(
          "# axm:start v=1 region=instruction-aliases ext=@agentxm/instructions/aliases\n/CLAUDE.md\n# axm:end v=1 region=instruction-aliases\n",
        );

        fs.rmSync(path.join(tempDir, "AGENTS.md"));
        fs.rmSync(path.join(tempDir, "CLAUDE.md"));
        fs.writeFileSync(path.join(tempDir, "CLAUDE.md"), "# Canonical Claude source\n");
        yield* sync({
          configuredAgents: ["claude-code", "gemini-cli"],
          config: { fileName: "CLAUDE.md", gitignoreAliases: true },
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

        const { gitignore } = yield* observe({
          configuredAgents: ["claude-code"],
          config: IGNORED,
          gitIndexView: true,
        });

        expect(gitignore.trackedAliases).toEqual(["CLAUDE.md", "docs/CLAUDE.md"]);
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

        const stale = yield* observe({ configuredAgents: ["claude-code"], config: IGNORED });
        expect(stale.gitignore.current).toBe(false);
        expect(instructionProjectionIsCurrent(stale)).toBe(false);

        const first = yield* sync({
          configuredAgents: ["claude-code"],
          config: IGNORED,
          symlinkSupported: true,
        });
        const second = yield* sync({
          configuredAgents: ["claude-code"],
          config: IGNORED,
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
        expect(second.removed).toEqual([]);
        expect(
          instructionProjectionIsCurrent(
            yield* observe({ configuredAgents: ["claude-code"], config: IGNORED }),
          ),
        ).toBe(true);
      }),
    ),
  );

  it.effect("writes idempotent managed copies when symlinks are unavailable", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

        yield* sync({ configuredAgents: ["claude-code", "gemini-cli"], symlinkSupported: false });

        const first = fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf-8");

        const secondResult = yield* sync({
          configuredAgents: ["claude-code", "gemini-cli"],
          symlinkSupported: false,
        });

        const second = fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf-8");

        expect(fs.lstatSync(path.join(tempDir, "CLAUDE.md")).isSymbolicLink()).toBe(false);
        expect(first).toContain("axm:file v=1 ext=@agentxm/instructions/alias src=AGENTS.md");
        expect(first).toContain("AXM managed file");
        expect(first).toContain("Edit: AGENTS.md");
        expect(first).toContain("# Workspace\n");
        expect(second).toBe(first);
        expect(second.match(/AXM managed file/g)?.length).toBe(1);
        expect(secondResult.written).toEqual([]);
        expect(secondResult.snapshot.status.items.every((item) => item.health === "ok")).toBe(true);
        expect(
          secondResult.snapshot.status.items.map((item) => [item.ownership, item.observedForm]),
        ).toEqual([
          ["owned-current", "copy"],
          ["owned-current", "copy"],
        ]);
      }),
    ),
  );

  it.effect("reports the observed form independently of the mechanism sync would choose", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        yield* sync({ configuredAgents: ["claude-code"], symlinkSupported: false });

        const { status } = yield* observe({
          configuredAgents: ["claude-code"],
          symlinkSupported: true,
        });

        expect(status.items[0]).toMatchObject({
          mechanism: "symlink",
          observedForm: "copy",
          ownership: "owned-current",
          health: "ok",
        });

        // What status calls current, sync leaves alone: a current copy is
        // never converted just because symlinks became available.
        const result = yield* sync({ configuredAgents: ["claude-code"], symlinkSupported: true });
        expect(result.written).toEqual([]);
        expect(fs.lstatSync(path.join(tempDir, "CLAUDE.md")).isSymbolicLink()).toBe(false);
      }),
    ),
  );

  it.effect("distinguishes an unowned collision from AXM-managed drift", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, "docs"));
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        fs.writeFileSync(path.join(tempDir, "docs", "AGENTS.md"), "# Docs\n");
        // Authored content at a planned target: unowned.
        fs.writeFileSync(path.join(tempDir, "CLAUDE.md"), "# Private notes\n");
        // A foreign symlink at a planned target: unowned.
        fs.writeFileSync(path.join(tempDir, "OTHER.md"), "# Other\n");
        fs.symlinkSync("OTHER.md", path.join(tempDir, "GEMINI.md"));
        // A managed copy whose body was hand-edited: owned, drifted.
        yield* syncInstructions({
          workspaceRoot: path.join(tempDir, "docs"),
          scope: "project",
          configuredAgents: ["claude-code"],
          config: TRACKED,
          dryRun: false,
          symlinkSupported: false,
        });
        const copyPath = path.join(tempDir, "docs", "CLAUDE.md");
        fs.writeFileSync(
          copyPath,
          fs.readFileSync(copyPath, "utf-8").replace("# Docs", "# Edited by hand"),
        );

        const { status } = yield* observe({
          configuredAgents: ["claude-code", "gemini-cli"],
          symlinkSupported: false,
        });

        expect(byTarget(status.items, path.join(tempDir, "CLAUDE.md"))).toMatchObject({
          health: "drift",
          ownership: "unowned",
          observedForm: "file",
          details: "An unowned file occupies the instruction target; AXM will not modify it.",
        });
        expect(byTarget(status.items, path.join(tempDir, "GEMINI.md"))).toMatchObject({
          health: "drift",
          ownership: "unowned",
          observedForm: "symlink",
        });
        expect(byTarget(status.items, copyPath)).toMatchObject({
          health: "drift",
          ownership: "owned-drift",
          observedForm: "copy",
          details: "Instruction file needs attention.",
        });
        expect(byTarget(status.items, path.join(tempDir, "docs", "GEMINI.md"))).toMatchObject({
          health: "missing-target",
          ownership: "absent",
          observedForm: "none",
        });

        const result = yield* Effect.result(assertInstructionTargetsSafe(status));
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          expect(result.failure.code).toBe("conflict");
          expect(result.failure.detail).toContain(path.join(tempDir, "CLAUDE.md"));
          expect(result.failure.detail).toContain(path.join(tempDir, "GEMINI.md"));
          expect(result.failure.detail).not.toContain(copyPath);
        }
      }),
    ),
  );

  it.effect("reports copy drift without overwriting it", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        fs.writeFileSync(path.join(tempDir, "GEMINI.md"), "# Local edit\n");

        const result = yield* sync({ configuredAgents: ["gemini-cli"] });
        const { status } = yield* observe({ configuredAgents: ["gemini-cli"] });

        expect(result.written).toEqual([]);
        expect(fs.readFileSync(path.join(tempDir, "GEMINI.md"), "utf-8")).toBe("# Local edit\n");
        expect(status.items[0]?.health).toBe("drift");
        expect(status.items[0]?.ownership).toBe("unowned");
      }),
    ),
  );

  it.effect("restores an AXM-owned managed copy that has drifted", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        yield* sync({ configuredAgents: ["claude-code"], symlinkSupported: false });
        const targetPath = path.join(tempDir, "CLAUDE.md");
        const managed = fs.readFileSync(targetPath, "utf-8");
        fs.writeFileSync(targetPath, managed.replace("# Workspace", "# Drifted"));

        const { status } = yield* observe({
          configuredAgents: ["claude-code"],
          symlinkSupported: false,
        });
        yield* assertInstructionTargetsSafe(status);
        const result = yield* reconcileInstructionTargets({
          workspaceRoot: tempDir,
          scope: "project",
          configuredAgents: ["claude-code"],
          config: TRACKED,
          symlinkSupported: false,
        });

        expect(result.written).toContain(targetPath);
        expect(fs.readFileSync(targetPath, "utf-8")).toBe(managed);
        expect(result.snapshot.status.items[0]?.ownership).toBe("owned-current");
      }),
    ),
  );

  it.effect("refuses to replace an unowned target through lint-fix reconciliation", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, ".git"));
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        const privateNotes = "# Private Claude notes\n\nNOT IN GIT. Irreplaceable.\n";
        fs.writeFileSync(path.join(tempDir, "CLAUDE.md"), privateNotes);

        const result = yield* Effect.result(
          reconcileInstructionTargets({
            workspaceRoot: tempDir,
            scope: "project",
            configuredAgents: ["claude-code", "gemini-cli"],
            config: IGNORED,
            symlinkSupported: true,
          }),
        );

        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          expect(result.failure.code).toBe("conflict");
          expect(result.failure.detail).toContain(path.join(tempDir, "CLAUDE.md"));
        }
        expect(fs.lstatSync(path.join(tempDir, "CLAUDE.md")).isSymbolicLink()).toBe(false);
        expect(fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf-8")).toBe(privateNotes);
        // The refusal happens before any write: the other alias is not created either.
        expect(fs.existsSync(path.join(tempDir, "GEMINI.md"))).toBe(false);
        expect(fs.existsSync(path.join(tempDir, ".gitignore"))).toBe(false);
      }),
    ),
  );

  it.effect("blocks an unowned alias even when its body matches the source", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        fs.writeFileSync(path.join(tempDir, "CLAUDE.md"), "# Workspace\n");

        const { status } = yield* observe({ configuredAgents: ["claude-code"] });
        const result = yield* Effect.result(assertInstructionTargetsSafe(status));

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

        const result = yield* sync({ configuredAgents: ["claude-code"], symlinkSupported: true });

        expect(result.written).toEqual([]);
        expect(result.snapshot.status.items[0]).toMatchObject({
          health: "drift",
          ownership: "unowned",
          observedForm: "directory",
        });
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

        const snapshot = yield* observe({ configuredAgents: ["claude-code"] });
        const previewed = yield* removeManagedInstructionTargets({ snapshot, dryRun: true });
        expect(previewed).toEqual([path.join(tempDir, "CLAUDE.md")]);
        expect(fs.lstatSync(path.join(tempDir, "CLAUDE.md")).isSymbolicLink()).toBe(true);

        const removed = yield* removeManagedInstructionTargets({ snapshot, dryRun: false });

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

        const snapshot = yield* observe({ configuredAgents: ["claude-code", "gemini-cli"] });
        const result = yield* Effect.result(
          removeManagedInstructionTargets({ snapshot, dryRun: false }),
        );

        expect(result._tag).toBe("Failure");
        expect(fs.lstatSync(path.join(tempDir, "CLAUDE.md")).isSymbolicLink()).toBe(true);
        expect(fs.readFileSync(path.join(tempDir, "GEMINI.md"), "utf-8")).toBe("# Human content\n");
      }),
    ),
  );

  it.effect("discovers and removes aliases left behind by a removed nested source root", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, ".git"));
        fs.mkdirSync(path.join(tempDir, "docs"));
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Root\n");
        fs.writeFileSync(path.join(tempDir, "docs", "AGENTS.md"), "# Docs\n");
        yield* sync({
          configuredAgents: ["claude-code", "junie"],
          config: IGNORED,
          symlinkSupported: true,
        });
        const staleClaude = path.join(tempDir, "docs", "CLAUDE.md");
        const staleJunie = path.join(tempDir, "docs", ".junie", "AGENTS.md");
        expect(fs.lstatSync(staleClaude).isSymbolicLink()).toBe(true);
        expect(fs.lstatSync(staleJunie).isSymbolicLink()).toBe(true);

        fs.rmSync(path.join(tempDir, "docs", "AGENTS.md"));

        const before = yield* observe({
          configuredAgents: ["claude-code", "junie"],
          config: IGNORED,
          symlinkSupported: true,
        });
        expect(before.status.roots).toEqual([tempDir]);
        expect(
          before.status.staleTargets.map((item) => [
            item.targetFile,
            item.agentId,
            item.health,
            item.ownership,
            item.observedForm,
            item.mechanism,
          ]),
        ).toEqual(
          expect.arrayContaining([
            [staleClaude, "claude-code", "stale", "owned-current", "broken-link", "symlink"],
            [staleJunie, "junie", "stale", "owned-current", "broken-link", "symlink"],
          ]),
        );
        expect(before.status.staleTargets).toHaveLength(2);
        expect(instructionProjectionIsCurrent(before)).toBe(false);

        const dryRun = yield* sync({
          configuredAgents: ["claude-code", "junie"],
          config: IGNORED,
          symlinkSupported: true,
          dryRun: true,
        });
        expect([...dryRun.removed].sort()).toEqual([staleClaude, staleJunie].sort());
        expect(dryRun.written).toEqual([path.join(tempDir, ".gitignore")]);
        expect(fs.lstatSync(staleClaude).isSymbolicLink()).toBe(true);
        expect(fs.lstatSync(staleJunie).isSymbolicLink()).toBe(true);
        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf8")).toContain(
          "/docs/CLAUDE.md",
        );

        const applied = yield* sync({
          configuredAgents: ["claude-code", "junie"],
          config: IGNORED,
          symlinkSupported: true,
        });
        expect([...applied.removed].sort()).toEqual([...dryRun.removed].sort());
        expect(applied.written).toEqual(dryRun.written);
        expect(fs.existsSync(staleClaude)).toBe(false);
        expect(fs.existsSync(staleJunie)).toBe(false);
        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf8")).not.toContain("/docs/");
        expect(applied.snapshot.status.staleTargets).toEqual([]);
        expect(
          instructionProjectionIsCurrent(
            yield* observe({
              configuredAgents: ["claude-code", "junie"],
              config: IGNORED,
              symlinkSupported: true,
            }),
          ),
        ).toBe(true);
      }),
    ),
  );

  it.effect("removes stale aliases without a managed gitignore region to consult", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, "docs"));
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Root\n");
        fs.writeFileSync(path.join(tempDir, "docs", "AGENTS.md"), "# Docs\n");
        yield* sync({ configuredAgents: ["gemini-cli"], symlinkSupported: true });
        fs.rmSync(path.join(tempDir, "docs", "AGENTS.md"));

        const result = yield* sync({ configuredAgents: ["gemini-cli"], symlinkSupported: true });

        expect(fs.existsSync(path.join(tempDir, ".gitignore"))).toBe(false);
        expect(result.removed).toEqual([path.join(tempDir, "docs", "GEMINI.md")]);
        expect(fs.existsSync(path.join(tempDir, "docs", "GEMINI.md"))).toBe(false);
        expect(fs.readlinkSync(path.join(tempDir, "GEMINI.md"))).toBe("AGENTS.md");
      }),
    ),
  );

  it.effect("removes a removed agent's alias but never an unowned file at an alias name", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        yield* sync({ configuredAgents: ["claude-code", "gemini-cli"], symlinkSupported: true });
        // Authored files at alias names the plan does not desire carry no proof.
        fs.writeFileSync(path.join(tempDir, "IFLOW.md"), "# Authored iFlow notes\n");
        fs.mkdirSync(path.join(tempDir, "notes"));
        fs.writeFileSync(path.join(tempDir, "notes", "shared.md"), "# Shared\n");
        fs.symlinkSync(path.join("notes", "shared.md"), path.join(tempDir, "CODEBUDDY.md"));

        const { status } = yield* observe({
          configuredAgents: ["claude-code"],
          symlinkSupported: true,
        });
        expect(status.staleTargets.map((item) => item.targetFile)).toEqual([
          path.join(tempDir, "GEMINI.md"),
        ]);

        const result = yield* sync({ configuredAgents: ["claude-code"], symlinkSupported: true });

        expect(result.removed).toEqual([path.join(tempDir, "GEMINI.md")]);
        expect(fs.existsSync(path.join(tempDir, "GEMINI.md"))).toBe(false);
        expect(fs.readlinkSync(path.join(tempDir, "CLAUDE.md"))).toBe("AGENTS.md");
        expect(fs.readFileSync(path.join(tempDir, "IFLOW.md"), "utf-8")).toBe(
          "# Authored iFlow notes\n",
        );
        expect(fs.readlinkSync(path.join(tempDir, "CODEBUDDY.md"))).toBe(
          path.join("notes", "shared.md"),
        );
      }),
    ),
  );

  it.effect(
    "leaves a hand-made sibling symlink alone unless it resolves to the canonical file",
    () =>
      run(
        Effect.gen(function* () {
          fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
          fs.writeFileSync(path.join(tempDir, "README.md"), "# Readme\n");
          fs.writeFileSync(path.join(tempDir, "CLAUDE.md"), "# Claude notes\n");
          // A user's own link to an unrelated sibling carries no AXM proof.
          fs.symlinkSync("README.md", path.join(tempDir, "CODEBUDDY.md"));
          // ...while a link to the canonical file is indistinguishable from an
          // alias AXM wrote, so it is residue once no agent wants it.
          fs.symlinkSync("CLAUDE.md", path.join(tempDir, "GEMINI.md"));
          fs.symlinkSync("AGENTS.md", path.join(tempDir, "IFLOW.md"));

          const { status } = yield* observe({
            configuredAgents: ["codex"],
            symlinkSupported: true,
          });
          expect(status.staleTargets.map((item) => item.targetFile)).toEqual([
            path.join(tempDir, "IFLOW.md"),
          ]);

          const result = yield* sync({ configuredAgents: ["codex"], symlinkSupported: true });

          expect(result.removed).toEqual([path.join(tempDir, "IFLOW.md")]);
          expect(fs.readlinkSync(path.join(tempDir, "CODEBUDDY.md"))).toBe("README.md");
          expect(fs.readlinkSync(path.join(tempDir, "GEMINI.md"))).toBe("CLAUDE.md");
          expect(fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf-8")).toBe(
            "# Claude notes\n",
          );
        }),
      ),
  );

  it.effect("does not enter directory symlinks or nested AXM workspaces", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        // A tree reachable only through a directory symlink.
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), "agent-instructions-outside-"));
        try {
          fs.writeFileSync(path.join(outside, "AGENTS.md"), "# Outside\n");
          fs.symlinkSync("AGENTS.md", path.join(outside, "GEMINI.md"));
          fs.symlinkSync(outside, path.join(tempDir, "linked"));
          // A nested package that is its own AXM workspace.
          const nested = path.join(tempDir, "packages", "child");
          fs.mkdirSync(path.join(nested, ".axm"), { recursive: true });
          fs.writeFileSync(path.join(nested, ".axm", "settings.json"), "{}\n");
          fs.writeFileSync(path.join(nested, "AGENTS.md"), "# Child\n");
          fs.symlinkSync("AGENTS.md", path.join(nested, "GEMINI.md"));

          const result = yield* sync({ configuredAgents: ["claude-code"], symlinkSupported: true });

          expect(result.snapshot.status.roots).toEqual([tempDir]);
          expect(result.snapshot.status.staleTargets).toEqual([]);
          expect(result.removed).toEqual([]);
          expect(fs.readlinkSync(path.join(outside, "GEMINI.md"))).toBe("AGENTS.md");
          expect(fs.readlinkSync(path.join(nested, "GEMINI.md"))).toBe("AGENTS.md");
          expect(fs.existsSync(path.join(outside, "CLAUDE.md"))).toBe(false);
          expect(fs.existsSync(path.join(nested, "CLAUDE.md"))).toBe(false);
        } finally {
          fs.rmSync(outside, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect(
    "sweeps residue an earlier discovery wrote inside an agent configuration directory",
    () =>
      run(
        Effect.gen(function* () {
          fs.mkdirSync(path.join(tempDir, ".git"));
          fs.mkdirSync(path.join(tempDir, ".junie"));
          fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
          fs.symlinkSync(path.join("..", "AGENTS.md"), path.join(tempDir, ".junie", "AGENTS.md"));
          // An earlier discovery treated `.junie` as a root and aliased into it.
          fs.symlinkSync("AGENTS.md", path.join(tempDir, ".junie", "CLAUDE.md"));
          fs.writeFileSync(
            path.join(tempDir, ".gitignore"),
            "# axm:start v=1 region=instruction-aliases ext=@agentxm/instructions/aliases\n/.junie/AGENTS.md\n/.junie/CLAUDE.md\n/CLAUDE.md\n# axm:end v=1 region=instruction-aliases\n",
          );

          const result = yield* sync({
            configuredAgents: ["claude-code", "junie"],
            config: IGNORED,
            symlinkSupported: true,
          });

          expect(result.removed).toEqual([path.join(tempDir, ".junie", "CLAUDE.md")]);
          expect(fs.existsSync(path.join(tempDir, ".junie", "CLAUDE.md"))).toBe(false);
          expect(fs.readlinkSync(path.join(tempDir, ".junie", "AGENTS.md"))).toBe(
            path.join("..", "AGENTS.md"),
          );
          expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf8")).toBe(
            "# axm:start v=1 region=instruction-aliases ext=@agentxm/instructions/aliases\n/.junie/AGENTS.md\n/CLAUDE.md\n# axm:end v=1 region=instruction-aliases\n",
          );
        }),
      ),
  );

  it.effect(
    "lint-fix reconciliation removes stale aliases and refuses before any write on unsafe markers",
    () =>
      run(
        Effect.gen(function* () {
          fs.mkdirSync(path.join(tempDir, ".git"));
          fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
          yield* sync({
            configuredAgents: ["claude-code", "gemini-cli"],
            config: IGNORED,
            symlinkSupported: true,
          });

          const result = yield* reconcileInstructionTargets({
            workspaceRoot: tempDir,
            scope: "project",
            configuredAgents: ["claude-code"],
            config: IGNORED,
            symlinkSupported: true,
          });
          expect(result.removed).toEqual([path.join(tempDir, "GEMINI.md")]);
          expect(fs.existsSync(path.join(tempDir, "GEMINI.md"))).toBe(false);
          expect(result.snapshot.status.staleTargets).toEqual([]);
          expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf8")).not.toContain(
            "/GEMINI.md",
          );

          // A malformed managed region blocks the whole reconciliation up front:
          // neither the stale alias nor the missing target is touched.
          fs.rmSync(path.join(tempDir, "CLAUDE.md"));
          fs.symlinkSync("AGENTS.md", path.join(tempDir, "GEMINI.md"));
          const malformed =
            "# axm:start v=1 region=instruction-aliases ext=@agentxm/instructions/aliases\n/CLAUDE.md\n";
          fs.writeFileSync(path.join(tempDir, ".gitignore"), malformed);

          const refused = yield* Effect.result(
            reconcileInstructionTargets({
              workspaceRoot: tempDir,
              scope: "project",
              configuredAgents: ["claude-code"],
              config: IGNORED,
              symlinkSupported: true,
            }),
          );

          expect(refused._tag).toBe("Failure");
          if (refused._tag === "Failure") {
            expect(refused.failure.code).toBe("conflict");
            expect(refused.failure.detail).toContain("malformed AXM ownership markers");
          }
          expect(fs.existsSync(path.join(tempDir, "CLAUDE.md"))).toBe(false);
          expect(fs.readlinkSync(path.join(tempDir, "GEMINI.md"))).toBe("AGENTS.md");
          expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf8")).toBe(malformed);
        }),
      ),
  );

  it.effect("treats any banner at a planned target as AXM-owned and regenerates it", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        // A copy written before the alias identity existed still proves AXM
        // produced it, so it is refreshed rather than disowned.
        fs.writeFileSync(
          path.join(tempDir, "CLAUDE.md"),
          "<!-- axm:file v=1 ext=@agentxm/rules/managed-file src=AGENTS.md -->\n\n# Old copy\n",
        );

        const { status } = yield* observe({
          configuredAgents: ["claude-code"],
          symlinkSupported: false,
        });
        expect(status.items[0]).toMatchObject({ health: "drift", ownership: "owned-drift" });

        const result = yield* sync({ configuredAgents: ["claude-code"], symlinkSupported: false });

        expect(result.written).toEqual([path.join(tempDir, "CLAUDE.md")]);
        expect(fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf-8")).toContain(
          "ext=@agentxm/instructions/alias",
        );
        expect(result.snapshot.status.items[0]?.ownership).toBe("owned-current");
      }),
    ),
  );

  it.effect("removes stale managed copies by their banner proof alone", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        yield* sync({ configuredAgents: ["claude-code", "gemini-cli"], symlinkSupported: false });
        // A banner-bearing file written by something other than instruction
        // propagation is not residue, even at an alias name.
        fs.writeFileSync(
          path.join(tempDir, "IFLOW.md"),
          "<!-- axm:file v=1 ext=@acme/skills/demo src=.axm/extensions/@acme/skills/demo/src/SKILL.md -->\n\n# Demo\n",
        );

        const { status } = yield* observe({
          configuredAgents: ["claude-code"],
          symlinkSupported: false,
        });
        expect(status.staleTargets).toHaveLength(1);
        expect(status.staleTargets[0]).toMatchObject({
          targetFile: path.join(tempDir, "GEMINI.md"),
          sourceFile: path.join(tempDir, "AGENTS.md"),
          mechanism: "copy",
          health: "stale",
          ownership: "owned-current",
          observedForm: "copy",
        });

        const result = yield* sync({ configuredAgents: ["claude-code"], symlinkSupported: false });

        expect(result.removed).toEqual([path.join(tempDir, "GEMINI.md")]);
        expect(fs.existsSync(path.join(tempDir, "GEMINI.md"))).toBe(false);
        expect(fs.existsSync(path.join(tempDir, "IFLOW.md"))).toBe(true);
        expect(fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf-8")).toContain("# Workspace");
      }),
    ),
  );

  it.effect("reconciles a changed source filename without touching an unowned collision", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Original\n");
        yield* sync({ configuredAgents: ["claude-code", "gemini-cli"], symlinkSupported: true });
        fs.writeFileSync(path.join(tempDir, "TEAM.md"), "# Team\n");
        const team: ResolvedInstructionsConfig = { fileName: "TEAM.md", gitignoreAliases: false };

        // Under the new configuration neither old alias proves anything about
        // TEAM.md: the old Claude alias is not recognized as residue, and the
        // old Gemini alias sits at a planned target as a collision that blocks
        // reconciliation instead of a rewrite.
        const direct = yield* observe({
          configuredAgents: ["gemini-cli"],
          config: team,
          symlinkSupported: true,
        });
        expect(direct.status.staleTargets).toEqual([]);
        expect(byTarget(direct.status.items, path.join(tempDir, "GEMINI.md"))).toMatchObject({
          ownership: "unowned",
          observedForm: "symlink",
        });
        const refused = yield* Effect.result(
          reconcileInstructionTargets({
            workspaceRoot: tempDir,
            scope: "project",
            configuredAgents: ["gemini-cli"],
            config: team,
            symlinkSupported: true,
          }),
        );
        expect(refused._tag).toBe("Failure");
        expect(fs.readlinkSync(path.join(tempDir, "CLAUDE.md"))).toBe("AGENTS.md");
        expect(fs.readlinkSync(path.join(tempDir, "GEMINI.md"))).toBe("AGENTS.md");

        // The transition path removes what the previous configuration owned
        // first, so the new plan starts from absent targets.
        const previous = yield* observe({
          configuredAgents: ["claude-code", "gemini-cli"],
          symlinkSupported: true,
        });
        const removed = yield* removeManagedInstructionTargets({
          snapshot: previous,
          dryRun: false,
        });
        expect([...removed].sort()).toEqual(
          [path.join(tempDir, "CLAUDE.md"), path.join(tempDir, "GEMINI.md")].sort(),
        );
        const result = yield* reconcileInstructionTargets({
          workspaceRoot: tempDir,
          scope: "project",
          configuredAgents: ["gemini-cli"],
          config: team,
          symlinkSupported: true,
        });
        expect(result.written).toEqual([path.join(tempDir, "GEMINI.md")]);
        expect(fs.readlinkSync(path.join(tempDir, "GEMINI.md"))).toBe("TEAM.md");
        expect(fs.existsSync(path.join(tempDir, "CLAUDE.md"))).toBe(false);
        expect(fs.readFileSync(path.join(tempDir, "AGENTS.md"), "utf-8")).toBe("# Original\n");
      }),
    ),
  );

  it.effect("reports missing canonical sources for roots the plan expects", () =>
    run(
      Effect.gen(function* () {
        const { status } = yield* observe({
          configuredAgents: ["claude-code"],
          symlinkSupported: true,
        });

        expect(status.roots).toEqual([tempDir]);
        expect(status.missingSources).toEqual([path.join(tempDir, "AGENTS.md")]);
        expect(status.items[0]).toMatchObject({
          health: "missing-source",
          ownership: "absent",
          observedForm: "none",
        });
      }),
    ),
  );

  it.effect("reports native rules directories AXM does not sync", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

        const { status } = yield* observe({
          // cursor: agents-md plus a secondary native rules directory.
          // roo: rules-dir, which AXM resolves to the unwritten adapter path.
          // codex: agents-md with no secondary directory.
          configuredAgents: ["cursor", "roo", "codex"],
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
        expect(status.items.find((item) => item.agentId === "roo")).toMatchObject({
          health: "unsupported",
          ownership: "absent",
          observedForm: "none",
        });
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

        yield* sync({ configuredAgents: ["claude-code"], config: IGNORED });
        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf-8")).toContain(
          "# axm:start v=1 region=instruction-aliases ext=@agentxm/instructions/aliases",
        );

        yield* sync({ configuredAgents: ["claude-code"], config: TRACKED });

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
        yield* sync({ configuredAgents: ["claude-code"], config: IGNORED, symlinkSupported: true });

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
          sync({ configuredAgents: ["claude-code"], config: IGNORED, symlinkSupported: true }),
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
