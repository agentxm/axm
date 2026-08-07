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
  listInstructionAliases,
  normalizeMarkdownBody,
  probeSymlinkSupport,
  removeManagedInstructionTargets,
  resolveInstructionMechanism,
  syncInstructions,
  syncInstructionsGitignore,
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
          scope: "project",
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
          scope: "project",
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
            symlinkSupported: true,
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
          symlinkSupported: true,
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
            symlinkSupported: true,
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
          "# >>> axm:instructions >>>",
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
          "# >>> axm:instructions >>>",
        );
      }),
    ),
  );

  it.effect("preserves gitignore bytes outside the managed block", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, ".git"));
        const before =
          "dist/  \r\n\r\n# >>> axm:instructions >>>\r\n**/OLD.md\r\n# <<< axm:instructions <<<\r\n\r\n# keep  \r\n";
        fs.writeFileSync(path.join(tempDir, ".gitignore"), before);

        yield* syncInstructionsGitignore({
          workspaceRoot: tempDir,
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: true },
          desired: true,
          dryRun: false,
        });

        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf-8")).toBe(
          "dist/  \r\n\r\n# >>> axm:instructions >>>\r\n**/CLAUDE.md\r\n# <<< axm:instructions <<<\r\n\r\n# keep  \r\n",
        );

        yield* syncInstructionsGitignore({
          workspaceRoot: tempDir,
          configuredAgents: ["claude-code"],
          config: { fileName: "AGENTS.md", gitignoreAliases: true },
          desired: false,
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
        const malformed = "dist/\n# >>> axm:instructions >>>\n**/CLAUDE.md\n";
        fs.writeFileSync(path.join(tempDir, ".gitignore"), malformed);

        const result = yield* Effect.result(
          syncInstructionsGitignore({
            workspaceRoot: tempDir,
            configuredAgents: ["claude-code"],
            config: { fileName: "AGENTS.md", gitignoreAliases: true },
            desired: true,
            dryRun: false,
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
