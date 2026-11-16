import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import * as NodeServices from "@effect/platform-node/NodeServices";
import type { NativeEntryRemoval } from "../../locations/index.js";
import { NativePlatformTest, withDetailedWork, workObservations } from "../../locations/testing.js";
import { CanonicalNativePathLive } from "../../locations/live.js";
import type { InstructionStatusItem } from "./instruction-status.js";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { NativeWriteAuthorityPermissive } from "../../agent-adapters/testing.js";
import { NativeWriteAuthority } from "../../agent-adapters/index.js";
import { readContainerReceipts } from "../../locations/index.js";
import { WorkspaceFileWriteLocks } from "../../settlement/index.js";
import { WorkspaceFileWriteLocksLive } from "../../settlement/live.js";
import { NativeWriteAuthorityLive } from "../live.js";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as EffectFileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Tracer from "effect/Tracer";
import { afterEach, beforeEach } from "vitest";
import {
  applyInstructionProjection,
  assertInstructionsGitignoreSafe,
  assertInstructionTargetsSafe,
  instructionProjectionEffects,
  recordIdenticalInstructionCopies,
  instructionProjectionIsCurrent,
  instructionProjectionRecordsRows,
  instructionProjectionRemovalEffects,
  observeInstructionProjection,
  probeSymlinkSupport,
  removeManagedInstructionTargets,
  removeInstructionsGitignore,
  resolveInstructionMechanism,
  syncInstructions,
  withInstructionRowChanges,
  type InstructionProjectionRows,
  type InstructionProjectionSnapshot,
  type ResolvedInstructionsConfig,
} from "./instructions.js";
import {
  instructionReconciliationReadiness,
  observeInstructionSurfacePlans,
  reconcileInstructions,
} from "./reconciliation.js";
import { planAggregateProjection } from "../planning.js";
import { WorkspaceReadTest } from "../../workspace-state/testing.js";
import { ProjectionRowsTest } from "../../workspace-state/testing.js";
import {
  AcceptedResolutionWriter,
  LockfileReader,
  ProjectionUnitPathSchema,
  type ProjectionRowChange,
} from "../../workspace-state/index.js";
import { InstructionMaintenanceFailed } from "./errors.js";
import { ProjectionOutputPosture } from "../output-posture.js";

/** Narrow a typed failure to the maintenance family before asserting fields. */
const expectMaintenanceFailed = (failure: {
  readonly _tag: string;
}): InstructionMaintenanceFailed => {
  if (!(failure instanceof InstructionMaintenanceFailed)) {
    throw new Error(`Expected InstructionMaintenanceFailed, got ${failure._tag}`);
  }
  return failure;
};
import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";

const gitLocalEnvironmentVariables = [
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_CONFIG",
  "GIT_CONFIG_PARAMETERS",
  "GIT_CONFIG_COUNT",
  "GIT_OBJECT_DIRECTORY",
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_GRAFT_FILE",
  "GIT_INDEX_FILE",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_REPLACE_REF_BASE",
  "GIT_PREFIX",
  "GIT_INTERNAL_SUPER_PREFIX",
  "GIT_SHALLOW_FILE",
  "GIT_COMMON_DIR",
] as const;

