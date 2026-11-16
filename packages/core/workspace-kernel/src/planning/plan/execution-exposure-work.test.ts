/**
 * Work counts of one external execution review over real temporary packages.
 *
 * The Registry transport and the native configured-agent observer are
 * substituted at their service seams; tree hashing, manifest reads and the
 * accepted canonical layout use the real filesystem through a recording port.
 */
import { withDetailedWork } from "../../locations/testing.js";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Tracer from "effect/Tracer";
import {
  decodeExtensionNameSync,
  decodeHandleSync,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { toExtensionTypePlural } from "@agentxm/extension-model/unstable/extensions/common";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import {
  ConfiguredAgentOutcomesProvider,
  ConfiguredAgentOutcomesUnavailable,
  HooksLockMapSchema,
  SettingsSchema,
  UNCONSTRAINED_DESIRED_NODE,
  acceptedLockedCanonicalPath,
  computeMaterializedTreeIntegrity,
  type ConfiguredAgentOutcomesRequest,
  type ConfiguredExtensionObservation,
  desiredMcpSourceKey,
  type DesiredExtensionNode,
  type DesiredNodeIdentity,
  type DesiredStateGraph,
  type Lockfile,
  type TreeIntegrity,
} from "../../workspace-state/index.js";
import {
  TEST_TREE_INTEGRITY,
  WorkspaceReadTest,
  makeRegistryMcpServerLockEntry,
} from "../../workspace-state/testing.js";
import {
  CurrentOperationUnit,
  type ExecutionChange,
  type Plan,
  type PlannedJobStep,
} from "../../operations/index.js";
import { AcquiredContent, sourceRefContentKey } from "../../acquisition/index.js";
import { SourceNotResolvable } from "../../sources/index.js";
import { SourceHostProvidersTest } from "../../sources/testing.js";
import { executionExposureRisks } from "./execution-exposure.js";

type ReviewedType = "hook" | "mcp-server";

const integrity = `sha512-${"A".repeat(86)}==`;
// Permission bits do not stop a privileged reader, and Windows ignores them.
const privileged = process.platform === "win32" || process.getuid?.() === 0;
const endpoint = "https://registry.example.test";
/** The Registry package every reviewed name selects. */
const packageName = { hook: "audit", "mcp-server": "context" } as const;

const manifests = {
  hook: {
    owner: "@acme",
    type: "hook",
    name: "audit",
    version: "1.0.0",
    configuration: { token: { type: "string", secret: true } },
    implementations: [
      {
        id: "claude",
        protocol: "claude-code",
        bindings: [
          {
            id: "stop",
            event: "Stop",
            handler: { type: "command", runtime: "bash", entrypoint: "src/hook.sh" },
          },
        ],
      },
    ],
  },
  "mcp-server": {
    owner: "@acme",
    type: "mcp-server",
    name: "context",
    version: "1.0.0",
    server: {
      name: "ai.acme/context",
      description: "Context",
      version: "1.0.0",
      packages: [
        {
          registryType: "npm",
          identifier: "@acme/context",
          version: "1.0.0",
          transport: { type: "stdio" },
          environmentVariables: [{ name: "API_TOKEN", isRequired: true, isSecret: true }],
        },
      ],
    },
  },
} as const;

const manifestFile = { hook: "hook.json", "mcp-server": "mcp.json" } as const;

const writePackage = (type: ReviewedType, root: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.makeDirectory(`${root}/src`, { recursive: true });
    yield* fs.writeFileString(`${root}/${manifestFile[type]}`, JSON.stringify(manifests[type]));
    yield* fs.writeFileString(`${root}/src/hook.sh`, "echo audit\n");
  });

const distribution = {
  kind: "package",
  registryType: "npm",
  identifier: "@acme/context",
  transport: "stdio",
} as const;

const binding = (env: string) => [
  { target: { kind: "environment", name: "API_TOKEN" }, value: { env } },
];

