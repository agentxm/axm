import * as fs from "node:fs";
import { NativeWriteAuthorityPermissive } from "@agentxm/workspace-kernel/agent-adapters/testing";
import * as os from "node:os";
import * as path from "node:path";
import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { NativeEntryRemoval, resolveNativeReferent } from "@agentxm/workspace-kernel/locations";
import { runWorkspaceTransaction } from "@agentxm/workspace-kernel/settlement";
import { WorkspaceTransactionScopeTest } from "@agentxm/workspace-kernel/settlement/testing";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  CodingAgentRepository,
  projectionOutputDigest,
  ProjectionOutputPosture,
  WorkspaceInvariantFacts,
  type CodingAgentRepositoryService,
  type AgentOutputAuthority,
} from "@agentxm/workspace-kernel/projection";
import {
  LOCKFILE_VERSION,
  ProjectionUnitPathSchema,
  type Lockfile,
} from "@agentxm/workspace-kernel/workspace-state";
import { codingAgentForId } from "@agentxm/workspace-kernel/agent-adapters";
import { WorkspaceReadTest } from "@agentxm/workspace-kernel/workspace-state/testing";
import {
  reconcileAgentOutputs,
  prepareUninstallArtifact,
} from "@agentxm/workspace-kernel/reconciliation";
import { applySync, previewSync, makeSyncFixture } from "../testing/sync-fixture.js";

/** Old inline marker text: ordinary content that grants no ownership. */
const OLD_MARKER_TEXT =
  "<!-- axm:file v=1 ext=@acme/subagents/test src=agent_extensions/@acme/subagents/test -->";

/** A lockfile recording AXM's last write of each Subagent file. */
const recordedSubagents = (rows: Readonly<Record<string, string>>): Lockfile => ({
  lockfileVersion: LOCKFILE_VERSION,
  skills: {},
  projections: {
    subagents: {
      contract: 1,
      units: Object.fromEntries(
        Object.entries(rows).map(([unit, bytes]) => [
          ProjectionUnitPathSchema.make(unit),
          { output: projectionOutputDigest(bytes) },
        ]),
      ),
    },
  },
});

const outputAuthority = (overrides: Partial<AgentOutputAuthority>): AgentOutputAuthority => ({
  expectedRegions: { rule: [], knowledge: [] },
  expectedHooks: [],
  declaredMcpNames: new Set([]),
  expectedSkillSources: {},
  expectedSubagentNames: new Set<string>(),
  ...overrides,
});

const expectedNames = (overrides?: {
  readonly skill?: ReadonlyArray<string>;
  readonly subagent?: ReadonlyArray<string>;
  readonly mcpServer?: ReadonlyArray<string>;
  readonly hook?: ReadonlyArray<string>;
}) => ({
  skill: new Set(overrides?.skill ?? []),
  subagent: new Set(overrides?.subagent ?? []),
  "mcp-server": new Set(overrides?.mcpServer ?? []),
  hook: new Set(overrides?.hook ?? []),
});

