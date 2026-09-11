/**
 * @agentxm/extension-lifecycle deterministic fixtures and ports.
 *
 * A throwaway workspace with settings, lockfile, and authored extension
 * content written as the product writes them, plus every service a lifecycle
 * use case reads or writes through: the workspace state and its transaction
 * scope, the projection capability, all seven materialization managers, and
 * the plan pipeline's per-invocation services with a recording interaction
 * port. Production source never imports this module.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { AgentExecutableResolver } from "@agentxm/agent-integration";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  ExtensionManagersLive,
  HookManagerLive,
  KnowledgeManagerLive,
  McpSecretStoreLive,
  McpServerManagerLive,
  PackManagerLive,
  ProjectionParticipantsLive,
  RuleManagerLive,
  SkillManagerLive,
  SubagentManagerLive,
} from "@agentxm/extension-materialization/live";
import {
  ReleaseAgePosture,
  decideNamedRegistryVersion,
  makeAxmSkillCompatibilityPolicyLayer,
  namedRegistryCandidates,
  resolveVersionEntryWithReleaseAge,
} from "@agentxm/extension-resolution";
import { AxmSkillCandidateGateLive } from "@agentxm/extension-resolution/live";
import { RegistryResolutionPolicy, SourceHostProviders } from "@agentxm/extension-sources";
import { SourceHostProvidersLive } from "@agentxm/extension-sources/live";
import { StepFailure } from "@agentxm/workspace-operations";
import {
  PlanInvocationTest,
  ResolvePlanInteractionTest,
  type ResolvePlanInteractionTestState,
} from "@agentxm/workspace-operations/testing";
import {
  CodingAgentRepositoryLive,
  NativeWriteAuthorityLive,
  WorkspaceCatalogLive,
  WorkspaceInvariantFactsLive,
} from "@agentxm/workspace-projection/live";
import { layer as WorkspaceLayerLive } from "@agentxm/workspace-state/live";

import { ExtensionLifecycleFailed } from "./errors.js";
import { ExtensionSelectionInteraction } from "./install/selection-interaction.js";
import { BundledAxmSkillAsset } from "./skills/install/bundled.js";
import { StepFailureConversion } from "./step-failure-conversion.js";

/**
 * The official skill as a running executable carries it. The generator that
 * produces the real asset belongs to the application; a specification only
 * needs a compatible one to observe what the lifecycle does with it.
 */
export const bundledAxmSkillAsset = (
  options: {
    readonly version?: string;
    readonly runningCliVersion?: string;
    readonly body?: string;
  } = {},
): Layer.Layer<BundledAxmSkillAsset> => {
  const version = options.version ?? "1.0.0";
  const body =
    options.body ?? "---\nname: axm\ndescription: The official AXM skill.\n---\n\n# axm\n";
  return Layer.succeed(BundledAxmSkillAsset, {
    manifestJson: `${JSON.stringify(
      {
        owner: "@agentxm",
        type: "skill",
        name: "axm",
        version,
        description: "The official AXM skill.",
      },
      null,
      2,
    )}\n`,
    version,
    cliVersion: version,
    cliVersionRange: `>=${version}`,
    sourceFiles: [{ path: "SKILL.md", base64: Buffer.from(body).toString("base64") }],
    runningCliVersion: options.runningCliVersion ?? version,
  });
};

/**
 * Render a failure as the sentence a structural fixture reports. Assertions in
 * this package bind to this mapping, not to the application boundary's
 * wording: a fixture that borrowed the application's renderer would be
 * asserting the application's words from inside the feature.
 */
const describeFailure = (failure: unknown): string => {
  if (failure instanceof ExtensionLifecycleFailed) return failure.detail ?? failure.category;
  if (typeof failure === "object" && failure !== null) {
    for (const key of ["detail", "subject", "message"] as const) {
      if (key in failure) {
        const candidate = Reflect.get(failure, key);
        if (typeof candidate === "string" && candidate.length > 0) return candidate;
      }
    }
    if ("cause" in failure && failure.cause !== undefined && failure.cause !== failure) {
      return describeFailure(failure.cause);
    }
  }
  return String(failure);
};

/**
 * Structural stand-in for the application's failure adapter: the feature's own
 * failure maps 1:1; anything else keeps its detail sentence under an
 * `internal` category.
 */
const TestStepFailureConversion = Layer.succeed(StepFailureConversion, {
  toStepFailure: (failure: unknown) =>
    failure instanceof ExtensionLifecycleFailed
      ? new StepFailure({
          category: failure.category,
          detail: failure.detail ?? failure.category,
          ...(failure.suggestions === undefined ? {} : { suggestions: failure.suggestions }),
          ...(failure.cause === undefined ? {} : { cause: failure.cause }),
        })
      : new StepFailure({ category: "internal", detail: describeFailure(failure), cause: failure }),
  describeFailure,
  describeFailureMessage: describeFailure,
});