const registryRef = (
  type: ReviewedType,
  name: string,
  overrides: { readonly lifecycleWarnings?: ReadonlyArray<string> } = {},
): ExtensionRef => {
  const common = {
    refType: "registry" as const,
    source: {
      type: "registry" as const,
      name: "agentxm",
      location: decodeRegistryEndpointSync(endpoint),
      owner: Option.none(),
    },
    owner: decodeHandleSync("@acme"),
    publisherBindingId: "hbnd_audit",
    name: decodeExtensionNameSync(packageName[type]),
    version: decodeVersionSync("1.0.0"),
    integrity: Option.some(integrity),
    packages: [],
    ...overrides,
  };
  return type === "hook"
    ? { ...common, type, hook: { name: decodeExtensionNameSync(name) } }
    : { ...common, type, server: { name: decodeExtensionNameSync(name) } };
};

const localRef = (name: string, root: string): ExtensionRef => ({
  type: "mcp-server",
  refType: "local",
  name: decodeExtensionNameSync("context"),
  owner: decodeHandleSync("@acme"),
  server: { name: decodeExtensionNameSync(name) },
  source: { type: "local", path: root },
  location: `file://${root}`,
});

/** The accepted source row every accepted MCP name of the Registry package reaches. */
const mcpIdentity: DesiredNodeIdentity = {
  authority: "registry",
  fqn: `@acme/${toExtensionTypePlural("mcp-server")}/${packageName["mcp-server"]}`,
  registry: { sourceName: "agentxm", endpoint: decodeRegistryEndpointSync(endpoint) },
};

/**
 * Accepted state for `accepted` names. A Hook row is keyed by its name; MCP
 * names share the one row keyed by the package's source.
 */
const lockfileFor = (
  type: ReviewedType,
  accepted: ReadonlyArray<string>,
  tree: TreeIntegrity,
): Lockfile =>
  type === "hook"
    ? {
        lockfileVersion: 1,
        skills: {},
        hooks: Schema.decodeUnknownSync(HooksLockMapSchema)(
          Object.fromEntries(
            accepted.map((name) => [
              name,
              {
                source: { type: "registry", url: endpoint },
                identity: { owner: "@acme", name: packageName.hook },
                resolved: { version: "1.0.0", integrity, publisherBindingId: "hbnd_audit" },
                treeIntegrity: tree,
              },
            ]),
          ),
        ),
      }
    : {
        lockfileVersion: 1,
        skills: {},
        mcpServers:
          accepted.length === 0
            ? {}
            : {
                [Option.getOrThrow(desiredMcpSourceKey(mcpIdentity))]: {
                  ...makeRegistryMcpServerLockEntry({
                    owner: decodeHandleSync("@acme"),
                    name: packageName["mcp-server"],
                    integrity,
                    endpoint: decodeRegistryEndpointSync(endpoint),
                    publisherBindingId: "hbnd_audit",
                  }),
                  treeIntegrity: tree,
                },
              },
      };

/** Every node is enabled; an MCP name reaches the accepted row only when it is accepted. */
const desiredGraph = (
  type: ReviewedType,
  names: ReadonlyArray<string>,
  accepted: ReadonlyArray<string>,
): DesiredStateGraph => ({
  nodes: names.map((name): DesiredExtensionNode => ({
    type,
    name,
    identity:
      type === "mcp-server" && accepted.includes(name)
        ? mcpIdentity
        : { authority: "path", locator: "unused" },
    source: "unused",
    enabled: true,
    constraint: UNCONSTRAINED_DESIRED_NODE,
    origins: [],
  })),
  mcpSourceClosures: [],
  problems: [],
  packMembership: [],
});