describe("cleanupManagedArtifactsForRemovedAgents", () => {
  it.effect("restores the owned skill link when interrupted after native cleanup", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const tempDir = yield* fileSystem
        .makeTempDirectoryScoped({ prefix: "axm-cleanup-interrupt-" })
        .pipe(Effect.flatMap(resolveNativeReferent));
      const workspaceDir = path.join(tempDir, ".axm");
      const source = path.join(tempDir, "source", "review");
      const parent = path.join(tempDir, ".cursor", "skills");
      const target = path.join(parent, "review");
      yield* fileSystem.makeDirectory(workspaceDir);
      yield* fileSystem.makeDirectory(source, { recursive: true });
      yield* fileSystem.makeDirectory(parent, { recursive: true });
      yield* fileSystem.writeFileString(path.join(source, "SKILL.md"), "# Retained source\n");
      yield* fileSystem.symlink(source, target);
      const before = (yield* fileSystem.readDirectory(tempDir, { recursive: true })).sort();
      const cursor = codingAgentForId("cursor");
      const agentRepo: CodingAgentRepositoryService = {
        get: () => Effect.succeed(cursor),
        all: Effect.succeed([cursor]),
        getConfiguredAgents: () => Effect.succeed([]),
        getMaterializationAgents: () => Effect.succeed([]),
        getUnknownConfiguredAgentIds: () => Effect.succeed([]),
      };
      const layer = Layer.mergeAll(
        NativeWriteAuthorityPermissive,
        WorkspaceReadTest({ baseDir: tempDir, runtimeDir: workspaceDir }),
        Layer.succeed(CodingAgentRepository, agentRepo),
      );
      const published = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const removal = yield* NativeEntryRemoval;
      const controlled = NativeEntryRemoval.of({
        ...removal,
        unlink: (entry) =>
          removal
            .unlink(entry)
            .pipe(
              Effect.andThen(Deferred.succeed(published, undefined)),
              Effect.andThen(Deferred.await(release)),
            ),
      });

      yield* Effect.gen(function* () {
        const transaction = yield* runWorkspaceTransaction({
          claimDefaultTargets: false,
          targets: [parent],
          transition: reconcileAgentOutputs({
            desiredAgentIds: new Set(),
            expectedNames: expectedNames({ skill: ["review"] }),
            authority: outputAuthority({ expectedSkillSources: { review: [source] } }),
          }),
          validate: () => Effect.void,
        }).pipe(
          Effect.provide(
            Layer.merge(
              WorkspaceTransactionScopeTest({
                workspaceDir,
                settingsPath: path.join(tempDir, "axm.json"),
                lockPath: path.join(tempDir, "axm.lock"),
              }),
              layer,
            ),
          ),
          Effect.provideService(NativeEntryRemoval, controlled),
          Effect.forkChild,
        );
        yield* Deferred.await(published);
        expect(yield* fileSystem.exists(target)).toBe(false);
        const interrupt = yield* Fiber.interrupt(transaction).pipe(
          Effect.forkChild({ startImmediately: true }),
        );
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(interrupt);
        const exit = yield* Fiber.await(transaction);
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          expect(Cause.hasInterruptsOnly(exit.cause), JSON.stringify(exit.cause)).toBe(true);
        }
        expect((yield* fileSystem.readDirectory(tempDir, { recursive: true })).sort()).toEqual(
          before,
        );
        expect(yield* fileSystem.readLink(target)).toBe(source);
        expect(yield* fileSystem.readFileString(path.join(source, "SKILL.md"))).toBe(
          "# Retained source\n",
        );
      }).pipe(Effect.ensuring(Deferred.succeed(release, undefined)));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("removes only AXM-managed skill and subagent artifacts for removed agents", () =>
    Effect.gen(function* () {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-agent-cleanup-"));
      try {
        const axmDir = path.join(tempDir, ".axm");
        const canonicalSkill = path.join(
          tempDir,
          "agent_extensions",
          "registry.agentxm.ai",
          "@acme",
          "skills",
          "code-review",
          "src",
        );
        const cursorSkills = path.join(tempDir, ".cursor", "skills");
        const sharedSkills = path.join(tempDir, ".agents", "skills");
        const cursorSubagents = path.join(tempDir, ".cursor", "agents");
        fs.mkdirSync(canonicalSkill, { recursive: true });
        fs.mkdirSync(cursorSkills, { recursive: true });
        fs.mkdirSync(sharedSkills, { recursive: true });
        fs.mkdirSync(cursorSubagents, { recursive: true });

        const managedSkillLink = path.join(cursorSkills, "code-review");
        const managedSharedLink = path.join(sharedSkills, "code-review");
        const foreignChainedLink = path.join(cursorSkills, "shared-code-review");
        const unmanagedSkill = path.join(cursorSkills, "user-skill");
        fs.symlinkSync(canonicalSkill, managedSkillLink);
        fs.symlinkSync(canonicalSkill, managedSharedLink);
        fs.symlinkSync(managedSharedLink, foreignChainedLink);
        fs.mkdirSync(unmanagedSkill, { recursive: true });
        fs.writeFileSync(path.join(unmanagedSkill, "SKILL.md"), "# User skill\n");

        const managedSubagent = path.join(cursorSubagents, "reviewer.md");
        const unmanagedSubagent = path.join(cursorSubagents, "manual.md");
        fs.writeFileSync(managedSubagent, "subagent body\n");
        fs.writeFileSync(unmanagedSubagent, "# Manual subagent\n");

        const cursor = codingAgentForId("cursor");
        const agentRepo: CodingAgentRepositoryService = {
          get: () => Effect.succeed(cursor),
          all: Effect.succeed([cursor]),
          getConfiguredAgents: () => Effect.succeed([]),
          getMaterializationAgents: () => Effect.succeed([]),
          getUnknownConfiguredAgentIds: () => Effect.succeed([]),
        };
        const layer = Layer.mergeAll(
          NativeWriteAuthorityPermissive,
          NativePlatformTest,
          WorkspaceReadTest({
            baseDir: tempDir,
            runtimeDir: axmDir,
            lockfile: recordedSubagents({ ".cursor/agents/reviewer.md": "subagent body\n" }),
          }),
          Layer.succeed(CodingAgentRepository, agentRepo),
        );

        const authority = outputAuthority({
          expectedSkillSources: { "code-review": [canonicalSkill] },
          expectedSubagentNames: new Set(["reviewer"]),
        });
        const preview = yield* reconcileAgentOutputs({
          desiredAgentIds: new Set(),
          expectedNames: expectedNames({ skill: ["code-review"] }),
          authority,
          dryRun: true,
        }).pipe(Effect.provide(layer));

        expect(preview.removedPaths).toEqual(
          expect.arrayContaining([managedSkillLink, managedSubagent]),
        );
        expect(preview.preservedPaths).toEqual(
          expect.arrayContaining([unmanagedSkill, unmanagedSubagent, foreignChainedLink]),
        );
        expect(fs.existsSync(managedSkillLink)).toBe(true);
        expect(fs.existsSync(managedSubagent)).toBe(true);

        const result = yield* reconcileAgentOutputs({
          desiredAgentIds: new Set(),
          expectedNames: expectedNames({ skill: ["code-review"] }),
          authority,
        }).pipe(Effect.provide(layer));

        expect(result.removedPaths).toEqual(
          expect.arrayContaining([managedSkillLink, managedSubagent]),
        );
        expect(result.preservedPaths).toEqual(
          expect.arrayContaining([unmanagedSkill, unmanagedSubagent, foreignChainedLink]),
        );
        expect(fs.existsSync(managedSkillLink)).toBe(false);
        expect(fs.readlinkSync(foreignChainedLink)).toBe(managedSharedLink);
        expect(fs.existsSync(managedSharedLink)).toBe(true);
        expect(fs.existsSync(managedSubagent)).toBe(false);
        expect(fs.existsSync(unmanagedSkill)).toBe(true);
        expect(fs.existsSync(unmanagedSubagent)).toBe(true);
        expect(result.rowChanges).toEqual([
          { kind: "subagents", path: ".cursor/agents/reviewer.md", row: undefined },
        ]);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }),
  );

  it.effect.each([
    {
      case: "modified",
      discardModified: false,
      posture: { discardModified: false },
      removed: false,
      withdrawn: true,
      warning: "; rerun with --discard-modified to delete it",
    },
    {
      case: "modified on a command without --discard-modified",
      discardModified: false,
      posture: {},
      removed: false,
      withdrawn: true,
      warning: "",
    },
    {
      case: "modified with --discard-modified",
      discardModified: true,
      posture: { discardModified: true },
      removed: true,
      withdrawn: true,
      warning: undefined,
    },
    {
      case: "unrecorded",
      discardModified: true,
      posture: { discardModified: true },
      removed: false,
      withdrawn: false,
      warning: undefined,
    },
  ])("applies the deletion guard to $case Subagent residue", (row) =>
    Effect.gen(function* () {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-agent-cleanup-guard-"));
      try {
        const subagents = path.join(tempDir, ".cursor", "agents");
        fs.mkdirSync(subagents, { recursive: true });
        const file = path.join(subagents, "reviewer.md");
        fs.writeFileSync(file, "Hand-edited reviewer\n");
        const cursor = codingAgentForId("cursor");
        const layer = Layer.mergeAll(
          NativeWriteAuthorityPermissive,
          NativePlatformTest,
          WorkspaceReadTest({
            baseDir: tempDir,
            runtimeDir: path.join(tempDir, ".axm"),
            ...(row.case === "unrecorded"
              ? {}
              : {
                  lockfile: recordedSubagents({
                    ".cursor/agents/reviewer.md": "AXM-written reviewer\n",
                  }),
                }),
          }),
          Layer.succeed(CodingAgentRepository, {
            get: () => Effect.succeed(cursor),
            all: Effect.succeed([cursor]),
            getConfiguredAgents: () => Effect.succeed([]),
            getMaterializationAgents: () => Effect.succeed([]),
            getUnknownConfiguredAgentIds: () => Effect.succeed([]),
          } satisfies CodingAgentRepositoryService),
        );
        const result = yield* reconcileAgentOutputs({
          desiredAgentIds: new Set(),
          expectedNames: expectedNames(),
          authority: outputAuthority({ expectedSubagentNames: new Set(["reviewer"]) }),
          discardModified: row.discardModified,
        }).pipe(Effect.provide(layer), Effect.provideService(ProjectionOutputPosture, row.posture));
        expect(fs.existsSync(file)).toBe(!row.removed);
        expect(result.removedPaths).toEqual(row.removed ? [file] : []);
        expect(result.rowChanges).toEqual(
          row.withdrawn
            ? [{ kind: "subagents", path: ".cursor/agents/reviewer.md", row: undefined }]
            : [],
        );
        // The warning names the flag only when the command offers it.
        expect(result.warnings).toEqual(
          row.warning === undefined
            ? []
            : [`Retained ${file}, modified since AXM last wrote it${row.warning}`],
        );
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }),
  );

  it.effect("leaves workspace-placed rule artifacts in place", () =>
    Effect.gen(function* () {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-agent-cleanup-workspace-"));
      try {
        const axmDir = path.join(tempDir, ".axm");
        const rulesDir = path.join(tempDir, ".cursor", "rules");
        fs.mkdirSync(rulesDir, { recursive: true });
        fs.mkdirSync(path.join(tempDir, ".cursor", "skills"), { recursive: true });

        // Rules render into shared instruction files and are not keyed to a
        // single agent, so removing an agent must not delete them.
        const instructionFile = path.join(tempDir, "AGENTS.md");
        const renderedRule = path.join(rulesDir, "style.md");
        for (const file of [instructionFile, renderedRule]) {
          fs.writeFileSync(file, `${OLD_MARKER_TEXT}\nbody\n`);
        }

        const cursor = codingAgentForId("cursor");
        const agentRepo: CodingAgentRepositoryService = {
          get: () => Effect.succeed(cursor),
          all: Effect.succeed([cursor]),
          getConfiguredAgents: () => Effect.succeed([]),
          getMaterializationAgents: () => Effect.succeed([]),
          getUnknownConfiguredAgentIds: () => Effect.succeed([]),
        };
        const layer = Layer.mergeAll(
          NativeWriteAuthorityPermissive,
          NativePlatformTest,
          WorkspaceReadTest({ baseDir: tempDir, runtimeDir: axmDir }),
          Layer.succeed(CodingAgentRepository, agentRepo),
        );

        const result = yield* reconcileAgentOutputs({
          desiredAgentIds: new Set(),
          expectedNames: expectedNames(),
        }).pipe(Effect.provide(layer));

        expect(result.removedPaths).toEqual([]);
        expect(result.preservedPaths).toEqual([]);
        expect(fs.existsSync(instructionFile)).toBe(true);
        expect(fs.existsSync(renderedRule)).toBe(true);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }),
  );
});

describe("cleanupStaleManagedSkillDirectories", () => {
  it.effect("reconciles the shared skill container without configured agents", () =>
    Effect.gen(function* () {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-universal-cleanup-"));
      try {
        const source = path.join(tempDir, "agent_extensions", "@acme", "skills", "retired", "src");
        const skillsDir = path.join(tempDir, ".agents", "skills");
        const projection = path.join(skillsDir, "retired");
        fs.mkdirSync(source, { recursive: true });
        fs.mkdirSync(skillsDir, { recursive: true });
        fs.symlinkSync(source, projection);

        const sharedReader = codingAgentForId("codex");
        const agentRepo: CodingAgentRepositoryService = {
          get: () => Effect.succeed(sharedReader),
          all: Effect.succeed([sharedReader]),
          getConfiguredAgents: () => Effect.succeed([]),
          getMaterializationAgents: () => Effect.succeed([]),
          getUnknownConfiguredAgentIds: () => Effect.succeed([]),
        };
        const layer = Layer.mergeAll(
          NativeWriteAuthorityPermissive,
          NativePlatformTest,
          WorkspaceReadTest({ baseDir: tempDir, runtimeDir: path.join(tempDir, ".axm") }),
          Layer.succeed(CodingAgentRepository, agentRepo),
        );

        yield* reconcileAgentOutputs({
          desiredAgentIds: new Set(),
          expectedNames: expectedNames(),
          authority: outputAuthority({ expectedSkillSources: { retired: [source] } }),
        }).pipe(Effect.provide(layer));

        expect(fs.existsSync(projection)).toBe(false);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }),
  );

  it.effect(
    "previews and removes retired owned skill projections while preserving lookalikes",
    () =>
      Effect.gen(function* () {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-skill-residue-cleanup-"));
        try {
          const skillsDir = path.join(tempDir, ".cursor", "skills");
          const canonicalRoot = path.join(tempDir, "skills");
          const currentSource = path.join(canonicalRoot, "current", "src");
          const retiredSource = path.join(canonicalRoot, "retired", "src");
          fs.mkdirSync(currentSource, { recursive: true });
          fs.mkdirSync(retiredSource, { recursive: true });
          fs.mkdirSync(skillsDir, { recursive: true });
          const current = path.join(skillsDir, "current");
          const retired = path.join(skillsDir, "retired");
          const lookalike = path.join(skillsDir, "lookalike");
          fs.symlinkSync(currentSource, current);
          fs.symlinkSync(retiredSource, retired);
          fs.mkdirSync(lookalike);
          fs.writeFileSync(path.join(lookalike, "SKILL.md"), "# User skill\n");

          const cursor = codingAgentForId("cursor");
          const agentRepo: CodingAgentRepositoryService = {
            get: () => Effect.succeed(cursor),
            all: Effect.succeed([cursor]),
            getConfiguredAgents: () => Effect.succeed([cursor]),
            getMaterializationAgents: () => Effect.succeed([cursor]),
            getUnknownConfiguredAgentIds: () => Effect.succeed([]),
          };
          const layer = Layer.mergeAll(
            NativeWriteAuthorityPermissive,
            NativePlatformTest,
            WorkspaceReadTest({
              baseDir: tempDir,
              runtimeDir: path.join(tempDir, ".axm"),
              settings: { agents: ["cursor"] },
            }),
            Layer.succeed(CodingAgentRepository, agentRepo),
          );

          const preview = yield* reconcileAgentOutputs({
            desiredAgentIds: new Set(["cursor"]),
            expectedNames: expectedNames({ skill: ["current"] }),
            authority: outputAuthority({
              expectedSkillSources: { current: [currentSource], retired: [retiredSource] },
            }),
            dryRun: true,
          }).pipe(Effect.provide(layer));
          expect(preview.removedPaths).toEqual([retired]);
          expect(fs.existsSync(retired)).toBe(true);

          yield* reconcileAgentOutputs({
            desiredAgentIds: new Set(["cursor"]),
            expectedNames: expectedNames({ skill: ["current"] }),
            authority: outputAuthority({
              expectedSkillSources: { current: [currentSource], retired: [retiredSource] },
            }),
          }).pipe(Effect.provide(layer));
          expect(fs.existsSync(current)).toBe(true);
          expect(fs.existsSync(retired)).toBe(false);
          expect(fs.existsSync(lookalike)).toBe(true);
        } finally {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }),
  );
});

describe("cleanupManagedArtifactsForRemovedAgents MCP and hook artifacts", () => {
  const managedHookCommand = "agent_extensions/@acme/hooks/guard/src/guard.sh";
  const hookAuthority = {
    expectedRegions: { rule: [], knowledge: [] },
    expectedHooks: [
      {
        name: "guard",
        ref: "@acme/hooks/guard",
        scope: "project" as const,
        root: "agent_extensions/@acme/hooks/guard",
      },
    ],
    declaredMcpNames: new Set([]),
    expectedSkillSources: {},
    expectedSubagentNames: new Set<string>(),
  };

  const makeClaudeCodeLayer = (tempDir: string) => {
    const claudeCode = codingAgentForId("claude-code");
    const agentRepo: CodingAgentRepositoryService = {
      get: () => Effect.succeed(claudeCode),
      all: Effect.succeed([claudeCode]),
      getConfiguredAgents: () => Effect.succeed([]),
      getMaterializationAgents: () => Effect.succeed([]),
      getUnknownConfiguredAgentIds: () => Effect.succeed([]),
    };
    return Layer.mergeAll(
      NativeWriteAuthorityPermissive,
      NativePlatformTest,
      WorkspaceReadTest({ baseDir: tempDir, runtimeDir: path.join(tempDir, ".axm") }),
      Layer.succeed(CodingAgentRepository, agentRepo),
    );
  };

  for (const row of [
    { type: "hook", relative: ".claude/settings.json", invalid: { hooks: [] } },
    { type: "mcp-server", relative: ".mcp.json", invalid: { mcpServers: [] } },
  ] as const) {
    it.effect(`preserves unreadable ${row.type} ownership in cleanup and uninstall evidence`, () =>
      Effect.gen(function* () {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-incomplete-native-cleanup-"));
        try {
          const file = path.join(tempDir, row.relative);
          const secret = "opaque-value-under-an-unfamiliar-native-env-key";
          const content = JSON.stringify({
            ...row.invalid,
            env: { UNFAMILIAR_NATIVE_SETTING: secret },
          });
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, content);
          const layer = makeClaudeCodeLayer(tempDir);
          for (const dryRun of [true, false]) {
            const result = yield* reconcileAgentOutputs({
              desiredAgentIds: new Set(["claude-code"]),
              expectedNames: expectedNames(),
              subjects: [{ type: row.type, name: "unknown-until-decoded" }],
              authority: outputAuthority({}),
              dryRun,
            }).pipe(Effect.provide(layer));
            expect(result.removedPaths).toEqual([]);
            expect(result.preservedPaths).toContain(file);
            expect(result.nativeLocations).toContainEqual(
              expect.objectContaining({
                address: expect.objectContaining({ path: file }),
                state: "unverified",
                ownership: "unverified",
              }),
            );
            expect(
              result.warnings.some(
                (warning) => warning.includes(file) && warning.includes("decode"),
              ),
            ).toBe(true);
            expect(JSON.stringify(result)).not.toContain(secret);
            expect(fs.readFileSync(file, "utf8")).toBe(content);
          }
          const artifact = yield* prepareUninstallArtifact({
            type: row.type,
            name: "unknown-until-decoded",
          }).pipe(
            Effect.provide(layer),
            Effect.provideService(WorkspaceInvariantFacts, {
              projectionFacts: Effect.succeed([]),
              projectionFactsForGraph: () => Effect.succeed([]),
            }),
          );
          expect(artifact.references).toContainEqual(
            expect.objectContaining({ path: row.relative, state: "unknown" }),
          );
          expect(JSON.stringify(artifact)).not.toContain(secret);
          expect(fs.readFileSync(file, "utf8")).toBe(content);
        } finally {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }),
    );
  }

  it.effect("scope selection does not authorize implicit native MCP cleanup", () =>
    Effect.gen(function* () {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-scoped-mcp-cleanup-"));
      try {
        const mcpConfig = path.join(tempDir, ".mcp.json");
        const entry = (name: string) => ({
          command: "npx",
          args: [name],
        });
        const retained = entry("unrelated");
        fs.writeFileSync(
          mcpConfig,
          JSON.stringify({ mcpServers: { selected: entry("selected"), unrelated: retained } }),
        );
        yield* reconcileAgentOutputs({
          desiredAgentIds: new Set(),
          expectedNames: expectedNames(),
          subjects: [{ type: "mcp-server", name: "selected" }],
          authority: outputAuthority({
            declaredMcpNames: new Set(["selected", "unrelated"]),
          }),
        }).pipe(Effect.provide(makeClaudeCodeLayer(tempDir)));
        const observed: unknown = JSON.parse(fs.readFileSync(mcpConfig, "utf8"));
        expect(observed).toEqual({
          mcpServers: { selected: entry("selected"), unrelated: retained },
        });
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }),
  );

  it.effect("retains declared and undeclared MCP entries after agent removal", () =>
    Effect.gen(function* () {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-agent-mcp-cleanup-"));
      try {
        const mcpConfig = path.join(tempDir, ".mcp.json");
        fs.writeFileSync(
          mcpConfig,
          `${JSON.stringify(
            {
              mcpServers: {
                "acme-managed": {
                  command: "npx",
                  args: ["-y", "acme-mcp"],
                },
                "user-server": { command: "npx", args: ["-y", "user-mcp"] },
              },
            },
            null,
            2,
          )}\n`,
        );

        const result = yield* reconcileAgentOutputs({
          desiredAgentIds: new Set(),
          expectedNames: expectedNames(),
          authority: outputAuthority({
            declaredMcpNames: new Set(["acme-managed"]),
          }),
        }).pipe(Effect.provide(makeClaudeCodeLayer(tempDir)));

        const parsed: unknown = JSON.parse(fs.readFileSync(mcpConfig, "utf8"));
        expect(parsed).toEqual({
          mcpServers: {
            "acme-managed": { command: "npx", args: ["-y", "acme-mcp"] },
            "user-server": { command: "npx", args: ["-y", "user-mcp"] },
          },
        });
        expect(result.removedPaths).toEqual([]);
        expect(result.nativeLocations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              ownership: "declared",
              state: "retained",
              reason: expect.stringContaining("does not authorize"),
            }),
          ]),
        );
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }),
  );

  it.effect("retains all Hook groups after agent removal", () =>
    Effect.gen(function* () {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-agent-hook-cleanup-"));
      try {
        const settingsPath = path.join(tempDir, ".claude", "settings.json");
        fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
        const userGroup = {
          matcher: "Write",
          hooks: [{ type: "command", command: "./scripts/user-hook.sh" }],
        };
        const unownedCollision = {
          matcher: "Bash",
          hooks: [{ type: "command", command: managedHookCommand }],
        };
        fs.writeFileSync(
          settingsPath,
          `${JSON.stringify(
            {
              permissions: { allow: ["Bash"] },
              hooks: {
                PreToolUse: [
                  {
                    matcher: "Bash",
                    hooks: [
                      {
                        type: "command",
                        command: managedHookCommand,
                      },
                    ],
                  },
                  unownedCollision,
                  userGroup,
                ],
              },
            },
            null,
            2,
          )}\n`,
        );

        const before = fs.readFileSync(settingsPath, "utf8");
        const preview = yield* reconcileAgentOutputs({
          authority: hookAuthority,
          desiredAgentIds: new Set(),
          expectedNames: expectedNames(),
          dryRun: true,
        }).pipe(Effect.provide(makeClaudeCodeLayer(tempDir)));
        expect(preview.removedPaths).toEqual([]);
        expect(fs.readFileSync(settingsPath, "utf8")).toBe(before);

        const result = yield* reconcileAgentOutputs({
          authority: hookAuthority,
          desiredAgentIds: new Set(),
          expectedNames: expectedNames(),
        }).pipe(Effect.provide(makeClaudeCodeLayer(tempDir)));

        const parsed: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        expect(parsed).toEqual(JSON.parse(before));
        expect(result.removedPaths).toEqual([]);
        expect(fs.readFileSync(settingsPath, "utf8")).toBe(before);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }),
  );

  it.effect("retains a Hook-only native container after agent removal", () =>
    Effect.gen(function* () {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-agent-hook-only-"));
      try {
        const settingsPath = path.join(tempDir, ".claude", "settings.json");
        fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
        fs.writeFileSync(
          settingsPath,
          `${JSON.stringify(
            {
              hooks: {
                PreToolUse: [
                  {
                    matcher: "Bash",
                    hooks: [
                      {
                        type: "command",
                        command: managedHookCommand,
                      },
                    ],
                  },
                ],
              },
            },
            null,
            2,
          )}\n`,
        );

        const before = fs.readFileSync(settingsPath, "utf8");
        yield* reconcileAgentOutputs({
          authority: hookAuthority,
          desiredAgentIds: new Set(),
          expectedNames: expectedNames(),
        }).pipe(Effect.provide(makeClaudeCodeLayer(tempDir)));

        const parsed: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        expect(parsed).toEqual(JSON.parse(before));
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }),
  );

  it.effect("leaves an agent that was not removed untouched", () =>
    Effect.gen(function* () {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-agent-kept-"));
      try {
        const mcpConfig = path.join(tempDir, ".mcp.json");
        const original = `${JSON.stringify(
          {
            mcpServers: {
              "acme-managed": {
                command: "npx",
              },
            },
          },
          null,
          2,
        )}\n`;
        fs.writeFileSync(mcpConfig, original);

        const result = yield* reconcileAgentOutputs({
          desiredAgentIds: new Set(["claude-code"]),
          expectedNames: expectedNames({ mcpServer: ["acme-managed"] }),
        }).pipe(Effect.provide(makeClaudeCodeLayer(tempDir)));

        expect(fs.readFileSync(mcpConfig, "utf8")).toEqual(original);
        expect(result.removedPaths).toEqual([]);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }),
  );
});

describe("authored skill cleanup exclusion", () => {
  it.effect.each([false, true])(
    "preserves authored source through preview and repeated sync with enabled=%s",
    (enabled) =>
      Effect.gen(function* () {
        const manifest = JSON.stringify({
          owner: "@acme",
          type: "skill",
          name: "review",
          version: "1.0.0",
        });
        const content = "---\nname: review\ndescription: Review code\n---\nReview the code.\n";
        const workspace = makeSyncFixture({
          settings: {
            owner: "@acme",
            agents: ["claude-code"],
            skills: { review: { source: "workspace", enabled } },
          },
          files: { "skills/review/skill.json": manifest, "skills/review/src/SKILL.md": content },
        });
        try {
          yield* workspace.provide(
            Effect.gen(function* () {
              const before = workspace.snapshot();
              const cleanup = yield* reconcileAgentOutputs({
                desiredAgentIds: new Set(["claude-code"]),
                expectedNames: expectedNames({ skill: enabled ? ["review"] : [] }),
                dryRun: true,
              });
              expect(cleanup).toEqual({
                removedPaths: [],
                preservedPaths: [],
                nativeLocations: [],
                rowChanges: [],
                warnings: [],
              });
              yield* previewSync();
              expect(workspace.snapshot()).toEqual(before);
              yield* applySync();
              expect(workspace.readFile("skills/review/skill.json")).toBe(manifest);
              expect(workspace.readFile("skills/review/src/SKILL.md")).toBe(content);
              const settled = workspace.snapshot();
              yield* previewSync();
              yield* applySync();
              expect(workspace.snapshot()).toEqual(settled);
            }),
          );
        } finally {
          workspace.cleanup();
        }
      }).pipe(Effect.provide(NativePlatformTest)),
  );
});
