import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { expect, layer } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { TEST_CONTENT_IDENTITY } from "../workspace/test-stubs.js";
import { makeBaseWorkspaceMock } from "../workspace/test-stubs.js";
import { computeMaterializedTreeIntegritySync, extensionName, handle } from "../test-helpers.js";
import {
  configuredMcpServersToDiskRefs,
  configuredSkillsToDiskRefs,
  configuredSubagentsToDiskRefs,
} from "./materializable-from-disk.js";

const writeJson = (filePath: string, value: unknown) => {
  nodeFs.mkdirSync(nodePath.dirname(filePath), { recursive: true });
  nodeFs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};

const makeEnv = (fs: FileSystem.FileSystem, path: Path.Path, baseDir: string) => ({
  fs,
  path,
  baseDir,
  scope: "project" as const,
  layout: makeBaseWorkspaceMock(nodePath.join(baseDir, ".axm")).layout,
});

const githubHost = {
  name: "github",
  type: "github" as const,
  url: new URL("https://github.com"),
};

const writeAcquiredSkill = (baseDir: string) => {
  const packageRoot = nodePath.join(
    baseDir,
    "agent_extensions",
    "github",
    "qualitymd",
    "quality.md",
  );
  writeJson(nodePath.join(packageRoot, "skill.json"), {
    owner: "@acme",
    type: "skill",
    name: "quality",
    version: "1.0.0",
  });
  nodeFs.mkdirSync(nodePath.join(packageRoot, "src"), { recursive: true });
  nodeFs.writeFileSync(
    nodePath.join(packageRoot, "src", "SKILL.md"),
    "---\nname: quality\ndescription: Review project quality.\n---\n",
  );
  return packageRoot;
};

layer(NodeServices.layer, { excludeTestServices: true })(
  "configured extensions to disk refs",
  (it) => {
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
        const env = makeEnv(fs, path, tempDir);

        writeJson(nodePath.join(tempDir, ".axm/extensions/@acme/skills/review/skill.json"), {
          owner: "@acme",
          type: "skill",
          name: "review",
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

        const [skills, mcpServers, subagents] = yield* Effect.all([
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
        expect(mcpServers).toEqual([]);
        expect(subagents).toEqual([]);
      }),
    );

    it.effect(
      "reconstructs a configured GitHub skill from matching trusted canonical content",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const env = makeEnv(fs, path, tempDir);
          const packageRoot = writeAcquiredSkill(tempDir);

          const refs = yield* configuredSkillsToDiskRefs(
            env,
            {
              quality: {
                type: "skill",
                name: "quality",
                source: "github:qualitymd/quality.md",
                enabled: true,
                packagingKind: "non-native",
                lifecycle: "configured",
              },
            },
            {
              lockEntries: {
                quality: {
                  type: "github",
                  sourceType: "github",
                  sourceName: "github",
                  endpoint: new URL("https://github.com"),
                  extensionType: "skill",
                  workspaceName: extensionName("quality"),
                  packageFormat: "agentxm",
                  packageOwner: handle("@acme"),
                  packageName: extensionName("quality"),
                  owner: "qualitymd",
                  repo: "quality.md",
                  resolvedCommit: "commit-1",
                  resolvedTree: "tree-1",
                  contentIdentity: TEST_CONTENT_IDENTITY,
                  treeIntegrity: computeMaterializedTreeIntegritySync(packageRoot),
                },
              },
              getConfiguredSources: () => Effect.succeed([githubHost]),
              getConfiguredSourceByName: (name) =>
                Effect.succeed(name === "github" ? Option.some(githubHost) : Option.none()),
            },
          );

          expect(refs).toHaveLength(1);
          const ref = refs[0];
          if (ref === undefined || ref.refType !== "git-hosted") {
            throw new Error("Expected one Git-hosted skill ref");
          }
          expect(ref.skill.name).toBe("quality");
          expect(ref.location).toBe(new URL(`file://${packageRoot}`).href);
        }),
    );

    it.effect(
      "rejects canonical GitHub skill content whose trusted source differs from settings",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const packageRoot = writeAcquiredSkill(tempDir);

          const refs = yield* configuredSkillsToDiskRefs(
            makeEnv(fs, path, tempDir),
            {
              quality: {
                type: "skill",
                name: "quality",
                source: "github:new-owner/quality.md",
                enabled: true,
                packagingKind: "non-native",
                lifecycle: "configured",
              },
            },
            {
              lockEntries: {
                quality: {
                  type: "github",
                  sourceType: "github",
                  sourceName: "github",
                  endpoint: new URL("https://github.com"),
                  extensionType: "skill",
                  workspaceName: extensionName("quality"),
                  packageFormat: "agentxm",
                  packageOwner: handle("@acme"),
                  packageName: extensionName("quality"),
                  owner: "qualitymd",
                  repo: "quality.md",
                  resolvedCommit: "commit-1",
                  resolvedTree: "tree-1",
                  contentIdentity: TEST_CONTENT_IDENTITY,
                  treeIntegrity: computeMaterializedTreeIntegritySync(packageRoot),
                },
              },
              getConfiguredSources: () => Effect.succeed([githubHost]),
              getConfiguredSourceByName: (name) =>
                Effect.succeed(name === "github" ? Option.some(githubHost) : Option.none()),
            },
          );

          expect(refs).toEqual([]);
        }),
    );

    it.effect("skips settings entries whose on-disk manifest is missing", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const refs = yield* configuredSubagentsToDiskRefs(makeEnv(fs, path, tempDir), {
          stale: {
            type: "subagent",
            name: "stale",
            source: "@acme/subagents/stale",
            enabled: true,
            packagingKind: "native",
            lifecycle: "configured",
          },
        });

        expect(refs).toEqual([]);
      }),
    );

    it.effect("skips disabled MCP server entries from on-disk manifests", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const env = makeEnv(fs, path, tempDir);

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
      }),
    );
  },
);
