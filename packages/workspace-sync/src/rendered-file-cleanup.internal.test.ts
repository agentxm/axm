import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  codingAgentForId,
  CodingAgentRepository,
  hasAxmManagedMarker,
} from "@agentxm/extension-workspace";
import type { CodingAgentRepositoryService } from "@agentxm/extension-workspace";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { makeBaseWorkspaceMock } from "@agentxm/workspace-state/testing";
import { reconcileAgentOutputs } from "./index.js";

const AXM_MANAGED_MARKER =
  "<!-- axm:file v=1 ext=@acme/subagents/test src=agent_extensions/@acme/subagents/test -->";

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
  it.effect("removes only AXM-managed skill and subagent artifacts for removed agents", () =>
    Effect.gen(function* () {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-agent-cleanup-"));
      try {
        const axmDir = path.join(tempDir, ".axm");
        const canonicalSkill = path.join(
          tempDir,
          "agent_extensions",
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
        const managedChainedLink = path.join(cursorSkills, "shared-code-review");
        const unmanagedSkill = path.join(cursorSkills, "user-skill");
        fs.symlinkSync(canonicalSkill, managedSkillLink);
        fs.symlinkSync(canonicalSkill, managedSharedLink);
        fs.symlinkSync(managedSharedLink, managedChainedLink);
        fs.mkdirSync(unmanagedSkill, { recursive: true });
        fs.writeFileSync(path.join(unmanagedSkill, "SKILL.md"), "# User skill\n");

        const managedSubagent = path.join(cursorSubagents, "reviewer.md");
        const unmanagedSubagent = path.join(cursorSubagents, "manual.md");
        fs.writeFileSync(managedSubagent, `${AXM_MANAGED_MARKER}\nsubagent body\n`);
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
          NodeServices.layer,
          Layer.succeed(WorkspaceMutations, makeBaseWorkspaceMock(axmDir)),
          Layer.succeed(CodingAgentRepository, agentRepo),
        );

        const preview = yield* reconcileAgentOutputs({
          desiredAgentIds: new Set(),
          expectedNames: expectedNames(),
          dryRun: true,
        }).pipe(Effect.provide(layer));

        expect(preview.removedPaths).toEqual(
          expect.arrayContaining([managedSkillLink, managedChainedLink, managedSubagent]),
        );
        expect(preview.preservedPaths).toEqual(
          expect.arrayContaining([unmanagedSkill, unmanagedSubagent]),
        );
        expect(fs.existsSync(managedSkillLink)).toBe(true);
        expect(fs.existsSync(managedSubagent)).toBe(true);

        const result = yield* reconcileAgentOutputs({
          desiredAgentIds: new Set(),
          expectedNames: expectedNames(),
        }).pipe(Effect.provide(layer));

        expect(result.removedPaths).toEqual(
          expect.arrayContaining([managedSkillLink, managedChainedLink, managedSubagent]),
        );
        expect(result.preservedPaths).toEqual(
          expect.arrayContaining([unmanagedSkill, unmanagedSubagent]),
        );
        expect(fs.existsSync(managedSkillLink)).toBe(false);
        expect(fs.existsSync(managedChainedLink)).toBe(false);
        expect(fs.existsSync(managedSharedLink)).toBe(true);
        expect(fs.existsSync(managedSubagent)).toBe(false);
        expect(fs.existsSync(unmanagedSkill)).toBe(true);
        expect(fs.existsSync(unmanagedSubagent)).toBe(true);
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
          fs.writeFileSync(file, `${AXM_MANAGED_MARKER}\nbody\n`);
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
          NodeServices.layer,
          Layer.succeed(WorkspaceMutations, makeBaseWorkspaceMock(axmDir)),
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
  it.effect("reconciles the synthetic universal skill container", () =>
    Effect.gen(function* () {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-universal-cleanup-"));
      try {
        const source = path.join(tempDir, "agent_extensions", "@acme", "skills", "retired", "src");
        const skillsDir = path.join(tempDir, ".agents", "skills");
        const projection = path.join(skillsDir, "retired");
        fs.mkdirSync(source, { recursive: true });
        fs.mkdirSync(skillsDir, { recursive: true });
        fs.symlinkSync(source, projection);

        const universal = codingAgentForId("universal");
        const agentRepo: CodingAgentRepositoryService = {
          get: () => Effect.succeed(universal),
          all: Effect.succeed([universal]),
          getConfiguredAgents: () => Effect.succeed([]),
          getMaterializationAgents: () => Effect.succeed([universal]),
          getUnknownConfiguredAgentIds: () => Effect.succeed([]),
        };
        const layer = Layer.mergeAll(
          NodeServices.layer,
          Layer.succeed(WorkspaceMutations, makeBaseWorkspaceMock(path.join(tempDir, ".axm"))),
          Layer.succeed(CodingAgentRepository, agentRepo),
        );

        yield* reconcileAgentOutputs({
          desiredAgentIds: new Set(["universal"]),
          expectedNames: expectedNames(),
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
          const workspace = makeBaseWorkspaceMock(path.join(tempDir, ".axm"), {
            getConfiguredAgents: () => Effect.succeed(["cursor"]),
          });
          const layer = Layer.mergeAll(
            NodeServices.layer,
            Layer.succeed(WorkspaceMutations, workspace),
            Layer.succeed(CodingAgentRepository, agentRepo),
          );

          const preview = yield* reconcileAgentOutputs({
            desiredAgentIds: new Set(["cursor"]),
            expectedNames: expectedNames({ skill: ["current"] }),
            dryRun: true,
          }).pipe(Effect.provide(layer));
          expect(preview.removedPaths).toEqual([retired]);
          expect(fs.existsSync(retired)).toBe(true);

          yield* reconcileAgentOutputs({
            desiredAgentIds: new Set(["cursor"]),
            expectedNames: expectedNames({ skill: ["current"] }),
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
      NodeServices.layer,
      Layer.succeed(WorkspaceMutations, makeBaseWorkspaceMock(path.join(tempDir, ".axm"))),
      Layer.succeed(CodingAgentRepository, agentRepo),
    );
  };

  it.effect("removes AXM-managed MCP entries and keeps user-authored servers", () =>
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
                  "x-axm": {
                    v: 1,
                    managed: true,
                    ext: "@workspace/mcps/acme-managed",
                    source: "inline",
                  },
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
        }).pipe(Effect.provide(makeClaudeCodeLayer(tempDir)));

        const parsed: unknown = JSON.parse(fs.readFileSync(mcpConfig, "utf8"));
        expect(parsed).toEqual({
          mcpServers: { "user-server": { command: "npx", args: ["-y", "user-mcp"] } },
        });
        expect(result.removedPaths).toEqual(expect.arrayContaining([`${mcpConfig}#acme-managed`]));
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }),
  );

  it.effect("strips AXM-managed hook groups and keeps user-authored groups", () =>
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
                        "x-axm": {
                          v: 1,
                          managed: true,
                          unit: "hook:guard",
                          source: "extension",
                          ref: "@acme/hooks/guard",
                        },
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
          desiredAgentIds: new Set(),
          expectedNames: expectedNames(),
          dryRun: true,
        }).pipe(Effect.provide(makeClaudeCodeLayer(tempDir)));
        expect(preview.removedPaths).toContain(`${settingsPath}#guard`);
        expect(fs.readFileSync(settingsPath, "utf8")).toBe(before);

        const result = yield* reconcileAgentOutputs({
          desiredAgentIds: new Set(),
          expectedNames: expectedNames(),
        }).pipe(Effect.provide(makeClaudeCodeLayer(tempDir)));

        const parsed: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        expect(parsed).toEqual({
          permissions: { allow: ["Bash"] },
          hooks: { PreToolUse: [unownedCollision, userGroup] },
        });
        expect(result.removedPaths).toEqual(expect.arrayContaining([`${settingsPath}#guard`]));
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }),
  );

  it.effect("drops the hooks key entirely when only managed groups existed", () =>
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
                        "x-axm": {
                          v: 1,
                          managed: true,
                          unit: "hook:guard",
                          source: "extension",
                          ref: "@acme/hooks/guard",
                        },
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

        yield* reconcileAgentOutputs({
          desiredAgentIds: new Set(),
          expectedNames: expectedNames(),
        }).pipe(Effect.provide(makeClaudeCodeLayer(tempDir)));

        const parsed: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        expect(parsed).toEqual({});
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
                "x-axm": {
                  v: 1,
                  managed: true,
                  ext: "@workspace/mcps/acme-managed",
                  source: "inline",
                },
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

describe("hasAxmManagedMarker", () => {
  it("matches the full managed-file banner", () => {
    expect(hasAxmManagedMarker(AXM_MANAGED_MARKER)).toBe(true);
    expect(hasAxmManagedMarker('{"_axm_managed": true}')).toBe(false);
  });

  it("does not match a user file that merely mentions the phrase", () => {
    // A user-authored subagent file that references "AXM managed" (e.g.
    // documentation) must not be treated as a managed artifact and deleted.
    expect(hasAxmManagedMarker("# Notes on how AXM managed extensions work")).toBe(false);
    expect(hasAxmManagedMarker("This skill explains AXM managed regions.")).toBe(false);
  });
});
