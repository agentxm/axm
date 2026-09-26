import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  decodeJsonMcpConfig,
  managedNativeMcpEntryNames,
  readNativeMcpEntry,
  readNativeMcpServers,
} from "./native-config.js";

const managed = {
  "x-axm": { v: 1, managed: true, ext: "@workspace/mcps/demo", source: "inline" },
  command: "node",
};

describe("native MCP config reads", () => {
  it.effect("decodes a JSON-like config and its servers map", () =>
    Effect.gen(function* () {
      const decoded = yield* decodeJsonMcpConfig(
        ".mcp.json",
        JSON.stringify({ mcpServers: { demo: managed, other: { command: "x" } } }),
        "mcpServers",
      );
      expect(Object.keys(decoded.servers ?? {})).toEqual(["demo", "other"]);
    }),
  );

  it.effect.each([
    { label: "an array root", raw: "[]" },
    { label: "a servers key that is not an object", raw: '{"mcpServers": []}' },
    { label: "malformed JSON", raw: "{invalid" },
  ])("refuses $label as a configuration fault", ({ raw }) =>
    Effect.gen(function* () {
      const failure = yield* decodeJsonMcpConfig(".mcp.json", raw, "mcpServers").pipe(Effect.flip);
      expect(failure._tag).toBe("McpConfigInvalid");
      const names = yield* managedNativeMcpEntryNames({
        format: "json",
        configPath: ".mcp.json",
        raw,
        serversKey: "mcpServers",
      }).pipe(Effect.flip);
      expect(names._tag).toBe("McpConfigInvalid");
    }),
  );

  it.effect("names only the AXM-managed entries and reads one by name", () =>
    Effect.gen(function* () {
      const read = {
        format: "json" as const,
        configPath: ".mcp.json",
        raw: JSON.stringify({ mcpServers: { demo: managed, other: { command: "x" } } }),
        serversKey: "mcpServers",
      };
      expect(yield* managedNativeMcpEntryNames(read)).toEqual(["demo"]);
      expect(yield* readNativeMcpEntry({ ...read, serverName: "other" })).toEqual(
        Option.some({ command: "x" }),
      );
      expect(yield* readNativeMcpEntry({ ...read, serverName: "absent" })).toEqual(Option.none());
    }),
  );

  it.effect.each([
    { format: "json" as const, raw: '{"mcpServers":{"demo":{"command":"node"},"ignored":42}}' },
    {
      format: "jsonc" as const,
      raw: '{// comment\n"mcpServers":{"demo":{"command":"node"},"ignored":42}}',
    },
    { format: "starlark" as const, raw: '{"mcpServers":{"demo":{"command":"node"},"ignored":42}}' },
    {
      format: "vscode-settings" as const,
      raw: '{"mcpServers":{"demo":{"command":"node"},"ignored":42}}',
    },
    { format: "yaml" as const, raw: "mcpServers:\n  demo:\n    command: node\n  ignored: 42\n" },
    {
      format: "toml" as const,
      raw: '[mcpServers.demo]\ncommand = "node"\n[mcpServers]\nignored = 42\n',
    },
  ])("reads record-shaped entries from $format", ({ format, raw }) =>
    Effect.gen(function* () {
      expect(
        yield* readNativeMcpServers({
          format,
          configPath: "config",
          raw,
          serversKey: "mcpServers",
        }),
      ).toEqual({ demo: { command: "node" } });
    }),
  );
});