interface ReviewFixture {
  readonly type: ReviewedType;
  /** Local names each step lists, in order; each step targets `agents`. */
  readonly steps: ReadonlyArray<{
    readonly names: ReadonlyArray<string>;
    readonly agents?: ReadonlyArray<string>;
  }>;
  /** The accepted tree: "matching" records the canonical tree; "diverged" records another digest. */
  readonly accepted?: "matching" | "diverged";
  /** Names with accepted state; every listed name by default. */
  readonly acceptedNames?: ReadonlyArray<string>;
  /** The native observer reports every requested target current, or fails. */
  readonly observer?: "current" | "fails";
  readonly lifecycleWarnings?: ReadonlyArray<string>;
  readonly within?: "no unit" | "operation unit";
  readonly fetchFails?: boolean;
  /** Review a local package directory instead of the Registry package. */
  readonly local?: boolean;
  /** The transition holds an acquired on-disk tree, with other bytes, for the Registry package. */
  readonly acquired?: boolean;
  /** A file of the accepted canonical tree cannot be read, so hashing that tree fails. */
  readonly unreadableCanonical?: boolean;
}

/** Review one plan and report the work it performed after fixture setup. */
const review = (fixture: ReviewFixture) =>
  Effect.gen(function* () {
    const native = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* native.makeTempDirectoryScoped({ prefix: "axm-exposure-work-" });
    const fetched = path.join(directory, "fetched");
    yield* writePackage(fixture.type, fetched);
    const acquiredRoot = path.join(directory, "acquired");
    yield* writePackage(fixture.type, acquiredRoot);
    yield* native.writeFileString(`${acquiredRoot}/src/hook.sh`, "echo acquired\n");
    const acquiredTree = yield* computeMaterializedTreeIntegrity(acquiredRoot);
    const names = [...new Set(fixture.steps.flatMap((step) => step.names))];
    const accepted = fixture.accepted === undefined ? [] : (fixture.acceptedNames ?? names);
    // The accepted layout places the package by its accepted identity, whichever name reaches it.
    const probe = names[0] ?? "unused";
    const canonicalRoot = Option.getOrThrow(
      yield* acceptedLockedCanonicalPath({ type: fixture.type, name: probe }).pipe(
        Effect.provide(
          WorkspaceReadTest({
            baseDir: directory,
            lockfile: lockfileFor(fixture.type, [probe], TEST_TREE_INTEGRITY),
            graph: desiredGraph(fixture.type, [probe], [probe]),
          }),
        ),
      ),
    );
    yield* writePackage(fixture.type, canonicalRoot);
    const canonicalTree = yield* computeMaterializedTreeIntegrity(canonicalRoot);
    if (fixture.unreadableCanonical === true) {
      const unreadable = `${canonicalRoot}/src/hook.sh`;
      yield* Effect.acquireRelease(native.chmod(unreadable, 0o000), () =>
        native.chmod(unreadable, 0o644).pipe(Effect.ignore),
      );
    }
    const lockfile = lockfileFor(
      fixture.type,
      accepted,
      fixture.accepted === "matching" ? canonicalTree : TEST_TREE_INTEGRITY,
    );
    const settings = Schema.decodeUnknownSync(SettingsSchema)({
      agents: ["claude-code"],
      ...(fixture.type === "hook"
        ? {
            hooks: Object.fromEntries(
              names.map((name) => [
                name,
                { source: "@acme/hooks/audit", configuration: { token: { env: "OLD_TOKEN" } } },
              ]),
            ),
          }
        : {
            mcpServers: Object.fromEntries(
              names.map((name) => [
                name,
                { source: "@acme/mcps/context", distribution, bindings: binding("OLD_TOKEN") },
              ]),
            ),
          }),
    });
    const step = (entry: ReviewFixture["steps"][number]): PlannedJobStep => ({
      readiness: "ready",
      label: entry.names.join(","),
      exposureRefs: entry.names.map((name) =>
        fixture.local === true
          ? localRef(name, fetched)
          : registryRef(
              fixture.type,
              name,
              fixture.lifecycleWarnings === undefined
                ? {}
                : { lifecycleWarnings: fixture.lifecycleWarnings },
            ),
      ),
      executionPreferences: entry.names.map((name) =>
        fixture.type === "hook"
          ? { type: "hook", name, configuration: { token: { env: "NEW_TOKEN" } } }
          : { type: "mcp-server", name, distribution, bindings: binding("NEW_TOKEN") },
      ),
      artifact: {
        path: path.join(directory, ".claude/settings.json"),
        change: "updated",
        scope: "project",
        agents: entry.agents ?? ["claude-code"],
      },
      run: Effect.succeed({ result: "success", message: "unused" }),
    });
    const plan: Plan = {
      _tag: "Plan",
      name: "Expose",
      description: Option.none(),
      jobs: [{ concurrency: 1, steps: fixture.steps.map(step) }],
    };
    const spans: Tracer.NativeSpan[] = [];
    const tracer = Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options);
        spans.push(span);
        return span;
      },
    });
    const warnings: string[] = [];
    const logger = Logger.make((entry) => {
      if (entry.logLevel === "Warn") warnings.push(String(entry.message));
    });
    const fetches: ExtensionRef[] = [];
    // Native observations, fetches and the release of each fetched tree, in order.
    const lifecycle: string[] = [];
    const observations: Array<{ readonly name: string; readonly agentIds: string }> = [];
    const observer = (request: ConfiguredAgentOutcomesRequest) =>
      Effect.gen(function* () {
        observations.push(
          ...request.rows.map((row) => ({ name: row.name, agentIds: request.agentIds.join(",") })),
        );
        lifecycle.push(...request.rows.map((row) => `observe ${row.name}`));
        if (fixture.observer === "fails")
          return yield* new ConfiguredAgentOutcomesUnavailable({
            category: "internal",
            detail: "Native observation is unavailable.",
          });
        return new Map(
          request.rows.map(
            (row) =>
              [
                row.name,
                {
                  nativeLocations: [],
                  agentOutcomes: request.agentIds.map((agentId) => ({
                    extensionType: request.type,
                    name: row.name,
                    agentId,
                    outcome: "current" as const,
                    reasonCode: "verified-native-unit" as const,
                    reason: "Current.",
                  })),
                } satisfies ConfiguredExtensionObservation,
              ] as const,
          ),
        );
      });
    const { fileSystem, recording } = makeRecordingFileSystem(native);
    const reviewed = executionExposureRisks(plan).pipe(
      withDetailedWork(tracer),
      Effect.provide(
        Layer.mergeAll(
          WorkspaceReadTest({
            baseDir: directory,
            lockfile,
            settings,
            graph: desiredGraph(fixture.type, names, accepted),
          }),
          SourceHostProvidersTest({
            fetch: (ref) =>
              Effect.gen(function* () {
                fetches.push(ref);
                lifecycle.push("fetch");
                yield* Effect.addFinalizer(() => Effect.sync(() => lifecycle.push("released")));
                if (ref.refType === "registry")
                  yield* Effect.forEach(ref.lifecycleWarnings ?? [], (warning) =>
                    Effect.logWarning(warning),
                  );
                if (fixture.fetchFails === true)
                  return yield* new SourceNotResolvable({
                    category: "not_found",
                    detail: "The package is unavailable.",
                  });
                return { directory: fetched };
              }),
          }),
          Logger.layer([logger]),
          fixture.acquired === true
            ? Layer.succeed(AcquiredContent, {
                requestedKeys: new Set([sourceRefContentKey(registryRef(fixture.type, probe))]),
                filesByKey: new Map([
                  [
                    sourceRefContentKey(registryRef(fixture.type, probe)),
                    { directory: acquiredRoot },
                  ],
                ]),
                failuresByKey: new Map(),
              })
            : Layer.empty,
          fixture.observer === undefined
            ? Layer.empty
            : Layer.succeed(ConfiguredAgentOutcomesProvider, {
                byExtensionType: { [fixture.type]: observer },
              }),
        ),
      ),
      Effect.provideService(FileSystem.FileSystem, fileSystem),
    );
    recording.reset();
    const risks = yield* (
      fixture.within === "operation unit"
        ? reviewed.pipe(Effect.provideService(CurrentOperationUnit, { unitId: "unit" }))
        : reviewed
    ).pipe(Effect.result);
    const named = (name: string) => spans.filter((span) => span.name === name).length;
    // A tree hash lists its root once and reads every file, its manifest included.
    const hashesOf = (root: string) => recording.counts(root).readDirectory ?? 0;
    const manifestReadsOf = (root: string) =>
      recording.contentReads(path.join(root, manifestFile[fixture.type])) - hashesOf(root);
    return {
      risks,
      changes: risks._tag === "Success" ? (risks.success[0]?.executionChanges ?? []) : [],
      fetches: fetches.length,
      warnings,
      observations,
      lifecycle,
      treeHashes: named("axm.hash.materialized-tree"),
      configurationHashes: named("axm.hash.execution-configuration"),
      canonicalHashes: hashesOf(canonicalRoot),
      fetchedHashes: hashesOf(fetched),
      canonicalManifestReads: manifestReadsOf(canonicalRoot),
      fetchedManifestReads: manifestReadsOf(fetched),
      acquiredHashes: hashesOf(acquiredRoot),
      canonicalTree,
      acquiredTree,
    };
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

