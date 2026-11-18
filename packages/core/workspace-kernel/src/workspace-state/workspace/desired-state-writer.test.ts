/**
 * One declaration decodes the caller's settings documents once each: the
 * intent read and the Registry source selection share the call's project and
 * user documents, while the settings owner keeps its own live read.
 */
import {
  FileSystemRecorder,
  layerRecordingFileSystem,
  type FileSystemRecording,
} from "@agentxm/test-support";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type * as Scope from "effect/Scope";

import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import type { NativeEntryRemoval } from "../../locations/index.js";
import { NativeEntryRemovalLive } from "../../locations/live.js";
import { workObservations } from "../../locations/testing.js";
import type { WorkspaceFileWriteLocks } from "../../settlement/index.js";
import { WorkspaceFileWriteLocksLive } from "../../settlement/live.js";
import { LOCKFILE_VERSION, type RuleLockEntry } from "../desired/lockfile/schema.js";
import { emitLockfileToml } from "../desired/lockfile/toml.js";
import { exactVersion, extensionName, handle, storedLockfileFixture } from "../testing.js";
import { WorkspaceLayerTest } from "../testing.js";
import { DesiredStateWriter, type DesiredStateWriterService } from "./desired-state-writer.js";
import { DesiredStateReader } from "./desired-state-reader.js";
import { withWorkspaceReadView } from "./read-view.js";
import { McpSourceKey } from "./mcp-source-identity.js";
import { TEST_TREE_INTEGRITY, makeRegistryMcpServerLockEntry } from "./test-stubs.js";

const corp = { name: "corp", type: "registry", location: "https://registry.corp.test/" };

const ruleEntry = (name = "style", url = "https://registry.agentxm.ai") =>
  ({
    source: { type: "registry", url: decodeRegistryEndpointSync(url) },
    identity: { owner: handle("@acme"), name: extensionName(name) },
    resolved: {
      version: exactVersion("1.0.0"),
      integrity: `sha512-${"A".repeat(86)}==`,
      publisherBindingId: `hbnd_${name}`,
    },
    treeIntegrity: TEST_TREE_INTEGRITY,
  }) satisfies RuleLockEntry;

const declareRule = (writer: DesiredStateWriterService, name = "style", url?: string) =>
  writer.declare("rule", {
    name,
    lockEntry: ruleEntry(name, url),
    versionRange: Option.none(),
  });

const declareMcp = (writer: DesiredStateWriterService, name = "docs") => {
  const lockEntry = makeRegistryMcpServerLockEntry({ owner: handle("@acme"), name: "docs" });
  return writer.declare("mcp-server", {
    name,
    resolutionKey: McpSourceKey.fromLockEntry(lockEntry),
    lockEntry,
    versionRange: Option.none(),
  });
};

const fixture = (documents: { readonly project: string; readonly user?: unknown }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const temp = yield* fs.realPath(yield* fs.makeTempDirectoryScoped({ prefix: "axm-declare-" }));
    const root = path.join(temp, "project");
    const home = path.join(temp, "home");
    const userSettings = path.join(home, ".axm", "workspace", "axm.json");
    yield* fs.makeDirectory(root, { recursive: true });
    yield* fs.makeDirectory(path.dirname(userSettings), { recursive: true });
    const settings = path.join(root, "axm.json");
    const lock = path.join(root, "axm.lock");
    yield* fs.writeFileString(settings, documents.project);
    yield* fs.writeFileString(
      lock,
      emitLockfileToml(storedLockfileFixture({ lockfileVersion: LOCKFILE_VERSION, skills: {} })),
    );
    if (documents.user !== undefined)
      yield* fs.writeFileString(userSettings, JSON.stringify(documents.user));
    return { root, home, settings, lock, userSettings };
  });

/** The project workspace's services built over the recording filesystem. */
const workspace = (paths: { readonly root: string; readonly home: string }) =>
  Layer.build(
    WorkspaceLayerTest({ scope: "project", projectRoot: decodeAbsolutePathSync(paths.root) }),
  ).pipe(
    Effect.provide(
      ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: paths.home } })),
    ),
  );

