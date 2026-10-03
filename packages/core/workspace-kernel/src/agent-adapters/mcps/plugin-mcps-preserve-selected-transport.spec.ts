import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { defineSpecification } from "@agentxm/specification-metadata";
import { readPluginMcpDefinition, planMcpServerTargets } from "../index.js";

export const specification = defineSpecification({
  requirement: "mcps/activation/plugin-mcps-preserve-selected-transport",
  title: "Selected plugin MCP connections preserve declared transport and literal configuration",
  statement:
    "AXM shall read a selected MCP connection from its unchanged plugin package, preserve its explicitly declared remote transport and literal portable headers in native projection, and report unsupported activation without changing unrelated components. Plugin configuration paths shall remain within the retained package. Portable remote endpoints shall meet the Agent Plugins 1.0 URL and header constraints.",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption", "workspace-intent-fidelity", "trustworthy-distribution"],
  boundary: "platform",
  boundaryRationale:
    "Real plugin files and physical paths establish package containment; native target plans expose transport and header semantics.",
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});
const selected = { format: "agent-plugins", configPath: "mcp.json", name: "selected" } as const;
const fixture = (entry: unknown) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-plugin-mcp-" });
    const content = JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: { selected: entry, future: { type: "future-transport", unknown: true } },
    });
    yield* fs.writeFileString(path.join(root, "mcp.json"), content);
    return { root, fs, path, content };
  });
const plan = (
  nativeDefinition: Effect.Success<ReturnType<typeof readPluginMcpDefinition>>,
  agents = ["claude-code"],
) =>
  planMcpServerTargets({
    agentIds: agents,
    scope: "project",
    serverName: "selected",
    declaration: { kind: "sourced", source: "./plugin", enabled: true },
    enabled: true,
    nativeDefinition,
  });

describe("Plugin MCP remote activation", () => {
  it("refuses Registry preferences that would override the selected upstream connection", () => {
    expect(
      planMcpServerTargets({
        agentIds: ["claude-code"],
        scope: "project",
        serverName: "selected",
        enabled: true,
        declaration: { kind: "sourced", source: "./plugin", auth: { type: "native-oauth" } },
        nativeDefinition: {
          kind: "remote",
          transport: "streamable-http",
          url: "https://example.test/mcp",
          headers: {},
        },
      }),
    ).toMatchObject({
      _tag: "invalid",
      detail: expect.stringContaining("overrides are unsupported"),
    });
  });
  it.effect.each([
    { type: "streamable-http", url: "https://example.test/sse", expected: "http" },
    { type: "sse", url: "https://example.test/events", expected: "sse" },
  ])("uses declared $type without inferring transport from the URL", ({ type, url, expected }) =>
    Effect.gen(function* () {
      const { root, fs, path, content } = yield* fixture({
        type,
        url,
        headers: { "X-Public": "tenant" },
      });
      const result = plan(yield* readPluginMcpDefinition(root, selected));
      expect(result).toMatchObject({
        _tag: "planned",
        agents: [{ _tag: "projected" }],
        writes: [{ entry: { type: expected, url, headers: { "X-Public": "tenant" } } }],
      });
      expect(yield* fs.readFileString(path.join(root, "mcp.json"))).toBe(content);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  it.effect("does not turn a portable literal into a host environment lookup", () =>
    Effect.gen(function* () {
      const { root } = yield* fixture({
        type: "streamable-http",
        url: "https://example.test/mcp",
        headers: { "X-Template": "${TOKEN}" },
      });
      const definition = yield* readPluginMcpDefinition(root, selected);
      expect(definition).toMatchObject({
        headers: { "X-Template": "${TOKEN}" },
      });
      const codex = plan(definition, ["codex"]);
      expect(codex).toMatchObject({
        _tag: "planned",
        writes: [{ entry: { http_headers: { "X-Template": "${TOKEN}" } } }],
      });
      const claude = plan(definition);
      expect(claude).toMatchObject({
        _tag: "planned",
        writes: [],
        agents: [{ _tag: "blocked", reason: expect.stringContaining("literal") }],
      });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  it.effect.each([
    "http://example.test/mcp",
    "https://user:password@example.test/mcp",
    "https://example.test/mcp#entry",
    "file:///tmp/socket",
  ])("refuses a nonportable endpoint: %s", (url) =>
    Effect.gen(function* () {
      const { root } = yield* fixture({ type: "streamable-http", url });
      expect(yield* readPluginMcpDefinition(root, selected).pipe(Effect.result)).toMatchObject({
        _tag: "Failure",
      });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  it.effect.each(["http://localhost/mcp", "http://127.0.0.2/mcp", "http://[::1]/mcp"])(
    "retains permitted loopback endpoint %s",
    (url) =>
      Effect.gen(function* () {
        const { root } = yield* fixture({ type: "streamable-http", url });
        expect(yield* readPluginMcpDefinition(root, selected)).toMatchObject({
          kind: "remote",
          url,
        });
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  it.effect("reports unsupported subprocess semantics without fabricating a command wrapper", () =>
    Effect.gen(function* () {
      const { root } = yield* fixture({
        type: "stdio",
        command: "./bin/server",
        args: ["${PLUGIN_DATA}"],
      });
      expect(plan(yield* readPluginMcpDefinition(root, selected))).toMatchObject({
        _tag: "planned",
        writes: [],
        agents: [{ _tag: "unsupported", reason: expect.stringContaining("working-directory") }],
      });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  it.effect("refuses configuration that resolves outside the package", () =>
    Effect.gen(function* () {
      const { root, fs, path } = yield* fixture({
        type: "streamable-http",
        url: "https://example.test/mcp",
      });
      const child = path.join(root, "child");
      yield* fs.makeDirectory(child);
      yield* fs.symlink("../mcp.json", path.join(child, "mcp.json"));
      expect(yield* readPluginMcpDefinition(child, selected).pipe(Effect.result)).toMatchObject({
        _tag: "Failure",
        failure: { detail: expect.stringContaining("escapes") },
      });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
