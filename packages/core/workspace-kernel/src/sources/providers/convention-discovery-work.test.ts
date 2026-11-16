/**
 * One convention discovery over one Git checkout reads the checked-out commit
 * once and each package directory's tree once, however many discovered
 * extensions share them, while every extension still carries both values.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Tracer from "effect/Tracer";

import type { FindOptions } from "@agentxm/extension-model/unstable/sources/source-host-provider";
import type { GitSource, LocalSource } from "@agentxm/extension-model/unstable/sources/types";
import { withDetailedWork } from "../../locations/testing.js";
import { isolatedGitEnv } from "../testing.js";
import { discoverConventionRefs } from "./convention-discovery.js";

const write = (file: string, content: unknown) => {
  fs.mkdirSync(nodePath.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
};

const writeManifestSkill = (directory: string, name: string) => {
  write(nodePath.join(directory, "skill.json"), {
    owner: "@acme",
    type: "skill",
    name,
    version: "1.0.0",
  });
  write(
    nodePath.join(directory, "src", "SKILL.md"),
    `---\nname: ${name}\ndescription: The ${name} skill\n---\n`,
  );
};

/** An Agent Plugins plugin with the given portable skills and MCP servers. */
const writeAgentPlugin = (
  directory: string,
  skills: ReadonlyArray<string>,
  servers: ReadonlyArray<string>,
) => {
  write(nodePath.join(directory, "plugin.json"), {
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    name: "reviews",
  });
  for (const skill of skills)
    write(
      nodePath.join(directory, "skills", skill, "SKILL.md"),
      `---\nname: ${skill}\ndescription: The ${skill} skill\n---\n`,
    );
  if (servers.length > 0)
    write(nodePath.join(directory, "mcp.json"), {
      $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: Object.fromEntries(servers.map((server) => [server, {}])),
    });
};

const find = (type: FindOptions["type"], names: ReadonlyArray<string> = []): FindOptions => ({
  names,
  type,
  owner: Option.none(),
  versionRange: Option.none(),
});

/** Discover with a tracer that records the Git operations the discovery runs. */
const discover = (source: GitSource | LocalSource, basePath: string, options: FindOptions) =>
  Effect.gen(function* () {
    const spans: Tracer.NativeSpan[] = [];
    const tracer = Tracer.make({
      span(spanOptions) {
        const span = new Tracer.NativeSpan(spanOptions);
        spans.push(span);
        return span;
      },
    });
    const refs = yield* discoverConventionRefs(source, basePath, options).pipe(
      withDetailedWork(tracer),
    );
    const operations = (operation: string) =>
      spans.filter(
        (span) =>
          span.name === "axm.git.operation" &&
          span.attributes.get("axm.git.operation") === operation,
      ).length;
    return {
      refs,
      commitReads: operations("get-commit-sha"),
      treeReads: operations("get-tree-sha"),
      gitOperations: spans.filter((span) => span.name === "axm.git.operation").length,
    };
  }).pipe(Effect.provide(NodeServices.layer));