export interface LifecycleFixtureOptions {
  readonly scope?: WorkspaceScope;
  /** Settings document for the selected scope; written as authored. */
  readonly settings?: Readonly<Record<string, unknown>>;
  /** Lockfile document for the selected scope; `lockfileVersion` is supplied. */
  readonly lockfile?: Readonly<Record<string, unknown>>;
  /** Extra files written into the project root, keyed by relative path. */
  readonly files?: Readonly<Record<string, string>>;
  /** Agent executables the machine reports as present. */
  readonly installedExecutables?: ReadonlyArray<string>;
  /**
   * How the fixture resolves sources. `none` (the default) refuses every
   * lookup, which is what an activation fixture wants: turning something on
   * never fetches. `live` composes the production source-resolution layer, so
   * an install fixture acquires from a real local package or a `file://`
   * Registry the specification published into.
   */
  readonly sources?: "none" | "live";
  /** The CLI version the official-skill compatibility policy evaluates against. */
  readonly cliVersion?: string;
  /**
   * How the fixture answers "which of these did you want?". The default takes
   * every candidate and records the question, so a specification can show
   * that a choice was — or was not — asked for.
   */
  readonly select?: "all" | "none";
}

/**
 * A throwaway workspace with every service a lifecycle use case needs over
 * it, and a pinned user home so a project-scope run can be shown to leave the
 * user scope alone.
 */
