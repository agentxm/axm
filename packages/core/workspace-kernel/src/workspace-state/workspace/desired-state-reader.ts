/**
 * Desired-state reader: captures the explicit input view one evaluation
 * derives from, evaluates it, and re-evaluates a captured base under a
 * proposal without publishing it. Collection reads each relevant document
 * once; evaluation reads nothing.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";

import type { PackManifest } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { LOCKFILE_VERSION, type Lockfile } from "../desired/lockfile/index.js";
import type { Settings, SourceHostConfig } from "../desired/settings/index.js";
import type { ExtensionTarget, WorkspaceStateReadFailure } from "./contracts.js";
import {
  configuredPackIdentity,
  configuredPackSourceFamily,
} from "./desired-configured-identity.js";
import type {
  DesiredEvaluationInputs,
  DesiredInputRead,
  ObservedPackDocument,
} from "./desired-evaluation-inputs.js";
import { evaluateDesiredState } from "./desired-state-evaluation.js";
import type { DesiredStateGraph, ProspectivePackRef } from "./desired-state-graph.js";
import { unresolvedPackRoutes } from "./desired-state-queries.js";
import { WorkspaceDocuments, type WorkspaceDocumentsService } from "./documents.js";
import { DesiredPackGraphIncomplete } from "./errors.js";
import {
  resolveProjectWorkspaceStatePaths,
  resolveUserWorkspaceLayout,
  type WorkspaceLayout,
} from "./layout.js";
import { WorkspaceLocation, type WorkspaceLocationService } from "./location.js";
import { computePackManifestContentIdentity } from "./pack-manifest-content-identity.js";
import { PackManifests, type PackManifestsPort } from "./pack-manifests.js";
import { mergeSources } from "./settings-reader.js";

/** Explicit candidate inputs for evaluating a proposal without publishing it. */
export interface DesiredStateCandidateInputs {
  readonly settings?: Settings;
  readonly acceptedResolutions?: Lockfile;
  readonly prospectivePacks?: ReadonlyArray<ProspectivePackRef>;
}

/** One evaluation and the input view it was derived from. */
export interface DesiredStateEvaluation {
  readonly inputs: DesiredEvaluationInputs;
  readonly graph: DesiredStateGraph;
}

export interface DesiredStateReaderService {
  /** Capture the current input view (or the candidate's explicit inputs) and evaluate it. */
  readonly evaluate: (
    options?: DesiredStateCandidateInputs,
  ) => Effect.Effect<DesiredStateEvaluation, WorkspaceStateReadFailure>;
  /** The evaluated graph alone, for readers that need no input evidence. */
  readonly graph: (
    options?: DesiredStateCandidateInputs,
  ) => Effect.Effect<DesiredStateGraph, WorkspaceStateReadFailure>;
  /**
   * Re-evaluate a captured base under proposed settings. The proposal keeps
   * the base's inherited settings, accepted resolutions, and every Pack
   * document it already observed; only a document the proposal relocates or
   * adds is read.
   */
  readonly propose: (
    base: DesiredStateEvaluation,
    settings: Settings,
  ) => Effect.Effect<DesiredStateEvaluation, WorkspaceStateReadFailure>;
  /** Whether an installed Pack's dependency maps reference the target. */
  readonly isRequiredByInstalledPack: (
    target: ExtensionTarget,
  ) => Effect.Effect<boolean, WorkspaceStateReadFailure | DesiredPackGraphIncomplete>;
}

export class DesiredStateReader extends ServiceMap.Service<
  DesiredStateReader,
  DesiredStateReaderService
>()("@agentxm/workspace-kernel/workspace-state/DesiredStateReader") {}

/** What one collection pass observes from. */
export interface CaptureDesiredStateInputsArgs {
  readonly manifests: PackManifestsPort;
  readonly baseDir: string;
  readonly scope?: WorkspaceScope;
  readonly settings: Settings;
  /** The other scope's settings; Registry bindings inherit from them. */
  readonly inheritedSettings?: Settings;
  readonly builtInSources?: ReadonlyArray<SourceHostConfig>;
  /** Explicit bindings replace derivation; a test seam supplies them directly. */
  readonly defaultRegistry?: string;
  readonly registryEndpoints?: Readonly<Record<string, URL>>;
  readonly layout?: WorkspaceLayout;
  readonly acceptedResolutions?: Lockfile;
  /** Proposed manifests that supersede the materialized copy of the Pack they name. */
  readonly prospectivePacks?: ReadonlyArray<ProspectivePackRef>;
  /** A captured view whose materialized documents are reused when still located at the same path. */
  readonly reuse?: DesiredEvaluationInputs;
  /** The authoritative documents the caller already read for this collection. */
  readonly readSet?: ReadonlyArray<DesiredInputRead>;
}

