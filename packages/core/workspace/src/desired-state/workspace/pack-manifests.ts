/** Materialized Pack documents observed by desired-state evaluation. */
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  PackManifestSchema,
  type PackManifest,
} from "@agentxm/extension-model/unstable/packs/manifest-schema";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import type { Settings } from "../settings/schema.js";
import type { WorkspaceLayout } from "./layout.js";
import { computePackManifestContentIdentity } from "./pack-manifest-content-identity.js";

export type PackManifestObservation =
  | { readonly status: "unavailable" }
  | { readonly status: "invalid" }
  | {
      readonly status: "decoded";
      readonly manifest: PackManifest;
      readonly contentIdentity: SourceHash;
    };

/** Interpret one Pack document with the same schema policy for every consumer. */
export const observePackManifest = (contents: string | undefined): PackManifestObservation => {
  if (contents === undefined) return { status: "unavailable" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return { status: "invalid" };
  }
  const decoded = Schema.decodeUnknownResult(PackManifestSchema)(parsed);
  if (Result.isFailure(decoded)) return { status: "invalid" };
  return {
    status: "decoded",
    manifest: decoded.success,
    contentIdentity: computePackManifestContentIdentity(decoded.success),
  };
};

export interface LocatedPackManifest {
  readonly path: string;
  readonly relativePath: string;
  /** Absence includes an unreadable document; policy reports it as unavailable. */
  readonly manifest: Effect.Effect<PackManifestObservation>;
}

export interface PackManifestsPort {
  readonly locate: (input: {
    readonly owner: Handle;
    readonly name: string;
    readonly sourceFamily: "git" | "path" | "registry" | "workspace";
    readonly relativeTo: string;
    readonly workspace:
      | { readonly layout: WorkspaceLayout }
      | { readonly baseDir: string; readonly settings: Settings };
  }) => LocatedPackManifest;
}

export class PackManifests extends Context.Service<PackManifests, PackManifestsPort>()(
  "@agentxm/workspace/desired-state/PackManifests",
) {}
