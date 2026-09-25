import * as NodeServices from "@effect/platform-node/NodeServices";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { AGENTS } from "@agentxm/extension-model/unstable/agents/registry";
import {
  AgentExecutableResolver,
  AgentExecutableResolverLive,
  detectAgentScopes,
} from "./detection.js";
import { AgentPresenceProbe, AgentPresenceProbeLive } from "./agent-presence.js";
import { codingAgentForId } from "./agents/adapters.js";
import { envOption } from "@agentxm/host-primitives";

const sourceError = new ConfigProvider.SourceError({ message: "source unavailable" });
const unavailable = ConfigProvider.layer(ConfigProvider.make(() => Effect.fail(sourceError)));

describe("agent environment configuration", () => {
  it.effect("uses injected XDG configuration for user detection", () =>
    Effect.gen(function* () {
      const probes: string[] = [];
      const result = yield* detectAgentScopes(AGENTS.devin, "/project").pipe(
        Effect.provide(
          Layer.mergeAll(
            FileSystem.layerNoop({
              exists: (path) =>
                Effect.sync(() => {
                  probes.push(path);
                  return path === "/injected/devin";
                }),
            }),
            Layer.succeed(AgentExecutableResolver, { exists: () => Effect.succeed(false) }),
            ConfigProvider.layer(ConfigProvider.fromEnv({ env: { XDG_CONFIG_HOME: "/injected" } })),
          ),
        ),
      );
      expect(result.user).toBe(true);
      expect(probes).toContain("/injected/devin");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("preserves XDG source failure through detection and presence", () =>
    Effect.gen(function* () {
      const direct = yield* detectAgentScopes(AGENTS.devin, "/project").pipe(Effect.flip);
      expect(direct._tag).toBe("ConfigError");
      expect(direct.cause).toBe(sourceError);
      const probe = yield* AgentPresenceProbe;
      const failure = yield* probe.detect("/project", "user").pipe(Effect.flip);
      expect(failure._tag).toBe("ConfigError");
      expect(failure.cause).toBe(sourceError);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          AgentPresenceProbeLive.pipe(Layer.provide(NodeServices.layer)),
          NodeServices.layer,
          Layer.succeed(AgentExecutableResolver, { exists: () => Effect.succeed(false) }),
          unavailable,
        ),
      ),
    ),
  );

  it.effect.each(["PATH", "PATHEXT"])(
    "preserves %s source failure without reporting an absent executable",
    (key) =>
      Effect.gen(function* () {
        const resolver = yield* AgentExecutableResolver;
        const failure = yield* resolver.exists("agent-cli").pipe(Effect.flip);
        expect(failure._tag).toBe("ConfigError");
        expect(failure.cause).toBe(sourceError);
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            AgentExecutableResolverLive.pipe(Layer.provide(NodeServices.layer)),
            ConfigProvider.layer(
              ConfigProvider.make((path) =>
                path[0] === key ? Effect.fail(sourceError) : Effect.succeed(undefined),
              ),
            ),
          ),
        ),
      ),
  );

  it.effect("probes PATH in order and stops after the first executable", () => {
    const probes: string[] = [];
    return Effect.gen(function* () {
      const resolver = yield* AgentExecutableResolver;
      expect(yield* resolver.exists("agent-cli.exe")).toBe(true);
      expect(probes).toEqual([
        path.join("first", "agent-cli.exe"),
        path.join("second", "agent-cli.exe"),
      ]);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          AgentExecutableResolverLive.pipe(
            Layer.provide(
              Layer.mergeAll(
                NodeServices.layer,
                FileSystem.layerNoop({
                  exists: (target) =>
                    Effect.sync(() => {
                      probes.push(target);
                      return target === path.join("second", "agent-cli.exe");
                    }),
                }),
              ),
            ),
          ),
          ConfigProvider.layer(
            ConfigProvider.fromEnv({
              env: {
                PATH: ["first", "second", "third"].join(path.delimiter),
                PATHEXT: ".EXE",
              },
            }),
          ),
        ),
      ),
    );
  });

  it.effect.each([
    { id: "claude-code", key: "AXM_CLAUDE_SKILLS_DIR" },
    { id: "gemini-cli", key: "AXM_GEMINI_CLI_SKILLS_DIR" },
  ] as const)(
    "uses the injected $id skill directory and preserves provider failure",
    ({ id, key }) =>
      Effect.gen(function* () {
        const agent = codingAgentForId(id);
        const outcome = yield* agent
          .resolveEffectiveSkillsDir({ workspaceRoot: "/project" })
          .pipe(
            Effect.provide(
              ConfigProvider.layer(ConfigProvider.fromEnv({ env: { [key]: "custom" } })),
            ),
          );
        expect(outcome).toEqual({ _tag: "supported", dir: "/project/custom" });
        const failure = yield* agent
          .resolveEffectiveSkillsDir({ workspaceRoot: "/project" })
          .pipe(Effect.provide(unavailable), Effect.flip);
        expect(failure._tag).toBe("ConfigError");
        expect(failure.cause).toBe(sourceError);
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("keeps absent and explicitly empty configuration distinct", () =>
    Effect.gen(function* () {
      expect(yield* envOption("ABSENT")).toEqual(Option.none());
      expect(yield* envOption("EMPTY")).toEqual(Option.some(""));
    }).pipe(
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.fromEnv({ env: { EMPTY: "" }, preserveEmptyStrings: true }),
        ),
      ),
    ),
  );
});