const git = (root: string, args: ReadonlyArray<string>) => {
  const environment = { ...process.env };
  for (const name of gitLocalEnvironmentVariables) delete environment[name];
  return spawnSync("git", args, { cwd: root, encoding: "utf8", env: environment });
};

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

  const run = <A, E>(
    effect: Effect.Effect<
      A,
      E,
      | NodeServices.NodeServices
      | NativeEntryRemoval
      | NativeWriteAuthority
      | AcceptedResolutionWriter
      | LockfileReader
    >,
  ) =>
    effect.pipe(
      Effect.provide(
        Layer.mergeAll(
          NativeWriteAuthorityPermissive,
          NativePlatformTest,
          CanonicalNativePathLive,
          ProjectionRowsTest(),
        ),
      ),
    );

  /** The recorded `instructions` rows of the test's in-memory lockfile. */
  const rows = Effect.flatMap(AcceptedResolutionWriter, (writer) =>
    writer.projectionRows("instructions"),
  );

  /** Commit row edits the way a writer's caller stages them. */
  const stage = (changes: ReadonlyArray<ProjectionRowChange>) =>
    Effect.flatMap(AcceptedResolutionWriter, (writer) =>
      writer.withBatch(writer.stageProjections(changes)),
    );

  /** Reconcile inside an accepted-resolution batch, as every writer's caller does. */
  const reconcile = (args: Parameters<typeof reconcileInstructions>[0]) =>
    Effect.flatMap(AcceptedResolutionWriter, (writer) =>
      writer.withBatch(reconcileInstructions(args)),
    );

  const observe = (args: {
    readonly configuredAgents: ReadonlyArray<string>;
    readonly config?: ResolvedInstructionsConfig;
    readonly scope?: "project" | "user";
    readonly symlinkSupported?: boolean;
    readonly gitIndexView?: boolean;
    readonly replaceUnrecorded?: boolean;
    readonly discardModified?: boolean;
  }) =>
    Effect.flatMap(rows, (recorded) =>
      observeInstructionProjection({
        workspaceRoot: tempDir,
        scope: args.scope ?? "project",
        configuredAgents: args.configuredAgents,
        config: args.config ?? TRACKED,
        rows: recorded,
        ...(args.symlinkSupported === undefined ? {} : { symlinkSupported: args.symlinkSupported }),
        ...(args.gitIndexView === undefined ? {} : { gitIndexView: args.gitIndexView }),
        ...(args.replaceUnrecorded === undefined
          ? {}
          : { replaceUnrecorded: args.replaceUnrecorded }),
        ...(args.discardModified === undefined ? {} : { discardModified: args.discardModified }),
      }),
    );

  const sync = (args: {
    readonly configuredAgents: ReadonlyArray<string>;
    readonly config?: ResolvedInstructionsConfig;
    readonly dryRun?: boolean;
    readonly symlinkSupported?: boolean;
    readonly replaceUnrecorded?: boolean;
  }) =>
    Effect.gen(function* () {
      const result = yield* syncInstructions({
        workspaceRoot: tempDir,
        scope: "project",
        configuredAgents: args.configuredAgents,
        config: args.config ?? TRACKED,
        dryRun: args.dryRun ?? false,
        rows: yield* rows,
        ...(args.symlinkSupported === undefined ? {} : { symlinkSupported: args.symlinkSupported }),
        ...(args.replaceUnrecorded === undefined
          ? {}
          : { replaceUnrecorded: args.replaceUnrecorded }),
      });
      yield* stage(result.rowChanges);
      return result;
    });

  for (const form of ["copy", "symlink"] as const) {
    it.effect(
      `distinguishes an owned ${form} by physical route proof despite overlapping consumers`,
      () =>
        run(
          Effect.gen(function* () {
            const source = path.join(tempDir, "AGENTS.md");
            const target = path.join(tempDir, "CLAUDE.md");
            fs.writeFileSync(source, "# Authoritative guidance\n");
            yield* sync({
              configuredAgents: ["claude-code"],
              symlinkSupported: form === "symlink",
            });
            expect(fs.lstatSync(target).isSymbolicLink()).toBe(form === "symlink");
            // The new probe supports links even when the existing owned form is a copy.
            expect(yield* probeSymlinkSupport(tempDir)).toBe(true);
            const routing = yield* observe({
              configuredAgents: ["claude-code"],
              symlinkSupported: true,
            });
            expect(instructionProjectionEffects(routing, [source])).toEqual(
              form === "copy" ? [{ path: target, change: "updated", lastWrite: "matches" }] : [],
            );
            const beforeSource = fs.readFileSync(source, "utf8");
            const beforeTarget = fs.readFileSync(target, "utf8");
            const workspace = WorkspaceReadTest({
              baseDir: tempDir,
              settings: { agents: ["claude-code"], instructionFiles: { gitignoreAliases: false } },
            });
            const observed = yield* Effect.gen(function* () {
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
                      present: true,
                      current: true,
                      expectedContributors: ["rule"],
                      nativeLocations: [
                        {
                          scope: "project",
                          address: { kind: "region", path: source, region: "rules" },
                          aliases: [source],
                          configuredConsumers: ["claude-code"],
                          potentialReaders: [],
                          policyReasons: ["shared-instructions"],
                          ownership: "owned",
                          state: "unchanged",
                          availability: [],
                        },
                      ],
                    }),
                  apply: () => Effect.void,
                },
              });
              return yield* observeInstructionSurfacePlans([plan], { view: "current" });
            }).pipe(
              // The rows the sync above recorded are the lockfile this observation reads.
              Effect.provide(
                Layer.merge(workspace, Layer.succeed(LockfileReader, yield* LockfileReader)),
              ),
            );
            const locations = observed.flatMap((observation) => observation.nativeLocations ?? []);
            expect(locations.filter((unit) => unit.address.kind === "region")).toHaveLength(1);
            const entries = locations.filter((unit) => unit.address.kind === "entry");
            if (form === "copy") {
              expect(entries).toEqual([
                expect.objectContaining({
                  address: { kind: "entry", path: target },
                  ownership: "owned",
                  state: "unchanged",
                  proof: "recorded-instruction-copy",
                  configuredConsumers: ["claude-code"],
                }),
              ]);
            } else {
              expect(entries).toEqual([]);
            }
            expect(fs.readFileSync(source, "utf8")).toBe(beforeSource);
            expect(fs.readFileSync(target, "utf8")).toBe(beforeTarget);
          }),
        ),
    );
  }

  it.effect("accepts a canonical instruction route shared with conditional readers", () =>
    run(
      Effect.gen(function* () {
        const source = path.join(tempDir, "AGENTS.md");
        fs.writeFileSync(source, "# Authoritative guidance\n");
        const workspace = WorkspaceReadTest({
          baseDir: tempDir,
          settings: {
            agents: ["codex", "opencode"],
            instructionFiles: { gitignoreAliases: false },
          },
        });
        const observed = yield* Effect.gen(function* () {
          const plan = yield* planAggregateProjection({
            unitId: "knowledge:discovery-region",
            targetFile: source,
            graph: { nodes: [], mcpSourceClosures: [], problems: [], packMembership: [] },
            select: () => Effect.succeed({ contributors: ["knowledge"], exclusions: [] }),
            adapter: {
              observe: () =>
                Effect.succeed({
                  unitId: "knowledge:discovery-region",
                  path: source,
                  present: true,
                  current: true,
                  expectedContributors: ["knowledge"],
                  nativeLocations: [
                    {
                      scope: "project",
                      address: { kind: "region", path: source, region: "knowledge" },
                      aliases: [source],
                      configuredConsumers: ["codex"],
                      potentialReaders: [],
                      policyReasons: ["shared-instructions"],
                      ownership: "owned",
                      state: "unchanged",
                      availability: [],
                    },
                  ],
                }),
              apply: () => Effect.void,
            },
          });
          return yield* observeInstructionSurfacePlans([plan]);
        }).pipe(Effect.provide(workspace));
        expect(observed).toHaveLength(1);
        expect(fs.readFileSync(source, "utf8")).toBe("# Authoritative guidance\n");
      }),
    ),
  );

  it("resolves own-file fallback mechanisms", () => {
    expect(
      resolveInstructionMechanism(
        {
          kind: "own-file",
          locations: [],
          scopes: ["project"],
          writerSupported: true,
          importSyntax: "at-path",
        },
        false,
      ),
    ).toBe("copy");
    expect(
      resolveInstructionMechanism(
        { kind: "own-file", locations: [], scopes: ["project"], writerSupported: true },
        false,
      ),
    ).toBe("copy");
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

  it.effect("skips Nx cache in project discovery but honors it as an explicit workspace root", () =>
    run(
      Effect.gen(function* () {
        const cacheWorkspace = path.join(tempDir, ".nx", "cache", "project");
        const docs = path.join(tempDir, "docs");
        fs.mkdirSync(cacheWorkspace, { recursive: true });
        fs.mkdirSync(docs);
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Root\n");
        fs.writeFileSync(path.join(docs, "AGENTS.md"), "# Docs\n");
        fs.writeFileSync(path.join(cacheWorkspace, "AGENTS.md"), "# Explicit\n");

        const broad = yield* observe({ configuredAgents: ["claude-code"] });
        const explicit = yield* observeInstructionProjection({
          rows: yield* rows,
          workspaceRoot: cacheWorkspace,
          scope: "project",
          configuredAgents: ["claude-code"],
          config: TRACKED,
        });

        expect([...broad.status.roots].sort()).toEqual([docs, tempDir].sort());
        expect(explicit.status.roots).toEqual([cacheWorkspace]);
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
          present: false,
          managed: false,
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
          rows: yield* rows,
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
          "# axm:instruction-aliases\n/CLAUDE.md\n# /axm:instruction-aliases\n",
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

  it.effect("flags a rewritten alias region that was edited since AXM last wrote it", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, ".git"));
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Root\n");
        const gitignore = path.join(tempDir, ".gitignore");
        const options = { config: IGNORED, symlinkSupported: true } as const;
        yield* sync({ configuredAgents: ["claude-code"], ...options });
        const gitignoreEffect = (agents: ReadonlyArray<string>) =>
          Effect.map(observe({ configuredAgents: agents, ...options }), (snapshot) =>
            instructionProjectionEffects(snapshot).find((effect) => effect.path === gitignore),
          );

        expect(yield* gitignoreEffect(["claude-code", "gemini-cli"])).toEqual({
          path: gitignore,
          change: "updated",
          lastWrite: "matches",
        });

        fs.writeFileSync(
          gitignore,
          "# axm:instruction-aliases\n/CLAUDE.md\n/edited-by-hand\n# /axm:instruction-aliases\n",
        );
        // A hand edit alone is not drift: the recorded generation is current.
        expect(yield* gitignoreEffect(["claude-code"])).toBeUndefined();
        expect(yield* gitignoreEffect(["claude-code", "gemini-cli"])).toEqual({
          path: gitignore,
          change: "updated",
          lastWrite: "modified",
        });
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
          "keep/\n\n# axm:instruction-aliases\n**/CLAUDE.md\n# /axm:instruction-aliases\n",
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
          "keep/\n\n# axm:instruction-aliases\n/CLAUDE.md\n# /axm:instruction-aliases\n",
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

  it.effect("preserves pre-v1 gitignore comments as unowned content", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, ".git"));
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        fs.writeFileSync(
          path.join(tempDir, ".gitignore"),
          "dist/\n\n# >>> axm:instructions >>>\n**/CLAUDE.md\n# <<< axm:instructions <<<\n",
        );

        const before = yield* observe({ configuredAgents: ["claude-code"], config: IGNORED });
        expect(before.gitignore).toMatchObject({ managed: false, current: false });

        yield* sync({
          configuredAgents: ["claude-code"],
          config: IGNORED,
          symlinkSupported: true,
        });

        const content = fs.readFileSync(path.join(tempDir, ".gitignore"), "utf8");
        expect(content).toContain(">>> axm:instructions >>>");
        expect(content).toContain("**/CLAUDE.md");
        expect(content.match(/axm:instruction-aliases/g)).toHaveLength(2);
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
        // A copy is byte-identical to its source; currency lives in the lockfile.
        expect(first).toBe("# Workspace\n");
        expect(second).toBe(first);
        expect(secondResult.written).toEqual([]);
        expect([...(yield* rows).keys()].sort()).toEqual(["CLAUDE.md", "GEMINI.md"]);
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

  it.effect("keys managed copies by physical location when the workspace root is an alias", () =>
    run(
      Effect.gen(function* () {
        // The root arrives through a link, as a macOS /var or Windows 8.3 temp
        // path does, while writes address the physical entry beneath it.
        const physicalRoot = fs.realpathSync(tempDir);
        const workspaceRoot = path.join(physicalRoot, "alias");
        const realRoot = path.join(physicalRoot, "real");
        fs.mkdirSync(realRoot);
        fs.symlinkSync(realRoot, workspaceRoot, "dir");
        const sourcePath = path.join(workspaceRoot, "AGENTS.md");
        const targetPath = path.join(realRoot, "CLAUDE.md");
        fs.mkdirSync(path.join(workspaceRoot, ".git"));
        fs.mkdirSync(path.join(workspaceRoot, "docs"));
        fs.writeFileSync(path.join(workspaceRoot, "docs", "AGENTS.md"), "# Docs\n");
        fs.writeFileSync(sourcePath, "# Aliased workspace\n");
        const args = {
          workspaceRoot,
          scope: "project",
          configuredAgents: ["claude-code"],
          config: IGNORED,
          symlinkSupported: false,
        } as const;

        const first = yield* reconcile(args);
        expect(first.written).toContain(targetPath);
        expect(fs.lstatSync(targetPath).isSymbolicLink()).toBe(false);
        expect([...(yield* rows).keys()].sort()).toEqual([
          ".gitignore",
          "CLAUDE.md",
          "docs/CLAUDE.md",
        ]);

        const unchanged = yield* reconcile(args);
        expect(unchanged.written).toEqual([]);

        fs.writeFileSync(sourcePath, "# Refreshed aliased workspace\n");
        const refreshed = yield* reconcile(args);
        expect(refreshed.written).toContain(targetPath);
        expect(fs.readFileSync(targetPath, "utf8")).toBe("# Refreshed aliased workspace\n");

        const removed = yield* removeManagedInstructionTargets({
          snapshot: yield* observeInstructionProjection({ ...args, rows: yield* rows }),
          dryRun: false,
        });
        expect(removed.removed).toEqual([targetPath, path.join(realRoot, "docs", "CLAUDE.md")]);
        yield* stage(removed.rowChanges);
        expect(fs.existsSync(targetPath)).toBe(false);
        expect(fs.existsSync(sourcePath)).toBe(true);

        const repeated = yield* removeManagedInstructionTargets({
          snapshot: yield* observeInstructionProjection({ ...args, rows: yield* rows }),
          dryRun: false,
        });
        expect(repeated.removed).toEqual([]);
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

  it.effect("distinguishes unowned collisions from an owned copy with an edited body", () =>
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
        // A recorded copy whose body was hand-edited: owned and current because
        // its recorded generation still matches its authoritative inputs.
        fs.renameSync(path.join(tempDir, "CLAUDE.md"), path.join(tempDir, "CLAUDE.private"));
        yield* sync({ configuredAgents: ["claude-code"], symlinkSupported: false });
        // The root alias then gets authored content and no recorded row: unowned.
        fs.renameSync(path.join(tempDir, "CLAUDE.private"), path.join(tempDir, "CLAUDE.md"));
        yield* stage([
          {
            kind: "instructions",
            path: ProjectionUnitPathSchema.make("CLAUDE.md"),
            row: undefined,
          },
        ]);
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
          health: "ok",
          ownership: "owned-current",
          observedForm: "copy",
          details: "Instruction file is current.",
        });
        expect(byTarget(status.items, path.join(tempDir, "docs", "GEMINI.md"))).toMatchObject({
          health: "missing-target",
          ownership: "absent",
          observedForm: "none",
        });

        const result = yield* Effect.result(
          assertInstructionTargetsSafe({ status, replaceUnrecorded: false }),
        );
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          const failure = expectMaintenanceFailed(result.failure);
          expect(failure.category).toBe("conflict");
          expect(failure.detail).toContain(path.join(tempDir, "CLAUDE.md"));
          expect(failure.detail).toContain(path.join(tempDir, "GEMINI.md"));
          expect(failure.detail).not.toContain(copyPath);
        }
      }),
    ),
  );

  it.effect("blocks a differing unrecorded alias without overwriting it", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        fs.writeFileSync(path.join(tempDir, "GEMINI.md"), "# Local edit\n");

        // A command that offers the override names it; one that does not, does not.
        const offered = yield* Effect.result(
          sync({ configuredAgents: ["gemini-cli"] }).pipe(
            Effect.provideService(ProjectionOutputPosture, { replaceUnrecorded: false }),
          ),
        );
        const result = yield* Effect.result(sync({ configuredAgents: ["gemini-cli"] }));
        const { status } = yield* observe({ configuredAgents: ["gemini-cli"] });

        expect(offered._tag).toBe("Failure");
        if (offered._tag === "Failure") {
          const failure = expectMaintenanceFailed(offered.failure);
          expect(failure.detail).toContain("--replace-unrecorded");
          expect(failure.problem).toEqual({
            code: "projection-output-unrecorded",
            paths: [path.join(tempDir, "GEMINI.md")],
          });
        }
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          const failure = expectMaintenanceFailed(result.failure);
          expect(failure.category).toBe("conflict");
          expect(failure.detail).toContain("has no recorded projection");
          expect(failure.detail).not.toContain("--replace-unrecorded");
        }
        expect(fs.readFileSync(path.join(tempDir, "GEMINI.md"), "utf-8")).toBe("# Local edit\n");
        expect(status.items[0]?.health).toBe("drift");
        expect(status.items[0]?.ownership).toBe("unowned");
        expect((yield* rows).size).toBe(0);
      }),
    ),
  );

  it.effect("replaces a differing unrecorded copy only on explicit intent", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        fs.writeFileSync(path.join(tempDir, "GEMINI.md"), "# Local edit\n");

        const preview = yield* observe({
          configuredAgents: ["gemini-cli"],
          symlinkSupported: false,
          replaceUnrecorded: true,
        });
        expect(instructionProjectionEffects(preview)).toEqual([
          { path: path.join(tempDir, "GEMINI.md"), change: "updated", lastWrite: "unrecorded" },
        ]);
        const result = yield* sync({
          configuredAgents: ["gemini-cli"],
          symlinkSupported: false,
          replaceUnrecorded: true,
        });

        expect(result.written).toEqual([path.join(tempDir, "GEMINI.md")]);
        expect(fs.readFileSync(path.join(tempDir, "GEMINI.md"), "utf-8")).toBe("# Workspace\n");
        expect(result.snapshot.status.items[0]).toMatchObject({
          ownership: "owned-current",
          observedForm: "copy",
        });
        expect([...(yield* rows).keys()]).toEqual(["GEMINI.md"]);
      }),
    ),
  );

  it.effect("preserves an AXM-owned managed copy whose body was edited", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        yield* sync({ configuredAgents: ["claude-code"], symlinkSupported: false });
        const targetPath = path.join(tempDir, "CLAUDE.md");
        const managed = fs.readFileSync(targetPath, "utf-8");
        const edited = managed.replace("# Workspace", "# Repository-formatted");
        fs.writeFileSync(targetPath, edited);

        const { status } = yield* observe({
          configuredAgents: ["claude-code"],
          symlinkSupported: false,
        });
        yield* assertInstructionTargetsSafe({ status, replaceUnrecorded: false });
        const result = yield* reconcile({
          workspaceRoot: tempDir,
          scope: "project",
          configuredAgents: ["claude-code"],
          config: TRACKED,
          symlinkSupported: false,
        });

        expect(result.written).toEqual([]);
        expect(fs.readFileSync(targetPath, "utf-8")).toBe(edited);
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
          reconcile({
            workspaceRoot: tempDir,
            scope: "project",
            configuredAgents: ["claude-code", "gemini-cli"],
            config: IGNORED,
            symlinkSupported: true,
          }),
        );

        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          const failure = expectMaintenanceFailed(result.failure);
          expect(failure.category).toBe("conflict");
          expect(failure.detail).toContain(path.join(tempDir, "CLAUDE.md"));
        }
        expect(fs.lstatSync(path.join(tempDir, "CLAUDE.md")).isSymbolicLink()).toBe(false);
        expect(fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf-8")).toBe(privateNotes);
        // The refusal happens before any write: the other alias is not created either.
        expect(fs.existsSync(path.join(tempDir, "GEMINI.md"))).toBe(false);
        expect(fs.existsSync(path.join(tempDir, ".gitignore"))).toBe(false);
      }),
    ),
  );

  it.effect("attributes instruction witness hashes to metadata and actual UTF-8 content", () =>
    run(
      Effect.gen(function* () {
        const spans: Tracer.NativeSpan[] = [];
        const tracer = Tracer.make({
          span(options) {
            const span = new Tracer.NativeSpan(options);
            spans.push(span);
            return span;
          },
        });
        for (const name of ["AGENTS.md", "CLAUDE.md"]) {
          fs.writeFileSync(path.join(tempDir, name), "# Workspace\n");
        }
        const before = yield* observe({ configuredAgents: ["claude-code"] }).pipe(
          withDetailedWork(tracer),
        );
        const first = spans.filter((span) => span.name === "axm.hash.instruction-witness");
        expect(before.witnesses.map((witness) => path.basename(witness.path))).toEqual([
          ".gitignore",
          "AGENTS.md",
          "CLAUDE.md",
        ]);
        expect(first.map((span) => span.attributes.get("axm.work.count"))).toEqual([1, 2, 2]);
        spans.length = 0;
        // In-place writes preserve inode/birth identity. Each new body is four UTF-8 bytes longer;
        // the metadata hashes contain fixed-length content digests, never the body itself.
        for (const name of ["AGENTS.md", "CLAUDE.md"]) {
          fs.appendFileSync(path.join(tempDir, name), "éé");
        }
        const after = yield* observe({ configuredAgents: ["claude-code"] }).pipe(
          withDetailedWork(tracer),
        );
        const second = spans.filter((span) => span.name === "axm.hash.instruction-witness");
        expect(second.map((span) => span.attributes.get("axm.work.count"))).toEqual([1, 2, 2]);
        expect(
          second.map(
            (span, index) =>
              Number(span.attributes.get("axm.work.bytes")) -
              Number(first[index]?.attributes.get("axm.work.bytes")),
          ),
        ).toEqual([0, 4, 4]);
        expect(after.witnesses[0]?.fingerprint).toBe(before.witnesses[0]?.fingerprint);
        expect(after.witnesses[1]?.fingerprint).not.toBe(before.witnesses[1]?.fingerprint);
        expect(after.witnesses[2]?.fingerprint).not.toBe(before.witnesses[2]?.fingerprint);
        expect([...first, ...second].every((span) => span.status._tag === "Ended")).toBe(true);
      }),
    ),
  );

  it.effect("records an unrecorded alias whose bytes already equal the source", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        fs.writeFileSync(path.join(tempDir, "CLAUDE.md"), "# Workspace\n");

        const snapshot = yield* observe({ configuredAgents: ["claude-code"] });
        expect(snapshot.status.items[0]).toMatchObject({
          ownership: "owned-unrecorded-identical",
          observedForm: "copy",
          health: "ok",
        });
        yield* assertInstructionTargetsSafe(snapshot);
        // Recording touches only the lockfile.
        expect(instructionProjectionIsCurrent(snapshot)).toBe(false);
        expect(instructionProjectionEffects(snapshot)).toEqual([]);
        expect(instructionProjectionRecordsRows(snapshot)).toBe(true);

        const result = yield* sync({ configuredAgents: ["claude-code"] });

        expect(result.written).toEqual([]);
        expect(fs.lstatSync(path.join(tempDir, "CLAUDE.md")).isSymbolicLink()).toBe(false);
        expect(fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf-8")).toBe("# Workspace\n");
        expect([...(yield* rows).keys()]).toEqual(["CLAUDE.md"]);
        const after = yield* observe({ configuredAgents: ["claude-code"] });
        expect(after.status.items[0]?.ownership).toBe("owned-current");
        expect(instructionProjectionIsCurrent(after)).toBe(true);
      }),
    ),
  );

  it.effect("never replaces an unowned alias directory", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        fs.mkdirSync(path.join(tempDir, "CLAUDE.md"));
        fs.writeFileSync(path.join(tempDir, "CLAUDE.md", "keep.txt"), "keep\n");

        const result = yield* Effect.result(
          sync({
            configuredAgents: ["claude-code"],
            symlinkSupported: true,
            replaceUnrecorded: true,
          }),
        );

        // Even explicit replacement intent covers only files, never a directory.
        expect(result._tag).toBe("Failure");
        const { status } = yield* observe({
          configuredAgents: ["claude-code"],
          symlinkSupported: true,
        });
        expect(status.items[0]).toMatchObject({
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

  it.effect("names the same changed paths in previews and applied instruction runs", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, ".git"));
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# First\n");
        yield* sync({
          configuredAgents: ["claude-code", "gemini-cli", "junie"],
          config: IGNORED,
          symlinkSupported: false,
        });

        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Second\n");
        fs.rmSync(path.join(tempDir, "GEMINI.md"));
        const agents = ["claude-code", "gemini-cli"];
        const before = yield* observe({
          configuredAgents: agents,
          config: IGNORED,
          symlinkSupported: false,
        });
        const effects = instructionProjectionEffects(before);
        const expectedWritten = effects
          .filter((effect) => effect.change !== "removed")
          .map((effect) => effect.path)
          .sort();
        const expectedRemoved = effects
          .filter((effect) => effect.change === "removed")
          .map((effect) => effect.path)
          .sort();
        expect(expectedWritten).toEqual(
          expect.arrayContaining([
            path.join(tempDir, "CLAUDE.md"),
            path.join(tempDir, "GEMINI.md"),
            path.join(tempDir, ".gitignore"),
          ]),
        );
        expect(expectedRemoved).toContain(path.join(tempDir, ".junie", "AGENTS.md"));

        const preview = yield* sync({
          configuredAgents: agents,
          config: IGNORED,
          symlinkSupported: false,
          dryRun: true,
        });
        expect([...preview.written].sort()).toEqual(expectedWritten);
        expect([...preview.removed].sort()).toEqual(expectedRemoved);
        const applied = yield* sync({
          configuredAgents: agents,
          config: IGNORED,
          symlinkSupported: false,
        });
        expect([...applied.written].sort()).toEqual(expectedWritten);
        expect([...applied.removed].sort()).toEqual(expectedRemoved);

        const removal = yield* observe({
          configuredAgents: agents,
          config: IGNORED,
          symlinkSupported: false,
        });
        const removalEffects = instructionProjectionRemovalEffects(removal);
        const removable = removalEffects
          .filter((effect) => effect.change === "removed")
          .map((effect) => effect.path)
          .sort();
        expect(removalEffects).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ path: path.join(tempDir, ".gitignore"), change: "updated" }),
          ]),
        );
        const removalPreview = yield* removeManagedInstructionTargets({
          snapshot: removal,
          dryRun: true,
        });
        expect([...removalPreview.removed].sort()).toEqual(removable);
        const removalApplied = yield* removeManagedInstructionTargets({
          snapshot: removal,
          dryRun: false,
        });
        expect([...removalApplied.removed].sort()).toEqual(removable);
        expect(
          (yield* removeInstructionsGitignore({
            workspaceRoot: tempDir,
            rows: yield* rows,
            dryRun: true,
          })).path,
        ).toEqual(Option.some(path.join(tempDir, ".gitignore")));
        expect(
          (yield* removeInstructionsGitignore({
            workspaceRoot: tempDir,
            rows: yield* rows,
            dryRun: false,
          })).path,
        ).toEqual(Option.some(path.join(tempDir, ".gitignore")));
      }),
    ),
  );

  it.effect("flags a rewritten copy that was edited since AXM last wrote it", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        yield* sync({ configuredAgents: ["claude-code", "gemini-cli"], symlinkSupported: false });
        fs.writeFileSync(path.join(tempDir, "CLAUDE.md"), "# Edited by hand\n");
        // A hand edit alone is not drift: the recorded generation is current.
        const edited = yield* observe({
          configuredAgents: ["claude-code", "gemini-cli"],
          symlinkSupported: false,
        });
        expect(instructionProjectionEffects(edited)).toEqual([]);

        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace, revised\n");
        const recordedBefore = yield* rows;
        const preview = yield* observe({
          configuredAgents: ["claude-code", "gemini-cli"],
          symlinkSupported: false,
        });
        expect(instructionProjectionEffects(preview)).toEqual([
          { path: path.join(tempDir, "CLAUDE.md"), change: "updated", lastWrite: "modified" },
          { path: path.join(tempDir, "GEMINI.md"), change: "updated", lastWrite: "matches" },
        ]);
        // Observing is pure: no row changes before the write.
        expect(yield* rows).toEqual(recordedBefore);
        // The same effects drive the rewrite when the source changes in the
        // same operation as a preceding region write.
        expect(
          instructionProjectionEffects(edited, [path.join(tempDir, "AGENTS.md")]).find(
            (effect) => effect.path === path.join(tempDir, "CLAUDE.md"),
          ),
        ).toEqual({
          path: path.join(tempDir, "CLAUDE.md"),
          change: "updated",
          lastWrite: "modified",
        });

        yield* sync({ configuredAgents: ["claude-code", "gemini-cli"], symlinkSupported: false });
        expect(fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf-8")).toBe(
          "# Workspace, revised\n",
        );
      }),
    ),
  );

  it.effect("previews an edited stale copy as retained unless modified output is discarded", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        yield* sync({ configuredAgents: ["claude-code", "gemini-cli"], symlinkSupported: false });
        fs.writeFileSync(path.join(tempDir, "CLAUDE.md"), "# Edited by hand\n");

        const preview = yield* observe({ configuredAgents: ["codex"], symlinkSupported: false });
        // The unedited copy is removed; the edited one is retained, and only
        // its row is withdrawn, which writes the lockfile alone.
        expect(instructionProjectionEffects(preview)).toEqual([
          { path: path.join(tempDir, "GEMINI.md"), change: "removed", lastWrite: "matches" },
        ]);
        expect(instructionProjectionRecordsRows(preview)).toBe(true);

        const discarding = yield* observe({
          configuredAgents: ["codex"],
          symlinkSupported: false,
          discardModified: true,
        });
        expect(instructionProjectionEffects(discarding)).toEqual([
          { path: path.join(tempDir, "CLAUDE.md"), change: "removed", lastWrite: "modified" },
          { path: path.join(tempDir, "GEMINI.md"), change: "removed", lastWrite: "matches" },
        ]);

        const result = yield* sync({ configuredAgents: ["codex"], symlinkSupported: false });
        expect(result.removed).toEqual([path.join(tempDir, "GEMINI.md")]);
        expect(fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf-8")).toBe(
          "# Edited by hand\n",
        );
        expect([...(yield* rows).keys()]).toEqual([]);
      }),
    ),
  );

  it.effect("previews an edited copy of a missing source as retained on removal", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        yield* sync({ configuredAgents: ["claude-code", "gemini-cli"], symlinkSupported: false });
        fs.rmSync(path.join(tempDir, "AGENTS.md"));
        fs.writeFileSync(path.join(tempDir, "CLAUDE.md"), "# Edited by hand\n");

        const removal = yield* observe({
          configuredAgents: ["claude-code", "gemini-cli"],
          symlinkSupported: false,
        });
        // Only AXM's last write can show a copy is unedited when its source
        // is gone, so the preview agrees with the deletion guard.
        expect(
          instructionProjectionRemovalEffects(removal).filter(
            (effect) => effect.change === "removed",
          ),
        ).toEqual([
          { path: path.join(tempDir, "GEMINI.md"), change: "removed", lastWrite: "matches" },
        ]);
        const preview = yield* removeManagedInstructionTargets({ snapshot: removal, dryRun: true });
        expect(preview.removed).toEqual([path.join(tempDir, "GEMINI.md")]);
        expect(preview.retained).toEqual([
          { path: path.join(tempDir, "CLAUDE.md"), reason: "modified" },
        ]);
      }),
    ),
  );

  describe("prior-membership route targets", () => {
    /**
     * One observation asked for the prior membership's routes, beside an
     * observation of that membership alone: the routes an agent addition
     * compares against.
     */
    const priorRoutes = (args: {
      readonly configuredAgents: ReadonlyArray<string>;
      readonly priorConfiguredAgents: ReadonlyArray<string>;
      readonly prospectiveRoots?: ReadonlyArray<string>;
    }) =>
      Effect.gen(function* () {
        const recorded = yield* rows;
        const snapshot = yield* observeInstructionProjection({
          workspaceRoot: tempDir,
          scope: "project",
          configuredAgents: args.configuredAgents,
          priorConfiguredAgents: args.priorConfiguredAgents,
          config: TRACKED,
          symlinkSupported: true,
          rows: recorded,
          ...(args.prospectiveRoots === undefined
            ? {}
            : { prospectiveRoots: args.prospectiveRoots }),
        });
        const prior = yield* observeInstructionProjection({
          workspaceRoot: tempDir,
          scope: "project",
          configuredAgents: args.priorConfiguredAgents,
          config: TRACKED,
          symlinkSupported: true,
          rows: recorded,
        });
        return {
          snapshot,
          derived: snapshot.priorRouteTargets,
          observed: prior.plan.items.flatMap((item) =>
            item.action === "skip" ? [] : [item.targetPath],
          ),
        };
      });

    it.effect("keeps a shared native route and every root's routes", () =>
      run(
        Effect.gen(function* () {
          fs.mkdirSync(path.join(tempDir, "docs"));
          fs.mkdirSync(path.join(tempDir, "notes"));
          fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Root\n");
          fs.writeFileSync(path.join(tempDir, "docs", "AGENTS.md"), "# Docs\n");
          fs.writeFileSync(path.join(tempDir, "notes", "AGENTS.md"), "");
          const { derived, observed } = yield* priorRoutes({
            configuredAgents: ["codex", "claude-code", "opencode"],
            priorConfiguredAgents: ["codex", "claude-code"],
          });
          expect(derived).toEqual(observed);
          expect(derived).toEqual([
            path.join(tempDir, "AGENTS.md"),
            path.join(tempDir, "CLAUDE.md"),
            path.join(tempDir, "docs", "AGENTS.md"),
            path.join(tempDir, "docs", "CLAUDE.md"),
            path.join(tempDir, "notes", "AGENTS.md"),
          ]);
        }),
      ),
    );

    it.effect("drops an empty source's alias even at a prospective root", () =>
      run(
        Effect.gen(function* () {
          fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "");
          const { snapshot, derived, observed } = yield* priorRoutes({
            configuredAgents: ["claude-code", "gemini-cli"],
            priorConfiguredAgents: ["claude-code"],
            prospectiveRoots: [tempDir],
          });
          expect(snapshot.status.items.map((item) => item.agentId)).toEqual([
            "claude-code",
            "gemini-cli",
          ]);
          expect(derived).toEqual(observed);
          expect(derived).toEqual([]);
        }),
      ),
    );

    it.effect("ignores a root only an added agent's alias evidences", () =>
      run(
        Effect.gen(function* () {
          fs.writeFileSync(path.join(tempDir, "GEMINI.md"), "# Gemini\n");
          const { snapshot, derived, observed } = yield* priorRoutes({
            configuredAgents: ["claude-code", "gemini-cli"],
            priorConfiguredAgents: ["claude-code"],
          });
          expect(snapshot.plan.roots).toEqual([tempDir]);
          expect(derived).toEqual(observed);
          expect(derived).toEqual([]);
        }),
      ),
    );

    it.effect("keeps a prior agent's recorded route without a source", () =>
      run(
        Effect.gen(function* () {
          fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Root\n");
          yield* sync({ configuredAgents: ["claude-code"], symlinkSupported: false });
          fs.rmSync(path.join(tempDir, "AGENTS.md"));
          fs.rmSync(path.join(tempDir, "CLAUDE.md"));
          const { derived, observed } = yield* priorRoutes({
            configuredAgents: ["claude-code", "gemini-cli"],
            priorConfiguredAgents: ["claude-code"],
          });
          expect(derived).toEqual(observed);
          expect(derived).toEqual([path.join(tempDir, "CLAUDE.md")]);
        }),
      ),
    );

    it.effect("ignores a root only an added agent's recorded route adds", () =>
      run(
        Effect.gen(function* () {
          fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Root\n");
          yield* sync({ configuredAgents: ["gemini-cli"], symlinkSupported: false });
          fs.rmSync(path.join(tempDir, "AGENTS.md"));
          fs.rmSync(path.join(tempDir, "GEMINI.md"));
          const { snapshot, derived, observed } = yield* priorRoutes({
            configuredAgents: ["claude-code", "gemini-cli"],
            priorConfiguredAgents: ["claude-code"],
          });
          expect(snapshot.plan.roots).toEqual([tempDir]);
          expect(derived).toEqual(observed);
          expect(derived).toEqual([]);
        }),
      ),
    );

    it.effect("ignores a prospective root without a source", () =>
      run(
        Effect.gen(function* () {
          const { snapshot, derived, observed } = yield* priorRoutes({
            configuredAgents: ["claude-code", "gemini-cli"],
            priorConfiguredAgents: ["claude-code"],
            prospectiveRoots: [tempDir],
          });
          expect(snapshot.plan.roots).toEqual([tempDir]);
          expect(derived).toEqual(observed);
          expect(derived).toEqual([]);
        }),
      ),
    );

    it.effect("derives nothing for a prior agent that is no longer configured", () =>
      run(
        Effect.gen(function* () {
          fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Root\n");
          const { derived, observed } = yield* priorRoutes({
            configuredAgents: ["claude-code"],
            priorConfiguredAgents: ["gemini-cli"],
          });
          expect(derived).toBeUndefined();
          expect(observed).toEqual([path.join(tempDir, "GEMINI.md")]);
        }),
      ),
    );
  });

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
          fs.mkdirSync(nested, { recursive: true });
          fs.writeFileSync(path.join(nested, "axm.json"), "{}\n");
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

  it.effect("preserves indirect aliases inside an agent configuration directory", () =>
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
          "# axm:instruction-aliases\n/.junie/AGENTS.md\n/.junie/CLAUDE.md\n/CLAUDE.md\n# /axm:instruction-aliases\n",
        );

        const result = yield* sync({
          configuredAgents: ["claude-code", "junie"],
          config: IGNORED,
          symlinkSupported: true,
        });

        expect(result.removed).toEqual([]);
        expect(fs.readlinkSync(path.join(tempDir, ".junie", "CLAUDE.md"))).toBe("AGENTS.md");
        expect(fs.readlinkSync(path.join(tempDir, ".junie", "AGENTS.md"))).toBe(
          path.join("..", "AGENTS.md"),
        );
        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf8")).toBe(
          "# axm:instruction-aliases\n/.junie/AGENTS.md\n/CLAUDE.md\n# /axm:instruction-aliases\n",
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

          const result = yield* reconcile({
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
          const malformed = "# axm:instruction-aliases\n/CLAUDE.md\n";
          fs.writeFileSync(path.join(tempDir, ".gitignore"), malformed);

          const refused = yield* Effect.result(
            reconcile({
              workspaceRoot: tempDir,
              scope: "project",
              configuredAgents: ["claude-code"],
              config: IGNORED,
              symlinkSupported: true,
            }),
          );

          expect(refused._tag).toBe("Failure");
          if (refused._tag === "Failure") {
            const failure = expectMaintenanceFailed(refused.failure);
            expect(failure.category).toBe("conflict");
            expect(failure.detail).toContain("malformed AXM region fences");
          }
          expect(fs.existsSync(path.join(tempDir, "CLAUDE.md"))).toBe(false);
          expect(fs.readlinkSync(path.join(tempDir, "GEMINI.md"))).toBe("AGENTS.md");
          expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf8")).toBe(malformed);
        }),
      ),
  );

  it.effect("treats an old in-file banner as ordinary unrecorded content", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        // Inline text grants no authority; only a recorded row does.
        const authored =
          "<!-- axm:file v=1 ext=@agentxm/instructions/alias src=AGENTS.md -->\n\n# Old copy\n";
        fs.writeFileSync(path.join(tempDir, "CLAUDE.md"), authored);

        const { status } = yield* observe({
          configuredAgents: ["claude-code"],
          symlinkSupported: false,
        });
        expect(status.items[0]).toMatchObject({ health: "drift", ownership: "unowned" });

        const result = yield* Effect.result(
          sync({ configuredAgents: ["claude-code"], symlinkSupported: false }),
        );

        expect(result._tag).toBe("Failure");
        expect(fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf-8")).toBe(authored);
      }),
    ),
  );

  it.effect("removes stale copies by their recorded rows alone", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        yield* sync({ configuredAgents: ["claude-code", "gemini-cli"], symlinkSupported: false });
        // A file AXM has no record of writing is not residue, even at an alias
        // name and even when it carries old in-file markers.
        fs.writeFileSync(
          path.join(tempDir, "IFLOW.md"),
          "<!-- axm:file v=1 ext=@acme/skills/demo src=agent_extensions/@acme/skills/demo/src/SKILL.md -->\n\n# Demo\n",
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

  it.effect("retains a modified stale copy unless modified copies are discarded", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        yield* sync({ configuredAgents: ["claude-code", "gemini-cli"], symlinkSupported: false });
        fs.writeFileSync(path.join(tempDir, "GEMINI.md"), "# Workspace\n\nLocal note\n");

        const kept = yield* sync({
          configuredAgents: ["claude-code"],
          symlinkSupported: false,
        }).pipe(Effect.provideService(ProjectionOutputPosture, { discardModified: false }));
        expect(kept.removed).toEqual([]);
        expect(kept.retained).toEqual([
          { path: path.join(tempDir, "GEMINI.md"), reason: "modified" },
        ]);
        expect(
          kept.nativeLocations.find((location) =>
            location.aliases.includes(path.join(tempDir, "GEMINI.md")),
          ),
        ).toMatchObject({
          state: "retained",
          reason: expect.stringContaining("--discard-modified"),
        });
        expect(fs.readFileSync(path.join(tempDir, "GEMINI.md"), "utf-8")).toContain("Local note");
        // The row is withdrawn either way, so the retained file is no longer AXM's.
        expect([...(yield* rows).keys()]).toEqual(["CLAUDE.md"]);
        const after = yield* observe({
          configuredAgents: ["claude-code"],
          symlinkSupported: false,
        });
        expect(after.status.staleTargets).toEqual([]);
        expect(instructionProjectionIsCurrent(after)).toBe(true);
      }),
    ),
  );

  it.effect("discards a modified recorded copy on explicit intent", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        yield* sync({ configuredAgents: ["claude-code", "gemini-cli"], symlinkSupported: false });
        fs.writeFileSync(path.join(tempDir, "GEMINI.md"), "# Workspace\n\nLocal note\n");

        const snapshot = yield* observe({
          configuredAgents: ["claude-code"],
          symlinkSupported: false,
          discardModified: true,
        });
        const removal = yield* removeManagedInstructionTargets({ snapshot, dryRun: false });

        expect([...removal.removed].sort()).toEqual(
          [path.join(tempDir, "CLAUDE.md"), path.join(tempDir, "GEMINI.md")].sort(),
        );
        expect(removal.retained).toEqual([]);
        expect(removal.rowChanges.map((change) => [change.path, change.row])).toEqual([
          ["CLAUDE.md", undefined],
          ["GEMINI.md", undefined],
        ]);
      }),
    ),
  );

  it.effect("withdraws a recorded row whose copy is gone", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        yield* sync({ configuredAgents: ["claude-code"], symlinkSupported: false });
        fs.rmSync(path.join(tempDir, "CLAUDE.md"));

        const orphaned = yield* observe({ configuredAgents: [], symlinkSupported: false });
        expect(orphaned.orphanRows).toEqual(["CLAUDE.md"]);
        expect(instructionProjectionIsCurrent(orphaned)).toBe(false);
        expect(instructionProjectionEffects(orphaned)).toEqual([]);

        yield* sync({ configuredAgents: [], symlinkSupported: false });
        expect((yield* rows).size).toBe(0);
      }),
    ),
  );

  it.effect("withdraws a .gitignore row whose region is gone without writing the file", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, ".git"));
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        yield* sync({ configuredAgents: ["claude-code"], config: IGNORED });
        expect([...(yield* rows).keys()]).toContain(".gitignore");
        // The region is removed by hand while no alias is ignored any more.
        fs.writeFileSync(path.join(tempDir, ".gitignore"), "node_modules/\n");

        const orphaned = yield* observe({ configuredAgents: ["claude-code"], config: TRACKED });
        expect(orphaned.gitignore.current).toBe(true);
        expect(orphaned.orphanRows).toContain(".gitignore");
        expect(instructionProjectionEffects(orphaned).map((effect) => effect.path)).not.toContain(
          path.join(tempDir, ".gitignore"),
        );

        yield* sync({ configuredAgents: ["claude-code"], config: TRACKED });
        expect([...(yield* rows).keys()]).not.toContain(".gitignore");
        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf-8")).toBe("node_modules/\n");
      }),
    ),
  );

  it.effect("records an identical unrecorded copy before its source changes", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        fs.writeFileSync(path.join(tempDir, "CLAUDE.md"), "# Workspace\n");
        const before = yield* observe({
          configuredAgents: ["claude-code"],
          symlinkSupported: false,
        });
        yield* stage(yield* recordIdenticalInstructionCopies(before));
        expect([...(yield* rows).keys()]).toEqual(["CLAUDE.md"]);
        expect(fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf-8")).toBe("# Workspace\n");

        // The source changes; the recorded copy is now refreshed, not refused.
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n\nMore\n");
        const after = yield* observe({
          configuredAgents: ["claude-code"],
          symlinkSupported: false,
        });
        expect(byTarget(after.status.items, path.join(tempDir, "CLAUDE.md"))?.lastWrite).toBe(
          "matches",
        );
        yield* sync({ configuredAgents: ["claude-code"], symlinkSupported: false });
        expect(fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf-8")).toBe(
          "# Workspace\n\nMore\n",
        );
      }),
    ),
  );

  it.effect("records the alias region once and then decides currency from the row", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, ".git"));
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        fs.writeFileSync(
          path.join(tempDir, ".gitignore"),
          "# axm:instruction-aliases\n/CLAUDE.md\n# /axm:instruction-aliases\n",
        );

        const unrecorded = yield* observe({ configuredAgents: ["claude-code"], config: IGNORED });
        expect(unrecorded.gitignore.current).toBe(false);
        yield* sync({ configuredAgents: ["claude-code"], config: IGNORED });
        expect([...(yield* rows).keys()]).toContain(".gitignore");

        // A reformatted region body stays current: bytes are never compared.
        fs.writeFileSync(
          path.join(tempDir, ".gitignore"),
          "# axm:instruction-aliases\n/CLAUDE.md   \n# /axm:instruction-aliases\n",
        );
        const formatted = yield* observe({ configuredAgents: ["claude-code"], config: IGNORED });
        expect(formatted.gitignore.current).toBe(true);
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
          reconcile({
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
        expect([...removed.removed].sort()).toEqual(
          [path.join(tempDir, "CLAUDE.md"), path.join(tempDir, "GEMINI.md")].sort(),
        );
        const result = yield* reconcile({
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

  it.effect("requires source evidence before diagnosing a missing canonical file", () =>
    run(
      Effect.gen(function* () {
        const absent = yield* observe({
          configuredAgents: ["claude-code"],
          symlinkSupported: true,
        });
        expect(absent.status.roots).toEqual([]);
        expect(absent.status.missingSources).toEqual([]);
        expect(absent.status.items).toEqual([]);
        fs.symlinkSync("AGENTS.md", path.join(tempDir, "CLAUDE.md"));
        const required = yield* observe({
          configuredAgents: ["claude-code"],
          symlinkSupported: true,
        });
        expect(required.status.missingSources).toEqual([path.join(tempDir, "AGENTS.md")]);
        expect(required.status.items[0]).toMatchObject({
          health: "missing-source",
          observedForm: "broken-link",
        });
      }),
    ),
  );

  it.effect("retires only aliases of explicitly withdrawn, absent sources", () =>
    run(
      Effect.gen(function* () {
        const source = path.join(tempDir, "AGENTS.md");
        const target = path.join(tempDir, "CLAUDE.md");
        fs.symlinkSync("AGENTS.md", target);
        const args = {
          workspaceRoot: tempDir,
          scope: "project" as const,
          configuredAgents: ["claude-code"],
          config: TRACKED,
          symlinkSupported: true,
          withdrawnSources: [source],
          rows: yield* rows,
          dryRun: false,
        };
        const withdrawn = yield* syncInstructions(args);
        expect(withdrawn.removed).toContain(target);
        expect(fs.readdirSync(tempDir)).not.toContain("CLAUDE.md");
        fs.writeFileSync(source, "Retained authored prose.\n");
        yield* syncInstructions(args);
        expect(fs.readFileSync(target, "utf8")).toBe("Retained authored prose.\n");
        expect(fs.readFileSync(source, "utf8")).toBe("Retained authored prose.\n");
      }),
    ),
  );

  it.effect(
    "preserves existing empty instruction files without creating or adopting empty aliases",
    () =>
      run(
        Effect.gen(function* () {
          fs.writeFileSync(path.join(tempDir, "CLAUDE.md"), "");
          const emptyAlias = yield* sync({
            configuredAgents: ["claude-code"],
            symlinkSupported: true,
          });
          expect(emptyAlias.written).toEqual([]);
          expect(emptyAlias.rowChanges).toEqual([]);
          expect(emptyAlias.snapshot.status.missingSources).toEqual([]);
          expect(fs.existsSync(path.join(tempDir, "AGENTS.md"))).toBe(false);
          fs.rmSync(path.join(tempDir, "CLAUDE.md"));
          fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "");
          const first = yield* sync({ configuredAgents: ["claude-code"], symlinkSupported: true });
          expect(first.written).toEqual([]);
          expect(first.rowChanges).toEqual([]);
          expect(fs.existsSync(path.join(tempDir, "CLAUDE.md"))).toBe(false);
          fs.writeFileSync(path.join(tempDir, "CLAUDE.md"), "");
          const second = yield* sync({ configuredAgents: ["claude-code"], symlinkSupported: true });
          expect(second.written).toEqual([]);
          expect(second.removed).toEqual([]);
          expect(second.rowChanges).toEqual([]);
          expect(fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf8")).toBe("");
        }),
      ),
  );

  it.effect("reports native rules directories AXM does not sync", () =>
    run(
      Effect.gen(function* () {
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

        const { status } = yield* observe({
          // cursor: agents-md plus a secondary native rules directory.
          // cline: rules-dir, which AXM resolves to the unwritten adapter path.
          // codex: agents-md with no secondary directory.
          configuredAgents: ["cursor", "cline", "codex"],
        });
        const detailsById = new Map(status.items.map((item) => [item.agentId, item.details]));

        expect(detailsById.get("cursor")).toBe(
          "Instruction file is current. Native rules directories .cursor/rules are not synced by AXM.",
        );
        expect(detailsById.get("cline")).toBe(
          "The declared native rules directory is not yet synced by AXM.",
        );
        expect(detailsById.get("codex")).toBe("Instruction file is current.");

        // Reporting is parity work only: the adapter mechanism stays unbuilt, so
        // rules-dir agents keep reporting unsupported and nothing is written.
        expect(status.items.find((item) => item.agentId === "cline")).toMatchObject({
          health: "unsupported",
          ownership: "absent",
          observedForm: "none",
        });
        expect(fs.existsSync(path.join(tempDir, ".clinerules"))).toBe(false);
        expect(fs.existsSync(path.join(tempDir, ".cursor"))).toBe(false);
      }),
    ),
  );

  it("carries every catalog secondary rules directory onto the descriptor", () => {
    const secondary = Object.values(AGENT_DESCRIPTORS).flatMap((descriptor) => {
      const instructions = descriptor.instructions;
      if (instructions === undefined || instructions.kind === "rules-dir") return [];
      return instructions.locations
        .filter(
          (location) =>
            location.scope === "project" &&
            location.role === "additional" &&
            location.shape === "directory",
        )
        .map((location) => [descriptor.id, location.path]);
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
      "tabnine-cli": ".tabnine/guidelines",
    });
  });

  it.effect("removes the managed gitignore block when gitignoreAliases is disabled", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, ".git"));
        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

        yield* sync({ configuredAgents: ["claude-code"], config: IGNORED });
        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf-8")).toContain(
          "# axm:instruction-aliases",
        );

        yield* sync({ configuredAgents: ["claude-code"], config: TRACKED });

        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf-8")).not.toContain(
          "# axm:instruction-aliases",
        );
      }),
    ),
  );

  it.effect("preserves gitignore bytes outside the managed block", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, ".git"));
        const before =
          "dist/  \r\n\r\n# axm:instruction-aliases\r\n**/OLD.md\r\n# /axm:instruction-aliases\r\n\r\n# keep  \r\n";
        fs.writeFileSync(path.join(tempDir, ".gitignore"), before);

        fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
        yield* sync({ configuredAgents: ["claude-code"], config: IGNORED, symlinkSupported: true });

        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf-8")).toBe(
          "dist/  \r\n\r\n# axm:instruction-aliases\r\n/CLAUDE.md\r\n# /axm:instruction-aliases\r\n\r\n# keep  \r\n",
        );

        yield* removeInstructionsGitignore({
          workspaceRoot: tempDir,
          rows: yield* rows,
          dryRun: false,
        });

        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf-8")).toBe(
          "dist/  \r\n\r\n\r\n# keep  \r\n",
        );
      }),
    ),
  );

  it.effect("refuses to overwrite malformed gitignore region fences", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(path.join(tempDir, ".git"));
        const malformed = "dist/\n# axm:instruction-aliases\n**/CLAUDE.md\n";
        fs.writeFileSync(path.join(tempDir, ".gitignore"), malformed);

        const result = yield* Effect.result(
          sync({ configuredAgents: ["claude-code"], config: IGNORED, symlinkSupported: true }),
        );

        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          const failure = expectMaintenanceFailed(result.failure);
          expect(failure.category).toBe("conflict");
          expect(failure.detail).toContain("malformed AXM region fences");
        }
        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf-8")).toBe(malformed);
      }),
    ),
  );
});

