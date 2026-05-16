import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { WorkspaceRuleContext } from "../../context.js";
import { configuredButNotInstalledRule } from "./configured-but-not-installed.js";

const row = (args: {
  readonly type: string;
  readonly name: string;
  readonly activation?: "enabled" | "disabled";
  readonly origin?: "direct" | "pack-member";
  readonly actualOrigin?: string;
}) => ({
  key: { type: args.type, name: args.name },
  activation: args.activation ?? "enabled",
  installationOrigin:
    args.origin === "pack-member"
      ? { _tag: "pack-member", pack: { key: { name: "starter-pack" } } }
      : { _tag: "direct", declared: { entry: { source: `@acme/${args.type}s/${args.name}` } } },
  actual:
    args.actualOrigin === undefined
      ? []
      : [
          {
            origin: { _tag: args.actualOrigin },
          },
        ],
});

const makeContext = (rows: {
  readonly skills?: ReadonlyArray<ReturnType<typeof row>>;
  readonly commands?: ReadonlyArray<ReturnType<typeof row>>;
  readonly mcpServers?: ReadonlyArray<ReturnType<typeof row>>;
  readonly subagents?: ReadonlyArray<ReturnType<typeof row>>;
  readonly packs?: ReadonlyArray<ReturnType<typeof row>>;
}): WorkspaceRuleContext =>
  // Assertion needed: this rule only reads the installed cells from the workspace read model.
  ({
    workspace: {
      skills: { installed: Effect.succeed(rows.skills ?? []) },
      commands: { installed: Effect.succeed(rows.commands ?? []) },
      mcpServers: { installed: Effect.succeed(rows.mcpServers ?? []) },
      subagents: { installed: Effect.succeed(rows.subagents ?? []) },
      packs: { installed: Effect.succeed(rows.packs ?? []) },
    },
    subject: { root: "/tmp/project", scope: "project" },
    axmDirExists: Effect.succeed(true),
    displayRoot: "",
  }) as unknown as WorkspaceRuleContext;

describe("workspace/configured-but-not-installed", () => {
  it.effect("reports direct settings entries with no canonical on-disk content", () =>
    Effect.gen(function* () {
      const findings = yield* configuredButNotInstalledRule.check(
        makeContext({
          subagents: [row({ type: "subagent", name: "reviewer" })],
        }),
      );

      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toContain("axm install reviewer");
    }),
  );

  it.effect("reports pack-implied entries with no canonical on-disk content", () =>
    Effect.gen(function* () {
      const findings = yield* configuredButNotInstalledRule.check(
        makeContext({
          commands: [row({ type: "command", name: "deploy", origin: "pack-member" })],
        }),
      );

      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("workspace/configured-but-not-installed");
      expect(findings[0]?.message).toContain("axm packs install starter-pack");
    }),
  );

  it.effect("does not report disabled entries or entries with canonical content", () =>
    Effect.gen(function* () {
      const findings = yield* configuredButNotInstalledRule.check(
        makeContext({
          skills: [
            row({ type: "skill", name: "disabled", activation: "disabled" }),
            row({
              type: "skill",
              name: "installed",
              actualOrigin: "canonical-axm-skill",
            }),
          ],
          packs: [row({ type: "pack", name: "starter", actualOrigin: "canonical-axm-pack" })],
        }),
      );

      expect(findings).toEqual([]);
    }),
  );
});