const registryEndpointsOf = (
  sources: ReadonlyArray<SourceHostConfig>,
): Readonly<Record<string, URL>> =>
  Object.fromEntries(
    sources.flatMap((source) =>
      source.type === "registry" ? [[source.name, source.location] as const] : [],
    ),
  );

/**
 * Capture the explicit input view: derive the Registry bindings from the
 * selected and inherited settings, then locate and observe each configured
 * Pack's document exactly once. A proposal's manifest is recorded with its
 * provenance instead of being read.
 */
export const captureDesiredStateInputs = (
  args: CaptureDesiredStateInputsArgs,
): Effect.Effect<DesiredEvaluationInputs> =>
  Effect.gen(function* () {
    const scope = args.scope ?? "project";
    const settings = args.settings;
    const inheritedSettings = args.inheritedSettings ?? {};
    const project = scope === "project" ? settings : inheritedSettings;
    const user = scope === "project" ? inheritedSettings : settings;
    const defaultRegistry =
      args.defaultRegistry ?? project.defaultRegistry ?? user.defaultRegistry ?? "agentxm";
    const registryEndpoints =
      args.registryEndpoints ??
      registryEndpointsOf(
        mergeSources(project.sources ?? [], user.sources ?? [], args.builtInSources ?? []),
      );
    const acceptedResolutions: Lockfile = args.acceptedResolutions ?? {
      lockfileVersion: LOCKFILE_VERSION,
      skills: {},
    };
    const prospectivePacks = args.prospectivePacks ?? [];
    const reusable = new Map(
      (args.reuse?.packDocuments ?? [])
        .filter((document) => document.provenance.kind === "materialized")
        .map((document) => [document.settingsName, document] as const),
    );

    const packDocuments: ObservedPackDocument[] = [];
    for (const [settingsName, entry] of Object.entries(settings.packs ?? {})) {
      const accepted = acceptedResolutions.packs?.[settingsName];
      const identify = (hint: ProspectivePackRef | undefined) =>
        configuredPackIdentity(
          settingsName,
          entry.source,
          settings,
          defaultRegistry,
          registryEndpoints,
          accepted,
          hint,
        );
      // A proposal applies to the entry whose identity it names.
      const proposal = prospectivePacks.find(
        (ref) => identify(ref)?.fqn === `${ref.owner}/packs/${ref.pack.name}`,
      );
      const identity = identify(proposal);
      if (identity === undefined) continue;
      const located = args.manifests.locate({
        owner: identity.owner,
        name: identity.name,
        sourceFamily: configuredPackSourceFamily(entry.source, accepted),
        relativeTo: args.baseDir,
        workspace:
          args.layout === undefined ? { baseDir: args.baseDir, settings } : { layout: args.layout },
      });
      if (proposal !== undefined) {
        const manifest: PackManifest = {
          owner: proposal.owner,
          type: "pack",
          name: proposal.pack.name,
          version: proposal.version,
          dependencies: proposal.pack.dependencies,
        };
        packDocuments.push({
          settingsName,
          path: located.path,
          relativePath: located.relativePath,
          observation: {
            status: "decoded",
            manifest,
            contentIdentity: computePackManifestContentIdentity(manifest),
          },
          provenance: { kind: "proposed", ref: proposal },
        });
        continue;
      }
      const reused = reusable.get(settingsName);
      if (reused !== undefined && reused.path === located.path) {
        packDocuments.push(reused);
        continue;
      }
      const observation = yield* located.manifest;
      packDocuments.push({
        settingsName,
        path: located.path,
        relativePath: located.relativePath,
        observation,
        provenance: { kind: "materialized" },
      });
    }

    return {
      scope,
      settings,
      inheritedSettings,
      defaultRegistry,
      registryEndpoints,
      acceptedResolutions,
      packDocuments,
      readSet: [
        ...(args.readSet ?? []),
        ...packDocuments.flatMap((document) =>
          document.provenance.kind === "materialized"
            ? [{ path: document.path, role: "pack-manifest" as const }]
            : [],
        ),
      ],
    };
  });

