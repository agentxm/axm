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
        ["mcpServers"],
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
      const failure = yield* decodeJsonMcpConfig(".mcp.json", raw, ["mcpServers"]).pipe(
        Effect.flip,
      );
      expect(failure._tag).toBe("McpConfigInvalid");
      const names = yield* managedNativeMcpEntryNames({
        format: "json",
        configPath: ".mcp.json",
        raw,
        serversPath: ["mcpServers"] as const,
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
        serversPath: ["mcpServers"] as const,
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
          serversPath: ["mcpServers"] as const,
        }),
      ).toEqual({ demo: { command: "node" } });
    }),
  );
  it.effect.each([
    {
      format: "json" as const,
      raw: '{"mcp":{"timeout":{"startup":45000},"servers":{"demo":{"command":["node"]},"occupied":42}},"theme":"dark"}',
    },
    {
      format: "jsonc" as const,
      raw: '{// retain\n"mcp":{"servers":{"demo":{"command":["node"]},"occupied":42}}}',
    },
    {
      format: "yaml" as const,
      raw: "mcp:\n  servers:\n    demo:\n      command: [node]\n    occupied: 42\n",
    },
    {
      format: "toml" as const,
      raw: '[mcp.servers]\noccupied = 42\n[mcp.servers.demo]\ncommand = ["node"]\n',
    },
  ])("reads the full nested container in $format", ({ format, raw }) =>
    Effect.gen(function* () {
      expect(
        yield* readNativeMcpServers({
          format,
          configPath: "native",
          raw,
          serversPath: ["mcp", "servers"],
        }),
      ).toEqual({ demo: { command: ["node"] } });
    }),
  );

  it.effect.each(["null", "42", "[]", "true", '"occupied"'])(
    "refuses an occupied nested ancestor %s",
    (value) =>
      Effect.gen(function* () {
        const result = yield* decodeJsonMcpConfig("native", `{"mcp":${value}}`, [
          "mcp",
          "servers",
        ]).pipe(Effect.result);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure")
          expect(result.failure.detail).toContain("mcp must be an object");
      }),
  );
});
