/**
 * @agentxm/workspace/lifecycle deterministic fixtures and ports.
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

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";

import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { ReleaseAgePosture } from "@agentxm/workspace-kernel/resolution";
import { InstallSelectionInteraction } from "@agentxm/workspace-kernel/operations";
import {
  ResolvePlanInteractionTest,
  type ResolvePlanInteractionTestState,
} from "@agentxm/workspace-kernel/planning/testing";
import {
  makeWorkspaceWorld,
  refusingSourceProviders,
  withAllManagers,
  withLiveSources,
} from "../testing/workspace-world.js";

import { BundledAxmSkillAsset } from "@agentxm/extension-kinds/skills";
import { StepFailureConversionTest } from "@agentxm/workspace-kernel/reconciliation/testing";

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
    /**
     * The compatibility range the asset declares. The default is the bounded,
     * wildcard-free form the install validates against; an unbounded range is
     * what an incompatible-asset example supplies deliberately.
     */
    readonly cliVersionRange?: string;
  } = {},
): Layer.Layer<BundledAxmSkillAsset> => {
  const version = options.version ?? "1.0.0";
  const nextMajor = `${Number(version.split(".")[0] ?? "0") + 1}.0.0`;
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
    cliVersionRange: options.cliVersionRange ?? `>=${version} <${nextMajor}`,
    sourceFiles: [{ path: "SKILL.md", base64: Buffer.from(body).toString("base64") }],
    runningCliVersion: options.runningCliVersion ?? version,
  });
};

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
  /**
   * The HTTP transport Registry clients use. The default refuses every
   * request; a live-Registry smoke supplies a real one.
   */
  readonly httpClient?: Layer.Layer<HttpClient.HttpClient>;
  /** The CLI version the official-skill compatibility policy evaluates against. */
  readonly cliVersion?: string;
  /**
   * How the fixture answers "which of these did you want?". The default takes
   * every candidate and records the question, so a specification can show
   * that a choice was — or was not — asked for.
   */
  readonly select?: "all" | "none";
  /**
   * Whether a confirmable risk condition can be approved at a prompt, and
   * what happens when one opens. The default has no terminal, so a
   * confirmable condition blocks naming interactive approval instead of
   * prompting. `onConfirm` runs while the answer is still pending, which is
   * where a specification observes that nothing was written before it.
   */
  readonly confirmation?: {
    readonly available?: boolean;
    readonly answer?: "approved" | "declined" | "cancelled";
    readonly onConfirm?: () => void;
  };
}

/**
 * A throwaway workspace with every service a lifecycle use case needs over
 * it, and a pinned user home so a project-scope run can be shown to leave the
 * user scope alone.
 */
export const makeLifecycleFixture = (options: LifecycleFixtureOptions = {}) => {
  const confirmation = options.confirmation;
  const interaction = ResolvePlanInteractionTest({
    isConfirmationAvailable: confirmation?.available ?? false,
    confirmApplyChanges: () =>
      Effect.sync(() => {
        confirmation?.onConfirm?.();
        return confirmation?.answer ?? "approved";
      }),
  });
  const selection = Layer.succeed(InstallSelectionInteraction, {
    select: (candidates) => Effect.succeed(options.select === "none" ? [] : candidates),
  });
  const world = makeWorkspaceWorld({
    prefix: "axm-lifecycle-",
    scope: options.scope,
    settings: options.settings,
    lockfile: options.lockfile,
    files: options.files,
    installedExecutables: options.installedExecutables,
    httpClient: options.httpClient,
    ports: Layer.mergeAll(
      interaction.layer,
      selection,
      StepFailureConversionTest,
      Layer.succeed(ReleaseAgePosture, "enforce"),
      bundledAxmSkillAsset(),
    ),
  });
  const withSources =
    (options.sources ?? "none") === "live"
      ? withLiveSources(world.projection, options.cliVersion ?? "0.0.0-fixture")
      : Layer.provideMerge(refusingSourceProviders, world.projection);
  const services = withAllManagers(withSources);
  const {
    root,
    home,
    workspaceRoot,
    writeFile,
    readFile,
    exists,
    snapshot,
    homeSnapshot,
    cleanup,
  } = world;

  return {
    root,
    home,
    workspaceRoot,
    writeFile,
    readFile,
    exists,
    /** Every file under the project root. */
    snapshot,
    /** Every file under the pinned user home. */
    homeSnapshot,
    /** What the plan interaction port was asked to present and confirm. */
    interactionState: (): ResolvePlanInteractionTestState => interaction.state,
    provide: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(services)),
    cleanup,
  };
};

export type LifecycleFixture = ReturnType<typeof makeLifecycleFixture>;
