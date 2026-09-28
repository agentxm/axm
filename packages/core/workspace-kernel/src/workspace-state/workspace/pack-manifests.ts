/** Materialized Pack documents observed by desired-state evaluation. */
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  PackManifestSchema,
  type PackManifest,
} from "@agentxm/extension-model/unstable/packs/manifest-schema";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import type { Settings } from "../desired/settings/schema.js";
import type { WorkspaceLayout } from "./layout.js";
import { computePackManifestContentIdentity } from "./pack-manifest-content-identity.js";

/** One schema violation located by its document path; the offending value is never carried. */
export interface PackManifestSchemaIssue {
  readonly path: string;
  readonly message: string;
}

/**
 * What observing one Pack document established. Absence, an I/O failure,
 * unparseable text, and a schema violation are distinct facts: a valid empty
 * manifest proves its Pack declares no members, and none of the others does.
 */
export type PackManifestObservation =
  | { readonly status: "absent" }
  | {
      readonly status: "unreadable";
      /** The normalized failure tag, never the raw error text. */
      readonly reason: string;
    }
  | { readonly status: "malformed" }
  | { readonly status: "schema-invalid"; readonly issues: ReadonlyArray<PackManifestSchemaIssue> }
  | {
      readonly status: "decoded";
      readonly manifest: PackManifest;
      readonly contentIdentity: SourceHash;
    };

const MAX_SCHEMA_ISSUES = 5;

/** The default leaf sentence with any rendering of the input value removed. */
const sanitizedLeafHook: SchemaIssue.LeafHook = (issue) =>
  SchemaIssue.defaultLeafHook(issue)
    .replace(/, got .*$/su, "")
    .replace(/^Invalid data .*$/su, "Invalid value")
    .replace(/^Unexpected key with value .*$/su, "Unexpected key")
    .replace(/ the input .*$/su, "");

const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1({ leafHook: sanitizedLeafHook });

/** Each violation's document path and expected shape, without the values found there. */
const schemaIssuesOf = (issue: SchemaIssue.Issue): ReadonlyArray<PackManifestSchemaIssue> =>
  formatIssues(issue)
    .issues.slice(0, MAX_SCHEMA_ISSUES)
    .map((item) => ({
      path: (item.path ?? [])
        .map((segment) =>
          typeof segment === "object" && segment !== null && "key" in segment
            ? String(segment.key)
            : String(segment),
        )
        .join("."),
      message: item.message,
    }));

/** Interpret one Pack document's text with the same schema policy for every consumer. */
export const decodePackManifestDocument = (
  contents: string,
): Exclude<PackManifestObservation, { readonly status: "absent" | "unreadable" }> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return { status: "malformed" };
  }
  const decoded = Schema.decodeUnknownResult(PackManifestSchema)(parsed);
  if (Result.isFailure(decoded)) {
    return { status: "schema-invalid", issues: schemaIssuesOf(decoded.failure.issue) };
  }
  return {
    status: "decoded",
    manifest: decoded.success,
    contentIdentity: computePackManifestContentIdentity(decoded.success),
  };
};

/** Observe a document that is absent, or whose text was read. */
export const observePackManifest = (contents: string | undefined): PackManifestObservation =>
  contents === undefined ? { status: "absent" } : decodePackManifestDocument(contents);

export interface LocatedPackManifest {
  readonly path: string;
  readonly relativePath: string;
  /** The observation; every read failure is a truthful variant, never a defect. */
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
  "@agentxm/workspace-kernel/workspace-state/PackManifests",
) {}