const knownInputs = (change: ExecutionChange | undefined) => change?.secretReferenceChanges;

/** Work and results that do not depend on whether repeated reads are shared. */
const reviewed = (result: Effect.Success<ReturnType<typeof review>>) => ({
  fetches: result.fetches,
  treeHashes: result.treeHashes,
  canonicalHashes: result.canonicalHashes,
  fetchedHashes: result.fetchedHashes,
  canonicalManifestReads: result.canonicalManifestReads,
  fetchedManifestReads: result.fetchedManifestReads,
  configurationHashes: result.configurationHashes,
});

describe("Reviewing an accepted canonical Registry tree", () => {
  it.effect("a reused canonical tree is hashed once as both integrity and reviewed content", () =>
    Effect.gen(function* () {
      const result = yield* review({
        type: "hook",
        steps: [{ names: ["audit"] }],
        accepted: "matching",
      });
      expect(reviewed(result)).toEqual({
        fetches: 0,
        treeHashes: 1,
        canonicalHashes: 1,
        fetchedHashes: 0,
        canonicalManifestReads: 1,
        fetchedManifestReads: 0,
        configurationHashes: 1,
      });
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]?.contentIdentity).toBe(
        `${result.canonicalTree}; configuration-sha256:8fa066aa9d8402caca6b9c80cfb85e17e93c15475e746fcf76f9d9c484523b78`,
      );
      expect(result.changes[0]?.registrations).toEqual([
        { target: "claude-code", change: "unknown" },
      ]);
      expect(knownInputs(result.changes[0])).toEqual({
        previous: "unavailable",
        added: [],
        removed: [],
      });
    }),
  );

  it.effect("a diverged canonical tree is not reused: the fetched tree is hashed", () =>
    Effect.gen(function* () {
      const result = yield* review({
        type: "hook",
        steps: [{ names: ["audit"] }],
        accepted: "diverged",
      });
      expect(reviewed(result)).toEqual({
        fetches: 1,
        treeHashes: 2,
        canonicalHashes: 1,
        fetchedHashes: 1,
        canonicalManifestReads: 0,
        fetchedManifestReads: 1,
        configurationHashes: 1,
      });
      expect(result.changes[0]?.contentIdentity).toContain(result.canonicalTree);
    }),
  );

  it.effect("an acquired tree for the ref is hashed as reviewed content instead", () =>
    Effect.gen(function* () {
      const result = yield* review({
        type: "hook",
        steps: [{ names: ["audit"] }],
        accepted: "matching",
        observer: "current",
        acquired: true,
      });
      // Canonical for the accepted integrity and again for previous inputs; the acquired tree once.
      expect({ ...reviewed(result), acquiredHashes: result.acquiredHashes }).toEqual({
        fetches: 0,
        treeHashes: 3,
        canonicalHashes: 2,
        fetchedHashes: 0,
        canonicalManifestReads: 2,
        fetchedManifestReads: 0,
        configurationHashes: 1,
        acquiredHashes: 1,
      });
      expect(result.acquiredTree).not.toBe(result.canonicalTree);
      expect(result.changes[0]?.contentIdentity).toBe(
        `${result.acquiredTree}; configuration-sha256:8fa066aa9d8402caca6b9c80cfb85e17e93c15475e746fcf76f9d9c484523b78`,
      );
      expect(result.changes[0]?.registrations).toEqual([
        { target: "claude-code", change: "changed" },
      ]);
      expect(knownInputs(result.changes[0])).toEqual({
        previous: "known",
        added: ["NEW_TOKEN"],
        removed: ["OLD_TOKEN"],
      });
    }),
  );

  it.effect("a reused Hook establishes previous inputs from the manifest it reviewed", () =>
    Effect.gen(function* () {
      const result = yield* review({
        type: "hook",
        steps: [{ names: ["audit"] }],
        accepted: "matching",
        observer: "current",
      });
      expect(reviewed(result)).toEqual({
        fetches: 0,
        treeHashes: 1,
        canonicalHashes: 1,
        fetchedHashes: 0,
        canonicalManifestReads: 1,
        fetchedManifestReads: 0,
        configurationHashes: 1,
      });
      expect(result.changes[0]?.registrations).toEqual([
        { target: "claude-code", change: "changed" },
      ]);
      expect(result.changes[0]?.secretReferences).toEqual(["NEW_TOKEN"]);
      expect(knownInputs(result.changes[0])).toEqual({
        previous: "known",
        added: ["NEW_TOKEN"],
        removed: ["OLD_TOKEN"],
      });
    }),
  );

  it.effect("a reused MCP establishes previous inputs from the manifest it reviewed", () =>
    Effect.gen(function* () {
      const result = yield* review({
        type: "mcp-server",
        steps: [{ names: ["context"] }],
        accepted: "matching",
        observer: "current",
      });
      expect(reviewed(result)).toEqual({
        fetches: 0,
        treeHashes: 1,
        canonicalHashes: 1,
        fetchedHashes: 0,
        canonicalManifestReads: 1,
        fetchedManifestReads: 0,
        configurationHashes: 1,
      });
      expect(result.changes[0]?.registrations).toEqual([
        { target: "claude-code", change: "changed" },
      ]);
      expect(result.changes[0]?.details).toEqual(["stdio: npx", "npm: @acme/context@1.0.0"]);
      expect(knownInputs(result.changes[0])).toEqual({
        previous: "known",
        added: ["NEW_TOKEN"],
        removed: ["OLD_TOKEN"],
      });
    }),
  );

  it.effect.each(["mcp-server", "hook"] as const)(
    "a fetched %s does not hash a canonical tree already found diverged for previous inputs",
    (type) =>
      Effect.gen(function* () {
        const result = yield* review({
          type,
          steps: [{ names: [packageName[type]] }],
          accepted: "diverged",
          observer: "current",
        });
        // Canonical before the fetch and the fetched tree; the diverged canonical tree settles
        // previous inputs as unavailable without a second hash.
        expect(reviewed(result)).toEqual({
          fetches: 1,
          treeHashes: 2,
          canonicalHashes: 1,
          fetchedHashes: 1,
          canonicalManifestReads: 0,
          fetchedManifestReads: 1,
          configurationHashes: 1,
        });
        expect(result.changes[0]?.registrations).toEqual([
          { target: "claude-code", change: "changed" },
        ]);
        expect(knownInputs(result.changes[0])).toEqual({
          previous: "unavailable",
          added: [],
          removed: [],
        });
      }),
  );

  it.effect.skipIf(privileged)(
    "a canonical tree that could not be hashed is hashed again for previous inputs",
    () =>
      Effect.gen(function* () {
        const result = yield* review({
          type: "hook",
          steps: [{ names: ["audit"] }],
          accepted: "matching",
          observer: "current",
          unreadableCanonical: true,
        });
        // The failed hash before the fetch decides nothing; previous inputs try the tree again.
        expect(reviewed(result)).toEqual({
          fetches: 1,
          treeHashes: 3,
          canonicalHashes: 2,
          fetchedHashes: 1,
          canonicalManifestReads: 0,
          fetchedManifestReads: 1,
          configurationHashes: 1,
        });
        expect(knownInputs(result.changes[0])).toEqual({
          previous: "unavailable",
          added: [],
          removed: [],
        });
      }),
  );
});