export const makeLifecycleFixture = (options: LifecycleFixtureOptions = {}) => {
  const scope = options.scope ?? "project";
  const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-lifecycle-")));
  const home = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-lifecycle-home-")));
  const workspaceRoot = scope === "user" ? nodePath.join(home, ".axm", "workspace") : root;
  fs.mkdirSync(nodePath.join(root, ".axm"), { recursive: true });
  fs.mkdirSync(nodePath.join(home, ".axm", "workspace"), { recursive: true });

  const writeFile = (relativePath: string, contents: string) => {
    const file = nodePath.join(root, relativePath);
    fs.mkdirSync(nodePath.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  };
  const readFile = (relativePath: string): string =>
    fs.readFileSync(nodePath.join(root, relativePath), "utf8");
  const exists = (relativePath: string): boolean =>
    fs.existsSync(nodePath.join(root, relativePath));

  /** Every file, symlink, and directory under a root, so purity can be proven. */
  const snapshotUnder = (base: string): ReadonlyArray<readonly [string, string]> => {
    const entries: Array<readonly [string, string]> = [];
    const walk = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = nodePath.join(directory, entry.name);
        const relative = nodePath.relative(base, absolute);
        if (entry.isSymbolicLink()) {
          entries.push([relative, `symlink:${fs.readlinkSync(absolute)}`]);
          continue;
        }
        if (entry.isDirectory()) {
          entries.push([relative, "directory"]);
          walk(absolute);
          continue;
        }
        entries.push([relative, fs.readFileSync(absolute, "utf8")]);
      }
    };
    walk(base);
    return entries.sort((left, right) => left[0].localeCompare(right[0]));
  };

  if (options.settings !== undefined) {
    fs.writeFileSync(
      nodePath.join(workspaceRoot, "axm.json"),
      JSON.stringify({ agents: [], ...options.settings }, null, 2),
    );
    // JSON is valid YAML, so the lockfile fixture needs no emitter.
    fs.writeFileSync(
      nodePath.join(workspaceRoot, "axm-lock.yaml"),
      JSON.stringify({ lockfileVersion: 7, skills: {}, ...options.lockfile }),
    );
  }
  for (const [relativePath, contents] of Object.entries(options.files ?? {})) {
    writeFile(relativePath, contents);
  }

  const interaction = ResolvePlanInteractionTest();
  const selectionCalls: Array<{
    readonly type: "skill" | "subagent";
    readonly offered: ReadonlyArray<string>;
  }> = [];
  const selection = Layer.succeed(ExtensionSelectionInteraction, {
    selectSkills: (candidates) => {
      selectionCalls.push({ type: "skill", offered: candidates.map((ref) => ref.skill.name) });
      return Effect.succeed(options.select === "none" ? [] : candidates);
    },
    selectSubagents: (candidates) => {
      selectionCalls.push({
        type: "subagent",
        offered: candidates.map((ref) => ref.subagent.name),
      });
      return Effect.succeed(options.select === "none" ? [] : candidates);
    },
  });
  const environment = ConfigProvider.layer(
    ConfigProvider.fromEnv({ env: { AXM_USER_HOME: home } }),
  );
  // Activation never fetches a source: it turns on what the workspace already
  // acquired. A fixture that could fetch would be describing installation.
  const refusingSourceProviders = Layer.succeed(SourceHostProviders, {
    find: () => Effect.succeed([]),
    resolveNamedRegistry: () => Effect.die("no named registry in this fixture"),
    fetch: () => Effect.die("no source fetch in this fixture"),
    cloneUrl: () => Option.none(),
    origin: () => "fixture",
  });
  const transport = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make(() => Effect.die("no HTTP request in this fixture")),
  );
  const installedExecutables = new Set(options.installedExecutables ?? []);
  const executables = Layer.succeed(AgentExecutableResolver, {
    exists: (name: string) => Effect.succeed(installedExecutables.has(name)),
  });

  // One environment, built outward: the workspace state and the ports over it,
  // then the projection services that read them, then the managers that read
  // both, then the registry that indexes the managers. `provideMerge` keeps
  // every layer's output, so a service a manager keeps in `R` is still there.
  const base = Layer.provideMerge(
    Layer.mergeAll(
      WorkspaceLayerLive({
        scope,
        projectRoot: decodeAbsolutePathSync(root),
        allowUninitialized: options.settings === undefined,
      }),
      CodingAgentRepositoryLive,
      NativeWriteAuthorityLive,
      transport,
      interaction.layer,
      selection,
      executables,
      TestStepFailureConversion,
      Layer.succeed(ReleaseAgePosture, "enforce"),
      PlanInvocationTest,
      // Every AXM executable carries the official skill, so the world a
      // lifecycle specification runs in carries one too. Only a request whose
      // subject is `bundled` ever reads it.
      bundledAxmSkillAsset(),
    ),
    environment,
  );
  const withProjection = Layer.provideMerge(WorkspaceCatalogLive, base);
  // Installing resolves real sources, so the install fixtures compose the
  // production resolution layer over the same workspace catalog.
  const liveSourceProviders = Layer.provide(
    SourceHostProvidersLive,
    Layer.mergeAll(
      withProjection,
      Layer.provide(
        AxmSkillCandidateGateLive,
        makeAxmSkillCompatibilityPolicyLayer(options.cliVersion ?? "0.0.0-fixture"),
      ),
      Layer.succeed(RegistryResolutionPolicy, {
        selectVersion: resolveVersionEntryWithReleaseAge,
        decideNamedVersion: decideNamedRegistryVersion,
        namedCandidates: namedRegistryCandidates,
      }),
    ),
  );
  const resolvedSources =
    (options.sources ?? "none") === "live" ? liveSourceProviders : refusingSourceProviders;
  const withSources = Layer.provideMerge(resolvedSources, withProjection);
  const leafManagers = Layer.provideMerge(
    Layer.mergeAll(
      RuleManagerLive,
      HookManagerLive,
      KnowledgeManagerLive,
      SkillManagerLive,
      SubagentManagerLive,
      McpSecretStoreLive,
    ),
    withSources,
  );
  const withMcp = Layer.provideMerge(McpServerManagerLive, leafManagers);
  const withPack = Layer.provideMerge(PackManagerLive, withMcp);
  // The participant registry indexes the managers, and the invariant facts
  // read the registry, so both come after every manager is available.
  const withParticipants = Layer.provideMerge(ProjectionParticipantsLive, withPack);
  const services = Layer.provideMerge(
    Layer.mergeAll(ExtensionManagersLive, WorkspaceInvariantFactsLive),
    withParticipants,
  );

  return {
    root,
    home,
    workspaceRoot,
    writeFile,
    readFile,
    exists,
    /** Every file under the project root. */
    snapshot: () => snapshotUnder(root),
    /** Every file under the pinned user home. */
    homeSnapshot: () => snapshotUnder(home),
    /** What the plan interaction port was asked to present and confirm. */
    interactionState: (): ResolvePlanInteractionTestState => interaction.state,
    /** Every time the fixture was asked which extensions to install. */
    selectionCalls: (): ReadonlyArray<{
      readonly type: "skill" | "subagent";
      readonly offered: ReadonlyArray<string>;
    }> => selectionCalls,
    provide: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(services)),
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
};

export type LifecycleFixture = ReturnType<typeof makeLifecycleFixture>;

// Local package and Registry fixtures an install specification publishes into.
export {
  writeAgentSkillDirectory,
  writeLocalHookPackage,
  writeLocalKnowledgePackage,
  writeLocalRulePackage,
  writeLocalSkillPackage,
  writeLocalSubagentPackage,
  type LocalPackageFixture,
} from "./test-packages.js";
export {
  makeLifecycleRegistry,
  type LifecycleRegistry,
  type RegistryHookVersion,
  type RegistryKnowledgeVersion,
  type RegistryMcpVersion,
  type RegistryPackVersion,
  type RegistryRuleVersion,
  type RegistrySkillVersion,
  type RegistrySubagentVersion,
} from "./test-registry.js";
