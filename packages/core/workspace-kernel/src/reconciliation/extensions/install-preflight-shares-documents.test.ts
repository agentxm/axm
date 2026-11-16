/**
 * The install step's write-free preflight under the transition lock: the prior
 * graph, the satisfied-install check and the prior output authority read the
 * workspace documents once before the transaction, which reads afresh.
 */
import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Tracer from "effect/Tracer";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { RegistryTransportTest } from "@agentxm/registry-client/testing";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { RegistryKnowledgeRef } from "@agentxm/extension-model/unstable/extensions/refs/knowledge";
import type { RegistryMcpServerRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { RegistryRuleRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";
import type { RegistrySkillRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { stringify as stringifyToml } from "smol-toml";
import type { NativeLocationOutcome } from "../../locations/index.js";
import { NativeEntryRemovalLive } from "../../locations/live.js";
import { workObservations } from "../../locations/testing.js";
import { NativeWriteAuthorityPermissive } from "../../agent-adapters/testing.js";
import { FootprintRecorderTest } from "../../planning/testing.js";
import { WorkspaceFileWriteLocksLive } from "../../settlement/live.js";
import { WorkspaceTransactionScopeTest } from "../../settlement/testing.js";
import { StepFailure } from "../../operations/index.js";
import {
  computeExtensionPathsForLayout,
  ConfiguredAgentOutcomesProvider,
  extensionPathSourceFromLockEntry,
  WorkspaceLocation,
  type LockEntry,
} from "../../workspace-state/index.js";
import {
  storedLockfileFixture,
  treeIntegrityOfSync,
  TEST_TREE_INTEGRITY,
} from "../../workspace-state/testing.js";
import type {
  ExtensionManagerFailure,
  InstallMaterialization,
  ManagerRequirements,
} from "../../materialization/index.js";
import { exactVersion, extensionName, handle, recipeWorkspace } from "../test-helpers.js";
import { buildInstallOperation, type CallerStepFailure } from "./operations.js";

let root: string;

beforeEach(() => {
  root = nodeFs.realpathSync(nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-install-")));
  nodeFs.writeFileSync(
    nodePath.join(root, "axm.json"),
    `${JSON.stringify({ owner: "@acme", agents: [] })}\n`,
  );
  // An accepted-resolution document exists, so every evaluation decodes both documents.
  nodeFs.writeFileSync(nodePath.join(root, "axm.lock"), "version = 1\n");
});

afterEach(() => {
  nodeFs.rmSync(root, { recursive: true, force: true });
});

const toStepFailure = (failure: CallerStepFailure<ExtensionManagerFailure>): StepFailure =>
  new StepFailure({ category: "internal", detail: String(failure) });

const registrySource = {
  type: "registry",
  name: "agentxm",
  location: decodeRegistryEndpointSync("https://registry.agentxm.ai"),
  owner: Option.some(handle("@acme")),
} as const;

const registryDetails = {
  refType: "registry",
  publisherBindingId: "hbnd_test",
  source: registrySource,
  owner: handle("@acme"),
  name: extensionName("review"),
  version: exactVersion("1.0.0"),
  integrity: Option.none(),
  packages: [],
} as const;

const ruleRef: RegistryRuleRef = {
  type: "rule",
  ...registryDetails,
  rule: { name: extensionName("review") },
};
const knowledgeRef: RegistryKnowledgeRef = {
  type: "knowledge",
  ...registryDetails,
  knowledge: { name: extensionName("review") },
};
const skillRef: RegistrySkillRef = {
  type: "skill",
  ...registryDetails,
  skill: { name: extensionName("review"), description: Option.none(), metadata: Option.none() },
};
const mcpRef: RegistryMcpServerRef = {
  type: "mcp-server",
  ...registryDetails,
  server: { name: extensionName("review") },
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
    ).pipe(Layer.provideMerge(platform)),
  );

/** What one install read and evaluated over some span of its run. */
interface DocumentWork {
  readonly evaluations: number;
  readonly settingsParses: number;
  readonly lockfileParses: number;
  readonly settingsReads: number;
  readonly lockfileReads: number;
}

const minus = (total: DocumentWork, before: DocumentWork): DocumentWork => ({
  evaluations: total.evaluations - before.evaluations,
  settingsParses: total.settingsParses - before.settingsParses,
  lockfileParses: total.lockfileParses - before.lockfileParses,
  settingsReads: total.settingsReads - before.settingsReads,
  lockfileReads: total.lockfileReads - before.lockfileReads,
});

interface InstallCountingOptions {
  readonly force?: boolean;
  readonly declare?: boolean;
  /** Runs once the preflight has ended, when the step first checks prior installation. */
  readonly afterPreflight?: () => void;
}

/**
 * Install `ref` with a stub manager into the fixture workspace. The preflight
 * counts are taken when the step first asks whether the target is installed:
 * after its preflight and before its transaction opens. The remaining counts
 * cover the transaction and its validation.
 */
const installCounting = (ref: ExtensionRef, options: InstallCountingOptions = {}) =>
  Effect.gen(function* () {
    const recording = yield* FileSystemRecorder;
    const work = workObservations(false);
    let evaluations = 0;
    let preflight: DocumentWork | undefined;
    const tracer = Tracer.make({
      span(spanOptions) {
        if (spanOptions.name === "DesiredStateReader.evaluate") evaluations += 1;
        return new Tracer.NativeSpan(spanOptions);
      },
    });
    const parses = (kind: string) => work.facts.filter((fact) => fact.kind === kind).length;
    const sofar = (): DocumentWork => ({
      evaluations,
      settingsParses: parses("axm.parse.settings"),
      lockfileParses: parses("axm.parse.lockfile"),
      settingsReads: recording.contentReads(nodePath.join(root, "axm.json")),
      lockfileReads: recording.contentReads(nodePath.join(root, "axm.lock")),
    });
    const manager = {
      // Absent before the transaction, present when its postcondition checks.
      isInstalled: () =>
        Effect.sync(() => {
          if (preflight !== undefined) return true;
          preflight = sofar();
          options.afterPreflight?.();
          return false;
        }),
      materializeInstall: () => Effect.void,
      acceptedResolution: () => Effect.succeed(Option.none()),
    } satisfies InstallMaterialization<
      ExtensionRef,
      void,
      ExtensionManagerFailure,
      ManagerRequirements
    >;
    const step = buildInstallOperation<
      ExtensionRef,
      void,
      ExtensionManagerFailure,
      ManagerRequirements
    >(manager, {
      ref,
      ...(options.force === undefined ? {} : { force: options.force }),
      ...(options.declare === true
        ? { declaration: { name: extensionName("review"), versionRange: Option.none() } }
        : {}),
      toStepFailure,
    });
    if (step.readiness === "error") throw new Error(step.errorMessage);
    recording.reset();
    const result = yield* step.run.pipe(
      work.provide,
      Effect.withTracer(tracer),
      Effect.withTracerEnabled(true),
    );
    expect(result.result).toBe("success");
    if (preflight === undefined) throw new Error("Expected the step to check prior installation");
    return { preflight, afterwards: minus(sofar(), preflight) };
  });

/** One evaluation: the project settings and the lockfile; no user settings document exists. */
const once: DocumentWork = {
  evaluations: 1,
  settingsParses: 1,
  lockfileParses: 1,
  settingsReads: 1,
  lockfileReads: 1,
};

const ruleNativeLocation = (path: string): NativeLocationOutcome => ({
  scope: "project",
  address: { kind: "entry", path },
  aliases: [path],
  configuredConsumers: [],
  potentialReaders: [],
  policyReasons: [],
  ownership: "owned",
  state: "unchanged",
  availability: [],
});

/** Every configured agent already holds the rule's current, owned output. */
const currentRuleOutputs = Layer.succeed(ConfiguredAgentOutcomesProvider, {
  byExtensionType: {
    rule: (request) =>
      Effect.succeed(
        new Map(
          request.rows.map((row) => [
            row.name,
            {
              agentOutcomes: [],
              nativeLocations: [ruleNativeLocation(nodePath.join(root, "AGENTS.md"))],
            },
          ]),
        ),
      ),
  },
});

const acceptedRuleIntegrity =
  "sha512-W6hmaNcCrEx5sOAbpgd9XOw+u68VBl+mKXJFoIxt5kihKN1+FVD/jdm1bqL40gSWuROKd0lEc0d45/aL2aNWqg==";

/** Declare and accept the registry rule, with its canonical tree in place. */
const acceptRule = Effect.gen(function* () {
  const location = yield* WorkspaceLocation;
  const layout = yield* Ref.get(location.layout);
  const path = yield* Path.Path;
  const entry: LockEntry = {
    source: { type: "registry", url: decodeRegistryEndpointSync("https://registry.agentxm.ai") },
    identity: { owner: handle("@acme"), name: extensionName("review") },
    resolved: {
      version: exactVersion("1.0.0"),
      integrity: acceptedRuleIntegrity,
      publisherBindingId: "hbnd_test",
    },
    treeIntegrity: TEST_TREE_INTEGRITY,
  };
  const canonical = computeExtensionPathsForLayout(
    path.join,
    layout,
    extensionPathSourceFromLockEntry(entry),
    "rules",
    entry.identity.name,
  ).canonicalPath;
  nodeFs.mkdirSync(nodePath.join(canonical, "src"), { recursive: true });
  nodeFs.writeFileSync(
    nodePath.join(canonical, "rule.json"),
    JSON.stringify({ owner: "@acme", type: "rule", name: "review", version: "1.0.0" }),
  );
  nodeFs.writeFileSync(nodePath.join(canonical, "src", "RULE.md"), "# Review\n");
  nodeFs.writeFileSync(
    nodePath.join(root, "axm.json"),
    `${JSON.stringify({
      owner: "@acme",
      agents: [],
      sources: [{ name: "corp", type: "registry", location: "https://registry.agentxm.ai" }],
      rules: { review: "corp:@acme/rules/review" },
    })}\n`,
  );
  nodeFs.writeFileSync(
    nodePath.join(root, "axm.lock"),
    stringifyToml(
      storedLockfileFixture({
        rules: { review: { ...entry, treeIntegrity: treeIntegrityOfSync(canonical) } },
      }),
    ),
  );
  return canonical;
});

/**
 * Run the install of `ref` with a manager that fails the test if it is ever
 * asked whether the target is installed; returns the step's failure.
 */
const failingInstall = (ref: ExtensionRef) =>
  Effect.gen(function* () {
    const isInstalled = vi.fn(() => Effect.succeed(false));
    const manager = {
      isInstalled,
      materializeInstall: () => Effect.void,
      acceptedResolution: () => Effect.succeed(Option.none()),
    } satisfies InstallMaterialization<
      ExtensionRef,
      void,
      ExtensionManagerFailure,
      ManagerRequirements
    >;
    const step = buildInstallOperation<
      ExtensionRef,
      void,
      ExtensionManagerFailure,
      ManagerRequirements
    >(manager, { ref, toStepFailure });
    if (step.readiness === "error") throw new Error(step.errorMessage);
    const failure = yield* Effect.flip(step.run);
    expect(isInstalled).not.toHaveBeenCalled();
    return failure;
  });

describe("install step preflight", () => {
  // Measured with separate preflight reads: the prior graph, the satisfied
  // check and the prior output authority each evaluated the desired state,
  // reading and decoding both documents three times.
  it.effect("evaluates a fresh registry rule's desired state once before the transaction", () =>
    Effect.gen(function* () {
      expect((yield* installCounting(ruleRef)).preflight).toEqual(once);
    }).pipe(Effect.provide(workspace())),
  );

  // Measured with separate preflight reads: the forced install skips the
  // satisfied check's evaluation; the prior graph and the prior output
  // authority each evaluated the desired state, reading both documents twice.
  it.effect("evaluates a forced knowledge install's desired state once", () =>
    Effect.gen(function* () {
      expect((yield* installCounting(knowledgeRef, { force: true })).preflight).toEqual(once);
    }).pipe(Effect.provide(workspace())),
  );

  // Measured with separate preflight reads: a skill has no prior output
  // authority; the prior graph and the satisfied check each evaluated,
  // reading both documents twice.
  it.effect("evaluates a registry skill's desired state once", () =>
    Effect.gen(function* () {
      expect((yield* installCounting(skillRef)).preflight).toEqual(once);
    }).pipe(Effect.provide(workspace())),
  );

  // A connection install has no satisfied evaluation and no prior output
  // authority: it evaluated once with separate reads and gains nothing.
  it.effect("keeps a connection install at one evaluation", () =>
    Effect.gen(function* () {
      expect((yield* installCounting(mcpRef)).preflight).toEqual(once);
    }).pipe(Effect.provide(workspace())),
  );

  // Measured identically with separate preflight reads: once the preflight
  // has ended, the transaction and its validation read and decode both
  // documents afresh.
  it.effect("keeps the transaction's own reads after the preflight", () =>
    Effect.gen(function* () {
      const { afterwards } = yield* installCounting(ruleRef, { declare: true });
      expect(afterwards).toEqual({
        evaluations: 1,
        settingsParses: 3,
        lockfileParses: 1,
        settingsReads: 9,
        lockfileReads: 2,
      });
    }).pipe(Effect.provide(workspace())),
  );

  // Observed identically with separate preflight reads.
  it.effect("preserves a settings edit made after the preflight through fresh writes", () =>
    Effect.gen(function* () {
      const settingsPath = nodePath.join(root, "axm.json");
      yield* installCounting(ruleRef, {
        declare: true,
        afterPreflight: () => {
          const current: unknown = JSON.parse(nodeFs.readFileSync(settingsPath, "utf-8"));
          if (typeof current !== "object" || current === null) throw new Error("Expected settings");
          const edited = { $schema: "https://example.com/settings.json", ...current };
          nodeFs.writeFileSync(settingsPath, `${JSON.stringify(edited, null, 2)}\n`);
        },
      });
      const settings: unknown = JSON.parse(nodeFs.readFileSync(settingsPath, "utf-8"));
      expect(settings).toMatchObject({
        $schema: "https://example.com/settings.json",
        owner: "@acme",
        rules: { review: "workspace" },
      });
    }).pipe(Effect.provide(workspace())),
  );

  // Two install steps run one after another, as a Pack's member steps do:
  // each opens its own view and reads the documents its predecessor wrote.
  // Measured with separate preflight reads: three evaluations each.
  it.effect("opens a separate preflight view for each step", () =>
    Effect.gen(function* () {
      const first = yield* installCounting(ruleRef, { declare: true });
      const second = yield* installCounting(knowledgeRef, { declare: true });
      expect([first.preflight, second.preflight]).toEqual([once, once]);
      expect(
        JSON.parse(nodeFs.readFileSync(nodePath.join(root, "axm.json"), "utf-8")),
      ).toMatchObject({ rules: { review: "workspace" }, knowledge: { review: "workspace" } });
    }).pipe(Effect.provide(workspace())),
  );

  // Measured with separate preflight reads: the prior graph and the satisfied
  // check each evaluated the desired state, reading and decoding both
  // documents twice; the satisfied check hashed the canonical tree once and
  // read its manifest twice, which it still does.
  it.effect("decides a repeat install satisfied from one evaluation", () =>
    Effect.gen(function* () {
      const canonical = yield* acceptRule;
      const recording = yield* FileSystemRecorder;
      const work = workObservations(false);
      let evaluations = 0;
      const tracer = Tracer.make({
        span(spanOptions) {
          if (spanOptions.name === "DesiredStateReader.evaluate") evaluations += 1;
          return new Tracer.NativeSpan(spanOptions);
        },
      });
      const isInstalled = vi.fn(() => Effect.succeed(true));
      const manager = {
        isInstalled,
        materializeInstall: () => Effect.void,
        acceptedResolution: () => Effect.succeed(Option.none()),
      } satisfies InstallMaterialization<
        ExtensionRef,
        void,
        ExtensionManagerFailure,
        ManagerRequirements
      >;
      const step = buildInstallOperation<
        ExtensionRef,
        void,
        ExtensionManagerFailure,
        ManagerRequirements
      >(manager, {
        ref: {
          ...ruleRef,
          source: { ...registrySource, name: "corp" },
          integrity: Option.some(acceptedRuleIntegrity),
        },
        toStepFailure,
      });
      if (step.readiness === "error") throw new Error(step.errorMessage);
      recording.reset();
      const result = yield* step.run.pipe(
        work.provide,
        Effect.withTracer(tracer),
        Effect.withTracerEnabled(true),
        Effect.provide(currentRuleOutputs),
      );
      expect(result).toMatchObject({ result: "success", disposition: "unchanged" });
      expect(isInstalled).not.toHaveBeenCalled();
      const parses = (kind: string) => work.facts.filter((fact) => fact.kind === kind).length;
      expect({
        evaluations,
        settingsParses: parses("axm.parse.settings"),
        lockfileParses: parses("axm.parse.lockfile"),
        settingsReads: recording.contentReads(nodePath.join(root, "axm.json")),
        lockfileReads: recording.contentReads(nodePath.join(root, "axm.lock")),
        treeHashes: parses("axm.hash.materialized-tree"),
        manifestReads: recording.contentReads(nodePath.join(canonical, "rule.json")),
      }).toEqual({ ...once, treeHashes: 1, manifestReads: 2 });
    }).pipe(Effect.provide(workspace())),
  );

  // Observed identically with separate preflight reads: the prior graph's
  // live read failed first and the step reported that failure.
  it.effect("reports undecodable settings from the first preflight read before any write", () =>
    Effect.gen(function* () {
      const settingsPath = nodePath.join(root, "axm.json");
      nodeFs.writeFileSync(settingsPath, "{ not json\n");
      const failure = yield* failingInstall(ruleRef);
      expect(failure).toMatchObject({ _tag: "StepFailure", category: "internal" });
      expect(failure.detail).toMatch(/^SettingsParseError/u);
      expect(nodeFs.readFileSync(settingsPath, "utf-8")).toBe("{ not json\n");
    }).pipe(Effect.provide(workspace())),
  );
});
