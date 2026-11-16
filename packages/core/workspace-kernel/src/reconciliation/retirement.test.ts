/**
 * Retirement planning observes each unreachable canonical tree once: rows
 * that bind one tree share its existence probe, its hash and its native
 * reference scan, while each row is still verified against its own accepted
 * integrity. The transition repeats every check under the lock.
 */
import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { RegistryTransportTest } from "@agentxm/registry-client/testing";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import {
  toExtensionTypePlural,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions/common";
import { NativeEntryRemovalLive } from "../locations/live.js";
import { workObservations } from "../locations/testing.js";
import { NativeWriteAuthorityPermissive } from "../agent-adapters/testing.js";
import { codingAgentRepositoryLayer } from "../projection/testing.js";
import { FootprintRecorderTest } from "../planning/testing.js";
import { WorkspaceFileWriteLocksLive } from "../settlement/live.js";
import { WorkspaceTransactionScopeTest } from "../settlement/testing.js";
import { StepFailure } from "../operations/index.js";
import {
  computeExtensionPathsForLayout,
  extensionPathSourceFromLockEntry,
  LockfileReader,
  WorkspaceLocation,
  withWorkspaceReadView,
  type LockEntry,
} from "../workspace-state/index.js";
import {
  ConfiguredAgentOutcomesProviderTest,
  storedLockfileFixture,
  treeIntegrityOfSync,
  TEST_TREE_INTEGRITY,
} from "../workspace-state/testing.js";
import { stringify as stringifyToml } from "smol-toml";
import { exactVersion, extensionName, handle, recipeWorkspace } from "./test-helpers.js";
import { collectUnreachableRetirementVerifying } from "./retirement.js";

let root: string;

beforeEach(() => {
  root = nodeFs.realpathSync(nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-retire-")));
  // Nothing desired reaches any accepted row.
  nodeFs.writeFileSync(
    nodePath.join(root, "axm.json"),
    `${JSON.stringify({ owner: "@acme", agents: [] })}\n`,
  );
  // A native connection configuration every reference scan reads; it names no package.
  nodeFs.writeFileSync(nodePath.join(root, ".mcp.json"), `${JSON.stringify({ mcpServers: {} })}\n`);
});

afterEach(() => {
  nodeFs.rmSync(root, { recursive: true, force: true });
});

const adapter = {
  toStepFailure: (failure: unknown) =>
    new StepFailure({ category: "internal", detail: String(failure) }),
};

const platform = Layer.mergeAll(WorkspaceFileWriteLocksLive, NativeEntryRemovalLive).pipe(
  Layer.provideMerge(layerRecordingFileSystem(NodeServices.layer)),
  Layer.provideMerge(NodeServices.layer),
);

const workspace = () =>
  Layer.provideMerge(
    recipeWorkspace(root),
    Layer.mergeAll(
      WorkspaceTransactionScopeTest({
        workspaceDir: nodePath.join(root, ".axm"),
        settingsPath: nodePath.join(root, "axm.json"),
        lockPath: nodePath.join(root, "axm.lock"),
      }),
      NativeWriteAuthorityPermissive,
      FootprintRecorderTest,
      RegistryTransportTest(FetchHttpClient.layer),
      codingAgentRepositoryLayer([]),
      ConfiguredAgentOutcomesProviderTest,
    ).pipe(Layer.provideMerge(platform)),
  );

const registryEntry = (name: string): LockEntry => ({
  source: { type: "registry", url: decodeRegistryEndpointSync("https://registry.agentxm.ai") },
  identity: { owner: handle("@acme"), name: extensionName(name) },
  resolved: {
    version: exactVersion("1.0.0"),
    integrity:
      "sha512-W6hmaNcCrEx5sOAbpgd9XOw+u68VBl+mKXJFoIxt5kihKN1+FVD/jdm1bqL40gSWuROKd0lEc0d45/aL2aNWqg==",
    publisherBindingId: "hbnd_test",
  },
  treeIntegrity: TEST_TREE_INTEGRITY,
});

const pathEntry = (name: string): LockEntry => ({
  source: { type: "path", path: "vendor/kit" },
  identity: { name: extensionName(name) },
  resolved: { tree: TEST_TREE_INTEGRITY },
  treeIntegrity: TEST_TREE_INTEGRITY,
});

/** One connection component of the package at `vendor/kit`. */
const componentEntry = (name: string): LockEntry => ({
  source: {
    type: "path",
    path: `vendor/kit/servers/${name}`,
    distribution: {
      format: "agent-plugins",
      packageRoot: ".",
      componentPath: `servers/${name}`,
    },
  },
  identity: { name: extensionName(name) },
  resolved: { tree: TEST_TREE_INTEGRITY },
  treeIntegrity: TEST_TREE_INTEGRITY,
});

interface AcceptedRow {
  readonly type: ExtensionType;
  readonly key: string;
  readonly entry: LockEntry;
}

const lockMapKey = {
  skill: "skills",
  subagent: "subagents",
  "mcp-server": "mcpServers",
  rule: "rules",
  hook: "hooks",
  knowledge: "knowledge",
  pack: "packs",
} as const;

/**
 * Write each row's canonical tree, then accept every row with the tree's
 * integrity. Returns the canonical roots, by row key.
 */
const acceptRows = (rows: ReadonlyArray<AcceptedRow>) =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const layout = yield* Ref.get(location.layout);
    const path = yield* Path.Path;
    const roots = new Map<string, string>();
    for (const row of rows) {
      const canonical = computeExtensionPathsForLayout(
        path.join,
        layout,
        extensionPathSourceFromLockEntry(row.entry),
        toExtensionTypePlural(row.type),
        row.entry.identity.name,
      ).canonicalPath;
      nodeFs.mkdirSync(canonical, { recursive: true });
      nodeFs.writeFileSync(nodePath.join(canonical, "server.json"), '{"name":"context"}\n');
      roots.set(row.key, canonical);
    }
    const entries: Record<string, Record<string, object>> = {};
    for (const row of rows) {
      const canonical = roots.get(row.key);
      if (canonical === undefined) throw new Error(`Expected a canonical root for ${row.key}`);
      const integrity = treeIntegrityOfSync(canonical);
      const accepted =
        row.entry.source.type === "path"
          ? { ...row.entry, resolved: { tree: integrity }, treeIntegrity: integrity }
          : { ...row.entry, treeIntegrity: integrity };
      const map = lockMapKey[row.type];
      entries[map] = { ...entries[map], [row.key]: accepted };
    }
    nodeFs.writeFileSync(
      nodePath.join(root, "axm.lock"),
      stringifyToml(storedLockfileFixture(entries)),
    );
    return roots;
  });

