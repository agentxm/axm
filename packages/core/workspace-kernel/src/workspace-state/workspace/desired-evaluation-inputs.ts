/**
 * The explicit input view one desired-state evaluation derives from.
 *
 * Collection captures every observation an evaluation uses — the selected
 * scope's settings, the other scope's settings it inherits Registry bindings
 * from, the bindings derived from both, the accepted resolutions, and one
 * observation per configured Pack document — and records the paths it read,
 * absent ones included. Pure evaluation reads nothing else, so a before/after
 * proposal and every consumer of one phase derive their answers from the same
 * facts, and freshness validation knows exactly which paths matter.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import type { Lockfile } from "../desired/lockfile/schema.js";
import type { Settings } from "../desired/settings/schema.js";
import type { ProspectivePackRef } from "./desired-state-graph.js";
import type { PackManifestObservation } from "./pack-manifests.js";

/** Where a Pack document observation came from. */
export type PackDocumentProvenance =
  | { readonly kind: "authored" }
  | {
      /** Accepted dependency authority, independent of installed Pack content. */
      readonly kind: "accepted-lock";
      readonly lockPath: string;
      readonly settingsName: string;
    }
  | {
      /** A planner's proposal that supersedes the materialized copy without publishing it. */
      readonly kind: "proposed";
      readonly ref: ProspectivePackRef;
    };

/** One configured Pack's document, observed once for the whole evaluation. */
export interface ObservedPackDocument {
  /** The `packs` settings key the document was located for. */
  readonly settingsName: string;
  /** Authored manifest path, accepted lock row, or proposal identity. */
  readonly path: string;
  readonly relativePath: string;
  readonly observation: PackManifestObservation;
  readonly provenance: PackDocumentProvenance;
}

/** The role a read path played in the collection. */
export type DesiredInputRole =
  "settings" | "inherited-settings" | "accepted-resolutions" | "pack-manifest";

/** A path the collection read, or found absent; unreadable paths are recorded too. */
export interface DesiredInputRead {
  readonly path: string;
  readonly role: DesiredInputRole;
}

export interface DesiredEvaluationInputs {
  readonly scope: WorkspaceScope;
  /** The selected scope's settings, or the proposal that replaces them. */
  readonly settings: Settings;
  /** The other scope's settings, captured once so a proposal inherits the same bindings. */
  readonly inheritedSettings: Settings;
  /** The effective default Registry an unqualified `@owner/...` locator binds to. */
  readonly defaultRegistry: string;
  /** Configured Registry source names mapped to their endpoints. */
  readonly registryEndpoints: Readonly<Record<string, URL>>;
  readonly acceptedResolutions: Lockfile;
  /** One document per configured Pack whose identity could be established, in settings order. */
  readonly packDocuments: ReadonlyArray<ObservedPackDocument>;
  /** Every path the collection depends on, for candidate freshness validation. */
  readonly readSet: ReadonlyArray<DesiredInputRead>;
}
