import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { WorkspaceRuleContext } from "../../context.js";
import { configuredButNotInstalledRule } from "./configured-but-not-installed.js";

const row = (args: {
  readonly type: string;
  readonly name: string;
  readonly plural?: string;
  readonly activation?: "enabled" | "disabled";
  readonly origin?: "direct" | "pack-member";
  readonly actualOrigin?: string;
}) => ({
  key: { type: args.type, name: args.name },
  activation: args.activation ?? "enabled",
  installationOrigin:
    args.origin === "pack-member"
      ? { _tag: "pack-member", pack: { key: { name: "starter-pack" } } }
      : {
          _tag: "direct",
          declared: {
            entry: { source: `@acme/${args.plural ?? `${args.type}s`}/${args.name}` },
          },
        },
  actual:
    args.actualOrigin === undefined
      ? []
      : [
          {
            origin: { _tag: args.actualOrigin },
          },
        ],
});

type Rows = ReadonlyArray<ReturnType<typeof row>>;

const makeContext = (rows: {
  readonly skills?: Rows;
  readonly commands?: Rows;
  readonly mcpServers?: Rows;
  readonly subagents?: Rows;
  readonly files?: Rows;
  readonly rules?: Rows;
  readonly hooks?: Rows;
  readonly knowledge?: Rows;
  readonly packs?: Rows;
}): WorkspaceRuleContext =>
  // Assertion needed: this rule only reads the installed cells from the workspace read model.
  ({
    workspace: {
      skills: { installed: Effect.succeed(rows.skills ?? []) },
      commands: { installed: Effect.succeed(rows.commands ?? []) },
      mcpServers: { installed: Effect.succeed(rows.mcpServers ?? []) },
      subagents: { installed: Effect.succeed(rows.subagents ?? []) },
      files: { installed: Effect.succeed(rows.files ?? []) },
      rules: { installed: Effect.succeed(rows.rules ?? []) },
      hooks: { installed: Effect.succeed(rows.hooks ?? []) },
      knowledge: { installed: Effect.succeed(rows.knowledge ?? []) },
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

  it.effect("covers the families the rule used to skip entirely", () =>
    Effect.gen(function* () {
      const findings = yield* configuredButNotInstalledRule.check(
        makeContext({
          files: [row({ type: "files", name: "house-style", plural: "files" })],
          rules: [row({ type: "rule", name: "conventions" })],
          hooks: [row({ type: "hook", name: "pre-commit" })],
          knowledge: [row({ type: "knowledge", name: "domain", plural: "knowledge" })],
        }),
      );

      expect(findings.map((finding) => finding.message)).toEqual([
        expect.stringContaining("context files 'house-style' is configured"),
        expect.stringContaining("rule 'conventions' is configured"),
        expect.stringContaining("hook 'pre-commit' is configured"),
        expect.stringContaining("knowledge bundle 'domain' is configured"),
      ]);
    }),
  );

  it.effect("labels every type from the type table rather than degrading to 'extension'", () =>
    Effect.gen(function* () {
      const findings = yield* configuredButNotInstalledRule.check(
        makeContext({
          knowledge: [row({ type: "knowledge", name: "domain", plural: "knowledge" })],
        }),
      );

      expect(findings[0]?.message.startsWith("knowledge bundle ")).toBe(true);
    }),
  );
});
