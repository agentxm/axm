// TODO: (#51) Uses node:fs/node:os/node:path directly. Migrate to @effect/platform
// test utilities when available.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Settings } from "@agentxm/client-core/unstable/settings";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";
import { TestRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import { normalizeHandle } from "@agentxm/client-core/unstable/extensions";
import { WorkspaceInitializationInteractionTest } from "@agentxm/client-core/unstable/workspace";
import { expectDefined } from "../test-helpers.js";
import { handleSetup, SetupSkillInstaller } from "./setup.js";

const readJson = (filePath: string): Settings => JSON.parse(fs.readFileSync(filePath, "utf-8"));

const makeSetupTestContext = (opts?: {
  readonly flags?: {
    verbose?: boolean;
    debug?: boolean;
    nonInteractive?: boolean;
  };
  readonly selectAgents?: ReadonlyArray<string>;
  readonly scope?: "project" | "user";
}) => {
  const renderer = TestRenderer.make();
  const installCalls: Array<{
    readonly scope: "project" | "user";
    readonly yes: boolean;
    readonly force: boolean;
    readonly preview: boolean;
  }> = [];
  const workspaceInitInteraction = WorkspaceInitializationInteractionTest({
    selectAgents: () => Effect.succeed(opts?.selectAgents ?? []),
  });
  const baseLayer = Layer.mergeAll(
    NodeServices.layer,
    renderer.layer,
    workspaceInitInteraction.layer,
    TestFlagsLayer(opts?.flags),
  );
  const layer = Layer.mergeAll(
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
      const { provide, installCalls } = makeSetupTestContext();

      return provide(
        Effect.gen(function* () {
          yield* handleSetup({ scope: "project" });

          const axmDir = path.join(tempDir, ".axm");
          expect(fs.existsSync(axmDir)).toBe(true);
          expect(fs.existsSync(path.join(axmDir, "settings.json"))).toBe(true);
          expect(fs.existsSync(path.join(axmDir, "axm-lock.yaml"))).toBe(true);

          const settings = readJson(path.join(axmDir, "settings.json"));
          expect(settings.skills?.["axm"]).toBe("@agentxm/skills/axm");
          expect(installCalls).toEqual([
            { scope: "project", yes: false, force: false, preview: false },
          ]);
        }),
      );
    });

    it.effect("preserves existing settings", () => {
      const { provide, installCalls } = makeSetupTestContext();

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
          fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");

          yield* handleSetup({ scope: "project" });

          const settings = readJson(path.join(axmDir, "settings.json"));
          expect(settings.agents).toEqual(["claude-code", "cursor"]);
          expect(settings.skills?.["commit"]).toBe("^1.0.0");
          expect(settings.owner).toBe("@myorg");
          expect(installCalls).toEqual([]);
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
            expect(settings.skills?.["axm"]).toBe("@agentxm/skills/axm");
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
          expect(infoMessages).toContain("Telemetry is enabled to help improve axm. To disable:");
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
          expect(infoMessages).not.toContain(
            "Telemetry is enabled to help improve axm. To disable:",
          );
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
          expect(
            infoMessages.some((message) => message.includes("existing subagent file(s)")),
          ).toBe(true);
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
          fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");

          const error = yield* handleSetup({ scope: "project" }).pipe(Effect.flip);
          expect(error._tag).toBe("AppError");
        }),
      );
    });
  });
});