/**
 * The live insertion authority over a recording filesystem, counting store
 * lock acquisitions beneath it and the authority operations callers make.
 */
const countedAuthority = (root: string) => {
  const acquisitions: Array<string> = [];
  const operations: Array<string> = [];
  const locks = Layer.effect(
    WorkspaceFileWriteLocks,
    Effect.map(WorkspaceFileWriteLocks, (inner) =>
      WorkspaceFileWriteLocks.of({
        withLock: (target, effect) =>
          Effect.suspend(() => {
            acquisitions.push(target);
            return inner.withLock(target, effect);
          }),
      }),
    ),
  ).pipe(Layer.provide(WorkspaceFileWriteLocksLive));
  const counted =
    <Args extends ReadonlyArray<unknown>, A, E, R>(
      name: string,
      operation: (...args: Args) => Effect.Effect<A, E, R>,
    ) =>
    (...args: Args) =>
      Effect.suspend(() => {
        operations.push(name);
        return operation(...args);
      });
  const authority = Layer.effect(
    NativeWriteAuthority,
    Effect.map(NativeWriteAuthority, (inner) =>
      NativeWriteAuthority.of({
        ...inner,
        captureInsertion: counted("captureInsertion", inner.captureInsertion),
        resolveInsertions: counted("resolveInsertions", inner.resolveInsertions),
        withdrawInsertions: counted("withdrawInsertions", inner.withdrawInsertions),
        retireInsertion: counted("retireInsertion", inner.retireInsertion),
        forgetInsertion: counted("forgetInsertion", inner.forgetInsertion),
        forgetInsertions: counted("forgetInsertions", inner.forgetInsertions),
      }),
    ),
  ).pipe(
    Layer.provide(NativeWriteAuthorityLive),
    Layer.provide(Layer.merge(WorkspaceReadTest({ baseDir: root }), locks)),
  );
  return {
    layer: authority.pipe(Layer.provideMerge(layerRecordingFileSystem(NodeServices.layer))),
    locks: (target: string) => acquisitions.filter((acquired) => acquired === target).length,
    operations: () => [...operations],
    reset: () => {
      acquisitions.length = 0;
      operations.length = 0;
    },
  };
};

