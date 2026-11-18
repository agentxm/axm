/**
 * A sync restores an enabled Registry Knowledge bundle whose canonical tree
 * drifted from its accepted integrity. The sync's own observation of that
 * tree has already hashed it and found it different, so the restore's reuse
 * decision for the same root and accepted row re-acquires without hashing
 * it again. A tree the observation could not hash is still judged by the
 * reuse decision, and a usable bundle takes no restore at all.
 */

import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import {
  desiredConstraintOf,
  WorkspaceReadTest,
  AcceptedResolutionWriterTest,
  MockWorkspaceTransactionScope,
  treeIntegrityOfSync,
  exactVersion,
  extensionName,
  handle,
} from "@agentxm/workspace-kernel/workspace-state/testing";
import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { WorkspaceFileWriteLocksLive } from "@agentxm/workspace-kernel/settlement/live";
import { NativePlatformTest, workObservations } from "@agentxm/workspace-kernel/locations/testing";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { RegistryTransportTest } from "@agentxm/registry-client/testing";
import { makeRecordingFileSystem, type FileSystemRecording } from "@agentxm/test-support";
import { AcquiredContent, sourceRefContentKey } from "@agentxm/workspace-kernel/acquisition";
import { KnowledgeManager } from "@agentxm/workspace-kernel/materialization";
import { SourceHostProviders, SourceNotResolvable } from "@agentxm/workspace-kernel/sources";
import {
  DesiredStateWriter,
  SettingsWriter,
  type DesiredExtensionNode,
} from "@agentxm/workspace-kernel/workspace-state";
import type { RegistryKnowledgeRef } from "@agentxm/extension-model/unstable/extensions/refs/knowledge";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import {
  CodingAgentRepositoryLive,
  NativeWriteAuthorityLive,
} from "@agentxm/workspace-kernel/projection/live";
import { KnowledgeManagerLive } from "./manager.js";
import { WorkspaceCatalogLive } from "@agentxm/workspace-kernel/sources/live";

const OWNER = "@acme";
const NAME = "handbook";
const ENDPOINT = decodeRegistryEndpointSync("https://registry.agentxm.ai");

const node: DesiredExtensionNode = {
  type: "knowledge",
  name: NAME,
  identity: {
    authority: "registry",
    fqn: `${OWNER}/knowledge/${NAME}`,
    registry: { sourceName: undefined, endpoint: ENDPOINT },
  },
  source: `${OWNER}/knowledge/${NAME}@^1.0.0`,
  enabled: true,
  constraint: desiredConstraintOf("^1.0.0"),
  origins: [
    {
      type: "settings",
      source: `${OWNER}/knowledge/${NAME}@^1.0.0`,
      enabled: true,
    },
  ],
};

/** The ref a restore rebuilds from the accepted row, as acquisition keys its bytes. */
const lockedRef: RegistryKnowledgeRef = {
  type: "knowledge",
  refType: "registry",
  owner: handle(OWNER),
  name: extensionName(NAME),
  source: { type: "registry", name: "agentxm", location: ENDPOINT, owner: Option.none() },
  version: exactVersion("1.0.0"),
  publisherBindingId: "hbnd_test",
  integrity: Option.some("sha512-stub"),
  packages: [],
  knowledge: { name: decodeExtensionNameSync(NAME) },
};

const writeBundle = (root: string) => {
  nodeFs.mkdirSync(nodePath.join(root, "src"), { recursive: true });
  nodeFs.writeFileSync(
    nodePath.join(root, "knowledge.json"),
    JSON.stringify({
      owner: OWNER,
      type: "knowledge",
      name: NAME,
      version: "1.0.0",
      format: { name: "okf", version: "0.2" },
      bundleRoot: "src",
    }),
  );
  nodeFs.writeFileSync(
    nodePath.join(root, "src", "index.md"),
    '---\nokf_version: "0.2"\n---\n# Knowledge\n',
  );
  nodeFs.writeFileSync(
    nodePath.join(root, "src", "concept.md"),
    "---\ntype: concept\n---\n# A useful concept\n",
  );
};

