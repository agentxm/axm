/** Native materialization output and adapter requirements. */
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type * as HttpClient from "effect/unstable/http/HttpClient";

import type { NativeWriteAuthority } from "@agentxm/agent-integration";
import type {
  DesiredStateReader,
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
} from "../desired-state/index.js";

/** Canonical acquisition leaves filesystem and source transport services in R. */
export type CanonicalMaterializationRequirements =
  | FileSystem.FileSystem
  | Path.Path
  | HttpClient.HttpClient
  | WorkspaceLocation
  | SettingsReader
  | LockfileReader
  | DesiredStateReader;

export type ManagerRequirements = CanonicalMaterializationRequirements | NativeWriteAuthority;

/**
 * Machine-local effects observed during the most recent materialization.
 *
 * This data is intentionally ephemeral. It supports operation output without
 * making agent-specific paths part of the shared lockfile contract.
 */
export interface MaterializationObservation {
  readonly agents: ReadonlyArray<string>;
  readonly targets: ReadonlyArray<{
    readonly path: string;
    readonly agentIds?: ReadonlyArray<string>;
  }>;
}

/** An empty observation, for transitions that projected nothing. */
export const NO_MATERIALIZATION_OBSERVATION: MaterializationObservation = {
  agents: [],
  targets: [],
};

/**
 * What native materialization observed. Each projecting kind extends this with the
 * content identity its own settings and lockfile writes need; the closure
 * recipes carry the value from `materializeInstall` to those writes and to the
 * step's artifact without inspecting the extension.
 */
export interface MaterializationFacts {
  readonly observation: MaterializationObservation;
}