describe("convention discovery Git metadata work", () => {
  let root: string;
  const git = (args: ReadonlyArray<string>) =>
    execFileSync(
      "git",
      ["-c", "user.name=AXM Test", "-c", "user.email=test@example.invalid", ...args],
      { cwd: root, env: isolatedGitEnv(process.env), encoding: "utf8" },
    ).trim();
  const commit = () => {
    git(["init", "--quiet", "--initial-branch=main"]);
    git(["add", "."]);
    git(["commit", "--quiet", "-m", "fixture"]);
  };
  const treeOf = (directory: string) => git(["ls-tree", "HEAD", directory]).split(/\s+/u)[2];
  const gitSource = (): GitSource => ({
    type: "git",
    url: new URL(pathToFileURL(root).href),
    ref: Option.none(),
    subPath: Option.none(),
  });

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-convention-git-")));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.effect("reads the commit once and each package directory's tree once", () =>
    Effect.gen(function* () {
      writeManifestSkill(nodePath.join(root, "skills", "alpha"), "alpha");
      writeManifestSkill(nodePath.join(root, "skills", "beta"), "beta");
      writeAgentPlugin(
        nodePath.join(root, "plugins", "reviews"),
        ["one", "two", "three"],
        ["first", "second"],
      );
      commit();
      const head = git(["rev-parse", "HEAD"]);

      const outcome = yield* discover(gitSource(), root, find("*"));

      expect({ commitReads: outcome.commitReads, treeReads: outcome.treeReads }).toStrictEqual({
        commitReads: 1,
        treeReads: 3,
      });
      expect(
        outcome.refs.map((ref) => [
          ref.type,
          ref.name,
          ref.refType === "git-hosted" ? ref.sourcePath : undefined,
          ref.refType === "git-hosted" ? ref.gitTreeSha : undefined,
          ref.refType === "git-hosted" ? ref.gitCommitSha : undefined,
        ]),
      ).toStrictEqual([
        ["mcp-server", expect.any(String), "plugins/reviews", treeOf("plugins/reviews"), head],
        ["mcp-server", expect.any(String), "plugins/reviews", treeOf("plugins/reviews"), head],
        ["skill", "one", "plugins/reviews/skills/one", treeOf("plugins/reviews"), head],
        ["skill", "three", "plugins/reviews/skills/three", treeOf("plugins/reviews"), head],
        ["skill", "two", "plugins/reviews/skills/two", treeOf("plugins/reviews"), head],
        ["skill", "alpha", "skills/alpha", treeOf("skills/alpha"), head],
        ["skill", "beta", "skills/beta", treeOf("skills/beta"), head],
      ]);
      expect(
        outcome.refs.flatMap((ref) =>
          ref.type === "mcp-server" && ref.refType === "git-hosted"
            ? [[ref.server.name, ref.source.subPath, ref.distribution?.packageRoot]]
            : [],
        ),
      ).toStrictEqual([
        ["first", Option.some("plugins/reviews"), "plugins/reviews"],
        ["second", Option.some("plugins/reviews"), "plugins/reviews"],
      ]);
    }),
  );

  it.effect("reads the root tree once for a plugin at the checkout root", () =>
    Effect.gen(function* () {
      writeAgentPlugin(root, ["one", "two"], []);
      commit();
      const rootTree = git(["rev-parse", "HEAD^{tree}"]);

      const outcome = yield* discover(gitSource(), root, find("skill"));

      expect({ commitReads: outcome.commitReads, treeReads: outcome.treeReads }).toStrictEqual({
        commitReads: 1,
        treeReads: 1,
      });
      expect(
        outcome.refs.map((ref) => [
          ref.name,
          ref.refType === "git-hosted" ? ref.gitTreeSha : undefined,
        ]),
      ).toStrictEqual([
        ["one", rootTree],
        ["two", rootTree],
      ]);
    }),
  );

  it.effect("runs no Git operation when nothing is discovered", () =>
    Effect.gen(function* () {
      writeManifestSkill(nodePath.join(root, "skills", "alpha"), "alpha");
      commit();

      const outcome = yield* discover(gitSource(), root, find("skill", ["missing"]));

      expect(outcome.refs).toStrictEqual([]);
      expect(outcome.gitOperations).toBe(0);
    }),
  );

  it.effect("runs no Git operation for a local source", () =>
    Effect.gen(function* () {
      writeManifestSkill(nodePath.join(root, "skills", "alpha"), "alpha");
      writeAgentPlugin(nodePath.join(root, "plugins", "reviews"), ["one", "two"], ["first"]);

      const outcome = yield* discover({ type: "local", path: root }, root, find("*"));

      expect(outcome.refs.map((ref) => ref.refType)).toStrictEqual([
        "local",
        "local",
        "local",
        "local",
      ]);
      expect(outcome.gitOperations).toBe(0);
    }),
  );
});
