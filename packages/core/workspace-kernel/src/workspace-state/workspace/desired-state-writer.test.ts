/**
 * One declaration decodes the caller's settings documents once each: the
 * intent read and the Registry source selection share the call's project and
 * user documents, while the settings owner keeps its own live read.
 */
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
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
          // The settings owner's own live reads and round-trip proof stay.
          roundTripParses: 4,
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
        // The phase already shares one document per scope across the call.
        expect(work).toEqual({
          settingsParses: 1,
          roundTripParses: 4,
          lockfileParses: 2,
          projectContentReads: 4,
          userAccess: 1,
          userContentReads: 0,
          lockContentReads: 4,
        });
      }),
    ),
  );

  it.effect("keeps the desired graph read before the settings an MCP declaration consults", () =>
    recorded(
      Effect.gen(function* () {
        const paths = yield* fixture({ project: '{\n  "agents": []\n}\n' });
        const services = yield* workspace(paths);
        const writer = Context.get(services, DesiredStateWriter);
        const lockEntry = makeRegistryMcpServerLockEntry({ owner: handle("@acme"), name: "docs" });
        const { work, parses } = yield* observe(
          paths,
          writer.declare("mcp-server", {
            name: "docs",
            resolutionKey: McpSourceKey.fromLockEntry(lockEntry),
            lockEntry,
            versionRange: Option.none(),
          }),
        );
        // The desired graph's own read, then one read per scope for the call.
        expect(work).toMatchObject({ settingsParses: 2, projectContentReads: 5, userAccess: 2 });
        // The graph decodes its settings and lockfile before the call's intent read.
        expect(parses.slice(0, 4)).toEqual([
          "axm.parse.settings",
          "axm.parse.lockfile",
          "axm.parse.lockfile-decode",
          "axm.parse.settings",
        ]);
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
