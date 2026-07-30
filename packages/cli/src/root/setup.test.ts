// Raw node:fs/node:os/node:path in test setup is the repo-wide convention for
// temp-dir fixtures; the old #51 migration marker referenced a tracker entry
// that no longer exists.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Settings } from "@agentxm/client-core/unstable/settings";
import { LockfileSchema } from "@agentxm/client-core/unstable/lockfile";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import { RegistryUrl } from "@agentxm/client-core/unstable/auth";
import { BRANDING } from "@agentxm/client-core/unstable/branding";
import { AgentExecutableResolver } from "@agentxm/client-core/unstable/agents";
import { TestMachineRenderer, TestRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import { normalizeHandle } from "@agentxm/client-core/unstable/extensions";
import { WorkspaceInitializationInteractionTest } from "@agentxm/client-core/unstable/workspace";
import {
  expectAppliedPlanResult,
  expectDefined,
  expectNoOpPlanResult,
  expectPreviewedPlanResult,
} from "../test-helpers.js";
import { computePackageContentHashSync } from "../test-stubs.js";
import {
  AXM_SKILL_JSON,
  AXM_SKILL_MD,
  AXM_SKILL_VERSION,
} from "../__generated__/bundled-axm-skill.js";
import { handleSetup, SetupSkillInstaller, SetupSkillInstallerLive } from "./setup.js";

const readJson = (filePath: string): Settings => JSON.parse(fs.readFileSync(filePath, "utf-8"));
const readLockfile = (filePath: string) =>
  Schema.decodeUnknownSync(LockfileSchema)(YAML.parse(fs.readFileSync(filePath, "utf-8")));
const telemetrySuggestion = {
  description:
    'Disable telemetry with AXM_TELEMETRY=0 or by setting "telemetry": false in settings',
};

const makeSetupTestContext = (opts?: {
  readonly flags?: {
    verbose?: boolean;
    debug?: boolean;
    json?: boolean;
    quiet?: boolean;
    nonInteractive?: boolean;
  };
  readonly selectAgents?: ReadonlyArray<string>;
  readonly scope?: "project" | "user";
  readonly installer?: "stub" | "live";
  readonly renderer?: "text" | "machine";
}) => {
  const renderer = opts?.renderer === "machine" ? TestMachineRenderer.make() : TestRenderer.make();
  const installCalls: Array<{
    readonly scope: "project" | "user";
    readonly yes: boolean;
    readonly force: boolean;
    readonly preview: boolean;
  }> = [];
  const selectAgentsOverride = opts?.selectAgents;
  const workspaceInitInteraction = WorkspaceInitializationInteractionTest(
    selectAgentsOverride === undefined
      ? undefined
      : {
          selectAgents: () => Effect.succeed(selectAgentsOverride),
        },
  );
  const baseLayer = Layer.mergeAll(
    NodeServices.layer,
    renderer.layer,
    workspaceInitInteraction.layer,
    TestFlagsLayer(opts?.flags),
    Layer.succeed(RegistryUrl, "https://registry.invalid"),
    Layer.succeed(AgentExecutableResolver, {
      exists: () => Effect.succeed(false),
    }),
  );
  const layer =
    opts?.installer === "live"
      ? Layer.provideMerge(SetupSkillInstallerLive, baseLayer)
      : Layer.mergeAll(
          baseLayer,
          Layer.succeed(SetupSkillInstaller, {
            installDefaultSkill: (args) =>
              Effect.sync(() => {
                installCalls.push(args);
              }),
          }),
        );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
  const provide = <A, E>(effect: Effect.Effect<A, E, any>) => effect.pipe(Effect.provide(layer));

  return {
    provide,
    installCalls,
    promptState: workspaceInitInteraction.state,
    rendererState: renderer.state,
  };
};

describe("setup.handler", () => {
  let tempDir: string;
  let homeDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalHome = process.env["HOME"];
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "setup-handler-test-"));
    homeDir = path.join(tempDir, "home");
    fs.mkdirSync(homeDir, { recursive: true });
    process.chdir(tempDir);
    process.env["HOME"] = homeDir;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalHome === undefined) {
      delete process.env["HOME"];
    } else {
      process.env["HOME"] = originalHome;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("workspace initialization", () => {
    it.effect("creates .axm, settings.json, and lockfile", () => {
      const { provide, installCalls } = makeSetupTestContext({
        flags: { nonInteractive: false },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleSetup({ scope: "project" });

          const axmDir = path.join(tempDir, ".axm");
          expect(fs.existsSync(axmDir)).toBe(true);
          expect(fs.existsSync(path.join(axmDir, "settings.json"))).toBe(true);
          expect(fs.existsSync(path.join(axmDir, "axm-lock.yaml"))).toBe(true);

          const settings = readJson(path.join(axmDir, "settings.json"));
          expect(settings.skills?.["axm"]).toBe("workspace:@agentxm/skills/axm");
          expect(installCalls).toEqual([
            { scope: "project", yes: false, force: false, preview: false },
          ]);
        }),
      );
    });

    it.effect(
      "reports already initialized on re-run without reinstalling the bundled skill",
      () => {
        const { provide, installCalls, rendererState } = makeSetupTestContext({
          flags: { nonInteractive: true },
        });

        return provide(
          Effect.gen(function* () {
            yield* handleSetup({ scope: "project", agents: ["claude-code"] });
            yield* handleSetup({ scope: "project", agents: ["claude-code"] });

            const successMessages = rendererState.logs
              .filter((entry) => entry._tag === "success")
              .map((entry) => entry.message);
            expect(successMessages).toEqual([
              "Initialized with agents: Claude Code",
              "Workspace already initialized with agents: Claude Code",
            ]);
            expect(installCalls).toEqual([
              { scope: "project", yes: false, force: false, preview: false },
            ]);
          }),
        );
      },
    );

    it.effect("emits initialized status in machine output", () => {
      const { provide, installCalls, rendererState } = makeSetupTestContext({
        flags: { json: true, nonInteractive: true },
        renderer: "machine",
      });

      return provide(
        Effect.gen(function* () {
          yield* handleSetup({ scope: "project", agents: ["claude-code"] });

          expect(installCalls).toEqual([
            { scope: "project", yes: false, force: false, preview: false },
          ]);
          const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
            planName: "Set up AXM workspace",
            totalSteps: 3,
            appliedCount: 3,
          });
          expect(result).toMatchObject({
            steps: [
              expect.objectContaining({
                label: "Workspace configuration",
                status: "applied",
                artifact: expect.objectContaining({
                  change: "created",
                }),
              }),
              expect.objectContaining({
                label: "Instruction files",
                status: "applied",
              }),
              expect.objectContaining({
                label: "@agentxm/skills/axm",
                status: "applied",
                artifact: expect.objectContaining({
                  path: ".axm/extensions/@agentxm/skills/axm",
                  version: AXM_SKILL_VERSION,
                }),
              }),
            ],
            status: "initialized",
            changed: true,
            defaultSkillInstalled: true,
            scope: "project",
            agents: [{ id: "claude-code", name: "Claude Code" }],
            telemetryEnabled: true,
          });
          expect(rendererState.suggestions).toEqual([
            { description: "Inspect configured agents", cmd: "axm agents list" },
            { description: "Inspect installed skills", cmd: "axm skills list" },
            { description: "Discover recommended extensions", cmd: "axm discover" },
            telemetrySuggestion,
          ]);
        }),
      );
    });

    it.effect("ends initialized setup with actionable suggestions", () => {
      const { provide, rendererState } = makeSetupTestContext({
        flags: { nonInteractive: true },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleSetup({ scope: "project", agents: ["claude-code"] });

          expect(rendererState.suggestions).toEqual([
            { description: "Inspect configured agents", cmd: "axm agents list" },
            { description: "Inspect installed skills", cmd: "axm skills list" },
            { description: "Discover recommended extensions", cmd: "axm discover" },
            telemetrySuggestion,
          ]);
        }),
      );
    });

    it.effect("reports the bundled AXM skill footprint in normal setup output", () => {
      const { provide, rendererState } = makeSetupTestContext({
        flags: { nonInteractive: true },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleSetup({ scope: "project", agents: ["claude-code"] });

          expect(rendererState.logs).toContainEqual({
            _tag: "info",
            message:
              "Skill: @agentxm/skills/axm -> .axm/extensions/@agentxm/skills/axm, .claude/skills/axm",
          });
        }),
      );
    });

    it.effect("fails on unrecognized requested agents before setup output", () => {
      const { provide, installCalls, rendererState } = makeSetupTestContext({
        flags: { json: true, nonInteractive: true },
        renderer: "machine",
      });

      return provide(
        Effect.gen(function* () {
          const result = yield* handleSetup({
            scope: "project",
            agents: ["claude-code", "not-an-agent"],
          }).pipe(
            Effect.as({ _tag: "success" as const }),
            Effect.catchTag("AppError", (error) =>
              Effect.succeed({ _tag: "error" as const, error }),
            ),
          );

          expect(result._tag).toBe("error");
          if (result._tag === "error") {
            expect(result.error.code).toBe("validation");
            expect(result.error.detail).toContain("not-an-agent");
            expect(result.error.suggestions).toEqual([
              { description: "Show available setup agents.", cmd: "axm setup --help" },
            ]);
          }
          expect(installCalls).toEqual([]);
          expect(rendererState.logs).toEqual([]);
          expect(rendererState.results).toEqual([]);
          expect(fs.existsSync(path.join(tempDir, ".axm", "settings.json"))).toBe(false);
        }),
      );
    });

    it.effect("emits already-initialized status in machine output on re-run", () => {
      const { provide, installCalls, rendererState } = makeSetupTestContext({
        flags: { json: true, nonInteractive: true },
        renderer: "machine",
      });

      return provide(
        Effect.gen(function* () {
          yield* handleSetup({ scope: "project", agents: ["claude-code"] });
          yield* handleSetup({ scope: "project", agents: ["claude-code"] });

          expect(installCalls).toEqual([
            { scope: "project", yes: false, force: false, preview: false },
          ]);
          const result = expectNoOpPlanResult(rendererState.results[1]?.data, {
            planName: "Set up AXM workspace",
            totalSteps: 2,
          });
          expect(result).toMatchObject({
            steps: [
              expect.objectContaining({
                label: "Workspace configuration",
                status: "unchanged",
              }),
              expect.objectContaining({
                label: "Instruction files",
                status: "unchanged",
              }),
            ],
            status: "already-initialized",
            changed: false,
            defaultSkillInstalled: false,
            scope: "project",
            agents: [{ id: "claude-code", name: "Claude Code" }],
          });
          expect(rendererState.suggestions).toEqual([
            { description: "Inspect configured agents", cmd: "axm agents list" },
            { description: "Inspect installed skills", cmd: "axm skills list" },
            { description: "Discover recommended extensions", cmd: "axm discover" },
            telemetrySuggestion,
            { description: "Inspect configured agents", cmd: "axm agents list" },
            { description: "Inspect installed skills", cmd: "axm skills list" },
            { description: "Discover recommended extensions", cmd: "axm discover" },
            telemetrySuggestion,
          ]);
        }),
      );
    });

    it.effect("pseudo-installs the bundled AXM skill without registry services", () => {
      const { provide } = makeSetupTestContext({ installer: "live" });

      return provide(
        Effect.gen(function* () {
          yield* handleSetup({ scope: "project", agents: ["claude-code"] });

          const axmDir = path.join(tempDir, ".axm");
          const skillJsonPath = path.join(
            axmDir,
            "extensions",
            "@agentxm",
            "skills",
            "axm",
            "skill.json",
          );
          const skillMdPath = path.join(
            axmDir,
            "extensions",
            "@agentxm",
            "skills",
            "axm",
            "src",
            "SKILL.md",
          );
          const agentSkillPath = path.join(tempDir, ".claude", "skills", "axm");

          expect(JSON.parse(fs.readFileSync(skillJsonPath, "utf-8"))).toEqual(
            JSON.parse(AXM_SKILL_JSON),
          );
          expect(fs.readFileSync(skillMdPath, "utf-8")).toBe(AXM_SKILL_MD);
          expect(fs.existsSync(agentSkillPath)).toBe(true);

          const lockfile = readLockfile(path.join(axmDir, "axm-lock.yaml"));
          const axmLockEntry = expectDefined(lockfile.skills["axm"]);
          expect(axmLockEntry.type).toBe("workspace");
          if (axmLockEntry.type !== "workspace") return;
          expect(axmLockEntry.owner).toBe("@agentxm");
          expect(axmLockEntry.name).toBe("axm");
          expect(axmLockEntry.version).toBe(AXM_SKILL_VERSION);
          expect(axmLockEntry.sourceHash).toBe(
            computePackageContentHashSync(path.dirname(path.dirname(skillMdPath))),
          );
          expect(axmLockEntry).not.toHaveProperty("agents");
        }),
      );
    });

    it.effect("preserves existing settings", () => {
      const { provide, installCalls } = makeSetupTestContext({
        flags: { nonInteractive: false },
      });

      return provide(
        Effect.gen(function* () {
          const axmDir = path.join(tempDir, ".axm");
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(
            path.join(axmDir, "settings.json"),
            JSON.stringify({
              agents: ["claude-code", "cursor"],
              skills: { commit: "^1.0.0" },
              owner: normalizeHandle("@myorg"),
            }),
          );
          fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 3\nskills: {}\n");

          yield* handleSetup({ scope: "project" });

          const settings = readJson(path.join(axmDir, "settings.json"));
          expect(settings.agents).toEqual(["claude-code", "cursor"]);
          expect(settings.skills?.["commit"]).toBe("^1.0.0");
          expect(settings.owner).toBe("@myorg");
          expect(installCalls).toEqual([]);
        }),
      );
    });

    it.effect("enables instruction sync and writes the shared source", () => {
      const { provide } = makeSetupTestContext();

      return provide(
        Effect.gen(function* () {
          fs.mkdirSync(path.join(tempDir, ".git"));

          yield* handleSetup({ scope: "project", agents: ["claude-code"], yes: true });

          const settings = readJson(path.join(tempDir, ".axm", "settings.json"));
          expect(settings.agents).toEqual(["claude-code"]);
          expect(settings.rulesConfig?.instructions).toEqual({
            fileName: "AGENTS.md",
            gitignoreAliases: true,
          });
          expect(fs.existsSync(path.join(tempDir, "AGENTS.md"))).toBe(true);
          expect(fs.existsSync(path.join(tempDir, "CLAUDE.md"))).toBe(true);
          expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf-8")).toContain(
            "**/CLAUDE.md",
          );
        }),
      );
    });

    it.effect("enables instruction sync without writing gitignore outside a git workspace", () => {
      const { provide } = makeSetupTestContext();

      return provide(
        Effect.gen(function* () {
          yield* handleSetup({ scope: "project", agents: ["claude-code"], yes: true });

          expect(fs.existsSync(path.join(tempDir, "AGENTS.md"))).toBe(true);
          expect(fs.existsSync(path.join(tempDir, "CLAUDE.md"))).toBe(true);
          expect(fs.existsSync(path.join(tempDir, ".gitignore"))).toBe(false);
        }),
      );
    });

    it.effect("seeds AGENTS.md from the richest existing instruction file", () => {
      const { provide } = makeSetupTestContext();

      return provide(
        Effect.gen(function* () {
          fs.writeFileSync(path.join(tempDir, "CLAUDE.md"), "# Existing\n\nKeep this.\n");

          yield* handleSetup({ scope: "project", agents: ["claude-code"], yes: true });

          expect(fs.readFileSync(path.join(tempDir, "AGENTS.md"), "utf-8")).toBe(
            "# Existing\n\nKeep this.\n",
          );
        }),
      );
    });

    it.effect("preview renders the setup plan without writing workspace files", () => {
      const { provide, installCalls } = makeSetupTestContext();

      return provide(
        Effect.gen(function* () {
          yield* handleSetup({
            scope: "project",
            agents: ["claude-code"],
            yes: true,
            preview: true,
          });

          expect(fs.existsSync(path.join(tempDir, ".axm"))).toBe(false);
          expect(fs.existsSync(path.join(tempDir, "AGENTS.md"))).toBe(false);
          expect(fs.existsSync(path.join(tempDir, "CLAUDE.md"))).toBe(false);
          expect(installCalls).toEqual([]);
        }),
      );
    });

    it.effect("ends setup preview with an apply suggestion", () => {
      const { provide, rendererState } = makeSetupTestContext();

      return provide(
        Effect.gen(function* () {
          yield* handleSetup({
            scope: "project",
            agents: ["claude-code"],
            yes: true,
            preview: true,
          });

          expect(rendererState.suggestions).toEqual([
            { description: "Apply setup", cmd: "axm setup --yes" },
          ]);
        }),
      );
    });

    it.effect("emits preview status in machine output without writing workspace files", () => {
      const { provide, installCalls, rendererState } = makeSetupTestContext({
        flags: { json: true, nonInteractive: true },
        renderer: "machine",
      });

      return provide(
        Effect.gen(function* () {
          yield* handleSetup({
            scope: "project",
            agents: ["claude-code"],
            yes: true,
            preview: true,
          });

          expect(fs.existsSync(path.join(tempDir, ".axm"))).toBe(false);
          expect(installCalls).toEqual([]);
          const result = expectPreviewedPlanResult(rendererState.results[0]?.data, {
            planName: "Set up AXM workspace",
            totalSteps: 3,
          });
          expect(result).toMatchObject({
            steps: [
              expect.objectContaining({
                label: "Workspace configuration",
                status: "ready",
              }),
              expect.objectContaining({
                label: "Instruction files",
                status: "ready",
              }),
              expect.objectContaining({
                label: "@agentxm/skills/axm",
                status: "ready",
              }),
            ],
            status: "preview",
            changed: false,
            defaultSkillInstalled: false,
            scope: "project",
            agents: [{ id: "claude-code", name: "Claude Code" }],
          });
          expect(rendererState.suggestions).toEqual([
            { description: "Apply setup", cmd: "axm setup --yes" },
          ]);
        }),
      );
    });
  });

  describe("user scope", () => {
    it.effect(
      "creates settings in the user workspace without touching the project workspace",
      () => {
        const { provide, installCalls } = makeSetupTestContext({ scope: "user" });

        return provide(
          Effect.gen(function* () {
            yield* handleSetup({ scope: "user" });

            const userSettingsPath = path.join(homeDir, ".axm", "settings.json");
            const projectSettingsPath = path.join(tempDir, ".axm", "settings.json");
            expect(fs.existsSync(userSettingsPath)).toBe(true);
            expect(fs.existsSync(projectSettingsPath)).toBe(false);

            const settings = readJson(userSettingsPath);
            expect(settings.skills?.["axm"]).toBe("workspace:@agentxm/skills/axm");
            expect(installCalls).toEqual([
              { scope: "user", yes: false, force: false, preview: false },
            ]);
          }),
        );
      },
    );
  });

  describe("agent selection", () => {
    it.effect("interactive mode prompts for agent selection", () => {
      const { provide, promptState } = makeSetupTestContext({
        flags: { nonInteractive: false },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleSetup({ scope: "project" });
          expect(promptState.selectAgentsCalls).toHaveLength(1);
        }),
      );
    });

    it.effect("non-interactive mode auto-selects detected agents without prompting", () => {
      const { provide, promptState } = makeSetupTestContext({
        flags: { nonInteractive: true },
      });

      return provide(
        Effect.gen(function* () {
          fs.mkdirSync(path.join(tempDir, ".claude"), { recursive: true });

          yield* handleSetup({ scope: "project" });

          const settings = readJson(path.join(tempDir, ".axm", "settings.json"));
          expect(promptState.selectAgentsCalls).toHaveLength(0);
          expect(settings.agents).toContain("claude-code");
        }),
      );
    });

    it.effect("uses the explicit agent multiselect result", () => {
      const { provide } = makeSetupTestContext({
        flags: { nonInteractive: false },
        selectAgents: ["claude-code"],
      });

      return provide(
        Effect.gen(function* () {
          yield* handleSetup({ scope: "project" });

          const settings = readJson(path.join(tempDir, ".axm", "settings.json"));
          expect(expectDefined(settings.agents)).toEqual(["claude-code"]);
        }),
      );
    });
  });

  describe("telemetry notice", () => {
    it.effect("displays telemetry guidance after setup", () => {
      const { provide, rendererState } = makeSetupTestContext();

      return provide(
        Effect.gen(function* () {
          yield* handleSetup({ scope: "project" });

          const infoMessages = rendererState.logs
            .filter((entry) => entry._tag === "info")
            .map((entry) => entry.message);
          expect(infoMessages).toContain("Telemetry is enabled to help improve AXM.");
          expect(infoMessages).not.toContain(
            '  AXM_TELEMETRY=0 or set "telemetry": false in settings',
          );
          expect(rendererState.suggestions).toContainEqual(telemetrySuggestion);
        }),
      );
    });

    it.effect("suppresses telemetry guidance when AXM_TELEMETRY=0", () => {
      const previousTelemetry = process.env["AXM_TELEMETRY"];
      process.env["AXM_TELEMETRY"] = "0";
      const { provide, rendererState } = makeSetupTestContext();

      return provide(
        Effect.gen(function* () {
          yield* handleSetup({ scope: "project" });

          const infoMessages = rendererState.logs
            .filter((entry) => entry._tag === "info")
            .map((entry) => entry.message);
          expect(infoMessages).not.toContain("Telemetry is enabled to help improve AXM.");
          expect(rendererState.suggestions).not.toContainEqual(telemetrySuggestion);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              if (previousTelemetry === undefined) {
                delete process.env["AXM_TELEMETRY"];
              } else {
                process.env["AXM_TELEMETRY"] = previousTelemetry;
              }
            }),
          ),
        ),
      );
    });
  });

  describe("branding", () => {
    it.effect("shows AXM branding at the start of text setup", () => {
      const { provide, rendererState } = makeSetupTestContext({
        flags: { nonInteractive: false },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleSetup({ scope: "project" });

          expect(rendererState.logs.slice(0, 3)).toEqual([
            { _tag: "message", message: "" },
            { _tag: "message", message: BRANDING },
            { _tag: "message", message: "" },
          ]);
        }),
      );
    });

    it.effect("does not emit branding in JSON mode", () => {
      const { provide, rendererState } = makeSetupTestContext({
        flags: { json: true },
        renderer: "machine",
      });

      return provide(
        Effect.gen(function* () {
          yield* handleSetup({ scope: "project" });

          const messageLogs = rendererState.logs.filter((entry) => entry._tag === "message");
          expect(messageLogs).toEqual([]);
        }),
      );
    });

    it.effect("does not emit branding in non-interactive mode", () => {
      const { provide, rendererState } = makeSetupTestContext({
        flags: { nonInteractive: true },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleSetup({ scope: "project", agents: ["claude-code"] });

          const messageLogs = rendererState.logs.filter((entry) => entry._tag === "message");
          expect(messageLogs.some((entry) => entry.message === BRANDING)).toBe(false);
          expect(rendererState.logs[0]).toEqual({
            _tag: "success",
            message: "Initialized with agents: Claude Code",
          });
        }),
      );
    });

    it.effect("keeps quiet setup to the outcome line", () => {
      const { provide, rendererState } = makeSetupTestContext({
        flags: { quiet: true, nonInteractive: true },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleSetup({ scope: "project", agents: ["claude-code"] });

          expect(rendererState.logs).toEqual([
            {
              _tag: "success",
              message: "Initialized with agents: Claude Code",
            },
          ]);
          expect(rendererState.suggestions).toEqual([]);
        }),
      );
    });
  });

  describe("subagent detection", () => {
    it.effect("notes existing subagent files", () => {
      const { provide, rendererState } = makeSetupTestContext();

      return provide(
        Effect.gen(function* () {
          const agentsDir = path.join(tempDir, ".claude", "agents");
          fs.mkdirSync(agentsDir, { recursive: true });
          fs.writeFileSync(path.join(agentsDir, "my-agent.md"), "# My Agent\nInstructions");

          yield* handleSetup({ scope: "project", agents: ["claude-code"] });

          const infoMessages = rendererState.logs
            .filter((entry) => entry._tag === "info")
            .map((entry) => entry.message);
          expect(infoMessages.some((message) => message.includes("existing subagent file"))).toBe(
            true,
          );
          expect(infoMessages.some((message) => message.includes("Claude Code"))).toBe(true);
        }),
      );
    });
  });

  describe("error handling", () => {
    it.effect("fails when the existing settings file is invalid JSON", () => {
      const { provide } = makeSetupTestContext();

      return provide(
        Effect.gen(function* () {
          const axmDir = path.join(tempDir, ".axm");
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(path.join(axmDir, "settings.json"), "not valid json {{{");
          fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 3\nskills: {}\n");

          const error = yield* handleSetup({ scope: "project" }).pipe(Effect.flip);
          expect(error._tag).toBe("AppError");
        }),
      );
    });
  });
});
