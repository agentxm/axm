import * as Layer from "effect/Layer";
import * as Effect from "effect/Effect";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { codingAgentForId, userScopeRefusal } from "../index.js";
import { resolveNativeReadLocation } from "../../locations/index.js";
import type { NativeConfigReadLocation } from "@agentxm/extension-model/unstable/agent-capabilities";

export const specification = defineSpecification({
  requirement: "workspace/native-locations/resolves-declared-scope-and-captured-inputs",
  title: "Native readers resolve only explicit scoped locations",
  statement:
    "AXM shall resolve native reader declarations independently of writer support, use the selected captured root for each scope, leave missing user locations unverified, and share captured directory overrides between writers and readers without asserting native runtime availability.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Scoped native locations", () => {
  it.effect(
    "resolves emerging targets in their declared filesystem scope and refuses unknown user roots",
    () =>
      Effect.gen(function* () {
        for (const [id, expected] of [
          ["fx", "/workspace/.fx/skills"],
          ["muse-code", "/workspace/.agents/skills"],
          ["mimo-code", "/workspace/.mimocode/skills"],
          ["coder-agents", "/workspace/.agents/skills"],
        ] as const) {
          expect(
            yield* codingAgentForId(id).resolveEffectiveSkillsDir({
              workspaceRoot: "/workspace",
              scope: "project",
            }),
          ).toEqual({ _tag: "supported", dir: expected });
        }
        expect(
          yield* codingAgentForId("muse-code", {
            skillsDirectoryOverrides: {},
            xdgConfigRoot: "/selected-config",
          }).resolveEffectiveSkillsDir({ workspaceRoot: "/selected-home", scope: "user" }),
        ).toEqual({ _tag: "supported", dir: "/selected-config/muse/skills" });
        expect(
          (yield* codingAgentForId("mimo-code").resolveEffectiveSkillsDir({
            workspaceRoot: "/selected-home",
            scope: "user",
          }))._tag,
        ).toBe("unverified");
        expect(
          (yield* codingAgentForId("coder-agents").resolveEffectiveSkillsDir({
            workspaceRoot: "/selected-home",
            scope: "user",
          }))._tag,
        ).toBe("unsupported");
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "applies captured config roots only to declarations with explicit override semantics",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const location: NativeConfigReadLocation = {
          id: "user",
          scope: "user",
          root: "home",
          path: ".codex/config.toml",
          shape: "file",
          role: "primary",
          status: "canonical",
          applicability: { kind: "always" },
          provenance: { kind: "capability-sources" },
          format: "toml",
          keyPath: ["mcp_servers"],
          configRootRelativePath: "config.toml",
        };
        const args = { workspaceRoot: "/selected-home", scope: "user" as const };
        const inputs = {
          skillsDirectoryOverrides: {},
          userConfigRootOverrides: { codex: "/selected-config" },
        };
        expect(resolveNativeReadLocation(path, "codex", location, args, inputs)).toMatchObject({
          path: "/selected-config/config.toml",
          nativeRoot: "/selected-config",
        });
        const { configRootRelativePath: _override, ...compatibility } = location;
        expect(resolveNativeReadLocation(path, "codex", compatibility, args, inputs)?.path).toBe(
          "/selected-home/.codex/config.toml",
        );
        expect(
          resolveNativeReadLocation(
            path,
            "codex",
            { ...location, applicability: { kind: "conditional", condition: "profile selected" } },
            args,
            inputs,
          ),
        ).toBeUndefined();
        expect(
          resolveNativeReadLocation(
            path,
            "codex",
            { ...location, applicability: { kind: "conditional", condition: "profile selected" } },
            args,
            inputs,
            { includeConditional: true },
          ),
        ).toMatchObject({
          path: "/selected-config/config.toml",
          availability: "unverified-condition",
        });
        expect(
          resolveNativeReadLocation(path, "codex", location, { ...args, scope: "project" }, inputs),
        ).toBeUndefined();
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("retains an explicitly selected XDG authority outside the selected home", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const location: NativeConfigReadLocation = {
        id: "user",
        scope: "user",
        root: "xdg-config",
        path: "agent/config.json",
        shape: "file",
        role: "primary",
        status: "canonical",
        applicability: { kind: "always" },
        provenance: { kind: "capability-sources" },
        format: "json",
      };
      const args = { workspaceRoot: "/selected-home", scope: "user" as const };
      expect(
        resolveNativeReadLocation(path, "agent", location, args, {
          skillsDirectoryOverrides: {},
          xdgConfigRoot: "/selected-xdg",
        }),
      ).toMatchObject({ nativeRoot: "/selected-xdg", path: "/selected-xdg/agent/config.json" });
      expect(
        resolveNativeReadLocation(path, "agent", location, args, { skillsDirectoryOverrides: {} }),
      ).toBeUndefined();
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("uses the selected home for native Subagents without consulting ambient HOME", () =>
    Effect.gen(function* () {
      const agent = codingAgentForId("claude-code");
      const outcome = yield* agent.resolveEffectiveSubagentsDir({
        workspaceRoot: "/selected/home",
        scope: "user",
      });
      expect(outcome).toEqual({
        _tag: "supported",
        dir: "/selected/home/.claude/agents",
        warnings: [],
      });
    }).pipe(
      Effect.provide(
        Layer.merge(
          ConfigProvider.layer(ConfigProvider.fromEnv({ env: { HOME: "/foreign" } })),
          NodeServices.layer,
        ),
      ),
    ),
  );

  it.effect("keeps a modeled native user reader distinct from workspace setup refusal", () =>
    Effect.gen(function* () {
      const agent = codingAgentForId("antigravity");
      const readers = yield* agent.resolveNativeReadLocations({
        workspaceRoot: "/selected/home",
        scope: "user",
        kind: "subagent",
      });
      expect(readers).toEqual([
        expect.objectContaining({ path: "/selected/home/.gemini/config/agents" }),
      ]);
      expect(
        userScopeRefusal({ agentId: agent.id, agentName: "Antigravity", type: "subagents" }),
      ).toBe(
        "AXM workspace setup manages only project-scope subagents for Antigravity; Antigravity supports user-scope subagents natively",
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("does not invent a user path from a project path", () =>
    Effect.gen(function* () {
      const agent = codingAgentForId("qoder");
      const outcome = yield* agent.resolveEffectiveSkillsDir({
        workspaceRoot: "/selected/home",
        scope: "user",
      });
      expect(outcome._tag).toBe("unverified");
      expect(
        yield* agent.resolveNativeReadLocations({
          workspaceRoot: "/selected/home",
          scope: "user",
          kind: "skill",
        }),
      ).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("retains a file reader whose native ownership writer is unsupported", () =>
    Effect.gen(function* () {
      const agent = codingAgentForId("ibm-bob");
      expect(
        (yield* agent.resolveEffectiveSubagentsDir({
          workspaceRoot: "/selected/home",
          scope: "user",
        }))._tag,
      ).toBe("unsupported");
      const readers = yield* agent.resolveNativeReadLocations({
        workspaceRoot: "/selected/home",
        scope: "user",
        kind: "subagent",
      });
      expect(readers).toHaveLength(1);
      expect(readers[0]).toMatchObject({
        path: "/selected/home/.bob/settings/custom_modes.yaml",
        declaration: { shape: "file" },
      });
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "resolves captured overrides identically for writers and observers with unverified native availability",
    () =>
      Effect.gen(function* () {
        const agent = codingAgentForId("claude-code", {
          skillsDirectoryOverrides: { "claude-code": "native/custom" },
        });
        const writer = yield* agent.resolveEffectiveSkillsDir({
          workspaceRoot: "/project",
          scope: "project",
        });
        const readers = yield* agent.resolveNativeReadLocations({
          workspaceRoot: "/project",
          scope: "project",
          kind: "skill",
        });
        expect(writer).toEqual({ _tag: "supported", dir: "/project/native/custom" });
        expect(readers[0]).toMatchObject({
          path: "/project/native/custom",
          availability: "unverified-override",
        });
      }).pipe(Effect.provide(NodeServices.layer)),
  );
});
