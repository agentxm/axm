/**
 * A root locator install opens a path once per installable type. Those probes
 * read one unchanged tree inside one selection, so the work each of them
 * repeats — the retained package's integrity hash and the walk of the local
 * source — is done once and its result shared across the probe loop, while
 * every refusal, explicit selection and later planning keeps reading the tree
 * itself.
 *
 * The cases count physical reads with a recording filesystem over a real
 * temporary workspace, and count source lookups with a counting
 * `SourceHostProviders` placed over the live one at its service seam.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { installableExtensionTypes } from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { FindOptions } from "@agentxm/extension-model/unstable/sources/source-host-provider";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { OperationRefused } from "@agentxm/workspace-kernel/operations";
import {
  SourceHostProviders,
  type SourceHostProvidersService,
} from "@agentxm/workspace-kernel/sources";

import {
  writeLocalHookPackage,
  writeLocalKnowledgePackage,
  writeLocalRulePackage,
  writeLocalSkillPackage,
  writeLocalSubagentPackage,
  writeAgentSkillDirectory,
  writeMinimalPackage,
} from "../../testing/local-packages.js";
import {
  applyInstall,
  installRequest,
  makeInstallWorld,
  type InstallWorld,
} from "../../testing/install-world.js";
import { serveBareRepository } from "../../testing/git-repositories.js";
import {
  InstallExtensions,
  type InstallExtensionsRequest,
  type InstallExtensionsSelection,
} from "./install-extensions.js";
import { makeLocatorProbeSources } from "./locator-probe-sharing.js";

const RETAINED = "agent_extensions/_local/project/source/vendor/review";

const broad = (type: FindOptions["type"]): FindOptions => ({
  type,
  names: [],
  owner: Option.none(),
  versionRange: Option.none(),
});

interface LocalFind {
  readonly path: string;
  readonly type: FindOptions["type"];
  readonly names: ReadonlyArray<string>;
}

/** Record each local lookup that reaches the live providers, in order. */
const countingSources = (
  sources: SourceHostProvidersService,
  finds: Array<LocalFind>,
): SourceHostProvidersService => ({
  ...sources,
  find: (source, options, accepted) =>
    Effect.sync(() => {
      if (source.type === "local")
        finds.push({ path: source.path, type: options.type, names: options.names });
    }).pipe(Effect.andThen(sources.find(source, options, accepted))),
});

/** A source tree with one skill (carrying an asset discovery never reads) and one rule. */
const writeSource = (world: InstallWorld) => {
  const root = nodePath.join(world.workspace.root, "source");
  const skill = writeLocalSkillPackage(root, { name: "review" });
  fs.mkdirSync(nodePath.join(skill, "assets"));
  fs.writeFileSync(nodePath.join(skill, "assets", "notes.txt"), "notes\n");
  writeLocalRulePackage(root, { name: "style" });
  return { root, skill };
};

/** The host services, with a recording filesystem in place of the plain one. */
const recordingHost = Layer.merge(
  NodeServices.layer,
  layerRecordingFileSystem(NodeFileSystem.layer),
);

/** Run `effect` in the world over a recording host filesystem. */
const recorded = <A, E, R>(world: InstallWorld, effect: Effect.Effect<A, E, R>) =>
  world.workspace.provide(effect).pipe(Effect.provide(recordingHost));

/** Select a locator install through counting providers. */
const selectCounting = (request: InstallExtensionsRequest, finds: Array<LocalFind>) =>
  Effect.gen(function* () {
    const live = yield* SourceHostProviders;
    return yield* InstallExtensions.select(request).pipe(
      Effect.provideService(SourceHostProviders, countingSources(live, finds)),
    );
  });

const locatorAll = (source: string) =>
  installRequest({ subject: { kind: "source", source }, all: true });

const retainSkill = (skill: string) =>
  applyInstall(installRequest({ type: "skill", subject: { kind: "source", source: skill } }));

