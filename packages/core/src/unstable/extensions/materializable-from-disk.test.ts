import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import {
  configuredCommandsToDiskRefs,
  configuredMcpServersToDiskRefs,
  configuredSkillsToDiskRefs,
  configuredSubagentsToDiskRefs,
} from "./materializable-from-disk.js";

const writeJson = (filePath: string, value: unknown) => {
  nodeFs.mkdirSync(nodePath.dirname(filePath), { recursive: true });
  nodeFs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};

describe("configured extensions to disk refs", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-disk-refs-"));
  });

  afterEach(() => {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("does not reconstruct registry refs without canonical registry metadata", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const env = { fs, path, baseDir: tempDir, scope: "project" as const };

      writeJson(nodePath.join(tempDir, ".axm/extensions/@acme/skills/review/skill.json"), {
        owner: "@acme",
        type: "skill",
        name: "review",
        version: "1.0.0",
      });
      writeJson(nodePath.join(tempDir, ".axm/extensions/@acme/commands/deploy/command.json"), {
        owner: "@acme",
        type: "command",
        name: "deploy",
        version: "1.0.0",
      });
      writeJson(nodePath.join(tempDir, ".axm/extensions/@acme/mcps/browser/mcp.json"), {
        owner: "@acme",
        type: "mcp-server",
        name: "browser",
        version: "1.0.0",
        server: {
          name: "io.github.acme/browser",
          description: "Browser MCP server",
          version: "1.0.0",
        },
      });
      writeJson(nodePath.join(tempDir, ".axm/extensions/@acme/subagents/planner/subagent.json"), {
        owner: "@acme",
        type: "subagent",
        name: "planner",
        version: "1.0.0",
      });

      const [skills, commands, mcpServers, subagents] = yield* Effect.all([
        configuredSkillsToDiskRefs(env, {
          review: {
            type: "skill",
            name: "review",
            source: "@acme/skills/review",
            enabled: true,
            packagingKind: "native",
            lifecycle: "configured",
          },
        }),
        configuredCommandsToDiskRefs(env, {
          deploy: {
            type: "command",
            name: "deploy",
            source: "@acme/commands/deploy",
            enabled: true,
            packagingKind: "native",
            lifecycle: "configured",
          },
        }),
        configuredMcpServersToDiskRefs(env, {
          browser: {
            type: "mcp-server",
            name: "browser",
            source: "@acme/mcps/browser",
            enabled: true,
            packagingKind: "native",
            lifecycle: "configured",
          },
        }),
        configuredSubagentsToDiskRefs(env, {
          planner: {
            type: "subagent",
            name: "planner",
            source: "@acme/subagents/planner",
            enabled: true,
            packagingKind: "native",
            lifecycle: "configured",
          },
        }),
      ]);

      expect(skills).toEqual([]);
      expect(commands).toEqual([]);
      expect(mcpServers).toEqual([]);
      expect(subagents).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("skips settings entries whose on-disk manifest is missing", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const refs = yield* configuredSubagentsToDiskRefs(
        { fs, path, baseDir: tempDir, scope: "project" },
        {
          stale: {
            type: "subagent",
            name: "stale",
            source: "@acme/subagents/stale",
            enabled: true,
            packagingKind: "native",
            lifecycle: "configured",
          },
        },
      );

      expect(refs).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("skips disabled MCP server entries from on-disk manifests", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const env = { fs, path, baseDir: tempDir, scope: "project" as const };

      writeJson(nodePath.join(tempDir, ".axm/extensions/@acme/mcps/browser/mcp.json"), {
        owner: "@acme",
        type: "mcp-server",
        name: "browser",
        version: "1.0.0",
        server: {
          name: "io.github.acme/browser",
          description: "Browser MCP server",
          version: "1.0.0",
          packages: [
            {
              registryType: "npm",
              identifier: "@acme/browser-mcp",
              version: "1.0.0",
              transport: { type: "stdio" },
            },
          ],
        },
      });

      const refs = yield* configuredMcpServersToDiskRefs(env, {
        browser: {
          type: "mcp-server",
          name: "browser",
          source: "@acme/mcps/browser",
          enabled: false,
          packagingKind: "native",
          lifecycle: "configured",
        },
      });

      expect(refs).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
