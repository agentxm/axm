/**
 * The rules that read `axm.json` beyond its strict schema share one loose
 * parse of their read model's settings text: the parse runs once however many
 * of them check one workspace, and each rule still decides from the parsed
 * value exactly as it would from a parse of its own.
 */
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import { vi } from "vitest";

import { contextFor, validLockfile } from "./conformance/test-helpers.js";
import { mcpServerNoSecretLiteralRule } from "./mcps-no-secret-literal.js";
import { mcpServerTransportExclusivityRule } from "./mcps-transport-exclusivity.js";
import { settingsKeysRecognizedRule } from "./settings-keys-recognized.js";

const settingsTextRules = [
  settingsKeysRecognizedRule,
  mcpServerTransportExclusivityRule,
  mcpServerNoSecretLiteralRule,
] as const;

type SettingsSpec = NonNullable<Parameters<typeof contextFor>[0]["settings"]>;

/** Check every settings-text rule over one context, counting parses of `text`. */
const checkAll = (settings: SettingsSpec, text: string) =>
  Effect.gen(function* () {
    const context = yield* contextFor({ settings, lockfile: validLockfile });
    const parse = vi.spyOn(JSON, "parse");
    return yield* Effect.forEach(settingsTextRules, (rule) => rule.check(context)).pipe(
      Effect.map((findings) => ({
        parses: parse.mock.calls.filter(([input]) => input === text).length,
        findings: findings.flat().map(({ ruleId, message }) => ({ ruleId, message })),
      })),
      Effect.ensuring(Effect.sync(() => parse.mockRestore())),
    );
  });

const field = (value: unknown, key: string): unknown =>
  Predicate.isObject(value) ? value[key] : undefined;

const settingsWithFindings = `${JSON.stringify({
  agents: ["claude-code"],
  sharedSettingsParseFixture: true,
  mcpServers: {
    flat: { command: "node" },
    secret: {
      connection: { transport: "stdio", command: "node", env: { API_TOKEN: "${API_TOKEN}" } },
    },
  },
})}\n`;

describe("settings text rules", () => {
  it.effect("parse the settings text once for all three rules", () =>
    Effect.gen(function* () {
      const { parses, findings } = yield* checkAll(
        { _tag: "valid", contents: settingsWithFindings },
        settingsWithFindings,
      );
      expect(parses).toBe(1);
      expect(findings).toEqual([
        {
          ruleId: "workspace/settings-keys-recognized",
          message:
            "Workspace settings has unrecognized top-level key 'sharedSettingsParseFixture'. The current settings schema does not recognize this key.",
        },
        {
          ruleId: "workspace/mcps-transport-exclusivity",
          message:
            "MCP server 'flat' uses retired flat fields; declare an explicit connection instead. Edit `axm.json` so each MCP server uses one transport.",
        },
        {
          ruleId: "workspace/mcps-no-secret-literal",
          message:
            'MCP server \'secret\' stores a secret-looking literal in connection.env.API_TOKEN. Use a structured {"env":"VAR"} reference so axm.json does not contain the secret.',
        },
      ]);
    }),
  );

  it.effect("report nothing for settings text that does not parse", () =>
    Effect.gen(function* () {
      const bytes = '{ "mcpServers": { "flat": { "command": "node" } }';
      const { parses, findings } = yield* checkAll({ _tag: "byteCorrupt", bytes }, bytes);
      expect(parses).toBe(1);
      expect(findings).toEqual([]);
    }),
  );

  it.effect("report nothing for settings text that parses to a non-object", () =>
    Effect.gen(function* () {
      const text = '[{ "mcpServers": { "flat": { "command": "node" } } }]\n';
      const { parses, findings } = yield* checkAll({ _tag: "valid", contents: text }, text);
      expect(parses).toBe(1);
      expect(findings).toEqual([]);
    }),
  );

  it.effect("still report findings when the settings text nests deeper than a recursive walk", () =>
    Effect.gen(function* () {
      const depth = 20_000;
      const nested = `${"[".repeat(depth)}${"]".repeat(depth)}`;
      const text = `{"mcpServers":{"flat":{"command":"node","args":${nested}}}}\n`;
      const { parses, findings } = yield* checkAll({ _tag: "valid", contents: text }, text);
      expect(parses).toBe(1);
      expect(findings).toEqual([
        {
          ruleId: "workspace/mcps-transport-exclusivity",
          message:
            "MCP server 'flat' uses retired flat fields; declare an explicit connection instead. Edit `axm.json` so each MCP server uses one transport.",
        },
      ]);
    }),
  );

  it.effect("share the parsed settings frozen down to their deepest value", () =>
    Effect.gen(function* () {
      const depth = 20_000;
      const nested = `${"[".repeat(depth)}{"leaf":{}}${"]".repeat(depth)}`;
      const text = `{"mcpServers":{"flat":{"command":"node","args":${nested}}}}\n`;
      const context = yield* contextFor({
        settings: { _tag: "valid", contents: text },
        lockfile: validLockfile,
      });
      const parsed = Option.getOrUndefined(yield* context.workspace.state.settingsJson);
      let levels = 0;
      let current = field(field(field(parsed, "mcpServers"), "flat"), "args");
      while (Array.isArray(current)) {
        expect(Object.isFrozen(current)).toBe(true);
        levels += 1;
        current = current[0];
      }
      expect(levels).toBe(depth);
      expect(Object.isFrozen(current)).toBe(true);
      expect(Object.isFrozen(field(current, "leaf"))).toBe(true);
    }),
  );

  it.effect("parse nothing when the workspace has no settings file", () =>
    Effect.gen(function* () {
      const context = yield* contextFor({ settings: { _tag: "absent" }, lockfile: validLockfile });
      const parse = vi.spyOn(JSON, "parse");
      const { calls, findings } = yield* Effect.forEach(settingsTextRules, (rule) =>
        rule.check(context),
      ).pipe(
        Effect.map((findings) => ({ calls: parse.mock.calls.length, findings: findings.flat() })),
        Effect.ensuring(Effect.sync(() => parse.mockRestore())),
      );
      expect(calls).toBe(0);
      expect(findings).toEqual([]);
    }),
  );
});