const recorded = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    | FileSystem.FileSystem
    | Path.Path
    | FileSystemRecorder
    | Scope.Scope
    | WorkspaceFileWriteLocks
    | NativeEntryRemoval
  >,
) =>
  effect.pipe(
    Effect.scoped,
    Effect.provide(
      Layer.mergeAll(WorkspaceFileWriteLocksLive, NativeEntryRemovalLive).pipe(
        Layer.provideMerge(layerRecordingFileSystem(NodeServices.layer)),
        Layer.provideMerge(NodeServices.layer),
      ),
    ),
  );

/** Observe one declaration's settings and lockfile work, with its parses in order. */
const observe = <E>(
  paths: { readonly settings: string; readonly lock: string; readonly userSettings: string },
  declaration: Effect.Effect<void, E>,
) =>
  Effect.gen(function* () {
    const recording = yield* FileSystemRecorder;
    const observations = workObservations(false);
    recording.reset();
    yield* declaration.pipe(observations.provide);
    const kinds = (kind: string) => observations.facts.filter((fact) => fact.kind === kind).length;
    return {
      work: {
        settingsParses: kinds("axm.parse.settings"),
        roundTripParses: kinds("axm.parse.settings-round-trip"),
        lockfileParses: kinds("axm.parse.lockfile"),
        projectContentReads: recording.contentReads(paths.settings),
        userAccess: recording.counts(paths.userSettings).access ?? 0,
        userContentReads: recording.contentReads(paths.userSettings),
        lockContentReads: recording.contentReads(paths.lock),
      },
      parses: observations.facts
        .map((fact) => fact.kind)
        .filter((kind) => kind.startsWith("axm.parse.")),
    };
  });

/** Measure one declaration's settings and lockfile work. */
const measure = <E>(
  paths: { readonly settings: string; readonly lock: string; readonly userSettings: string },
  declaration: Effect.Effect<void, E>,
) => observe(paths, declaration).pipe(Effect.map(({ work }) => work));

describe("DesiredStateWriter.declare settings reads", () => {
  it.effect("decodes the project and absent user settings once outside a read phase", () =>
    recorded(
      Effect.gen(function* () {
        const paths = yield* fixture({ project: '{\n  "agents": []\n}\n' });
        const services = yield* workspace(paths);
        const writer = Context.get(services, DesiredStateWriter);
        const work = yield* measure(paths, declareRule(writer));
        expect(work).toEqual({
          // The caller's intent read; Registry selection shares the same document.
          settingsParses: 1,
          // The settings owner's round-trip proof parses the prior and rendered
          // images once each; it no longer re-parses the writer's two strings.
          roundTripParses: 2,
          lockfileParses: 2,
          // One caller read; the settings owner's own reads stay.
          projectContentReads: 4,
          userAccess: 1,
          userContentReads: 0,
          lockContentReads: 4,
        });
      }),
    ),
  );

  it.effect("keeps the read phase's documents and work inside an active read phase", () =>
    recorded(
      Effect.gen(function* () {
        const paths = yield* fixture({ project: '{\n  "agents": []\n}\n' });
        const services = yield* workspace(paths);
        const writer = Context.get(services, DesiredStateWriter);
        const work = yield* measure(
          paths,
          withWorkspaceReadView(declareRule(writer)).pipe(Effect.provideContext(services)),
        );
        // The phase already shares one document per scope across the call, and
        // the round-trip proof parses the prior and rendered images once each.
        expect(work).toEqual({
          settingsParses: 1,
          roundTripParses: 2,
          lockfileParses: 2,
          projectContentReads: 4,
          userAccess: 1,
          userContentReads: 0,
          lockContentReads: 4,
        });
      }),
    ),
  );

  it.effect("shares one decode per scope between an MCP declaration's graph and its settings", () =>
    recorded(
      Effect.gen(function* () {
        const paths = yield* fixture({ project: '{\n  "agents": []\n}\n' });
        const services = yield* workspace(paths);
        const writer = Context.get(services, DesiredStateWriter);
        const { work, parses } = yield* observe(paths, declareMcp(writer));
        // The call's own read of each scope also feeds the desired graph,
        // which keeps its own lockfile read.
        expect(work).toEqual({
          settingsParses: 1,
          roundTripParses: 2,
          lockfileParses: 3,
          projectContentReads: 4,
          userAccess: 1,
          userContentReads: 0,
          lockContentReads: 5,
        });
        // The intent read still precedes the graph's lockfile decode.
        expect(parses.slice(0, 4)).toEqual([
          "axm.parse.settings",
          "axm.parse.lockfile",
          "axm.parse.lockfile-decode",
          "axm.parse.settings-round-trip",
        ]);
      }),
    ),
  );

  it.effect("keeps the read phase's work for an MCP declaration inside an active read phase", () =>
    recorded(
      Effect.gen(function* () {
        const paths = yield* fixture({ project: '{\n  "agents": []\n}\n' });
        const services = yield* workspace(paths);
        const writer = Context.get(services, DesiredStateWriter);
        const work = yield* measure(
          paths,
          withWorkspaceReadView(declareMcp(writer)).pipe(Effect.provideContext(services)),
        );
        expect(work).toEqual({
          settingsParses: 1,
          roundTripParses: 2,
          lockfileParses: 3,
          projectContentReads: 4,
          userAccess: 1,
          userContentReads: 0,
          lockContentReads: 5,
        });
      }),
    ),
  );
});