/** Plan the retirement of `rows`, counting its work from a reset recorder. */
const planCounting = (rows: ReadonlyArray<AcceptedRow>) =>
  Effect.gen(function* () {
    const roots = yield* acceptRows(rows);
    const recording = yield* FileSystemRecorder;
    const work = workObservations(false);
    recording.reset();
    // Planning runs in one document phase, as sync's does; the accepted
    // connection rows read in that phase are the rows it judged.
    const { planned, acceptedConnections } = yield* withWorkspaceReadView(
      Effect.gen(function* () {
        const planned = yield* collectUnreachableRetirementVerifying(adapter);
        const acceptedConnections = Object.values(
          yield* (yield* LockfileReader).entries("mcp-server"),
        );
        return { planned, acceptedConnections };
      }),
    ).pipe(work.provide);
    const nativeReads = recording.contentReads(nodePath.join(root, ".mcp.json"));
    const hashes = work.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree").length;
    const probes = (canonical: string) =>
      recording.calls({ path: canonical, method: "access" }).length;
    return { planned, acceptedConnections, roots, recording, hashes, nativeReads, probes };
  });

const mcpRow = (key: string, name: string): AcceptedRow => ({
  type: "mcp-server",
  key,
  entry: registryEntry(name),
});

/** Two connection components of one acquired package bind its one canonical tree. */
const componentRows: ReadonlyArray<AcceptedRow> = [
  { type: "mcp-server", key: "alpha", entry: componentEntry("alpha") },
  { type: "mcp-server", key: "beta", entry: componentEntry("beta") },
];

