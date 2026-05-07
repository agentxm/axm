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

  it.effect("enumerates direct settings refs from on-disk manifests", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const env = { fs, path, baseDir: tempDir };

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
      writeJson(
        nodePath.join(tempDir, ".axm/extensions/@acme/mcp-servers/browser/mcp-server.json"),
        {
          owner: "@acme",
          type: "mcp-server",
          name: "browser",
          version: "1.0.0",
        },
      );
      writeJson(nodePath.join(tempDir, ".axm/extensions/@acme/subagents/planner/subagent.json"), {
        owner: "@acme",
        type: "subagent",
        name: "planner",
        version: "1.0.0",
      });

      const [skills, commands, mcpServers, subagents] = yield* Effect.all([
        configuredSkillsToDiskRefs(env, {
          review: {
            source: "@acme/skills/review",
            enabled: true,
            packagingKind: "native",
          },
        }),
        configuredCommandsToDiskRefs(env, {
          deploy: {
            source: "@acme/commands/deploy",
            enabled: true,
            packagingKind: "native",
          },
        }),
        configuredMcpServersToDiskRefs(env, {
          browser: {
            source: "@acme/mcp-servers/browser",
            packagingKind: "native",
          },
        }),
        configuredSubagentsToDiskRefs(env, {
          planner: {
            source: "@acme/subagents/planner",
            enabled: true,
            packagingKind: "native",
          },
        }),
      ]);

      expect(skills.map((ref) => ref.skill.name)).toEqual(["review"]);
      expect(commands.map((ref) => ref.command.name)).toEqual(["deploy"]);
      expect(mcpServers.map((ref) => ref.server.name)).toEqual(["browser"]);
      expect(subagents.map((ref) => ref.subagent.name)).toEqual(["planner"]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("skips settings entries whose on-disk manifest is missing", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const refs = yield* configuredSubagentsToDiskRefs(
        { fs, path, baseDir: tempDir },
        {
          stale: {
            source: "@acme/subagents/stale",
            enabled: true,
            packagingKind: "native",
          },
        },
      );

      expect(refs).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