describe("locator install probes share one reading of an unchanged tree", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("walks a local source once for every type it probes", () => {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    const source = writeSource(world);
    return recorded(
      world,
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const sources = yield* SourceHostProviders;
        const rootReads = () =>
          recording.calls({ method: "readDirectory", path: source.root }).length;

        recording.reset();
        yield* sources.find({ type: "local", path: source.root }, broad("skill"));
        const typedWalk = rootReads();
        recording.reset();
        yield* sources.find({ type: "local", path: source.root }, broad("*"));
        const broadWalk = rootReads();
        expect(typedWalk).toBe(1);
        expect(broadWalk).toBe(typedWalk);

        const finds: Array<LocalFind> = [];
        recording.reset();
        yield* selectCounting(locatorAll(source.root), finds);

        // Today: seven typed walks of the source root. Shared: one broad walk.
        expect({
          rootReads: rootReads(),
          finds: finds.filter((find) => find.path === source.root).map((find) => find.type),
        }).toEqual({ rootReads: broadWalk, finds: ["*"] });
      }),
    );
  });

  it.effect("hashes a retained package once across the probe loop", () => {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    const source = writeSource(world);
    const retained = nodePath.join(world.workspace.root, RETAINED);
    return recorded(
      world,
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const sources = yield* SourceHostProviders;
        yield* retainSkill(source.skill);
        expect(fs.existsSync(nodePath.join(retained, "assets", "notes.txt"))).toBe(true);

        // Discovery reads the manifest once and never the asset.
        recording.reset();
        yield* sources.find({ type: "local", path: retained }, broad("skill"));
        expect(recording.contentReads(nodePath.join(retained, "assets", "notes.txt"))).toBe(0);
        expect(recording.contentReads(nodePath.join(retained, "skill.json"))).toBe(1);

        const finds: Array<LocalFind> = [];
        recording.reset();
        yield* selectCounting(locatorAll(source.root), finds);

        // Today: 7 hashes (asset) and 7 hashes + 7 typed walks (manifest).
        expect({
          asset: recording.contentReads(nodePath.join(retained, "assets", "notes.txt")),
          manifest: recording.contentReads(nodePath.join(retained, "skill.json")),
          finds: finds.filter((find) => find.path === retained).map((find) => find.type),
        }).toEqual({ asset: 1, manifest: 2, finds: ["*"] });
      }),
    );
  });

  it.effect("hashes the original source once when the retained copy no longer matches", () => {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    const source = writeSource(world);
    const retained = nodePath.join(world.workspace.root, RETAINED);
    return recorded(
      world,
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        yield* retainSkill(source.skill);
        fs.writeFileSync(nodePath.join(retained, "assets", "notes.txt"), "edited\n");

        const finds: Array<LocalFind> = [];
        recording.reset();
        yield* selectCounting(locatorAll(source.root), finds);

        // Today: 7 hashes of each root, the original also serving 7 typed walks.
        expect({
          retainedAsset: recording.contentReads(nodePath.join(retained, "assets", "notes.txt")),
          originalAsset: recording.contentReads(nodePath.join(source.skill, "assets", "notes.txt")),
          finds: finds.filter((find) => find.path === source.skill).map((find) => find.type),
        }).toEqual({ retainedAsset: 1, originalAsset: 1, finds: ["*"] });
      }),
    );
  });
});

