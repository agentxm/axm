/**
 * Workspace document decoding by one external execution review, over a real
 * temporary workspace and the production workspace readers. The Registry
 * transport, source fetches and the native configured-agent observer are
 * substituted at their service seams.
 */
import { withDetailedWork, NativePlatformTest } from "../../locations/testing.js";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import * as Tracer from "effect/Tracer";
import {
  decodeExtensionNameSync,
  decodeHandleSync,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { OfflineHttpClient, RegistryClientFactoryTest } from "@agentxm/registry-client/testing";
import { WorkspaceFileWriteLocksLive } from "../../settlement/live.js";
import { WorkspaceStateLive } from "../../workspace-state/live.js";
import {
  ConfiguredAgentOutcomesProvider,
  SettingsReader,
  WorkspaceLocation,
  withLiveWorkspaceObservations,
  withWorkspaceReadView,
  workspaceReadPhaseFor,
  type ConfiguredAgentOutcomesRequest,
} from "../../workspace-state/index.js";
import { ConfiguredAgentOutcomesProviderTest } from "../../workspace-state/testing.js";
import { StepFailure, type Plan, type PlannedJobStep } from "../../operations/index.js";
import { prepareExecutionCandidate } from "../index.js";
import { SourceHostProvidersTest } from "../../sources/testing.js";
import { executionExposureRisks } from "./execution-exposure.js";

const hookManifest = {
  owner: "@acme",
  type: "hook",
  name: "audit",
  version: "1.0.0",
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
};

const mcpManifest = {
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
      },
    ],
  },
};

const distribution = {
  kind: "package",
  registryType: "npm",
  identifier: "@acme/context",
  transport: "stdio",
};

const registrySource = {
  type: "registry" as const,
  name: "agentxm",
  location: decodeRegistryEndpointSync("https://registry.example.test"),
  owner: Option.none(),
};

const registryPackage = (name: string) => ({
  refType: "registry" as const,
  source: registrySource,
  owner: decodeHandleSync("@acme"),
  publisherBindingId: "hbnd_test",
  name: decodeExtensionNameSync(name),
  version: decodeVersionSync("1.0.0"),
  integrity: Option.some(`sha512-${"A".repeat(86)}==`),
  packages: [],
});

const hookRef: ExtensionRef = {
  ...registryPackage("audit"),
  type: "hook",
  hook: { name: decodeExtensionNameSync("audit") },
};

const mcpRef: ExtensionRef = {
  ...registryPackage("context"),
  type: "mcp-server",
  server: { name: decodeExtensionNameSync("context") },
};

const step = (refs: ReadonlyArray<ExtensionRef>): PlannedJobStep => ({
  readiness: "ready",
  label: "expose",
  exposureRefs: refs,
  artifact: { path: ".claude/settings.json", change: "created", scope: "project" },
  run: Effect.die("The review never applies"),
});

interface ReviewOptions {
  /** Runs inside the review, when a source is fetched. */
  readonly duringReview?: (
    root: string,
    fs: FileSystem.FileSystem,
  ) => Effect.Effect<void, PlatformError.PlatformError>;
  /** Runs after planning's phase retired and before the review. */
  readonly beforeReview?: (
    root: string,
    fs: FileSystem.FileSystem,
  ) => Effect.Effect<void, PlatformError.PlatformError>;
  /** Each native observation reads through the active read phase, as production observers do. */
  readonly phaseReadingObserver?: boolean;
}

/**
 * A native observer that, like the production provider and its extension
 * managers, reads documents and workspace records through the active read
 * phase. It records which phase each observation saw; it cannot establish
 * what the production managers inspect natively.
 */