describe("instruction ignore-pattern withdrawal through the live authority", () => {
  const NO_ROWS = new Map();
  /** A git workspace whose ignore file routes three agents' instruction aliases. */
  const routedWorkspace = (baseline: string | undefined) =>
    Effect.gen(function* () {
      const files = yield* EffectFileSystem.FileSystem;
      const root = yield* files.realPath(yield* files.makeTempDirectoryScoped());
      yield* files.makeDirectory(path.join(root, ".git"));
      yield* files.writeFileString(path.join(root, "AGENTS.md"), "source\n");
      if (baseline !== undefined)
        yield* files.writeFileString(path.join(root, ".gitignore"), baseline);
      const configuredAgents = ["claude-code", "gemini-cli", "junie"];
      const args = {
        workspaceRoot: root,
        scope: "project" as const,
        config: IGNORED,
        symlinkSupported: true,
        rows: NO_ROWS,
      };
      return {
        root,
        args,
        configuredAgents,
        gitignore: path.join(root, ".gitignore"),
        store: path.join(root, ".axm", "projection-containers.json"),
      };
    });

  it.effect("forgets every removed pattern in one store update", () =>
    Effect.gen(function* () {
      const workspace = yield* routedWorkspace("dist/\n");
      const counted = countedAuthority(workspace.root);
      yield* Effect.gen(function* () {
        const files = yield* EffectFileSystem.FileSystem;
        const recording = yield* FileSystemRecorder;
        yield* syncInstructions({
          ...workspace.args,
          configuredAgents: workspace.configuredAgents,
          eligibleAgentIds: workspace.configuredAgents,
          dryRun: false,
        });
        const routed = yield* files.readFileString(workspace.gitignore);
        expect(routed.match(/^\/.+$/gmu)).toHaveLength(3);
        recording.reset();
        counted.reset();
        yield* removeInstructionsGitignore({
          workspaceRoot: workspace.root,
          rows: NO_ROWS,
          dryRun: false,
        });
        expect(yield* files.readFileString(workspace.gitignore)).toBe("dist/\n");
        expect({
          operations: counted.operations(),
          // One update for the restoring record and one for all three forgets.
          storeLocks: counted.locks(workspace.store),
          storeReads: recording.calls({ path: workspace.store, method: "readFile" }).length,
          storeTempWrites: recording
            .calls({ method: "writeFile" })
            .filter(({ path: written }) => written.startsWith(`${workspace.store}.tmp.`)).length,
          gitignoreLeaf: recording.calls({ path: workspace.gitignore, method: "readLink" }).length,
        }).toEqual({
          operations: ["withdrawInsertions", "captureInsertion", "forgetInsertions"],
          storeLocks: 2,
          // The withdrawal gate, the capture, and one locked read per update.
          storeReads: 4,
          storeTempWrites: 2,
          // One entry-mode forget admission among the withdrawal and publication work.
          gitignoreLeaf: 19,
        });
      }).pipe(Effect.provide(counted.layer));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("forgets a replaced pattern in the call that renders its replacement", () =>
    Effect.gen(function* () {
      const workspace = yield* routedWorkspace("dist/\n");
      const counted = countedAuthority(workspace.root);
      yield* Effect.gen(function* () {
        const files = yield* EffectFileSystem.FileSystem;
        const sync = (configuredAgents: ReadonlyArray<string>) =>
          syncInstructions({
            ...workspace.args,
            configuredAgents,
            eligibleAgentIds: configuredAgents,
            dryRun: false,
          });
        const ignoreUnits = Effect.map(
          readContainerReceipts(path.join(workspace.root, ".axm")),
          ({ entries }) =>
            entries
              .filter(({ identity }) => identity.physicalPath === workspace.gitignore)
              .map(({ kind, unit }) => `${kind}:${unit}`),
        );
        yield* sync(["claude-code", "junie"]);
        expect(yield* ignoreUnits).toEqual([
          'inserted-key:["instruction-ignore-pattern","/.junie/AGENTS.md"]',
          'inserted-key:["instruction-ignore-pattern","/CLAUDE.md"]',
        ]);
        counted.reset();
        yield* sync(["claude-code", "gemini-cli"]);
        const ignored = yield* files.readFileString(workspace.gitignore);
        expect(ignored).toContain("/GEMINI.md");
        expect(ignored).not.toContain("/.junie/AGENTS.md");
        // The in-place replacement publishes, then forgets the removed pattern.
        expect(counted.operations()).toEqual(["captureInsertion", "forgetInsertions"]);
        expect(yield* ignoreUnits).toEqual([
          'inserted-key:["instruction-ignore-pattern","/CLAUDE.md"]',
        ]);
      }).pipe(Effect.provide(counted.layer));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("resolves only and changes nothing when a dry run removes patterns", () =>
    Effect.gen(function* () {
      const workspace = yield* routedWorkspace(undefined);
      const counted = countedAuthority(workspace.root);
      yield* Effect.gen(function* () {
        const files = yield* EffectFileSystem.FileSystem;
        const recording = yield* FileSystemRecorder;
        yield* syncInstructions({
          ...workspace.args,
          configuredAgents: workspace.configuredAgents,
          eligibleAgentIds: workspace.configuredAgents,
          dryRun: false,
        });
        const before = {
          gitignore: yield* files.readFileString(workspace.gitignore),
          store: yield* files.readFileString(workspace.store),
        };
        recording.reset();
        counted.reset();
        yield* syncInstructions({
          ...workspace.args,
          configuredAgents: ["claude-code"],
          dryRun: true,
        });
        expect({
          operations: counted.operations(),
          storeWrites: recording
            .calls({ method: "writeFile" })
            .filter(({ path: written }) => written.startsWith(workspace.store)).length,
          gitignoreWrites: recording.writes(workspace.gitignore),
        }).toEqual({ operations: ["resolveInsertions"], storeWrites: 0, gitignoreWrites: 0 });
        expect({
          gitignore: yield* files.readFileString(workspace.gitignore),
          store: yield* files.readFileString(workspace.store),
        }).toEqual(before);
      }).pipe(Effect.provide(counted.layer));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );
});

/**
 * Work one instruction call repeats on the same admitted file. Counts are exact
 * for these fixtures: a real temporary workspace observed through a recording
 * filesystem, reset after setup.
 */
describe("instruction projection reads each prepared input once", () => {
  const NO_ROWS = new Map();
  const WITNESS_HASH = "axm.hash.instruction-witness";

  /** A real workspace whose canonical source is `AGENTS.md`, observed through a recording filesystem. */
  const workspace = (files: {
    readonly git?: boolean;
    readonly links?: Readonly<Record<string, string>>;
    readonly copies?: ReadonlyArray<string>;
  }) =>
    Effect.gen(function* () {
      const host = yield* EffectFileSystem.FileSystem;
      const root = yield* host.realPath(yield* host.makeTempDirectoryScoped());
      if (files.git === true) yield* host.makeDirectory(path.join(root, ".git"));
      yield* host.writeFileString(path.join(root, "AGENTS.md"), "# Workspace\n");
      for (const [link, target] of Object.entries(files.links ?? {}))
        yield* host.symlink(target, path.join(root, link));
      for (const copy of files.copies ?? [])
        yield* host.writeFileString(path.join(root, copy), "# Workspace\n");
      return {
        root,
        source: path.join(root, "AGENTS.md"),
        gitignore: path.join(root, ".gitignore"),
        git: path.join(root, ".git"),
      };
    });

  const observeAt = (
    root: string,
    args: {
      readonly configuredAgents: ReadonlyArray<string>;
      readonly config?: ResolvedInstructionsConfig;
      readonly symlinkSupported: boolean;
    },
  ) =>
    observeInstructionProjection({
      workspaceRoot: root,
      scope: "project",
      configuredAgents: args.configuredAgents,
      config: args.config ?? TRACKED,
      symlinkSupported: args.symlinkSupported,
      rows: NO_ROWS,
    });

  const recorded = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provide(layerRecordingFileSystem(NodeServices.layer)),
      Effect.scoped,
      Effect.provide(
        Layer.mergeAll(NativeWriteAuthorityPermissive, NativePlatformTest, CanonicalNativePathLive),
      ),
    );

  const witnessHashes = (facts: ReadonlyArray<{ readonly kind: string }>) =>
    facts.filter((fact) => fact.kind === WITNESS_HASH).length;

  it.effect("reads each admitted referent once in one observation", () =>
    recorded(
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const ws = yield* workspace({ links: { "CLAUDE.md": "AGENTS.md" }, copies: ["GEMINI.md"] });
        const observations = workObservations(false);
        recording.reset();
        const snapshot = yield* observeAt(ws.root, {
          configuredAgents: ["claude-code", "gemini-cli"],
          symlinkSupported: true,
        }).pipe(observations.provide);
        expect(
          snapshot.status.items.map((item) => [item.agentId, item.ownership, item.observedForm]),
        ).toEqual([
          ["claude-code", "owned-current", "symlink"],
          ["gemini-cli", "owned-unrecorded-identical", "copy"],
        ]);
        expect({
          source: recording.contentReads(ws.source),
          copy: recording.contentReads(path.join(ws.root, "GEMINI.md")),
          witnessHashes: witnessHashes(observations.facts),
        }).toEqual({ source: 1, copy: 1, witnessHashes: 4 });
      }),
    ),
  );

  it.effect("derives the prior membership's route targets from one observation", () =>
    recorded(
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const ws = yield* workspace({ links: { "CLAUDE.md": "AGENTS.md" } });
        const priorConfiguredAgents = ["claude-code"];
        // What a step planning an agent addition needs: the prior membership's
        // route targets, from the observation itself when it can derive them,
        // otherwise from a second observation of the prior membership.
        const priorTargets = (snapshot: InstructionProjectionSnapshot) =>
          snapshot.priorRouteTargets === undefined
            ? observeAt(ws.root, {
                configuredAgents: priorConfiguredAgents,
                symlinkSupported: true,
              }).pipe(
                Effect.map((prior) =>
                  prior.plan.items.flatMap((item) =>
                    item.action === "skip" ? [] : [item.targetPath],
                  ),
                ),
              )
            : Effect.succeed(snapshot.priorRouteTargets);
        recording.reset();
        const snapshot = yield* observeInstructionProjection({
          workspaceRoot: ws.root,
          scope: "project",
          configuredAgents: ["claude-code", "gemini-cli"],
          priorConfiguredAgents,
          config: TRACKED,
          symlinkSupported: true,
          rows: NO_ROWS,
        });
        const targets = yield* priorTargets(snapshot);
        const counted = {
          rootListings: recording.counts(ws.root).readDirectory ?? 0,
          sourceReads: recording.contentReads(ws.source),
        };
        recording.reset();
        // The same observation without a prior membership does the same work.
        const unasked = yield* observeAt(ws.root, {
          configuredAgents: ["claude-code", "gemini-cli"],
          symlinkSupported: true,
        });
        const unaskedCounts = {
          rootListings: recording.counts(ws.root).readDirectory ?? 0,
          sourceReads: recording.contentReads(ws.source),
        };
        const independent = yield* observeAt(ws.root, {
          configuredAgents: priorConfiguredAgents,
          symlinkSupported: true,
        });
        expect(targets).toEqual([path.join(ws.root, "CLAUDE.md")]);
        expect(targets).toEqual(
          independent.plan.items.flatMap((item) =>
            item.action === "skip" ? [] : [item.targetPath],
          ),
        );
        expect("priorRouteTargets" in unasked).toBe(false);
        expect({ counted, unaskedCounts }).toEqual({
          // One observation lists the workspace root five times, during its
          // discovery walk and its route checks, and reads the source once.
          counted: { rootListings: 5, sourceReads: 1 },
          unaskedCounts: { rootListings: 5, sourceReads: 1 },
        });
      }),
    ),
  );

  it.effect("admits a source shared by planned items once in one observation", () =>
    recorded(
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const ws = yield* workspace({});
        const observations = workObservations(false);
        recording.reset();
        const snapshot = yield* observeAt(ws.root, {
          configuredAgents: ["claude-code", "gemini-cli"],
          symlinkSupported: true,
        }).pipe(observations.provide);
        expect(
          snapshot.status.items.map((item) => [item.agentId, item.health, item.ownership]),
        ).toEqual([
          ["claude-code", "missing-target", "absent"],
          ["gemini-cli", "missing-target", "absent"],
        ]);
        expect(snapshot.status.missingSources).toEqual([]);
        expect({
          // One admission shared by both planned items and the missing-source
          // check, then the source witness's own entry and content admissions.
          source: recording.counts(ws.source),
          contentReads: recording.contentReads(ws.source),
          witnessHashes: witnessHashes(observations.facts),
        }).toEqual({
          source: { readFile: 1, readLink: 6, realPath: 5, stat: 6 },
          contentReads: 1,
          witnessHashes: 4,
        });
      }),
    ),
  );

  for (const [name, arrange] of [
    [
      "an escaping link",
      (source: string, outside: string) => {
        fs.rmSync(source);
        fs.writeFileSync(path.join(outside, "AGENTS.md"), "# Foreign\n");
        fs.symlinkSync(path.join(outside, "AGENTS.md"), source);
      },
    ],
    [
      "a hard link",
      (source: string, outside: string) => fs.linkSync(source, path.join(outside, "AGENTS.md")),
    ],
  ] as const)
    it.effect(`reports a source with ${name} missing for every planned item`, () =>
      recorded(
        Effect.gen(function* () {
          const host = yield* EffectFileSystem.FileSystem;
          const recording = yield* FileSystemRecorder;
          const ws = yield* workspace({});
          const outside = yield* host.realPath(yield* host.makeTempDirectoryScoped());
          arrange(ws.source, outside);
          recording.reset();
          const snapshot = yield* observeAt(ws.root, {
            configuredAgents: ["claude-code", "gemini-cli"],
            symlinkSupported: true,
          });
          expect(snapshot.status.items.map((item) => [item.agentId, item.health])).toEqual([
            ["claude-code", "missing-source"],
            ["gemini-cli", "missing-source"],
          ]);
          expect(snapshot.status.missingSources).toEqual([ws.source]);
          expect(recording.contentReads(ws.source)).toBe(0);
        }),
      ),
    );

  it.effect("admits a user-scope source separately for the missing-source check", () =>
    recorded(
      Effect.gen(function* () {
        const host = yield* EffectFileSystem.FileSystem;
        const home = yield* host.realPath(yield* host.makeTempDirectoryScoped());
        const configRoot = yield* host.realPath(yield* host.makeTempDirectoryScoped());
        const external = path.join(configRoot, "AGENTS.md");
        yield* host.writeFileString(external, "# User\n");
        yield* host.symlink(external, path.join(home, "AGENTS.md"));
        const snapshot = yield* observeInstructionProjection({
          workspaceRoot: home,
          scope: "user",
          nativeDirectoryInputs: {
            skillsDirectoryOverrides: {},
            userConfigRootOverrides: { "claude-code": configRoot },
          },
          configuredAgents: ["claude-code"],
          config: TRACKED,
          symlinkSupported: false,
          rows: NO_ROWS,
        });
        // The planned item reads the source through the declared config root;
        // the workspace-only missing-source admission refuses the same link.
        expect(snapshot.status.items.map((item) => item.health)).toEqual(["missing-target"]);
        expect(snapshot.status.missingSources).toEqual([path.join(home, "AGENTS.md")]);
      }),
    ),
  );

  for (const mechanism of ["symlink", "copy"] as const)
    it.effect(`publishes the bytes its own witness verified for a ${mechanism} target`, () =>
      recorded(
        Effect.gen(function* () {
          const recording = yield* FileSystemRecorder;
          const ws = yield* workspace({});
          const snapshot = yield* observeAt(ws.root, {
            configuredAgents: ["claude-code"],
            symlinkSupported: mechanism === "symlink",
          });
          const observations = workObservations(false);
          recording.reset();
          const applied = yield* applyInstructionProjection({
            workspaceRoot: ws.root,
            config: TRACKED,
            snapshot,
            dryRun: false,
          }).pipe(observations.provide);
          const target = path.join(ws.root, "CLAUDE.md");
          expect(applied.written).toEqual([target]);
          expect(fs.lstatSync(target).isSymbolicLink()).toBe(mechanism === "symlink");
          expect(fs.readFileSync(target, "utf-8")).toBe("# Workspace\n");
          expect({
            // Prepare's re-observation, the whole-snapshot witness, and the
            // per-target witness whose bytes are published.
            source: recording.contentReads(ws.source),
            witnessHashes: witnessHashes(observations.facts),
          }).toEqual({ source: 3, witnessHashes: 5 });
        }),
      ),
    );

  it.effect("records an identical copy from the bytes its own witness verified", () =>
    recorded(
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const ws = yield* workspace({ copies: ["CLAUDE.md"] });
        const snapshot = yield* observeAt(ws.root, {
          configuredAgents: ["claude-code"],
          symlinkSupported: false,
        });
        recording.reset();
        const records = yield* recordIdenticalInstructionCopies(snapshot);
        expect(records.map((change) => change.path)).toEqual(["CLAUDE.md"]);
        // Prepare's re-observation and the record's own witness.
        expect(recording.contentReads(ws.source)).toBe(2);
      }),
    ),
  );

  it.effect("reads a source shared by alias items once while preparing", () =>
    recorded(
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const ws = yield* workspace({});
        const snapshot = yield* observeAt(ws.root, {
          configuredAgents: ["claude-code", "gemini-cli"],
          symlinkSupported: false,
        });
        recording.reset();
        yield* applyInstructionProjection({
          workspaceRoot: ws.root,
          config: TRACKED,
          snapshot,
          dryRun: false,
        });
        // One prepare read, the whole-snapshot witness, one witness per target.
        expect(recording.contentReads(ws.source)).toBe(4);
      }),
    ),
  );

  it.effect("refuses a source edited after observation before publishing anything", () =>
    recorded(
      Effect.gen(function* () {
        const ws = yield* workspace({});
        const snapshot = yield* observeAt(ws.root, {
          configuredAgents: ["claude-code"],
          symlinkSupported: false,
        });
        fs.writeFileSync(ws.source, "# Edited\n");
        const result = yield* Effect.result(
          applyInstructionProjection({
            workspaceRoot: ws.root,
            config: TRACKED,
            snapshot,
            dryRun: false,
          }),
        );
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure")
          expect(expectMaintenanceFailed(result.failure)).toMatchObject({
            category: "conflict",
            detail: `Instruction input changed after observation: ${ws.source}`,
          });
        expect(fs.existsSync(path.join(ws.root, "CLAUDE.md"))).toBe(false);
      }),
    ),
  );

  it.effect("never publishes verified bytes of a source outside the workspace root", () =>
    recorded(
      Effect.gen(function* () {
        const host = yield* EffectFileSystem.FileSystem;
        const home = yield* host.realPath(yield* host.makeTempDirectoryScoped());
        const configRoot = yield* host.realPath(yield* host.makeTempDirectoryScoped());
        const external = path.join(configRoot, "AGENTS.md");
        yield* host.writeFileString(external, "# User\n");
        yield* host.symlink(external, path.join(home, "AGENTS.md"));
        const snapshot = yield* observeInstructionProjection({
          workspaceRoot: home,
          scope: "user",
          nativeDirectoryInputs: {
            skillsDirectoryOverrides: {},
            userConfigRootOverrides: { "claude-code": configRoot },
          },
          configuredAgents: ["claude-code"],
          config: TRACKED,
          symlinkSupported: false,
          rows: NO_ROWS,
        });
        const target = path.join(configRoot, "CLAUDE.md");
        expect(snapshot.status.items.map((item) => [item.targetFile, item.health])).toEqual([
          [target, "missing-target"],
        ]);
        const result = yield* Effect.result(
          applyInstructionProjection({
            workspaceRoot: home,
            config: TRACKED,
            snapshot,
            dryRun: false,
          }),
        );
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure")
          expect(expectMaintenanceFailed(result.failure)).toMatchObject({
            category: "internal",
            detail: `Instruction source disappeared before projection: ${external}`,
          });
        expect(fs.existsSync(target)).toBe(false);
      }),
    ),
  );

  /** A .gitignore the live fence check refuses, arranged in `root`. */
  const unsafeGitignores = [
    [
      "an escaping link",
      (root: string, outside: string) => {
        fs.writeFileSync(path.join(outside, "ignore"), "dist/\n");
        fs.symlinkSync(path.join(outside, "ignore"), path.join(root, ".gitignore"));
      },
    ],
    [
      "a dangling link",
      (root: string, outside: string) =>
        fs.symlinkSync(path.join(outside, "missing"), path.join(root, ".gitignore")),
    ],
    [
      "a hard link",
      (root: string, outside: string) => {
        fs.writeFileSync(path.join(root, ".gitignore"), "dist/\n");
        fs.linkSync(path.join(root, ".gitignore"), path.join(outside, "ignore"));
      },
    ],
    [
      "malformed region fences",
      (root: string) =>
        fs.writeFileSync(
          path.join(root, ".gitignore"),
          "dist/\n# axm:instruction-aliases\n**/CLAUDE.md\n",
        ),
    ],
  ] as const;

  for (const [name, arrange] of unsafeGitignores)
    it.effect(`refuses readiness for a .gitignore with ${name} exactly as the live check`, () =>
      recorded(
        Effect.gen(function* () {
          const host = yield* EffectFileSystem.FileSystem;
          const ws = yield* workspace({ git: true });
          const outside = yield* host.realPath(yield* host.makeTempDirectoryScoped());
          arrange(ws.root, outside);
          const snapshot = yield* observeAt(ws.root, {
            configuredAgents: ["claude-code"],
            config: IGNORED,
            symlinkSupported: true,
          });
          const live = yield* Effect.flip(assertInstructionsGitignoreSafe(ws.root));
          const readiness = yield* instructionReconciliationReadiness({
            snapshot,
            workspaceRoot: ws.root,
          });
          if (Option.isNone(readiness)) throw new Error("Expected readiness to refuse");
          const refusal = expectMaintenanceFailed(readiness.value);
          expect(refusal).toEqual(live);
          expect({ category: refusal.category, detail: refusal.detail }).toEqual({
            category: live.category,
            detail: live.detail,
          });
        }),
      ),
    );

  for (const [name, arrange] of unsafeGitignores)
    for (const dryRun of [true, false])
      it.effect(
        `refuses ${dryRun ? "previewing" : "applying"} aliases over a .gitignore with ${name} exactly as the live check`,
        () =>
          recorded(
            Effect.gen(function* () {
              const host = yield* EffectFileSystem.FileSystem;
              const ws = yield* workspace({ git: true });
              const outside = yield* host.realPath(yield* host.makeTempDirectoryScoped());
              arrange(ws.root, outside);
              const snapshot = yield* observeAt(ws.root, {
                configuredAgents: ["claude-code"],
                config: IGNORED,
                symlinkSupported: true,
              });
              const live = yield* Effect.flip(assertInstructionsGitignoreSafe(ws.root));
              const refusal = yield* Effect.flip(
                applyInstructionProjection({
                  workspaceRoot: ws.root,
                  config: IGNORED,
                  snapshot,
                  dryRun,
                }),
              );
              expect(refusal).toEqual(live);
              expect(yield* host.exists(path.join(ws.root, "CLAUDE.md"))).toBe(false);
            }),
          ),
      );

  it.effect("checks .gitignore readiness live when the observation cannot decide it", () =>
    recorded(
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const ws = yield* workspace({ git: true });
        fs.writeFileSync(ws.gitignore, "dist/\n");
        const observeView = (gitIndexView: boolean) =>
          observeInstructionProjection({
            workspaceRoot: ws.root,
            scope: "project",
            configuredAgents: ["claude-code"],
            config: IGNORED,
            symlinkSupported: true,
            gitIndexView,
            rows: NO_ROWS,
          });
        const liveChecks = (snapshot: InstructionProjectionSnapshot, workspaceRoot = ws.root) =>
          Effect.gen(function* () {
            recording.reset();
            expect(
              Option.isNone(yield* instructionReconciliationReadiness({ snapshot, workspaceRoot })),
            ).toBe(true);
            return recording.contentReads(ws.gitignore);
          });
        const working = yield* observeView(false);
        const admission = working.gitignoreAdmission;
        expect(admission?.earlyReferent).toEqual(Option.some(ws.gitignore));
        expect(yield* liveChecks(working)).toBe(0);
        // A Git-index view, a referent the early read did not admit, a hand-built
        // snapshot, and another workspace spelling each read the file live.
        expect(yield* liveChecks(yield* observeView(true))).toBe(1);
        if (admission === undefined) throw new Error("Expected a recorded admission");
        expect(
          yield* liveChecks({
            ...working,
            gitignoreAdmission: { ...admission, earlyReferent: Option.some(ws.source) },
          }),
        ).toBe(1);
        const { gitignoreAdmission: _recorded, ...handBuilt } = working;
        expect(yield* liveChecks(handBuilt)).toBe(1);
        expect(yield* liveChecks(working, `${ws.root}${path.sep}`)).toBe(1);
      }),
    ),
  );

  it.effect("decides readiness from the observation's own .gitignore admission", () =>
    recorded(
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const ws = yield* workspace({ git: true });
        const first = yield* observeAt(ws.root, {
          configuredAgents: ["claude-code"],
          config: IGNORED,
          symlinkSupported: true,
        });
        const applied = yield* applyInstructionProjection({
          workspaceRoot: ws.root,
          config: IGNORED,
          snapshot: first,
          dryRun: false,
        });
        expect(applied.written).toContain(ws.gitignore);
        recording.reset();
        const snapshot = yield* observeAt(ws.root, {
          configuredAgents: ["claude-code"],
          config: IGNORED,
          symlinkSupported: true,
        });
        expect(snapshot.gitignore.managed).toBe(true);
        const observed = {
          git: recording.calls({ path: ws.git }).length,
          gitignore: recording.counts(ws.gitignore),
        };
        recording.reset();
        const readiness = yield* instructionReconciliationReadiness({
          snapshot,
          workspaceRoot: ws.root,
        });
        expect(Option.isNone(readiness)).toBe(true);
        expect({
          observed,
          readiness: {
            git: recording.calls({ path: ws.git }).length,
            gitignore: recording.counts(ws.gitignore),
          },
        }).toEqual({
          // The early read and the region's witness share one content read.
          observed: { git: 1, gitignore: { readFile: 1, readLink: 6, realPath: 5, stat: 6 } },
          readiness: { git: 0, gitignore: {} },
        });
      }),
    ),
  );

  /** Calls naming `target` for the methods that resolve a native entry; `exists` probes are stats. */
  const resolutions = (
    recording: { readonly counts: (path: string) => Readonly<Record<string, number | undefined>> },
    target: string,
  ) => {
    const counts = recording.counts(target);
    return {
      readLink: counts["readLink"] ?? 0,
      stat: counts["stat"] ?? 0,
      realPath: counts["realPath"] ?? 0,
    };
  };

  it.effect("resolves a source shared by link aliases once in one observation", () =>
    recorded(
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const ws = yield* workspace({
          links: { "CLAUDE.md": "AGENTS.md", "GEMINI.md": "AGENTS.md" },
        });
        const observations = workObservations(false);
        recording.reset();
        const snapshot = yield* observeAt(ws.root, {
          configuredAgents: ["claude-code", "gemini-cli"],
          symlinkSupported: true,
        }).pipe(observations.provide);
        expect(
          snapshot.status.items.map((item) => [item.agentId, item.ownership, item.observedForm]),
        ).toEqual([
          ["claude-code", "owned-current", "symlink"],
          ["gemini-cli", "owned-current", "symlink"],
        ]);
        expect({
          source: resolutions(recording, ws.source),
          // The links themselves are classified and witnessed as before.
          claude: resolutions(recording, path.join(ws.root, "CLAUDE.md")),
          gemini: resolutions(recording, path.join(ws.root, "GEMINI.md")),
          contentReads: recording.contentReads(ws.source),
          witnessHashes: witnessHashes(observations.facts),
        }).toEqual({
          // Both links name the source: its entry is resolved once for both, not twice each.
          source: { readLink: 7, stat: 7, realPath: 6 },
          claude: { readLink: 9, stat: 4, realPath: 4 },
          gemini: { readLink: 9, stat: 4, realPath: 4 },
          contentReads: 1,
          witnessHashes: 4,
        });
      }),
    ),
  );

  it.effect("classifies each link alias by its own referent and a new link before writing", () =>
    recorded(
      Effect.gen(function* () {
        const ws = yield* workspace({
          links: { "CLAUDE.md": "AGENTS.md", "GEMINI.md": "other.md" },
        });
        fs.writeFileSync(path.join(ws.root, "other.md"), "# Workspace\n");
        const mixed = yield* observeAt(ws.root, {
          configuredAgents: ["claude-code", "gemini-cli"],
          symlinkSupported: true,
        });
        expect(
          mixed.status.items.map((item) => [item.agentId, item.ownership, item.observedForm]),
        ).toEqual([
          ["claude-code", "owned-current", "symlink"],
          ["gemini-cli", "unowned", "symlink"],
        ]);
        // A link created after observation is classified live before anything is written.
        const gemini = path.join(ws.root, "GEMINI.md");
        fs.rmSync(gemini);
        const planned = yield* observeAt(ws.root, {
          configuredAgents: ["claude-code", "gemini-cli"],
          symlinkSupported: true,
        });
        expect(planned.status.items.map((item) => item.ownership)).toEqual([
          "owned-current",
          "absent",
        ]);
        fs.symlinkSync("other.md", gemini);
        const result = yield* Effect.result(
          applyInstructionProjection({
            workspaceRoot: ws.root,
            config: TRACKED,
            snapshot: planned,
            dryRun: false,
          }),
        );
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure")
          expect(expectMaintenanceFailed(result.failure)).toMatchObject({
            detail: `Instruction reconciliation would overwrite files with unknown ownership: ${gemini}`,
          });
        expect(fs.readlinkSync(gemini)).toBe("other.md");
      }),
    ),
  );

  it.effect("resolves a stale link's referent and its source once when they coincide", () =>
    recorded(
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const ws = yield* workspace({ links: { "GEMINI.md": "AGENTS.md" } });
        recording.reset();
        const snapshot = yield* observeAt(ws.root, {
          configuredAgents: ["claude-code"],
          symlinkSupported: true,
        });
        expect(
          snapshot.status.staleTargets.map((item) => [
            item.targetFile,
            item.ownership,
            item.observedForm,
          ]),
        ).toEqual([[path.join(ws.root, "GEMINI.md"), "owned-current", "symlink"]]);
        expect({
          source: resolutions(recording, ws.source),
          gemini: resolutions(recording, path.join(ws.root, "GEMINI.md")),
          contentReads: recording.contentReads(ws.source),
        }).toEqual({
          // The link's referent is the source itself: one resolution serves both.
          source: { readLink: 7, stat: 7, realPath: 6 },
          gemini: { readLink: 9, stat: 4, realPath: 4 },
          contentReads: 1,
        });
      }),
    ),
  );

  it.effect("keys each observed copy once in one observation", () =>
    recorded(
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const ws = yield* workspace({});
        const synced = yield* syncInstructions({
          workspaceRoot: ws.root,
          scope: "project",
          configuredAgents: ["claude-code", "gemini-cli"],
          config: TRACKED,
          symlinkSupported: false,
          rows: NO_ROWS,
          dryRun: false,
        });
        const rows = withInstructionRowChanges(NO_ROWS, synced.rowChanges);
        expect([...rows.keys()].sort()).toEqual(["CLAUDE.md", "GEMINI.md"]);
        const claude = path.join(ws.root, "CLAUDE.md");
        const gemini = path.join(ws.root, "GEMINI.md");
        recording.reset();
        const snapshot = yield* observeInstructionProjection({
          workspaceRoot: ws.root,
          scope: "project",
          configuredAgents: ["claude-code"],
          config: TRACKED,
          symlinkSupported: false,
          rows,
        });
        expect(
          [...snapshot.status.items, ...snapshot.status.staleTargets].map((item) => [
            item.targetFile,
            item.health,
            item.ownership,
            item.observedForm,
          ]),
        ).toEqual([
          [claude, "ok", "owned-current", "copy"],
          [gemini, "stale", "owned-current", "copy"],
        ]);
        expect(snapshot.orphanRows).toEqual([]);
        expect({
          claude: resolutions(recording, claude),
          gemini: resolutions(recording, gemini),
          root: recording.counts(ws.root)["realPath"] ?? 0,
        }).toEqual({
          // Classification keys each copy; the row check reuses that key.
          claude: { readLink: 8, stat: 7, realPath: 6 },
          gemini: { readLink: 8, stat: 7, realPath: 6 },
          root: 28,
        });
      }),
    ),
  );

  it.effect("keys absent alias targets as before", () =>
    recorded(
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const ws = yield* workspace({});
        recording.reset();
        const snapshot = yield* observeAt(ws.root, {
          configuredAgents: ["claude-code", "gemini-cli"],
          symlinkSupported: true,
        });
        expect(snapshot.status.items.map((item) => item.ownership)).toEqual(["absent", "absent"]);
        expect({
          claude: resolutions(recording, path.join(ws.root, "CLAUDE.md")),
          gemini: resolutions(recording, path.join(ws.root, "GEMINI.md")),
        }).toEqual({
          claude: { readLink: 8, stat: 4, realPath: 0 },
          gemini: { readLink: 8, stat: 4, realPath: 0 },
        });
      }),
    ),
  );

  /** Every recorded call naming `target`, by method. */
  const allCalls = (
    recording: { readonly counts: (path: string) => Readonly<Record<string, number | undefined>> },
    target: string,
  ) => ({ ...recording.counts(target) });

  it.effect("classifies an absent or directory target from its own content admission", () =>
    recorded(
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const absent = yield* workspace({ copies: ["GEMINI.md"] });
        const occupied = yield* workspace({ copies: ["GEMINI.md"] });
        yield* (yield* EffectFileSystem.FileSystem).makeDirectory(
          path.join(occupied.root, "CLAUDE.md"),
        );
        const observeBoth = (root: string) =>
          observeAt(root, {
            configuredAgents: ["claude-code", "gemini-cli"],
            symlinkSupported: true,
          });
        recording.reset();
        const absentSnapshot = yield* observeBoth(absent.root);
        const absentCounts = {
          claude: allCalls(recording, path.join(absent.root, "CLAUDE.md")),
          gemini: allCalls(recording, path.join(absent.root, "GEMINI.md")),
        };
        recording.reset();
        const occupiedSnapshot = yield* observeBoth(occupied.root);
        const occupiedCounts = {
          claude: allCalls(recording, path.join(occupied.root, "CLAUDE.md")),
          gemini: allCalls(recording, path.join(occupied.root, "GEMINI.md")),
        };
        const classified = (snapshot: InstructionProjectionSnapshot) =>
          snapshot.status.items.map((item) => [item.agentId, item.ownership, item.observedForm]);
        expect({
          absent: classified(absentSnapshot),
          occupied: classified(occupiedSnapshot),
        }).toEqual({
          absent: [
            ["claude-code", "absent", "none"],
            ["gemini-cli", "owned-unrecorded-identical", "copy"],
          ],
          occupied: [
            ["claude-code", "unowned", "directory"],
            ["gemini-cli", "owned-unrecorded-identical", "copy"],
          ],
        });
        expect({ absentCounts, occupiedCounts }).toEqual({
          // The admission that found the target absent or a directory decides
          // its classification; the copy beside it is classified as before.
          absentCounts: {
            claude: { readLink: 8, stat: 4 },
            gemini: { readFile: 1, readLink: 8, realPath: 6, stat: 8 },
          },
          occupiedCounts: {
            claude: { readDirectory: 1, readLink: 7, realPath: 5, stat: 7 },
            gemini: { readFile: 1, readLink: 8, realPath: 6, stat: 8 },
          },
        });
      }),
    ),
  );

  it.effect("prepares an absent target without probing it again after its admission", () =>
    recorded(
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const ws = yield* workspace({});
        const snapshot = yield* observeAt(ws.root, {
          configuredAgents: ["gemini-cli"],
          symlinkSupported: false,
        });
        recording.reset();
        const applied = yield* applyInstructionProjection({
          workspaceRoot: ws.root,
          config: TRACKED,
          snapshot,
          dryRun: true,
        });
        expect(applied.written).toEqual([path.join(ws.root, "GEMINI.md")]);
        // Prepare's entry and content admissions and its classification's
        // link check; no probe follows them.
        expect(allCalls(recording, path.join(ws.root, "GEMINI.md"))).toEqual({
          readLink: 5,
          stat: 2,
        });
      }),
    ),
  );

  it.effect("keys each prepared copy from its own entry admission", () =>
    recorded(
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const ws = yield* workspace({ copies: ["GEMINI.md"] });
        const snapshot = yield* observeAt(ws.root, {
          configuredAgents: ["gemini-cli"],
          symlinkSupported: true,
        });
        expect(snapshot.status.items.map((item) => [item.ownership, item.observedForm])).toEqual([
          ["owned-unrecorded-identical", "copy"],
        ]);
        recording.reset();
        const records = yield* recordIdenticalInstructionCopies(snapshot);
        expect(records.map((change) => change.path)).toEqual(["GEMINI.md"]);
        expect({
          target: allCalls(recording, path.join(ws.root, "GEMINI.md")),
          rootRealPaths: recording.counts(ws.root)["realPath"] ?? 0,
          sourceReads: recording.contentReads(ws.source),
        }).toEqual({
          // Prepare's entry admission, its classification and the record's
          // witness; the row key reuses the admitted entry and still resolves
          // the workspace root live.
          target: { readFile: 2, readLink: 7, realPath: 6, stat: 7 },
          rootRealPaths: 17,
          sourceReads: 2,
        });
      }),
    ),
  );

  it.effect("checks the .gitignore fences once before an alias write", () =>
    recorded(
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const host = yield* EffectFileSystem.FileSystem;
        const counted = (ws: { readonly git: string; readonly gitignore: string }) => ({
          git: recording.calls({ path: ws.git }).length,
          gitignore: allCalls(recording, ws.gitignore),
          gitignoreReads: recording.contentReads(ws.gitignore),
        });
        const applyAt = (
          root: string,
          dryRun: boolean,
          rows: InstructionProjectionRows = NO_ROWS,
        ) =>
          Effect.gen(function* () {
            const snapshot = yield* observeInstructionProjection({
              workspaceRoot: root,
              scope: "project",
              configuredAgents: ["claude-code"],
              config: IGNORED,
              symlinkSupported: true,
              rows,
            });
            recording.reset();
            return yield* applyInstructionProjection({
              workspaceRoot: root,
              config: IGNORED,
              snapshot,
              dryRun,
            });
          });
        const preview = yield* workspace({ git: true });
        yield* host.writeFileString(preview.gitignore, "dist/\n");
        const previewed = yield* applyAt(preview.root, true);
        const previewCounts = counted(preview);
        const applied = yield* workspace({ git: true });
        yield* host.writeFileString(applied.gitignore, "dist/\n");
        const written = yield* applyAt(applied.root, false);
        const appliedCounts = counted(applied);
        // The region is current and recorded now: apply has no .gitignore change to check.
        const current = yield* applyAt(
          applied.root,
          false,
          withInstructionRowChanges(NO_ROWS, written.rowChanges),
        );
        const currentCounts = counted(applied);
        expect(current.written).toEqual([]);
        expect(previewed.written).toContain(preview.gitignore);
        expect(written.written).toContain(applied.gitignore);
        expect(yield* host.readFileString(applied.gitignore)).toContain("CLAUDE.md");
        expect(yield* host.readFileString(preview.gitignore)).toBe("dist/\n");
        expect({ previewCounts, appliedCounts, currentCounts }).toEqual({
          // The region dry run walks to the Git root, admits and reads the
          // .gitignore once before any write.
          previewCounts: {
            git: 1,
            gitignore: { readFile: 1, readLink: 2, realPath: 2, stat: 2 },
            gitignoreReads: 1,
          },
          // Apply then re-takes the region's witness and rewrites it under its lock.
          appliedCounts: {
            git: 2,
            gitignore: {
              access: 1,
              readFile: 4,
              readLink: 10,
              realPath: 10,
              stat: 13,
              writeFile: 1,
            },
            gitignoreReads: 4,
          },
          currentCounts: { git: 0, gitignore: {}, gitignoreReads: 0 },
        });
      }),
    ),
  );
});