/** A source tree offering every installable type, including plugin connections and a pack. */
const writeEveryKind = (world: InstallWorld) => {
  const root = nodePath.join(world.workspace.root, "catalog");
  writeLocalSkillPackage(root, { name: "review" });
  writeLocalSkillPackage(root, { name: "audit" });
  writeAgentSkillDirectory(root, { name: "notes" });
  writeLocalSubagentPackage(root, { name: "planner" });
  writeLocalRulePackage(root, { name: "style" });
  writeLocalHookPackage(root, { name: "guard" });
  writeLocalKnowledgePackage(root, { name: "handbook" });
  writeMinimalPackage(nodePath.join(root, "vendor", "context"), "mcp-server", { name: "context" });
  writeMinimalPackage(nodePath.join(root, "vendor", "bundle"), "pack", { name: "bundle" });
  writePlugin(root, {
    $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    mcpServers: {
      search: { type: "streamable-http", url: "https://example.test/search" },
      docs: { type: "sse", url: "https://example.test/docs" },
    },
  });
  return root;
};

/** An Agent Plugins package under `plugins/tools` with the given MCP configuration. */
const writePlugin = (root: string, mcp: unknown) => {
  const plugin = nodePath.join(root, "plugins", "tools");
  fs.mkdirSync(plugin, { recursive: true });
  fs.writeFileSync(
    nodePath.join(plugin, "plugin.json"),
    '{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"tools"}\n',
  );
  fs.writeFileSync(nodePath.join(plugin, "mcp.json"), JSON.stringify(mcp));
};

/** The names a locator selection settled, type by type. */
const settledNames = (selection: InstallExtensionsSelection) =>
  selection.kind !== "locator"
    ? []
    : selection.settled.map((settled) => ({
        type: settled.type,
        names:
          settled.type === "mcp-server" || settled.type === "pack"
            ? settled.selectedRefs.map((ref) => ref.name)
            : settled.settled.refs.map((entry) => entry.ref.name),
      }));

describe("a shared broad walk answers exactly what each typed walk would", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("serves every type's refs, in order, from one broad walk", () => {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    const root = writeEveryKind(world);
    const local = { type: "local", path: root } as const;
    return recorded(
      world,
      Effect.scoped(
        Effect.gen(function* () {
          const sources = yield* SourceHostProviders;
          const finds: Array<LocalFind> = [];
          const shared = yield* makeLocatorProbeSources(countingSources(sources, finds));
          for (const type of installableExtensionTypes) {
            const typed: ReadonlyArray<ExtensionRef> = yield* sources.find(local, broad(type));
            expect(typed.length, type).toBeGreaterThan(0);
            expect(yield* shared.find(local, broad(type)), type).toEqual(typed);
          }
          expect(finds.map((find) => find.type)).toEqual(["*"]);

          // Questions a broad walk cannot answer by type alone read their own walk.
          finds.length = 0;
          yield* shared.find(local, { ...broad("skill"), names: ["review"] });
          yield* shared.find(local, {
            ...broad("skill"),
            owner: Option.some(decodeHandleSync("@acme")),
          });
          yield* shared.find(local, broad("*"));
          expect(finds.map((find) => find.type)).toEqual(["skill", "skill", "*"]);

          // The probe loop of a root install takes the same single walk.
          finds.length = 0;
          const selection = yield* selectCounting(locatorAll(root), finds);
          expect(finds.filter((find) => find.path === root).map((find) => find.type)).toEqual([
            "*",
          ]);
          expect(settledNames(selection).map(({ type }) => type)).toEqual([
            "skill",
            "mcp-server",
            "subagent",
            "rule",
            "hook",
            "knowledge",
            "pack",
          ]);
        }),
      ),
    );
  });
});