export const makeDesiredStateReader = (
  location: WorkspaceLocationService,
  documents: WorkspaceDocumentsService,
  manifests: PackManifestsPort,
  path: Path.Path,
): DesiredStateReaderService => {
  const inheritedScope: WorkspaceScope = location.scope === "project" ? "user" : "project";
  const inheritedSettingsPath =
    location.scope === "project"
      ? resolveUserWorkspaceLayout(location.userHome).pipe(
          Effect.map((layout) => layout.settingsPath),
          Effect.provideService(Path.Path, path),
        )
      : Effect.succeed(resolveProjectWorkspaceStatePaths(path, location.projectRoot).settingsPath);
  const authoritativeReads = (inheritedPath: string): ReadonlyArray<DesiredInputRead> => [
    { path: location.settingsPath, role: "settings" },
    { path: inheritedPath, role: "inherited-settings" },
    { path: location.lockPath, role: "accepted-resolutions" },
  ];

  const evaluate: DesiredStateReaderService["evaluate"] = (options) =>
    Effect.gen(function* () {
      const settings = options?.settings ?? (yield* documents.settings());
      const inheritedSettings = yield* documents.settings(inheritedScope);
      const layout = yield* Ref.get(location.layout);
      const acceptedResolutions =
        options?.acceptedResolutions ?? (yield* documents.acceptedResolutions);
      const inputs = yield* captureDesiredStateInputs({
        manifests,
        baseDir: location.baseDir,
        scope: location.scope,
        settings,
        inheritedSettings,
        builtInSources: location.builtInSources,
        layout,
        acceptedResolutions,
        ...(options?.prospectivePacks === undefined
          ? {}
          : { prospectivePacks: options.prospectivePacks }),
        readSet: authoritativeReads(yield* inheritedSettingsPath),
      });
      return { inputs, graph: evaluateDesiredState(inputs) };
    }).pipe(Effect.withSpan("DesiredStateReader.evaluate"));

  const graph: DesiredStateReaderService["graph"] = (options) =>
    Effect.map(evaluate(options), (evaluation) => evaluation.graph);

  const propose: DesiredStateReaderService["propose"] = (base, settings) =>
    Effect.gen(function* () {
      const layout = yield* Ref.get(location.layout);
      const inputs = yield* captureDesiredStateInputs({
        manifests,
        baseDir: location.baseDir,
        scope: base.inputs.scope,
        settings,
        inheritedSettings: base.inputs.inheritedSettings,
        builtInSources: location.builtInSources,
        layout,
        acceptedResolutions: base.inputs.acceptedResolutions,
        reuse: base.inputs,
        readSet: base.inputs.readSet.filter((read) => read.role !== "pack-manifest"),
      });
      return { inputs, graph: evaluateDesiredState(inputs) };
    }).pipe(Effect.withSpan("DesiredStateReader.propose"));

  return {
    evaluate,
    graph,
    propose,
    isRequiredByInstalledPack: (target) =>
      Effect.gen(function* () {
        if (target.type === "pack") return false;
        const current = yield* graph();
        // A negative answer needs every active Pack's routes established.
        if (unresolvedPackRoutes(current).length > 0) {
          return yield* new DesiredPackGraphIncomplete();
        }
        return current.nodes.some(
          (node) =>
            node.type === target.type &&
            node.name === target.name &&
            node.origins.some((origin) => origin.type === "pack"),
        );
      }),
  };
};

export const DesiredStateReaderLive: Layer.Layer<
  DesiredStateReader,
  never,
  WorkspaceLocation | WorkspaceDocuments | PackManifests | Path.Path
> = Layer.effect(
  DesiredStateReader,
  Effect.gen(function* () {
    return makeDesiredStateReader(
      yield* WorkspaceLocation,
      yield* WorkspaceDocuments,
      yield* PackManifests,
      yield* Path.Path,
    );
  }),
);
