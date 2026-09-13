import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { injectWriteFaults } from "@agentxm/workspace-transactions/testing";
import { afterEach } from "vitest";
import { deriveOperationOutcome } from "@agentxm/workspace-operations";
import {
  applyInstall,
  installRequest,
  makeInstallWorld,
  previewInstall,
} from "../../install/test-helpers.js";

describe("Registry MCP installation with shared native targets", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  for (const transport of ["stdio", "http", "http-symbolic"] as const) {
    it.effect(`preserves symbolic ${transport} credentials for Claude, Copilot, and Codex`, () => {
      const world = makeInstallWorld({
        settings: { agents: ["claude-code", "github-copilot-cli", "codex"] },
      });
      cleanups.push(world.cleanup);
      world.workspace.writeFile(
        ".mcp.json",
        JSON.stringify({ mcpServers: { personal: { command: "personal-server" } } }),
      );
      const server =
        transport === "stdio"
          ? {
              packages: [
                {
                  registryType: "npm",
                  identifier: "@acme/context",
                  version: "1.0.0",
                  transport: { type: "stdio" },
                  environmentVariables: [{ name: "API_TOKEN", isSecret: true, isRequired: true }],
                },
              ],
            }
          : {
              remotes: [
                {
                  type: "streamable-http",
                  url: "https://mcp.example.test/mcp",
                  headers: [
                    {
                      name: "Authorization",
                      value:
                        transport === "http-symbolic"
                          ? "Bearer ${API_TOKEN}"
                          : "Bearer {API_TOKEN}",
                      variables: { API_TOKEN: { isSecret: true, isRequired: true } },
                    },
                  ],
                },
              ],
            };
      world.registry.writeMcp("context", [
        {
          version: "1.0.0",
          files: {
            "mcp.json": JSON.stringify({
              owner: "@acme",
              type: "mcp-server",
              name: "context",
              version: "1.0.0",
              server: {
                name: "ai.acme/context",
                version: "1.0.0",
                description: "Context",
                ...server,
              },
            }),
          },
        },
      ]);
      const request = installRequest({
        type: "mcp-server",
        subject: { kind: "source", source: "@acme/mcps/context" },
        env: ["API_TOKEN=${API_TOKEN}"],
      });
      return world.workspace
        .provide(
          Effect.gen(function* () {
            const before = world.workspace.snapshot();
            const preview = yield* previewInstall(request);
            expect(deriveOperationOutcome(preview)).toBe("previewed");
            expect(world.workspace.snapshot()).toEqual(before);
            const applied = yield* applyInstall(request);
            expect(deriveOperationOutcome(applied)).toBe("applied");
            expect(world.workspace.readFile("axm.json")).toContain("${API_TOKEN}");
            expect(world.workspace.readFile(".mcp.json")).toContain("${API_TOKEN}");
            expect(world.workspace.readFile(".mcp.json")).not.toContain("$${API_TOKEN}");
            expect(world.workspace.readFile(".mcp.json")).toContain("personal-server");
            expect(world.workspace.readFile(".codex/config.toml")).toContain("API_TOKEN");
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    });
  }

  it.effect(
    "restores lock, settings, canonical content, and native entries after a projection write fails",
    () => {
      const world = makeInstallWorld({
        settings: { agents: ["claude-code", "github-copilot-cli", "codex"] },
      });
      cleanups.push(world.cleanup);
      world.registry.writeMcp("context", [{ version: "1.0.0" }]);
      world.workspace.writeFile(
        ".mcp.json",
        JSON.stringify({ mcpServers: { personal: { command: "personal-server" } } }),
      );
      world.workspace.writeFile(".codex/config.toml", "# personal configuration\n");
      const request = installRequest({
        type: "mcp-server",
        subject: { kind: "source", source: "@acme/mcps/context" },
      });
      return world.workspace
        .provide(
          Effect.gen(function* () {
            const before = world.workspace.snapshot();
            const result = yield* applyInstall(request);
            expect(deriveOperationOutcome(result)).toBe("failed");
            expect(world.workspace.snapshot()).toEqual(before);
          }),
        )
        .pipe(
          Effect.provide(
            Layer.provideMerge(
              injectWriteFaults(
                (operation) =>
                  operation.kind === "writeFileString" &&
                  operation.path.endsWith(".codex/config.toml"),
              ),
              NodeServices.layer,
            ),
          ),
        );
    },
  );
});