describe("locator probes keep every refusal and explicit selection they had", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("refuses a retained package neither copy of which still matches", () => {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    const source = writeSource(world);
    const retained = nodePath.join(world.workspace.root, RETAINED);
    return recorded(
      world,
      Effect.gen(function* () {
        yield* retainSkill(source.skill);
        fs.writeFileSync(nodePath.join(retained, "assets", "notes.txt"), "edited\n");
        fs.writeFileSync(nodePath.join(source.skill, "assets", "notes.txt"), "edited\n");

        const failure = yield* Effect.flip(InstallExtensions.select(locatorAll(source.root)));
        expect(failure).toBeInstanceOf(OperationRefused);
        expect(failure).toMatchObject({
          category: "conflict",
          detail:
            "Neither the retained package nor the local source contains the accepted snapshot",
        });
      }),
    );
  });

  it.effect("walks once per explicitly selected type", () => {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    const source = writeSource(world);
    return recorded(
      world,
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const finds: Array<LocalFind> = [];
        recording.reset();
        const selection = yield* selectCounting(
          installRequest({
            subject: { kind: "source", source: source.root },
            selectors: { skill: ["review"], rule: ["style"] },
            all: false,
          }),
          finds,
        );
        // The skill probe asks without names, as an unfiltered probe would; it still walks alone.
        expect(finds.filter((find) => find.path === source.root)).toEqual([
          { path: source.root, type: "skill", names: [] },
          { path: source.root, type: "rule", names: ["style"] },
        ]);
        expect(recording.calls({ method: "readDirectory", path: source.root }).length).toBe(2);
        expect(settledNames(selection)).toEqual([
          { type: "skill", names: ["review"] },
          { type: "rule", names: ["style"] },
        ]);
      }),
    );
  });

  it.effect("selects by source path and by name as before", () => {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    const source = writeSource(world);
    const portable = nodePath.join(source.root, "vendor", "notes");
    fs.mkdirSync(portable, { recursive: true });
    fs.writeFileSync(
      nodePath.join(portable, "SKILL.md"),
      '---\nname: "Notes Helper"\ndescription: "Takes notes."\n---\n\n# Notes\n',
    );
    return recorded(
      world,
      Effect.gen(function* () {
        const finds: Array<LocalFind> = [];
        const selection = yield* selectCounting(
          installRequest({
            subject: { kind: "source", source: source.root },
            selectors: { skill: ["vendor/review", "notes"] },
            all: false,
          }),
          finds,
        );
        expect(finds.filter((find) => find.path === source.root).map((find) => find.type)).toEqual([
          "skill",
        ]);
        expect(settledNames(selection)).toEqual([{ type: "skill", names: ["notes", "review"] }]);
      }),
    );
  });

  it.effect("fails on a malformed plugin connection as the connection probe alone does", () => {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    const source = writeSource(world);
    writePlugin(source.root, { mcpServers: "not a map" });
    return recorded(
      world,
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const typed = yield* Effect.flip(
          InstallExtensions.select(
            installRequest({
              type: "mcp-server",
              subject: { kind: "source", source: source.root },
              all: true,
            }),
          ),
        );
        recording.reset();
        const located = yield* Effect.flip(InstallExtensions.select(locatorAll(source.root)));
        expect(located).toBeInstanceOf(OperationRefused);
        expect(located).toEqual(typed);
        expect(located).toMatchObject({
          category: "network",
          detail: "Failed to discover extensions",
        });
        // The failed broad walk adds one walk before the skill and connection probes' own.
        expect(recording.calls({ method: "readDirectory", path: source.root }).length).toBe(3);
      }),
    );
  });

  it.effect("fails on a duplicate identity within one type as that type's probe alone does", () => {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    const source = writeSource(world);
    writeMinimalPackage(nodePath.join(source.root, "copies", "style"), "rule", { name: "style" });
    return recorded(
      world,
      Effect.gen(function* () {
        const typed = yield* Effect.flip(
          InstallExtensions.select(
            installRequest({
              type: "rule",
              subject: { kind: "source", source: source.root },
              all: true,
            }),
          ),
        );
        const located = yield* Effect.flip(InstallExtensions.select(locatorAll(source.root)));
        expect(located).toBeInstanceOf(OperationRefused);
        expect(located).toEqual(typed);
        expect(located).toMatchObject({
          category: "network",
          detail: "Failed to discover extensions",
        });
      }),
    );
  });

  it.effect("hands planning the source view itself, not the probe loop's walk", () => {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    const source = writeSource(world);
    const local = { type: "local", path: source.root } as const;
    return recorded(
      world,
      Effect.gen(function* () {
        const finds: Array<LocalFind> = [];
        const request = locatorAll(source.root);
        const selection = yield* selectCounting(request, finds);
        if (selection.kind !== "locator") return expect.fail("expected a locator selection");
        // Planning and the command's first-use establishment (not driven here) receive this
        // view; every unfiltered typed question asked of it reads the source again.
        finds.length = 0;
        for (const type of installableExtensionTypes)
          yield* selection.sources.find(local, broad(type));
        expect(finds.map((find) => find.type)).toEqual(installableExtensionTypes);
        finds.length = 0;
        yield* InstallExtensions.plan(request, selection);
        expect(finds.filter((find) => find.type === "*")).toEqual([]);
      }),
    );
  });
});