describe("Several local names of one exact Registry MCP package in one step", () => {
  it.effect("fetch, tree hash and manifest decode once while each name is reviewed", () =>
    Effect.gen(function* () {
      const result = yield* review({ type: "mcp-server", steps: [{ names: ["a", "b"] }] });
      expect(reviewed(result)).toEqual({
        fetches: 1,
        treeHashes: 1,
        canonicalHashes: 0,
        fetchedHashes: 1,
        canonicalManifestReads: 0,
        fetchedManifestReads: 1,
        configurationHashes: 2,
      });
      expect(result.changes.map((change) => [change.name, change.registrations])).toEqual([
        ["a", [{ target: "claude-code", change: "added" }]],
        ["b", [{ target: "claude-code", change: "added" }]],
      ]);
      expect(result.changes[0]?.contentIdentity).toBe(result.changes[1]?.contentIdentity);
    }),
  );

  it.effect("a warning-bearing package is fetched and warns once per name", () =>
    Effect.gen(function* () {
      const warning = "context@1.0.0 is deprecated";
      const result = yield* review({
        type: "mcp-server",
        steps: [{ names: ["a", "b"] }],
        lifecycleWarnings: [warning],
      });
      expect(reviewed(result)).toMatchObject({
        fetches: 2,
        fetchedHashes: 2,
        fetchedManifestReads: 2,
      });
      expect(result.warnings).toEqual([warning, warning]);
    }),
  );

  it.effect("a review under an operation unit fetches once per name", () =>
    Effect.gen(function* () {
      const result = yield* review({
        type: "mcp-server",
        steps: [{ names: ["a", "b"] }],
        within: "operation unit",
      });
      expect(reviewed(result)).toMatchObject({
        fetches: 2,
        fetchedHashes: 2,
        fetchedManifestReads: 2,
      });
    }),
  );

  it.effect("a local package is snapshotted and hashed once per name", () =>
    Effect.gen(function* () {
      const result = yield* review({
        type: "mcp-server",
        steps: [{ names: ["a", "b"] }],
        local: true,
      });
      expect(result.fetches).toBe(0);
      expect(result.treeHashes).toBe(2);
      expect(result.changes).toHaveLength(2);
    }),
  );

  it.effect("each name keeps its own canonical reuse decision", () =>
    Effect.gen(function* () {
      const result = yield* review({
        type: "mcp-server",
        steps: [{ names: ["a", "b"] }],
        accepted: "matching",
        acceptedNames: ["a"],
      });
      // Name a reuses the canonical tree; name b reaches no accepted row and fetches.
      expect(reviewed(result)).toEqual({
        fetches: 1,
        treeHashes: 2,
        canonicalHashes: 1,
        fetchedHashes: 1,
        canonicalManifestReads: 1,
        fetchedManifestReads: 1,
        configurationHashes: 2,
      });
      expect(result.changes.map((change) => change.registrations)).toEqual([
        [{ target: "claude-code", change: "unknown" }],
        [{ target: "claude-code", change: "added" }],
      ]);
    }),
  );

  it.effect("accepted names hash and decode the canonical tree once", () =>
    Effect.gen(function* () {
      const result = yield* review({
        type: "mcp-server",
        steps: [{ names: ["a", "b"] }],
        accepted: "matching",
      });
      expect(reviewed(result)).toEqual({
        fetches: 0,
        treeHashes: 1,
        canonicalHashes: 1,
        fetchedHashes: 0,
        canonicalManifestReads: 1,
        fetchedManifestReads: 0,
        configurationHashes: 2,
      });
      expect(result.changes.map((change) => [change.name, change.registrations])).toEqual([
        ["a", [{ target: "claude-code", change: "unknown" }]],
        ["b", [{ target: "claude-code", change: "unknown" }]],
      ]);
      expect(result.changes[0]?.contentIdentity).toBe(result.changes[1]?.contentIdentity);
      expect(result.changes[0]?.contentIdentity).toContain(result.canonicalTree);
    }),
  );

  it.effect("a fetch failure fails the review at the first name", () =>
    Effect.gen(function* () {
      const result = yield* review({
        type: "mcp-server",
        steps: [{ names: ["a", "b"] }],
        fetchFails: true,
      });
      expect(result.fetches).toBe(1);
      expect(result.risks).toMatchObject({
        _tag: "Failure",
        failure: {
          _tag: "StepFailure",
          detail: "External execution cannot be reviewed from its exact package and configuration.",
        },
      });
    }),
  );

  it.effect("a step releases its fetched tree before a later step fetches again", () =>
    Effect.gen(function* () {
      const result = yield* review({
        type: "mcp-server",
        steps: [{ names: ["a", "b"] }, { names: ["a", "b"] }],
        observer: "current",
      });
      expect(reviewed(result)).toMatchObject({
        fetches: 2,
        fetchedHashes: 2,
        fetchedManifestReads: 2,
      });
      // Both names of a step read one fetched tree, released when that step's refs are reviewed.
      expect(result.lifecycle).toEqual([
        "observe a",
        "fetch",
        "observe b",
        "released",
        "fetch",
        "released",
      ]);
      expect(result.changes.map((change) => change.name)).toEqual(["a", "b"]);
    }),
  );
});