const phaseReadingObserver = (observed: Array<string>) =>
  Layer.effect(
    ConfiguredAgentOutcomesProvider,
    Effect.gen(function* () {
      const location = yield* WorkspaceLocation;
      const path = yield* Path.Path;
      const observe = (request: ConfiguredAgentOutcomesRequest) =>
        Effect.gen(function* () {
          const phase = yield* workspaceReadPhaseFor(location);
          if (phase === undefined) {
            observed.push(`${request.type}: live`);
            return new Map();
          }
          observed.push(
            `${request.type}: ${phase.observations ? "observation" : "document"} phase`,
          );
          yield* phase.readers.settings.configuredAgents;
          yield* phase.readers.locks.lockfile;
          yield* phase.readers.desired.graph();
          yield* phase.records
            .rows(request.type)
            .pipe(
              Effect.provideService(FileSystem.FileSystem, phase.fileSystem),
              Effect.provideService(Path.Path, path),
            );
          return new Map();
        }).pipe(Effect.orDie);
      return { byExtensionType: { hook: observe, "mcp-server": observe } };
    }),
  );

/** A real workspace whose plan exposes one Registry ref per step. */
const workspace = (refs: ReadonlyArray<ReadonlyArray<ExtensionRef>>, options: ReviewOptions = {}) =>
  Effect.gen(function* () {
    const observed: string[] = [];
    const live = yield* FileSystem.FileSystem;
    const root = yield* live.makeTempDirectoryScoped({ prefix: "axm-exposure-phase-" });
    yield* live.writeFileString(
      `${root}/axm.json`,
      JSON.stringify({
        agents: ["claude-code"],
        hooks: { audit: { source: "@acme/hooks/audit" } },
        mcpServers: { context: { source: "@acme/mcps/context", distribution } },
      }),
    );
    yield* live.writeFileString(`${root}/axm.lock`, "version = 1\n");
    for (const [directory, file, manifest] of [
      ["hook", "hook.json", hookManifest],
      ["mcp", "mcp.json", mcpManifest],
    ] as const) {
      yield* live.makeDirectory(`${root}/fetched/${directory}/src`, { recursive: true });
      yield* live.writeFileString(`${root}/fetched/${directory}/${file}`, JSON.stringify(manifest));
      yield* live.writeFileString(`${root}/fetched/${directory}/src/hook.sh`, "echo audit\n");
    }
    const plan: Plan = {
      _tag: "Plan",
      name: "Expose",
      description: Option.none(),
      jobs: [{ concurrency: 1, steps: refs.map(step) }],
    };
    const state = WorkspaceStateLive({
      projectRoot: decodeAbsolutePathSync(root),
      scope: "project",
      allowUninitialized: true,
    }).pipe(
      Layer.provide(RegistryClientFactoryTest(OfflineHttpClient)),
      Layer.provide(
        ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: `${root}/home` } })),
      ),
    );
    const layer = Layer.mergeAll(
      options.phaseReadingObserver === true
        ? Layer.provideMerge(phaseReadingObserver(observed), state)
        : Layer.merge(state, ConfiguredAgentOutcomesProviderTest),
      SourceHostProvidersTest({
        fetch: (ref) =>
          Effect.gen(function* () {
            if (options.duringReview !== undefined) yield* options.duringReview(root, live);
            return { directory: `${root}/fetched/${ref.type === "hook" ? "hook" : "mcp"}` };
          }).pipe(Effect.orDie),
      }),
    );
    return { root, plan, layer, live, observed };
  });

/**
 * Plan in a stable read phase, then review once the phase has retired, as
 * candidate preparation does, counting the review's own work.
 */
