import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ConfigProvider from "effect/ConfigProvider";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { makeWorkspaceLocation } from "../testing.js";

export const specification = defineSpecification({
  requirement: "workspace/native-locations/captures-native-inputs-at-workspace-boundary",
  title: "Selected workspaces capture native directory inputs once",
  statement:
    "AXM shall capture native directory overrides at the selected workspace boundary, share the captured values with readers and writers, and preserve configuration-source failures as typed failures before filesystem mutation.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Workspace native input capture", () => {
  it.effect("captures Skill and instruction overrides with the selected configuration root", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-native-inputs-" });
      const home = path.join(root, "home");
      const config = path.join(root, "config");
      const location = yield* makeWorkspaceLocation({
        projectRoot: decodeAbsolutePathSync(root),
        scope: "project",
        allowUninitialized: true,
      }).pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromEnv({
              env: {
                AXM_USER_HOME: home,
                AXM_CLAUDE_SKILLS_DIR: "custom/claude",
                AXM_GEMINI_CLI_SKILLS_DIR: "custom/gemini",
                XDG_CONFIG_HOME: config,
                CODEX_HOME: path.join(root, "codex"),
                CLAUDE_CONFIG_DIR: path.join(root, "claude"),
              },
            }),
          ),
        ),
      );
      expect(location.nativeDirectoryInputs).toEqual({
        skillsDirectoryOverrides: { "claude-code": "custom/claude", "gemini-cli": "custom/gemini" },
        xdgConfigRoot: config,
        userConfigRootOverrides: {
          codex: path.join(root, "codex"),
          "claude-code": path.join(root, "claude"),
        },
      });
      expect(location.userHome).toBe(home);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("preserves a directory-override provider failure", () =>
    Effect.gen(function* () {
      const failure = new ConfigProvider.SourceError({
        message: "native configuration unavailable",
      });
      const result = yield* makeWorkspaceLocation({
        projectRoot: decodeAbsolutePathSync("/project"),
        scope: "project",
        allowUninitialized: true,
      }).pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.make((key) =>
              key[0] === "AXM_CLAUDE_SKILLS_DIR" ? Effect.fail(failure) : Effect.succeed(undefined),
            ),
          ),
        ),
        Effect.flip,
      );
      expect(result._tag).toBe("ConfigError");
      if (result._tag === "ConfigError") expect(result.cause).toBe(failure);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
