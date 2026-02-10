import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import type { FileSystem, Path } from "@effect/platform";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach, vi } from "vitest";
import { type Log, makeLogTestLayer, type Confirm, makeConfirmTestLayer } from "../tui/index.js";
import type { Settings } from "../settings/index.js";
import { Workspace } from "./service.js";
import { ensureAgentsConfigured, EnsureAgentsError } from "./ensure-agents.js";

// Mock TTY utilities so isInteractive() returns true in tests
vi.mock("../utils/tty.js", () => ({
  isInteractive: vi.fn(() => true),
}));

describe("ensureAgentsConfigured", () => {
  let tempDir: string;
  let axmDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ensure-agents-test-"));
    axmDir = path.join(tempDir, ".axm");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const initSettings = (settings: Settings): void => {
    fs.mkdirSync(axmDir, { recursive: true });
    fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings, null, 2));
  };

  const makeTestLayer = (confirmValue = true) => {
    const [logLayer, mockLog] = makeLogTestLayer();
    const [confirmLayer] = makeConfirmTestLayer({ type: "return", value: confirmValue });
    const WsLayer = Workspace.layer({
      global: false,
      path: axmDir,
      nonInteractive: true,
      preview: false,
      resolvePlan: () => Effect.succeed({ name: "mock", description: Option.none(), jobs: [] }),
      getConfiguredSources: () => Effect.succeed([]),
      getConfiguredSourceByName: () => Effect.succeed(Option.none()),
      getConfiguredRegistrySources: () => Effect.succeed([]),
      getConfiguredScope: () => Effect.succeed("@community"),
      addConfiguredSource: () => Effect.void,
      getInstalledSkills: () => Effect.succeed({}),
      getConfiguredAgents: () =>
        Effect.try(() => {
          const content = fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8");
          const settings = JSON.parse(content) as Settings;
          return (settings.agents ?? []) as ReadonlyArray<string>;
        }).pipe(Effect.catchAll(() => Effect.succeed<ReadonlyArray<string>>([]))),
      getLockedSkills: () => Effect.succeed({}),
      getLockedSkill: () => Effect.succeed(Option.none()),
      setSkill: () => Effect.void,
      removeSkill: () => Effect.void,
      addConfiguredAgent: (agentId: string) =>
        Effect.try(() => {
          const content = fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8");
          const settings = JSON.parse(content) as Record<string, unknown>;
          const agents = (settings["agents"] ?? []) as string[];
          if (!agents.includes(agentId)) {
            settings["agents"] = [...agents, agentId];
            fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings, null, 2));
          }
        }).pipe(Effect.catchAll(() => Effect.void)),
    });
    const TestLayer = Layer.mergeAll(NodeContext.layer, logLayer, confirmLayer, WsLayer);
    return { TestLayer, mockLog };
  };

  const withLayer =
    (layer: Layer.Layer<FileSystem.FileSystem | Path.Path | Log | Confirm | Workspace>) =>
    <A, E>(
      effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Log | Confirm | Workspace>,
    ) =>
      effect.pipe(Effect.provide(layer));

  const baseOpts = (overrides?: Partial<Parameters<typeof ensureAgentsConfigured>[0]>) => ({
    agentFlags: [] as readonly string[],
    yes: false,
    nonInteractive: false,
    ...overrides,
  });

  describe("when no --agent flags provided", () => {
    it.effect("returns agents from settings", () => {
      const { TestLayer } = makeTestLayer();
      return withLayer(TestLayer)(
        Effect.gen(function* () {
          initSettings({ agents: ["claude-code", "cursor"] } as Settings);

          const agents = yield* ensureAgentsConfigured(baseOpts());

          expect(agents).toHaveLength(2);
          expect(agents[0]!.id).toBe("claude-code");
          expect(agents[1]!.id).toBe("cursor");
        }),
      );
    });

    it.effect("fails with EnsureAgentsError when settings has no agents", () => {
      const { TestLayer } = makeTestLayer();
      return withLayer(TestLayer)(
        Effect.gen(function* () {
          initSettings({});

          const error = yield* ensureAgentsConfigured(baseOpts()).pipe(Effect.flip);

          expect(error._tag).toBe("EnsureAgentsError");
          expect((error as EnsureAgentsError).message).toContain("No agents configured");
        }),
      );
    });

    it.effect("fails with EnsureAgentsError when settings has empty agents", () => {
      const { TestLayer } = makeTestLayer();
      return withLayer(TestLayer)(
        Effect.gen(function* () {
          initSettings({ agents: [] } as Settings);

          const error = yield* ensureAgentsConfigured(baseOpts()).pipe(Effect.flip);

          expect(error._tag).toBe("EnsureAgentsError");
        }),
      );
    });
  });

  describe("when --agent flags provided", () => {
    it.effect("returns agents from flags", () => {
      const { TestLayer } = makeTestLayer();
      return withLayer(TestLayer)(
        Effect.gen(function* () {
          initSettings({ agents: ["claude-code"] } as Settings);

          const agents = yield* ensureAgentsConfigured(
            baseOpts({ agentFlags: ["claude-code"], yes: true }),
          );

          expect(agents).toHaveLength(1);
          expect(agents[0]!.id).toBe("claude-code");
        }),
      );
    });

    it.effect("warns about unknown agent IDs", () => {
      const { TestLayer, mockLog } = makeTestLayer();
      return withLayer(TestLayer)(
        Effect.gen(function* () {
          initSettings({ agents: ["claude-code"] } as Settings);

          const agents = yield* ensureAgentsConfigured(
            baseOpts({ agentFlags: ["claude-code", "nonexistent-agent"], yes: true }),
          );

          expect(agents).toHaveLength(1);
          expect(agents[0]!.id).toBe("claude-code");
          expect(mockLog.logs.warn.some((m) => m.includes("nonexistent-agent"))).toBe(true);
        }),
      );
    });

    it.effect("fails when all agent IDs are unknown", () => {
      const { TestLayer, mockLog } = makeTestLayer();
      return withLayer(TestLayer)(
        Effect.gen(function* () {
          initSettings({});

          const error = yield* ensureAgentsConfigured(
            baseOpts({ agentFlags: ["fake-agent-1", "fake-agent-2"], yes: true }),
          ).pipe(Effect.flip);

          expect(error._tag).toBe("EnsureAgentsError");
          expect(mockLog.logs.warn.some((m) => m.includes("fake-agent-1"))).toBe(true);
        }),
      );
    });

    it.effect("prompts to add unconfigured agents to workspace", () => {
      const { TestLayer } = makeTestLayer(true);
      return withLayer(TestLayer)(
        Effect.gen(function* () {
          initSettings({ agents: [] } as Settings);

          const agents = yield* ensureAgentsConfigured(baseOpts({ agentFlags: ["claude-code"] }));

          expect(agents).toHaveLength(1);

          // Verify agent was persisted to settings
          const settings = JSON.parse(
            fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8"),
          ) as Settings;
          expect(settings.agents).toContain("claude-code");
        }),
      );
    });

    it.effect("does not add agent when user declines prompt", () => {
      const { TestLayer } = makeTestLayer(false);
      return withLayer(TestLayer)(
        Effect.gen(function* () {
          initSettings({ agents: [] } as Settings);

          const agents = yield* ensureAgentsConfigured(baseOpts({ agentFlags: ["claude-code"] }));

          // Agent is still returned (just not persisted)
          expect(agents).toHaveLength(1);

          // Settings should NOT be updated
          const settings = JSON.parse(
            fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8"),
          ) as Settings;
          expect(settings.agents ?? []).not.toContain("claude-code");
        }),
      );
    });

    it.effect("skips prompt with --yes and auto-adds", () => {
      const { TestLayer } = makeTestLayer();
      return withLayer(TestLayer)(
        Effect.gen(function* () {
          initSettings({ agents: [] } as Settings);

          const agents = yield* ensureAgentsConfigured(
            baseOpts({ agentFlags: ["claude-code"], yes: true }),
          );

          expect(agents).toHaveLength(1);

          // Should be persisted without prompting
          const settings = JSON.parse(
            fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8"),
          ) as Settings;
          expect(settings.agents).toContain("claude-code");
        }),
      );
    });

    it.effect("skips prompt with --non-interactive and auto-adds", () => {
      const { TestLayer } = makeTestLayer();
      return withLayer(TestLayer)(
        Effect.gen(function* () {
          initSettings({ agents: [] } as Settings);

          const agents = yield* ensureAgentsConfigured(
            baseOpts({ agentFlags: ["claude-code"], nonInteractive: true }),
          );

          expect(agents).toHaveLength(1);

          const settings = JSON.parse(
            fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8"),
          ) as Settings;
          expect(settings.agents).toContain("claude-code");
        }),
      );
    });

    it.effect("does not re-add agent already in settings", () => {
      const { TestLayer } = makeTestLayer();
      return withLayer(TestLayer)(
        Effect.gen(function* () {
          initSettings({ agents: ["claude-code"] } as Settings);

          const agents = yield* ensureAgentsConfigured(
            baseOpts({ agentFlags: ["claude-code"], yes: true }),
          );

          expect(agents).toHaveLength(1);

          // Settings should be unchanged
          const settings = JSON.parse(
            fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8"),
          ) as Settings;
          expect(settings.agents).toEqual(["claude-code"]);
        }),
      );
    });
  });
});