const reviewWorkspace = (
  refs: ReadonlyArray<ReadonlyArray<ExtensionRef>>,
  options: ReviewOptions = {},
) =>
  Effect.gen(function* () {
    const { root, plan, layer, live, observed } = yield* workspace(refs, options);
    const spans: Tracer.NativeSpan[] = [];
    const tracer = Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options);
        spans.push(span);
        return span;
      },
    });
    const risks = yield* withWorkspaceReadView(
      Effect.gen(function* () {
        // Planning decodes the documents in its own phase.
        expect(yield* (yield* SettingsReader).configuredAgents).toEqual(["claude-code"]);
        spans.length = 0;
        return yield* withLiveWorkspaceObservations(
          Effect.gen(function* () {
            if (options.beforeReview !== undefined) yield* options.beforeReview(root, live);
            return yield* executionExposureRisks(plan);
          }),
        );
      }),
    ).pipe(withDetailedWork(tracer), Effect.provide(layer), Effect.result);
    const named = (name: string) => spans.filter((span) => span.name === name).length;
    return {
      risks,
      changes:
        risks._tag === "Success"
          ? (risks.success[0]?.executionChanges ?? []).map((change) => change.name)
          : [],
      settingsParses: named("axm.parse.settings"),
      lockfileParses: named("axm.parse.lockfile"),
      evaluations: named("axm.resolve.desired-state"),
      treeHashes: named("axm.hash.materialized-tree"),
      observed,
      spanNames: [...new Set(spans.map((span) => span.name))].sort(),
    };
  }).pipe(
    Effect.scoped,
    Effect.provide(Layer.provideMerge(WorkspaceFileWriteLocksLive, NativePlatformTest)),
  );

describe("Workspace documents read by one execution review", () => {
  it.effect("a Hook step and an MCP step decode settings and the lockfile once", () =>
    Effect.gen(function* () {
      const result = yield* reviewWorkspace([[hookRef], [mcpRef]]);
      expect({
        settingsParses: result.settingsParses,
        lockfileParses: result.lockfileParses,
        evaluations: result.evaluations,
      }).toEqual({ settingsParses: 1, lockfileParses: 1, evaluations: 1 });
      expect(result.changes).toEqual(["audit", "context"]);
      // Physical observations stay live: each fetched tree is hashed, none is reused.
      expect(result.treeHashes).toBe(2);
      expect(result.spanNames).not.toContain("axm.observation.reuse");
    }),
  );

  it.effect("native observations read documents and records through the review's phase", () =>
    Effect.gen(function* () {
      const result = yield* reviewWorkspace([[hookRef], [mcpRef]], { phaseReadingObserver: true });
      expect(result.observed).toEqual(["hook: document phase", "mcp-server: document phase"]);
      expect({
        settingsParses: result.settingsParses,
        lockfileParses: result.lockfileParses,
        evaluations: result.evaluations,
        treeHashes: result.treeHashes,
      }).toEqual({ settingsParses: 1, lockfileParses: 1, evaluations: 1, treeHashes: 2 });
      expect(result.changes).toEqual(["audit", "context"]);
    }),
  );

  it.effect("a plan without external Hook or MCP exposure reads no document", () =>
    Effect.gen(function* () {
      const result = yield* reviewWorkspace([[]]);
      expect(result.risks).toMatchObject({ _tag: "Success", success: [] });
      expect(result.spanNames).toEqual(["executionExposureRisks"]);
    }),
  );

  it.effect("settings corrupted after planning fail the review as unreadable documents", () =>
    Effect.gen(function* () {
      const result = yield* reviewWorkspace([[hookRef], [mcpRef]], {
        beforeReview: (root, fs) => fs.writeFileString(`${root}/axm.json`, "{ not json"),
      });
      expect(result.risks._tag).toBe("Failure");
      if (result.risks._tag === "Failure") {
        expect(result.risks.failure).not.toBeInstanceOf(StepFailure);
        expect(result.risks.failure._tag).toBe("SettingsParseError");
      }
    }),
  );

  it.effect("a settings edit during the review is refused when the candidate is sealed", () =>
    Effect.gen(function* () {
      let edited = false;
      const { plan, layer } = yield* workspace([[hookRef], [mcpRef]], {
        duringReview: (root, fs) =>
          Effect.gen(function* () {
            if (edited) return;
            edited = true;
            yield* fs.writeFileString(
              `${root}/axm.json`,
              JSON.stringify({ agents: ["claude-code", "cursor"] }),
            );
          }),
      });
      const result = yield* prepareExecutionCandidate(plan).pipe(
        Effect.provide(layer),
        Effect.result,
      );
      expect(edited).toBe(true);
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "StaleExecutionCandidate" },
      });
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.provideMerge(WorkspaceFileWriteLocksLive, NativePlatformTest)),
    ),
  );
});
