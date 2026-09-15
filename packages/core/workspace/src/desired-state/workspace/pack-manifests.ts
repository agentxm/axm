/** Materialized Pack documents observed by desired-state evaluation. */
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import type { Settings } from "../settings/schema.js";
import type { WorkspaceLayout } from "./layout.js";

export interface LocatedPackManifest {
  readonly path: string;
  readonly relativePath: string;
  /** Absence includes an unreadable document; policy reports it as unavailable. */
  readonly contents: Effect.Effect<string | undefined>;
}

export interface PackManifestsPort {
  readonly locate: (input: {
    readonly owner: Handle;
    readonly name: string;
    readonly sourceName: string;
    readonly relativeTo: string;
    readonly workspace:
      | { readonly layout: WorkspaceLayout }
      | { readonly baseDir: string; readonly settings: Settings };
  }) => LocatedPackManifest;
}

export class PackManifests extends Context.Service<PackManifests, PackManifestsPort>()(
  "@agentxm/workspace/desired-state/PackManifests",
) {}