describe("the probe loop's shared readings end with its selection", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("verifies a retained package afresh on the next selection", () => {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    const source = writeSource(world);
    const retained = nodePath.join(world.workspace.root, RETAINED);
    return recorded(
      world,
      Effect.gen(function* () {
        yield* retainSkill(source.skill);
        yield* InstallExtensions.select(locatorAll(source.root));

        fs.writeFileSync(nodePath.join(retained, "assets", "notes.txt"), "edited\n");
        fs.writeFileSync(nodePath.join(source.skill, "assets", "notes.txt"), "edited\n");
        const failure = yield* Effect.flip(InstallExtensions.select(locatorAll(source.root)));
        expect(failure).toBeInstanceOf(OperationRefused);
        expect(failure).toMatchObject({
          category: "conflict",
          detail:
            "Neither the retained package nor the local source contains the accepted snapshot",
        });
      }),
    );
  });

  it.effect("walks the local source afresh on the next selection", () => {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    const source = writeSource(world);
    return recorded(
      world,
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const first = yield* InstallExtensions.select(locatorAll(source.root));
        expect(settledNames(first)).toEqual([
          { type: "skill", names: ["review"] },
          { type: "rule", names: ["style"] },
        ]);

        writeLocalSkillPackage(source.root, { name: "audit" });
        recording.reset();
        const second = yield* InstallExtensions.select(locatorAll(source.root));
        expect(settledNames(second)).toEqual([
          { type: "skill", names: ["audit", "review"] },
          { type: "rule", names: ["style"] },
        ]);
        expect(recording.calls({ method: "readDirectory", path: source.root }).length).toBe(1);
      }),
    );
  });
});

/**
 * Serve a Git repository holding the skills `alpha` (carrying an asset discovery
 * never reads) and `beta` and the rule `gamma`, retain `alpha` from it, and run
 * `use` with the served URL and the retained `alpha` tree, over a recording
 * host filesystem.
 */
const withRetainedGitSkill = <A, E, R>(
  use: (served: { readonly url: string; readonly retained: string }) => Effect.Effect<A, E, R>,
) => {
  const world = makeInstallWorld();
  return Effect.gen(function* () {
    const source = nodePath.join(world.workspace.root, "vendor-source");
    fs.mkdirSync(source);
    const alpha = writeLocalSkillPackage(source, { name: "alpha" });
    fs.mkdirSync(nodePath.join(alpha, "assets"));
    fs.writeFileSync(nodePath.join(alpha, "assets", "notes.txt"), "notes\n");
    writeLocalSkillPackage(source, { name: "beta" });
    writeLocalRulePackage(source, { name: "gamma" });
    const git = (args: ReadonlyArray<string>) =>
      execFileSync(
        "git",
        ["-c", "user.name=AXM Test", "-c", "user.email=test@example.invalid", ...args],
        { cwd: source, stdio: "ignore" },
      );
    git(["init", "--quiet", "--initial-branch=main"]);
    git(["add", "."]);
    git(["commit", "--quiet", "-m", "main"]);
    const served = yield* Effect.acquireRelease(
      Effect.promise(() =>
        serveBareRepository({ root: world.workspace.root, source, name: "extensions" }),
      ),
      (repository) => Effect.sync(repository.stop),
    );
    return yield* world.workspace.provide(
      Effect.gen(function* () {
        yield* applyInstall(
          installRequest({
            type: "skill",
            subject: { kind: "source", source: served.url },
            names: ["alpha"],
            all: false,
          }),
        );
        const store = nodePath.join(world.workspace.root, "agent_extensions");
        const asset = fs
          .readdirSync(store, { recursive: true, encoding: "utf8" })
          .filter((relative) => relative.endsWith(nodePath.join("assets", "notes.txt")));
        expect(asset).toHaveLength(1);
        const retained = nodePath.dirname(nodePath.dirname(nodePath.join(store, asset[0] ?? "")));
        return yield* use({ url: served.url, retained });
      }),
    );
  }).pipe(
    Effect.scoped,
    Effect.provide(recordingHost),
    Effect.ensuring(Effect.sync(world.cleanup)),
  );
};

