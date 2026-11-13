/** Reader ports and phase identity, independent of their live implementations. */
import type * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type * as Option from "effect/Option";
import type { AbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import type { ExtensionVisibility } from "@agentxm/extension-model/unstable/extensions/common";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { ScopedReleaseAgeExcludePattern } from "@agentxm/extension-model/unstable/extensions/release-age";
import type { NativeDirectoryInputs, NativeObservationView } from "../../locations/index.js";
import type { ResolvedKnowledgeDiscoveryConfig } from "../desired/discovery-config.js";
import type {
  Settings,
  SourceHostConfig,
  InstructionsConfigValue,
  MinimumReleaseAge,
} from "../desired/settings/index.js";
import type { Lockfile } from "../desired/lockfile/schema.js";
import type { LockfileValidationError } from "../desired/lockfile/errors.js";
import type { WorkspaceRootEscape } from "../observed/errors.js";
import type { ExtensionInventory } from "../observed/extensions/inventory.js";
import type { WorkspaceRecordRow } from "../observed/records.js";
import type { DesiredPackGraphIncomplete } from "./errors.js";
import type { SettingsEntriesOf, LockEntriesOf, LockEntryByType } from "./entry-accessors.js";
import type {
  ExtensionTarget,
  LockfileState,
  WorkspaceSettingsReadFailure,
  WorkspaceLockfileReadFailure,
  WorkspaceStateReadFailure,
} from "./contracts.js";
import type { DesiredEvaluationInputs } from "./desired-evaluation-inputs.js";
import type { DesiredStateGraph, ProspectivePackRef } from "./desired-state-graph.js";

type SettingsRead<A> = Effect.Effect<A, WorkspaceSettingsReadFailure>;
type LockfileRead<A> = Effect.Effect<A, WorkspaceLockfileReadFailure>;
type RecordsRead<A> = Effect.Effect<
  A,
  WorkspaceStateReadFailure,
  FileSystem.FileSystem | Path.Path
>;
type RegistrySourceHost = Extract<SourceHostConfig, { readonly type: "registry" }>;
interface BoundRegistrySource {
  /** The source the locator spells, or the effective default Registry when it spells none. */
  readonly sourceName: string;
  /** The configured Registry host of that name, when one is configured. */
  readonly host: Option.Option<RegistrySourceHost>;
}

export interface SettingsReaderService {
  /** The selected scope's settings, defaulting when the file is absent. */
  readonly settings: SettingsRead<Settings>;
  /** Merged sources from project, user-scope, and built-in defaults. Shared only within the active read phase. */
  readonly configuredSources: SettingsRead<ReadonlyArray<SourceHostConfig>>;
  readonly sourceByName: (name: string) => SettingsRead<Option.Option<SourceHostConfig>>;
  readonly registrySourceHosts: SettingsRead<
    ReadonlyArray<Extract<SourceHostConfig, { type: "registry" }>>
  >;
  /** defaultRegistry: project settings, then user-scope settings, then agentxm. */
  readonly defaultRegistry: SettingsRead<string>;
  /**
   * The configured Registry a parsed locator names: its spelled source, or
   * the effective default Registry when it spells none, with that source's
   * configured host.
   */
  readonly bindRegistrySource: (locator: {
    readonly sourceName: Option.Option<string>;
  }) => SettingsRead<BoundRegistrySource>;
  /** Owner: project settings, then user-scope settings, then none. */
  readonly owner: SettingsRead<Option.Option<Handle>>;
  /** Repository publication default for this exact workspace scope. */
  readonly publishDefaultVisibility: SettingsRead<Option.Option<ExtensionVisibility>>;
  /** minimumReleaseAge: project settings, then user-scope settings, then the default. */
  readonly minimumReleaseAge: SettingsRead<MinimumReleaseAge>;
  /** minimumReleaseAgeExclude with the same precedence; an explicit [] wins. */
  readonly minimumReleaseAgeExclude: SettingsRead<ReadonlyArray<ScopedReleaseAgeExcludePattern>>;
  readonly configuredAgents: SettingsRead<ReadonlyArray<string>>;
  readonly instructionsConfig: SettingsRead<Option.Option<InstructionsConfigValue>>;
  readonly knowledgeDiscoveryConfig: SettingsRead<ResolvedKnowledgeDiscoveryConfig>;
  /** The configured entries of one type, defaulting to `{}`. */
  readonly entries: <T extends InstallableExtensionType>(
    type: T,
  ) => SettingsRead<SettingsEntriesOf<T>>;
}

export interface LockfileReaderService {
  /** The selected scope's lockfile, empty when the file is absent. */
  readonly lockfile: LockfileRead<Lockfile>;
  /** Probe lockfile health without mutating disk: ok | missing | invalid. */
  readonly state: Effect.Effect<LockfileState, LockfileValidationError | WorkspaceRootEscape>;
  /** The accepted entries of one type, defaulting to `{}`. */
  readonly entries: <T extends InstallableExtensionType>(type: T) => LockfileRead<LockEntriesOf<T>>;
  /** One accepted entry by its lock key (the workspace name, or the MCP resolution key). */
  readonly entry: <T extends InstallableExtensionType>(
    type: T,
    name: string,
  ) => LockfileRead<Option.Option<LockEntryByType[T]>>;
  /**
   * The accepted resolution one desired extension resolves to by its type and
   * workspace name. Every type keys its row by that name except an MCP
   * connection, whose local name resolves to the shared resolution of its
   * source; an inline or undesired connection has none.
   */
  readonly acceptedEntry: <T extends InstallableExtensionType>(
    type: T,
    name: string,
  ) => Effect.Effect<Option.Option<LockEntryByType[T]>, WorkspaceStateReadFailure>;
}

/** Explicit immutable document inputs for evaluating a proposal. */
interface DesiredStateCandidateInputs {
  readonly settings?: Settings;
  readonly acceptedResolutions?: Lockfile;
  readonly prospectivePacks?: ReadonlyArray<ProspectivePackRef>;
}

/** One evaluation and the input evidence it owns. */
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
   * the base's inherited settings, accepted resolutions, and every authored Pack
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

export interface WorkspaceRecordsService {
  /** Inventory across every installable extension type, or a selected set of types. */
  readonly getInventory: (options: {
    readonly types?: ReadonlyArray<InstallableExtensionType>;
  }) => RecordsRead<ExtensionInventory>;
  /** Physical inventory and associations; native currency requires explicit details. */
  readonly getExtensionInventory: (
    type: InstallableExtensionType,
    options: { readonly agents?: ReadonlyArray<string>; readonly details?: boolean },
  ) => RecordsRead<ExtensionInventory>;
  /** Lifecycle records without configured-agent outcomes. */
  readonly rows: (type: InstallableExtensionType) => RecordsRead<ReadonlyArray<WorkspaceRecordRow>>;
}

/** The scopes and source view that identify a workspace's document cells. */
export interface StateCellPaths {
  readonly initialSettings?: Settings;
  readonly observationView?: NativeObservationView;
  readonly scope: WorkspaceScope;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly projectRoot: AbsolutePath;
  readonly userHome: AbsolutePath;
  readonly projectRuntimeDir: string;
  readonly userRuntimeDir: string;
}

export interface WorkspaceReadViewReaders {
  readonly settings: SettingsReaderService;
  readonly locks: LockfileReaderService;
  readonly desired: DesiredStateReaderService;
}