describe("Current registrations across plan steps", () => {
  it.effect("the same server and targets in two steps is observed once", () =>
    Effect.gen(function* () {
      const result = yield* review({
        type: "mcp-server",
        steps: [{ names: ["context"] }, { names: ["context"] }],
        observer: "current",
      });
      expect(result.observations).toEqual([{ name: "context", agentIds: "claude-code" }]);
      expect(result.fetches).toBe(2);
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]?.registrations).toEqual([
        { target: "claude-code", change: "added" },
      ]);
    }),
  );

  it.effect("an accepted server's current registrations stay verified on the second step", () =>
    Effect.gen(function* () {
      const result = yield* review({
        type: "mcp-server",
        steps: [{ names: ["context"] }, { names: ["context"] }],
        accepted: "matching",
        observer: "current",
      });
      expect(result.observations).toEqual([{ name: "context", agentIds: "claude-code" }]);
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]?.registrations).toEqual([
        { target: "claude-code", change: "changed" },
      ]);
      expect(knownInputs(result.changes[0])?.previous).toBe("known");
    }),
  );

  it.effect("distinct targets in two steps are each observed", () =>
    Effect.gen(function* () {
      const result = yield* review({
        type: "mcp-server",
        steps: [
          { names: ["context"], agents: ["claude-code"] },
          { names: ["context"], agents: ["claude-code", "cursor"] },
        ],
        observer: "current",
      });
      expect(result.observations).toEqual([
        { name: "context", agentIds: "claude-code" },
        { name: "context", agentIds: "claude-code,cursor" },
      ]);
    }),
  );

  it.effect("an observation failure leaves both steps' registrations unverified", () =>
    Effect.gen(function* () {
      const result = yield* review({
        type: "mcp-server",
        steps: [{ names: ["context"] }, { names: ["context"] }],
        accepted: "matching",
        observer: "fails",
      });
      expect(result.observations).toEqual([{ name: "context", agentIds: "claude-code" }]);
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]?.registrations).toEqual([
        { target: "claude-code", change: "unknown" },
      ]);
      expect(knownInputs(result.changes[0])?.previous).toBe("unavailable");
    }),
  );
});
