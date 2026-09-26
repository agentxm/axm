/** Read and validate a package manifest from its owning directory. */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  ManifestError,
  ManifestIdentitySchema,
  manifestFilenameForType,
  manifestSchemaForType,
  type ExtensionManifest,
  type ManifestIdentity,
} from "./manifest-policy.js";

interface ReadManifestOptions {
  readonly defaultOwner?: Handle;
}

interface ReadManifestResult {
  readonly path: string;
  readonly fileName: string;
  readonly raw: unknown;
  readonly manifest: ExtensionManifest;
  readonly identity: ManifestIdentity;
}

const withDefaultOwner = (raw: unknown, defaultOwner: Handle | undefined): unknown =>
  defaultOwner !== undefined &&
  typeof raw === "object" &&
  raw !== null &&
  !Array.isArray(raw) &&
  !Object.hasOwn(raw, "owner")
    ? { ...raw, owner: defaultOwner }
    : raw;

export const readExtensionManifest = (
  directory: string,
  type: ExtensionType,
  options?: ReadManifestOptions,
): Effect.Effect<ReadManifestResult, ManifestError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const fileName = manifestFilenameForType(type);
    const manifestPath = path.join(directory, fileName);
    const exists = yield* fs.exists(manifestPath).pipe(
      Effect.mapError(
        (cause) =>
          new ManifestError({
            code: "manifest_unreadable",
            detail: `Manifest file "${manifestPath}" could not be inspected.`,
            cause,
          }),
      ),
    );
    if (!exists) {
      return yield* new ManifestError({
        code: "manifest_missing",
        detail: `Expected manifest file "${fileName}" not found in ${directory}.`,
      });
    }

    const content = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError(
        (cause) =>
          new ManifestError({
            code: "manifest_unreadable",
            detail: `Manifest file "${manifestPath}" could not be read.`,
            cause,
          }),
      ),
    );
    const parsed = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(
      content,
    ).pipe(
      Effect.mapError(
        (cause) =>
          new ManifestError({
            code: "manifest_invalid_json",
            detail: `Manifest file "${fileName}" contains invalid JSON.`,
            cause,
          }),
      ),
    );
    const raw = withDefaultOwner(parsed, options?.defaultOwner);
    const manifest = yield* Schema.decodeUnknownEffect(manifestSchemaForType(type))(raw).pipe(
      Effect.mapError(
        (cause) =>
          new ManifestError({
            code: "manifest_schema_invalid",
            detail: `Manifest file "${fileName}" does not conform to the ${type} manifest schema.`,
            details: SchemaIssue.makeFormatterDefault()(cause.issue),
          }),
      ),
    );
    const identity = yield* Schema.decodeUnknownEffect(ManifestIdentitySchema)(manifest).pipe(
      Effect.mapError(
        (cause) =>
          new ManifestError({
            code: "manifest_schema_invalid",
            detail: `Manifest file "${fileName}" is missing required identity fields.`,
            details: SchemaIssue.makeFormatterDefault()(cause.issue),
          }),
      ),
    );
    if (identity.type !== type) {
      return yield* new ManifestError({
        code: "manifest_schema_invalid",
        detail: `Manifest declared type "${identity.type}" disagrees with ${fileName}.`,
      });
    }
    return { path: manifestPath, fileName, raw, manifest, identity };
  });
