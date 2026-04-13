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
import { handleInit } from "./init.js";

const readJson = (filePath: string): Settings => JSON.parse(fs.readFileSync(filePath, "utf-8"));

const makeInitTestContext = (opts?: {
  readonly flags?: {
    verbose?: boolean;
    debug?: boolean;
    nonInteractive?: boolean;
  };
  readonly selectAgents?: ReadonlyArray<string>;
}) => {
  const renderer = TestRenderer.make();
  const workspaceInitInteraction = WorkspaceInitializationInteractionTest({
    selectAgents: () => Effect.succeed(opts?.selectAgents ?? []),
  });
  const layer = Layer.mergeAll(
    NodeServices.layer,
    renderer.layer,
    workspaceInitInteraction.layer,
    TestFlagsLayer(opts?.flags),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
  const provide = <A, E>(effect: Effect.Effect<A, E, any>) => effect.pipe(Effect.provide(layer));

  return {
    provide,
    promptState: workspaceInitInteraction.state,
    rendererState: renderer.state,
  };
};

describe("init.handler", () => {
  let tempDir: string;
  let homeDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalHome = process.env["HOME"];
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "init-handler-test-"));
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
      const { provide } = makeInitTestContext();

      return provide(
        Effect.gen(function* () {
          yield* handleInit({ scope: "project" });

          const axmDir = path.join(tempDir, ".axm");
          expect(fs.existsSync(axmDir)).toBe(true);
          expect(fs.existsSync(path.join(axmDir, "settings.json"))).toBe(true);
          expect(fs.existsSync(path.join(axmDir, "axm-lock.yaml"))).toBe(true);
        }),
      );
    });

    it.effect("preserves existing settings", () => {
      const { provide } = makeInitTestContext();

      return provide(
        Effect.gen(function* () {
          const axmDir = path.join(tempDir, ".axm");
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(
            path.join(axmDir, "settings.json"),
            JSON.stringify({
              agents: ["claude-code", "cursor"],
              skills: { commit: "^1.0.0" },
              profile: normalizeHandle("@myorg"),
            }),
          );
          fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");

          yield* handleInit({ scope: "project" });

          const settings = readJson(path.join(axmDir, "settings.json"));
          expect(settings.agents).toEqual(["claude-code", "cursor"]);
          expect(settings.skills?.["commit"]).toBe("^1.0.0");
          expect(settings.profile).toBe("@myorg");
        }),
      );
    });
  });

  describe("user scope", () => {
    it.effect(
      "creates settings in the user workspace without touching the project workspace",
      () => {
        const { provide } = makeInitTestContext();

        return provide(
          Effect.gen(function* () {
            yield* handleInit({ scope: "user" });

            const userSettingsPath = path.join(homeDir, ".axm", "settings.json");
            const projectSettingsPath = path.join(tempDir, ".axm", "settings.json");
            expect(fs.existsSync(userSettingsPath)).toBe(true);
            expect(fs.existsSync(projectSettingsPath)).toBe(false);
          }),
        );
      },
    );
  });

  describe("agent selection", () => {
    it.effect("interactive mode prompts for agent selection", () => {
      const { provide, promptState } = makeInitTestContext({
        flags: { nonInteractive: false },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleInit({ scope: "project" });
          expect(promptState.selectAgentsCalls).toHaveLength(1);
        }),
      );
    });

    it.effect("non-interactive mode auto-selects detected agents without prompting", () => {
      const { provide, promptState } = makeInitTestContext({
        flags: { nonInteractive: true },
      });

      return provide(
        Effect.gen(function* () {
          fs.mkdirSync(path.join(tempDir, ".claude"), { recursive: true });

          yield* handleInit({ scope: "project" });

          const settings = readJson(path.join(tempDir, ".axm", "settings.json"));
          expect(promptState.selectAgentsCalls).toHaveLength(0);
          expect(settings.agents).toContain("claude-code");
        }),
      );
    });

    it.effect("uses the explicit agent multiselect result", () => {
      const { provide } = makeInitTestContext({
        flags: { nonInteractive: false },
        selectAgents: ["claude-code"],
      });

      return provide(
        Effect.gen(function* () {
          yield* handleInit({ scope: "project" });

          const settings = readJson(path.join(tempDir, ".axm", "settings.json"));
          expect(expectDefined(settings.agents)).toEqual(["claude-code"]);
        }),
      );
    });
  });

  describe("telemetry notice", () => {
    it.effect("displays telemetry guidance after init", () => {
      const { provide, rendererState } = makeInitTestContext();

      return provide(
        Effect.gen(function* () {
          yield* handleInit({ scope: "project" });

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
      const { provide, rendererState } = makeInitTestContext();

      return provide(
        Effect.gen(function* () {
          yield* handleInit({ scope: "project" });

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
    it.effect("notes unmanaged subagent files", () => {
      const { provide, rendererState } = makeInitTestContext();

      return provide(
        Effect.gen(function* () {
          const agentsDir = path.join(tempDir, ".claude", "agents");
          fs.mkdirSync(agentsDir, { recursive: true });
          fs.writeFileSync(path.join(agentsDir, "my-agent.md"), "# My Agent\nInstructions");

          yield* handleInit({ scope: "project", agents: ["claude-code"] });

          const warnMessages = rendererState.logs
            .filter((entry) => entry._tag === "warn")
            .map((entry) => entry.message);
          expect(warnMessages.some((message) => message.includes("not managed by axm"))).toBe(true);
          expect(warnMessages.some((message) => message.includes("Claude Code"))).toBe(true);
        }),
      );
    });

    it.effect("notes managed subagent files", () => {
      const { provide, rendererState } = makeInitTestContext();

      return provide(
        Effect.gen(function* () {
          const agentsDir = path.join(tempDir, ".claude", "agents");
          fs.mkdirSync(agentsDir, { recursive: true });
          fs.writeFileSync(
            path.join(agentsDir, "managed-agent.md"),
            '<!-- Managed by axm — see "axm subagents --help" -->\n# Managed Agent',
          );

          yield* handleInit({ scope: "project", agents: ["claude-code"] });

          const infoMessages = rendererState.logs
            .filter((entry) => entry._tag === "info")
            .map((entry) => entry.message);
          expect(infoMessages.some((message) => message.includes("managed subagent file(s)"))).toBe(
            true,
          );
          expect(infoMessages.some((message) => message.includes("Claude Code"))).toBe(true);
        }),
      );
    });
  });

  describe("error handling", () => {
    it.effect("fails when the existing settings file is invalid JSON", () => {
      const { provide } = makeInitTestContext();

      return provide(
        Effect.gen(function* () {
          const axmDir = path.join(tempDir, ".axm");
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(path.join(axmDir, "settings.json"), "not valid json {{{");
          fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");

          const error = yield* handleInit({ scope: "project" }).pipe(Effect.flip);
          expect(error._tag).toBe("AppError");
        }),
      );
    });
  });
});