describe("DesiredStateWriter.declare settings inputs", () => {
  it.effect("preserves a foreign edit made between two declarations", () =>
    recorded(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const paths = yield* fixture({ project: '{\n  "agents": []\n}\n' });
        const writer = Context.get(yield* workspace(paths), DesiredStateWriter);
        yield* declareRule(writer, "style");
        const declared: unknown = JSON.parse(yield* fs.readFileString(paths.settings));
        const foreign = `${JSON.stringify(
          { ...Object(declared), agents: ["claude-code"] },
          undefined,
          "\t",
        )}\n`;
        yield* fs.writeFileString(paths.settings, foreign);
        yield* declareRule(writer, "lint");
        expect(yield* fs.readFileString(paths.settings)).toBe(
          [
            "{",
            '\t"agents": [',
            '\t\t"claude-code"',
            "\t],",
            '\t"rules": {',
            '    "style": "agentxm:@acme/rules/style",',
            '    "lint": "agentxm:@acme/rules/lint"',
            "\t}",
            "}",
            "",
          ].join("\n"),
        );
      }),
    ),
  );

  it.effect("selects the user default Registry for an unconfigured Registry endpoint", () =>
    recorded(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const paths = yield* fixture({
          project: '{\n  "agents": []\n}\n',
          user: { defaultRegistry: "corp", sources: [corp] },
        });
        const writer = Context.get(yield* workspace(paths), DesiredStateWriter);
        const work = yield* measure(
          paths,
          declareRule(writer, "style", "https://registry.unlisted.test"),
        );
        expect(JSON.parse(yield* fs.readFileString(paths.settings))).toEqual({
          agents: [],
          rules: { style: "corp:@acme/rules/style" },
        });
        expect(work).toMatchObject({ settingsParses: 2, userContentReads: 1 });
      }),
    ),
  );

  for (const corrupt of ["project", "user"] as const)
    it.effect(`fails an MCP declaration over corrupt ${corrupt} settings without writing`, () =>
      recorded(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const recording = yield* FileSystemRecorder;
          const paths = yield* fixture({ project: '{\n  "agents": []\n}\n', user: {} });
          const services = yield* workspace(paths);
          const writer = Context.get(services, DesiredStateWriter);
          const target = corrupt === "project" ? paths.settings : paths.userSettings;
          yield* fs.writeFileString(target, "{");
          recording.reset();
          const failure = yield* declareMcp(writer).pipe(Effect.flip);
          expect(recording.contentReads(target)).toBe(1);
          expect(recording.contentReads(paths.lock)).toBe(0);
          expect(recording.writes(paths.settings)).toBe(0);
          expect(recording.writes(paths.lock)).toBe(0);
          expect(yield* fs.readFileString(target)).toBe("{");
          // Exactly the failure the desired graph's own decode of that scope reports.
          expect(failure).toMatchObject({ _tag: "SettingsParseError", path: target });
          expect(failure).toEqual(
            yield* Effect.flip(Context.get(services, DesiredStateReader).graph()),
          );
        }),
      ),
    );

  it.effect("fails corrupt project settings at the caller's read without writing", () =>
    recorded(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const recording = yield* FileSystemRecorder;
        const paths = yield* fixture({ project: '{\n  "agents": []\n}\n' });
        const writer = Context.get(yield* workspace(paths), DesiredStateWriter);
        yield* fs.writeFileString(paths.settings, "{");
        recording.reset();
        const failure = yield* declareRule(writer).pipe(Effect.flip);
        expect(failure).toMatchObject({ _tag: "SettingsParseError", path: paths.settings });
        expect(recording.contentReads(paths.settings)).toBe(1);
        expect(recording.writes(paths.settings)).toBe(0);
        expect(recording.calls({ path: paths.userSettings })).toEqual([]);
        expect(yield* fs.readFileString(paths.settings)).toBe("{");
      }),
    ),
  );
});