describe("locator probes of a Git source share one verification of a retained Git package", () => {
  it.effect("hashes a retained Git package once across the probe loop", () =>
    withRetainedGitSkill(({ url, retained }) =>
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const finds: Array<LocalFind> = [];
        recording.reset();
        const selection = yield* selectCounting(locatorAll(url), finds);

        // Each of the seven type probes hashed the retained tree before.
        expect({
          asset: recording.contentReads(nodePath.join(retained, "assets", "notes.txt")),
          manifest: recording.contentReads(nodePath.join(retained, "skill.json")),
          finds: finds.filter((find) => find.path === retained).map((find) => find.type),
        }).toEqual({ asset: 1, manifest: 2, finds: ["*"] });
        expect(settledNames(selection)).toEqual([
          { type: "skill", names: ["alpha", "beta"] },
          { type: "rule", names: ["gamma"] },
        ]);

        // The next selection verifies the retained tree afresh.
        recording.reset();
        yield* selectCounting(locatorAll(url), finds);
        expect(recording.contentReads(nodePath.join(retained, "assets", "notes.txt"))).toBe(1);
      }),
    ),
  );

  it.effect("hashes an edited retained Git package on every probe and reads Git instead", () =>
    withRetainedGitSkill(({ url, retained }) =>
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        fs.writeFileSync(nodePath.join(retained, "assets", "notes.txt"), "edited\n");
        const finds: Array<LocalFind> = [];
        recording.reset();
        const selection = yield* selectCounting(locatorAll(url), finds);

        expect({
          asset: recording.contentReads(nodePath.join(retained, "assets", "notes.txt")),
          finds: finds.filter((find) => find.path === retained).map((find) => find.type),
        }).toEqual({ asset: 7, finds: [] });
        expect(settledNames(selection)).toEqual([
          { type: "skill", names: ["alpha", "beta"] },
          { type: "rule", names: ["gamma"] },
        ]);
      }),
    ),
  );

  it.effect("hashes a retained Git package once across explicitly selected types", () =>
    withRetainedGitSkill(({ url, retained }) =>
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        const finds: Array<LocalFind> = [];
        recording.reset();
        const selection = yield* selectCounting(
          installRequest({
            subject: { kind: "source", source: url },
            selectors: { skill: ["beta"], rule: ["gamma"] },
            all: false,
          }),
          finds,
        );

        expect({
          asset: recording.contentReads(nodePath.join(retained, "assets", "notes.txt")),
          finds: finds.filter((find) => find.path === retained).map((find) => find.type),
        }).toEqual({ asset: 1, finds: ["skill", "rule"] });
        expect(settledNames(selection)).toEqual([
          { type: "skill", names: ["beta"] },
          { type: "rule", names: ["gamma"] },
        ]);
      }),
    ),
  );
});