describe("Knowledge sync restoring a drifted Registry bundle", () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = nodeFs.mkdtempSync(
      nodePath.join(nodeFs.realpathSync(nodeOs.tmpdir()), "axm-knowledge-drift-"),
    );
  });

  afterEach(() => {
    nodeFs.rmSync(baseDir, { recursive: true, force: true });
  });

  const canonicalRoot = () =>
    nodePath.join(baseDir, "agent_extensions", "registry.agentxm.ai", OWNER, "knowledge", NAME);

  /**
   * Accept the canonical bundle as written, apply `drift`, and offer the
   * accepted bytes as this transition's acquired content when `fetched`.
   */
  const prepare = (options: {
    readonly drift?: (root: string) => void;
    readonly fetched: boolean;
  }) => {
    const root = canonicalRoot();
    writeBundle(root);
    const treeIntegrity = treeIntegrityOfSync(root);
    const fetchedDirectory = nodePath.join(baseDir, "fetched");
    writeBundle(fetchedDirectory);
    options.drift?.(root);
    const acquired = {
      requestedKeys: new Set<string>(),
      filesByKey: new Map(
        options.fetched ? [[sourceRefContentKey(lockedRef), { directory: fetchedDirectory }]] : [],
      ),
      failuresByKey: new Map(),
    };
    return { root, treeIntegrity, acquired };
  };

  const layerFor = (
    treeIntegrity: ReturnType<typeof treeIntegrityOfSync>,
    wrap: (native: FileSystem.FileSystem) => FileSystem.FileSystem,
  ) => {
    const axmDir = nodePath.join(baseDir, ".axm");
    const platform = Layer.provideMerge(
      Layer.effect(
        FileSystem.FileSystem,
        Effect.gen(function* () {
          return wrap(yield* FileSystem.FileSystem);
        }),
      ),
      NativePlatformTest,
    );
    return KnowledgeManagerLive.pipe(
      Layer.provideMerge(WorkspaceCatalogLive),
      Layer.provideMerge(CodingAgentRepositoryLive),
      Layer.provideMerge(NativeWriteAuthorityLive),
      Layer.provideMerge(
        Layer.mergeAll(
          AcceptedResolutionWriterTest(),
          WorkspaceReadTest({
            baseDir,
            runtimeDir: axmDir,
            settings: {
              knowledge: { [NAME]: { source: node.source ?? "", enabled: true } },
              instructionFiles: {},
            },
            lockfile: {
              lockfileVersion: 1,
              skills: {},
              knowledge: {
                [NAME]: {
                  source: { type: "registry", url: ENDPOINT },
                  identity: { owner: handle(OWNER), name: extensionName(NAME) },
                  resolved: {
                    version: exactVersion("1.0.0"),
                    integrity: "sha512-stub",
                    publisherBindingId: "hbnd_test",
                  },
                  treeIntegrity,
                },
              },
            },
            graph: { packMembership: [], nodes: [node], mcpSourceClosures: [], problems: [] },
          }),
          Layer.mock(SettingsWriter, {}),
          Layer.mock(DesiredStateWriter, {}),
        ),
      ),
      Layer.provideMerge(MockWorkspaceTransactionScope(axmDir)),
      Layer.provide(
        Layer.succeed(SourceHostProviders, {
          resolveNamedRegistry: () => Effect.die("not used"),
          find: () => Effect.succeed([]),
          fetch: () =>
            Effect.fail(new SourceNotResolvable({ category: "validation", detail: "not used" })),
          acquireForTransition: () =>
            Effect.fail(new SourceNotResolvable({ category: "validation", detail: "not used" })),
          cloneUrl: () => Option.none(),
          origin: () => "test",
        }),
      ),
      Layer.provideMerge(WorkspaceFileWriteLocksLive),
      Layer.provideMerge(
        Layer.provideMerge(RegistryTransportTest(FetchHttpClient.layer), platform),
      ),
    );
  };

  /** Sync once through a recording filesystem, counting its work after layer construction. */
  const sync = (
    prepared: ReturnType<typeof prepare>,
    dryRun: boolean,
    wrap: (recorded: FileSystem.FileSystem) => FileSystem.FileSystem = (fs) => fs,
  ) =>
    Effect.gen(function* () {
      let recording: FileSystemRecording | undefined;
      const work = workObservations(false);
      const outcome = yield* Effect.gen(function* () {
        const manager = yield* KnowledgeManager;
        recording?.reset();
        return yield* manager
          .sync({ dryRun })
          .pipe(work.provide, Effect.provideService(AcquiredContent, prepared.acquired));
      }).pipe(
        Effect.result,
        Effect.provide(
          layerFor(prepared.treeIntegrity, (native) => {
            const recorded = makeRecordingFileSystem(native);
            recording = recorded.recording;
            return wrap(recorded.fileSystem);
          }),
        ),
      );
      const treeHashes = work.facts.filter(
        (fact) => fact.kind === "axm.hash.materialized-tree",
      ).length;
      return { outcome, recording, treeHashes };
    });

  const editConcept = (root: string) =>
    nodeFs.writeFileSync(
      nodePath.join(root, "src", "concept.md"),
      "---\ntype: concept\n---\n# An edited concept\n",
    );

  for (const dryRun of [true, false])
    it.effect(
      `hashes a drifted canonical tree once before restoring it in a sync ${dryRun ? "preview" : "apply"}`,
      () =>
        Effect.gen(function* () {
          const prepared = prepare({ drift: editConcept, fetched: true });
          const { outcome, recording, treeHashes } = yield* sync(prepared, dryRun);
          expect(outcome).toMatchObject({ _tag: "Success", success: { warnings: [] } });
          // A preview hashes the canonical tree in its observation and the
          // staged tree once; an apply also publishes, records and observes
          // the restored tree again.
          expect(recording?.contentReads(nodePath.join(prepared.root, "src", "concept.md"))).toBe(
            dryRun ? 1 : 7,
          );
          expect(treeHashes).toBe(dryRun ? 2 : 6);
          if (!dryRun)
            expect(
              nodeFs.readFileSync(nodePath.join(prepared.root, "src", "concept.md"), "utf8"),
            ).toBe("---\ntype: concept\n---\n# A useful concept\n");
        }),
    );

  it.effect("still lets the reuse decision keep a tree the observation could not hash", () =>
    Effect.gen(function* () {
      const prepared = prepare({ fetched: false });
      const concept = nodePath.join(prepared.root, "src", "concept.md");
      let failed = false;
      const { outcome, treeHashes } = yield* sync(prepared, true, (fs) => ({
        ...fs,
        readFile: (file) => {
          if (file !== concept || failed) return fs.readFile(file);
          failed = true;
          return fs.readFile(nodePath.join(prepared.root, "src", "absent.md"));
        },
      }));
      expect(failed).toBe(true);
      expect(outcome).toMatchObject({ _tag: "Success", success: { warnings: [] } });
      expect(treeHashes).toBe(2);
    }),
  );

  it.effect("takes no restore hash for a usable bundle", () =>
    Effect.gen(function* () {
      const prepared = prepare({ fetched: false });
      const { outcome, recording, treeHashes } = yield* sync(prepared, true);
      expect(outcome).toMatchObject({ _tag: "Success", success: { warnings: [] } });
      expect(treeHashes).toBe(1);
      expect(recording?.contentReads(nodePath.join(prepared.root, "src", "concept.md"))).toBe(2);
    }),
  );
});
