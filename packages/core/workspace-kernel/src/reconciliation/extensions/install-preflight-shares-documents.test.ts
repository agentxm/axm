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
import { NativeEntryRemovalLive } from "../../locations/live.js";
import { workObservations } from "../../locations/testing.js";
import { NativeWriteAuthorityPermissive } from "../../agent-adapters/testing.js";
import { FootprintRecorderTest } from "../../planning/testing.js";
import { WorkspaceFileWriteLocksLive } from "../../settlement/live.js";
import { WorkspaceTransactionScopeTest } from "../../settlement/testing.js";
import { StepFailure } from "../../operations/index.js";
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

/** What one install read before its transaction, counted when it checks prior installation. */
interface PreflightWork {
  readonly evaluations: number;
  readonly settingsParses: number;
  readonly lockfileParses: number;
  readonly settingsReads: number;
  readonly lockfileReads: number;
}

/**
 * Install `ref` with a stub manager into the fixture workspace. The counts are
 * taken when the step first asks whether the target is installed: after its
 * preflight and before its transaction opens.
 */
const installCounting = (ref: ExtensionRef, options: { readonly force?: boolean } = {}) =>
  Effect.gen(function* () {
    const recording = yield* FileSystemRecorder;
    const work = workObservations(false);
    let evaluations = 0;
    let preflight: PreflightWork | undefined;
    const tracer = Tracer.make({
      span(spanOptions) {
        if (spanOptions.name === "DesiredStateReader.evaluate") evaluations += 1;
        return new Tracer.NativeSpan(spanOptions);
      },
    });
    const parses = (kind: string) => work.facts.filter((fact) => fact.kind === kind).length;
    const manager = {
      // Absent before the transaction, present when its postcondition checks.
      isInstalled: () =>
        Effect.sync(() => {
          if (preflight !== undefined) return true;
          preflight = {
            evaluations,
            settingsParses: parses("axm.parse.settings"),
            lockfileParses: parses("axm.parse.lockfile"),
            settingsReads: recording.contentReads(nodePath.join(root, "axm.json")),
            lockfileReads: recording.contentReads(nodePath.join(root, "axm.lock")),
          };
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
    return preflight;
  }).pipe(Effect.provide(workspace()));

/** One evaluation: the project settings and the lockfile; no user settings document exists. */
const once: PreflightWork = {
  evaluations: 1,
  settingsParses: 1,
  lockfileParses: 1,
  settingsReads: 1,
  lockfileReads: 1,
};

describe("install step preflight", () => {
  // Measured with separate preflight reads: the prior graph, the satisfied
  // check and the prior output authority each evaluated the desired state,
  // reading and decoding both documents three times.
  it.effect("evaluates a fresh registry rule's desired state once before the transaction", () =>
    Effect.gen(function* () {
      expect(yield* installCounting(ruleRef)).toEqual(once);
    }),
  );

  // Measured with separate preflight reads: the forced install skips the
  // satisfied check's evaluation; the prior graph and the prior output
  // authority each evaluated the desired state, reading both documents twice.
  it.effect("evaluates a forced knowledge install's desired state once", () =>
    Effect.gen(function* () {
      expect(yield* installCounting(knowledgeRef, { force: true })).toEqual(once);
    }),
  );

  // Measured with separate preflight reads: a skill has no prior output
  // authority; the prior graph and the satisfied check each evaluated,
  // reading both documents twice.
  it.effect("evaluates a registry skill's desired state once", () =>
    Effect.gen(function* () {
      expect(yield* installCounting(skillRef)).toEqual(once);
    }),
  );

  // A connection install has no satisfied evaluation and no prior output
  // authority: it evaluated once with separate reads and gains nothing.
  it.effect("keeps a connection install at one evaluation", () =>
    Effect.gen(function* () {
      expect(yield* installCounting(mcpRef)).toEqual(once);
    }),
  );

  // Observed identically with separate preflight reads: the prior graph's
  // live read failed first and the step reported that failure.
  it.effect("reports undecodable settings from the first preflight read before any write", () =>
    Effect.gen(function* () {
      const settingsPath = nodePath.join(root, "axm.json");
      nodeFs.writeFileSync(settingsPath, "{ not json\n");
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
      >(manager, { ref: ruleRef, toStepFailure });
      if (step.readiness === "error") throw new Error(step.errorMessage);
      const failure = yield* Effect.flip(step.run);
      expect(failure).toMatchObject({ _tag: "StepFailure", category: "internal" });
      expect(failure.detail).toMatch(/^SettingsParseError/u);
      expect(isInstalled).not.toHaveBeenCalled();
      expect(nodeFs.readFileSync(settingsPath, "utf-8")).toBe("{ not json\n");
    }).pipe(Effect.provide(workspace())),
  );
});
