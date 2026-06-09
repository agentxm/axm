import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { McpServerEntry } from "../settings/index.js";
import { readYamlEntry } from "../yaml/index.js";
import { writeAgentMcpConfig } from "./config-writer.js";
import { collectManagedAgentMcpServers, inspectAgentMcpServer } from "./inspection.js";

const withNode = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

const withHome = <A, E, R>(home: string, effect: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = process.env["HOME"];
      process.env["HOME"] = home;
      return previous;
    }),
    () => effect,
    (previous) =>
      Effect.sync(() => {
        if (previous === undefined) {
          delete process.env["HOME"];
        } else {
          process.env["HOME"] = previous;
        }
      }),
  );

const contextEntry = {
  source: "inline",
  command: "npx",
  args: ["-y", "@acme/context-mcp"],
  enabled: true,
  authored: false,
  env: { ACME_TOKEN: "secret" },
} satisfies McpServerEntry;

const writeHermesEntry = (workspaceRoot: string, entry: Readonly<Record<string, unknown>>) =>
  writeAgentMcpConfig({
    workspaceRoot,
    serverName: "context",
    serversKey: "mcp_servers",
    target: { scope: "user", path: "~/.hermes/config.yaml", format: "yaml" },
    entry,
  });

describe("agent MCP config inspection", () => {
  it.effect("reports match for AXM-managed Hermes YAML entries", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-inspect-hermes-"));
        try {
          yield* withHome(
            workspaceRoot,
            writeHermesEntry(workspaceRoot, {
              "x-axm": { managed: true, source: "inline" },
              enabled: true,
              command: "npx",
              args: ["-y", "@acme/context-mcp"],
              env: { ACME_TOKEN: "secret" },
            }).pipe(
              Effect.flatMap(() =>
                inspectAgentMcpServer({
                  workspaceRoot,
                  scope: "user",
                  agentId: "hermes",
                  serverName: "context",
                  entry: contextEntry,
                }),
              ),
            ),
          ).pipe(
            Effect.map((result) => {
              expect(result.status).toBe("match");
              expect(result.path).toBe("~/.hermes/config.yaml");
              expect(result.expected).toMatchObject({
                "x-axm": { managed: true, source: "inline" },
                enabled: true,
                command: "npx",
                args: ["-y", "@acme/context-mcp"],
                env: { ACME_TOKEN: "secret" },
              });
            }),
          );
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("reports drift for hand-edited managed Hermes YAML entries", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-inspect-hermes-drift-"));
        try {
          yield* withHome(
            workspaceRoot,
            writeHermesEntry(workspaceRoot, {
              "x-axm": { managed: true, source: "inline" },
              enabled: true,
              command: "pnpx",
              args: ["-y", "@acme/context-mcp"],
              env: { ACME_TOKEN: "secret" },
            }).pipe(
              Effect.flatMap(() =>
                inspectAgentMcpServer({
                  workspaceRoot,
                  scope: "user",
                  agentId: "hermes",
                  serverName: "context",
                  entry: contextEntry,
                }),
              ),
            ),
          ).pipe(
            Effect.map((result) => {
              expect(result.status).toBe("drift");
              expect(result.fields).toContain("command");
              expect(result.actual).toMatchObject({ command: "pnpx" });
            }),
          );
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("reports unmanaged for Hermes YAML entries without AXM metadata", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-inspect-hermes-unmanaged-"));
        try {
          const hermesDir = nodePath.join(workspaceRoot, ".hermes");
          mkdirSync(hermesDir, { recursive: true });
          writeFileSync(
            nodePath.join(hermesDir, "config.yaml"),
            [
              "mcp_servers:",
              "  context:",
              "    command: npx",
              "    args:",
              "      - -y",
              "      - '@acme/context-mcp'",
              "",
            ].join("\n"),
          );

          yield* withHome(
            workspaceRoot,
            inspectAgentMcpServer({
              workspaceRoot,
              scope: "user",
              agentId: "hermes",
              serverName: "context",
              entry: contextEntry,
            }),
          ).pipe(
            Effect.map((result) => {
              expect(result.status).toBe("unmanaged");
              expect(result.actual).toMatchObject({ command: "npx" });
            }),
          );
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("collects AXM-managed Hermes YAML entries", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-collect-hermes-"));
        try {
          const hermesDir = nodePath.join(workspaceRoot, ".hermes");
          mkdirSync(hermesDir, { recursive: true });
          const configPath = nodePath.join(hermesDir, "config.yaml");
          writeFileSync(
            configPath,
            [
              "mcp_servers:",
              "  filesystem:",
              "    command: npx",
              "  context:",
              "    x-axm:",
              "      managed: true",
              "      source: inline",
              "    command: npx",
              "",
            ].join("\n"),
          );

          yield* withHome(
            workspaceRoot,
            collectManagedAgentMcpServers({
              workspaceRoot,
              scope: "user",
              agentIds: ["hermes"],
            }),
          ).pipe(
            Effect.map((result) => {
              expect(result).toEqual([
                {
                  agentId: "hermes",
                  serverName: "context",
                  path: "~/.hermes/config.yaml",
                  absolutePath: configPath,
                  target: { scope: "user", path: "~/.hermes/config.yaml", format: "yaml" },
                },
              ]);
              expect(
                readYamlEntry(readFileSync(configPath, "utf8"), "mcp_servers", "filesystem"),
              ).toMatchObject({ command: "npx" });
            }),
          );
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );
});