describe("unreachable retirement planning", () => {
  it.effect("observes a tree two unreachable connection rows bind once", () =>
    Effect.gen(function* () {
      const shared = yield* planCounting(componentRows);
      const canonical = shared.roots.get("alpha");
      if (canonical === undefined) throw new Error("Expected the shared canonical root");
      expect(shared.roots.get("beta")).toBe(canonical);
      expect({
        hashes: shared.hashes,
        probes: shared.probes(canonical),
        nativeReads: shared.nativeReads,
      }).toEqual({ hashes: 1, probes: 1, nativeReads: 1 });
      // Each row keeps its own verified digest, against its own accepted entry.
      expect(shared.acceptedConnections).toHaveLength(2);
      for (const entry of shared.acceptedConnections) {
        expect(shared.planned.verifiedTree("mcp-server", entry)).toEqual({
          root: canonical,
          accepted: entry,
          integrity: entry.treeIntegrity,
        });
      }
      const step = Option.getOrUndefined(shared.planned.step);
      expect(step?.artifact).toEqual({
        path: "axm.lock",
        scope: "project",
        change: "updated",
        references: [],
        targets: [{ path: nodePath.relative(root, canonical), change: "removed" }],
      });
    }).pipe(Effect.provide(workspace())),
  );

  it.effect("observes a single unreachable row's tree once", () =>
    Effect.gen(function* () {
      const single = yield* planCounting([mcpRow("context", "context")]);
      const canonical = single.roots.get("context");
      if (canonical === undefined) throw new Error("Expected the canonical root");
      expect({
        hashes: single.hashes,
        probes: single.probes(canonical),
        nativeReads: single.nativeReads,
      }).toEqual({ hashes: 1, probes: 1, nativeReads: 1 });
    }).pipe(Effect.provide(workspace())),
  );

  it.effect("does no tree or native work without unreachable rows", () =>
    Effect.gen(function* () {
      const none = yield* planCounting([]);
      expect(Option.isNone(none.planned.step)).toBe(true);
      expect({ hashes: none.hashes, nativeReads: none.nativeReads }).toEqual({
        hashes: 0,
        nativeReads: 0,
      });
    }).pipe(Effect.provide(workspace())),
  );

  it.effect("observes trees on different canonical paths separately", () =>
    Effect.gen(function* () {
      const separate = yield* planCounting([
        mcpRow("context", "context"),
        mcpRow("search", "search"),
      ]);
      expect({ hashes: separate.hashes, nativeReads: separate.nativeReads }).toEqual({
        hashes: 2,
        nativeReads: 2,
      });
    }).pipe(Effect.provide(workspace())),
  );

  it.effect("scans native references only for the first row of a type that needs them", () =>
    Effect.gen(function* () {
      const crossType = yield* planCounting([
        { type: "skill", key: "kit", entry: pathEntry("kit") },
        { type: "mcp-server", key: "kit", entry: pathEntry("kit") },
      ]);
      const canonical = crossType.roots.get("kit");
      if (canonical === undefined) throw new Error("Expected the shared canonical root");
      expect({
        hashes: crossType.hashes,
        probes: crossType.probes(canonical),
        nativeReads: crossType.nativeReads,
      }).toEqual({ hashes: 1, probes: 1, nativeReads: 1 });
    }).pipe(Effect.provide(workspace())),
  );

  it.effect("rechecks native references and the tree once per package under the lock", () =>
    Effect.gen(function* () {
      const shared = yield* planCounting(componentRows);
      const canonical = shared.roots.get("alpha");
      const step = Option.getOrUndefined(shared.planned.step);
      if (canonical === undefined || step === undefined || step.readiness !== "ready")
        throw new Error("Expected a ready retirement step");
      const work = workObservations(false);
      shared.recording.reset();
      const result = yield* step.run.pipe(work.provide);
      expect(result).toMatchObject({
        result: "success",
        message: "Retired 2 unreachable accepted extensions",
      });
      expect({
        hashes: work.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree").length,
        nativeReads: shared.recording.contentReads(nodePath.join(root, ".mcp.json")),
        present: nodeFs.existsSync(canonical),
      }).toEqual({ hashes: 1, nativeReads: 1, present: false });
    }).pipe(Effect.provide(workspace())),
  );
});
