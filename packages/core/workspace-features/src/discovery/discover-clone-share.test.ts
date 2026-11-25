import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { makeRecordingFileSystem } from "@agentxm/test-support";

import { discover } from "./discover.js";
import { makeRecordedRegistryPort, registryFactoryForClient } from "./test-helpers.js";
import { makeDiscoveryProject } from "./testing.js";

const writeJson = (root: string, relativePath: string, value: unknown) => {
  const file = nodePath.join(root, relativePath);
  fs.mkdirSync(nodePath.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`);
};

const skill = (name: string) => ({ owner: "@acme", type: "skill", name, version: "1.0.0" });

/**
 * A Git repository on `main` with skills `alpha` and `beta`, the skill
 * `gamma` under `nested/`, and an Agent Plugins package whose MCP
 * configuration is invalid; branch `other` adds the skill `delta`.
 */
const makeRepository = () => {
  const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-clone-share-")));
  const git = (args: ReadonlyArray<string>) =>
    execFileSync(
      "git",
      ["-c", "user.name=AXM Test", "-c", "user.email=test@example.invalid", ...args],
      { cwd: root },
    );
  writeJson(root, "skills/alpha/skill.json", skill("alpha"));
  writeJson(root, "skills/beta/skill.json", skill("beta"));
  writeJson(root, "nested/gamma/skill.json", skill("gamma"));
  writeJson(root, "plugins/tools/plugin.json", {
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    name: "tools",
  });
  writeJson(root, "plugins/tools/mcp.json", { mcpServers: "not a map" });
  git(["init", "--quiet", "--initial-branch=main"]);
  git(["add", "."]);
  git(["commit", "--quiet", "-m", "fixture"]);
  git(["checkout", "--quiet", "-b", "other"]);
  writeJson(root, "skills/delta/skill.json", skill("delta"));
  git(["add", "."]);
  git(["commit", "--quiet", "-m", "other"]);
  git(["checkout", "--quiet", "main"]);
  return { root, url: pathToFileURL(root).href };
};

interface Recommendation {
  readonly ref: string;
  readonly revision?: string;
  readonly path?: string;
}

/** Discover the recommendations a detected dependency declares from the fixture repository. */
const discoverFrom = (recommendations: ReadonlyArray<Recommendation>) => {
  const project = makeDiscoveryProject();
  const repository = makeRepository();
  project.writeJson("package.json", { dependencies: { react: "18.2.0" } });
  project.writeJson("node_modules/react/package.json", {
    name: "react",
    version: "18.2.0",
    agentExtensions: recommendations.map((recommendation) => ({
      ref: recommendation.ref,
      source: {
        type: "git",
        url: repository.url,
        ...(recommendation.revision === undefined ? {} : { revision: recommendation.revision }),
        ...(recommendation.path === undefined ? {} : { path: recommendation.path }),
      },
    })),
  });
  const registry = makeRecordedRegistryPort(() => ({ body: { results: [] } }));
  return Effect.gen(function* () {
    const client = yield* registry.client;
    const recorder = makeRecordingFileSystem(yield* FileSystem.FileSystem);
    const result = yield* discover(project.root, registryFactoryForClient(client)).pipe(
      Effect.provideService(FileSystem.FileSystem, recorder.fileSystem),
    );
    const clones = recorder.recording
      .calls({ method: "makeTempDirectory" })
      .filter((call) => nodePath.basename(call.path).startsWith("axm-source-clone-"));
    return {
      resolved: (result.packages[0]?.extensions ?? []).map((entry) => [entry.ref, entry.resolved]),
      clones: clones.length,
      retained: clones.filter((call) => fs.existsSync(call.path)).length,
    };
  }).pipe(
    Effect.provide(NodeServices.layer),
    Effect.ensuring(
      Effect.sync(() => {
        project.cleanup();
        fs.rmSync(repository.root, { recursive: true, force: true });
      }),
    ),
  );
};

describe("Discover Git clone sharing", () => {
  it.effect("clones one Git revision once for every recommendation it serves", () =>
    Effect.gen(function* () {
      const outcome = yield* discoverFrom([
        { ref: "@acme/skills/alpha" },
        { ref: "@acme/skills/beta" },
      ]);
      expect(outcome).toEqual({
        resolved: [
          ["@acme/skills/alpha", true],
          ["@acme/skills/beta", true],
        ],
        clones: 1,
        retained: 0,
      });
    }),
  );

  it.effect("clones each distinct revision of one repository separately", () =>
    Effect.gen(function* () {
      const outcome = yield* discoverFrom([
        { ref: "@acme/skills/alpha", revision: "main" },
        { ref: "@acme/skills/delta", revision: "other" },
        { ref: "@acme/skills/delta", revision: "main" },
      ]);
      expect(outcome).toEqual({
        resolved: [
          ["@acme/skills/alpha", true],
          ["@acme/skills/delta", true],
          ["@acme/skills/delta", false],
        ],
        clones: 2,
        retained: 0,
      });
    }),
  );

  it.effect("resolves each recommendation within its own path of a shared clone", () =>
    Effect.gen(function* () {
      const outcome = yield* discoverFrom([
        { ref: "@acme/skills/gamma", path: "nested" },
        { ref: "@acme/skills/gamma", path: "skills" },
        { ref: "@acme/skills/alpha", path: "skills" },
      ]);
      expect(outcome).toEqual({
        resolved: [
          ["@acme/skills/gamma", true],
          ["@acme/skills/gamma", false],
          ["@acme/skills/alpha", true],
        ],
        clones: 1,
        retained: 0,
      });
    }),
  );

  it.effect("retries a revision whose clone failed and keeps each outcome", () =>
    Effect.gen(function* () {
      const outcome = yield* discoverFrom([
        { ref: "@acme/skills/alpha", revision: "missing" },
        { ref: "@acme/skills/beta", revision: "missing" },
        { ref: "@acme/skills/alpha", revision: "main" },
      ]);
      expect(outcome).toEqual({
        resolved: [
          ["@acme/skills/alpha", false],
          ["@acme/skills/beta", false],
          ["@acme/skills/alpha", true],
        ],
        clones: 3,
        retained: 0,
      });
    }),
  );

  it.effect("keeps each recommendation's own type when walking a shared clone", () =>
    Effect.gen(function* () {
      const outcome = yield* discoverFrom([
        { ref: "@acme/mcps/tools" },
        { ref: "@acme/skills/alpha" },
      ]);
      expect(outcome).toEqual({
        resolved: [
          ["@acme/mcps/tools", false],
          ["@acme/skills/alpha", true],
        ],
        clones: 1,
        retained: 0,
      });
    }),
  );
});