/**
 * One MCP undeclaration outside a read phase decodes the selected settings
 * once for both the desired graph and its removal decision; the lockfile is
 * read again after the settings write, and the settings owner keeps its own
 * live read when it publishes.
 */
describe("DesiredStateWriter.undeclare MCP settings reads", () => {
  /** Writes and renames that publish a document at this path. */
  const publications = (recording: FileSystemRecording, path: string) =>
    recording
      .calls({ path })
      .filter((call) => call.method === "writeFile" || call.method === "rename").length;
  const project = `${JSON.stringify({ agents: [], sources: [corp] }, undefined, 2)}\n`;
  const corpDocs = makeRegistryMcpServerLockEntry({
    owner: handle("@acme"),
    name: "docs",
    endpoint: decodeRegistryEndpointSync(corp.location),
  });
  const declareCorpDocs = (writer: DesiredStateWriterService, name: string) =>
    writer.declare("mcp-server", {
      name,
      resolutionKey: McpSourceKey.fromLockEntry(corpDocs),
      lockEntry: corpDocs,
      versionRange: Option.none(),
    });

  /** A project that declares the Registry-sourced connection "docs" and accepts its row. */
  const declared = (options: { readonly user?: unknown; readonly alsoAs?: string } = {}) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const paths = yield* fixture({
        project,
        ...(options.user === undefined ? {} : { user: options.user }),
      });
      const empty = yield* fs.readFileString(paths.lock);
      const services = yield* workspace(paths);
      const writer = Context.get(services, DesiredStateWriter);
      yield* declareCorpDocs(writer, "docs");
      if (options.alsoAs !== undefined) yield* declareCorpDocs(writer, options.alsoAs);
      return { paths, services, writer, empty, accepted: yield* fs.readFileString(paths.lock) };
    });

  it.effect("decodes the selected settings once for the graph and the removal", () =>
    recorded(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const recording = yield* FileSystemRecorder;
        const { paths, writer, empty } = yield* declared();
        const { work, parses } = yield* observe(paths, writer.undeclare("mcp-server", "docs"));
        expect(work).toEqual({
          settingsParses: 1,
          roundTripParses: 3,
          lockfileParses: 3,
          projectContentReads: 4,
          userAccess: 1,
          userContentReads: 0,
          lockContentReads: 5,
        });
        // The graph's lockfile decode follows the one settings decode, and no
        // second settings decode precedes the write.
        expect(parses.slice(0, 4)).toEqual([
          "axm.parse.settings",
          "axm.parse.lockfile",
          "axm.parse.lockfile-decode",
          "axm.parse.settings-round-trip",
        ]);
        expect(publications(recording, paths.settings)).toBe(1);
        expect(JSON.parse(yield* fs.readFileString(paths.settings))).toMatchObject({
          mcpServers: {},
        });
        // This connection was the accepted row's last user.
        expect(yield* fs.readFileString(paths.lock)).toBe(empty);
      }),
    ),
  );

  it.effect("decodes the selected settings once and writes nothing for an absent entry", () =>
    recorded(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const recording = yield* FileSystemRecorder;
        const paths = yield* fixture({ project });
        const writer = Context.get(yield* workspace(paths), DesiredStateWriter);
        const before = yield* fs.readFileString(paths.lock);
        const { work } = yield* observe(paths, writer.undeclare("mcp-server", "docs"));
        expect(work).toEqual({
          settingsParses: 1,
          roundTripParses: 0,
          lockfileParses: 2,
          projectContentReads: 1,
          userAccess: 1,
          userContentReads: 0,
          lockContentReads: 2,
        });
        expect(publications(recording, paths.settings)).toBe(0);
        expect(publications(recording, paths.lock)).toBe(0);
        expect(yield* fs.readFileString(paths.settings)).toBe(project);
        expect(yield* fs.readFileString(paths.lock)).toBe(before);
      }),
    ),
  );

  it.effect("keeps the read phase's settings work for an MCP undeclaration inside it", () =>
    recorded(
      Effect.gen(function* () {
        const { paths, services, writer } = yield* declared();
        const { work } = yield* observe(
          paths,
          withWorkspaceReadView(writer.undeclare("mcp-server", "docs")).pipe(
            Effect.provideContext(services),
          ),
        );
        expect(work).toMatchObject({ settingsParses: 1, projectContentReads: 4 });
      }),
    ),
  );

  it.effect("keeps an accepted row another local name still resolves to", () =>
    recorded(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { paths, writer, empty, accepted } = yield* declared({ alsoAs: "docs-mirror" });
        yield* writer.undeclare("mcp-server", "docs");
        expect(yield* fs.readFileString(paths.lock)).toBe(accepted);
        yield* writer.undeclare("mcp-server", "docs-mirror");
        expect(yield* fs.readFileString(paths.lock)).toBe(empty);
        expect(JSON.parse(yield* fs.readFileString(paths.settings))).toMatchObject({
          mcpServers: {},
        });
      }),
    ),
  );

  for (const corrupt of ["project", "user", "lockfile"] as const)
    it.effect(`fails an MCP undeclaration over a corrupt ${corrupt} document without writing`, () =>
      recorded(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const recording = yield* FileSystemRecorder;
          const { paths, services, writer } = yield* declared({ user: {} });
          const target =
            corrupt === "project"
              ? paths.settings
              : corrupt === "user"
                ? paths.userSettings
                : paths.lock;
          const settingsBefore = yield* fs.readFileString(paths.settings);
          const lockBefore = yield* fs.readFileString(paths.lock);
          yield* fs.writeFileString(target, corrupt === "lockfile" ? "[" : "{");
          const observations = workObservations(false);
          recording.reset();
          const failure = yield* writer
            .undeclare("mcp-server", "docs")
            .pipe(observations.provide, Effect.flip);
          // One selected-settings read, which an inherited-settings or lockfile
          // failure still follows.
          expect(recording.contentReads(paths.settings)).toBe(1);
          expect(
            observations.facts.filter((fact) => fact.kind === "axm.parse.settings").length,
          ).toBe(corrupt === "project" ? 1 : 2);
          expect(publications(recording, paths.settings)).toBe(0);
          expect(publications(recording, paths.lock)).toBe(0);
          if (corrupt !== "project")
            expect(yield* fs.readFileString(paths.settings)).toBe(settingsBefore);
          if (corrupt !== "lockfile") expect(yield* fs.readFileString(paths.lock)).toBe(lockBefore);
          // Exactly the failure the desired graph's own decode reports.
          expect(failure).toEqual(
            yield* Effect.flip(Context.get(services, DesiredStateReader).graph()),
          );
        }),
      ),
    );
});
