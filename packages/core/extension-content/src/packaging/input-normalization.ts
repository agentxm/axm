import * as Effect from "effect/Effect";
import type { ExtensionName, ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  ArchiveGuardrailError,
  type ArchiveGuardrailLimits,
  defaultReadEntry,
  type ZipEntry,
  validateArchive,
} from "./archive-guardrails.js";
import {
  enforceArchiveContentType,
  enforceArchiveSizeLimit,
  type IngestLimitError,
  type IngestUnsupportedContentTypeError,
} from "./ingest-limits.js";
import {
  type ManifestError,
  type ResolvedManifest,
  resolveManifest,
  validateDeclaredManifestAlignment,
} from "./manifest-policy.js";
import type { Version } from "@agentxm/extension-model/unstable/version-constraints";
import { FilteredPackageError, validateFilteredPackage } from "./filtered-package-validation.js";

export interface DeclaredPublishIdentity {
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly version: Version;
}

export interface PublishArchiveInput {
  readonly archiveBytes: Uint8Array;
  readonly archiveContentType?: string;
  readonly clientIntegrity?: string;
}

export interface NormalizePublishInputArgs {
  readonly declaredIdentity: DeclaredPublishIdentity;
  readonly archive: PublishArchiveInput;
  readonly digestHeader?: string;
  readonly readEntry?: (
    archiveBytes: Uint8Array,
    entry: ZipEntry,
  ) => Effect.Effect<Uint8Array, ArchiveGuardrailError>;
  readonly guardrailLimits?: ArchiveGuardrailLimits;
}

export interface PublishInput {
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly version: Version;
  readonly archiveBytes: Uint8Array;
  readonly archiveContentType: string;
  readonly manifest: ResolvedManifest;
  readonly clientIntegrity?: string;
  readonly digestHeader?: string;
}

export const normalizePublishInput = (
  args: NormalizePublishInputArgs,
): Effect.Effect<
  PublishInput,
  | IngestLimitError
  | IngestUnsupportedContentTypeError
  | ArchiveGuardrailError
  | ManifestError
  | FilteredPackageError
> =>
  Effect.gen(function* () {
    const { declaredIdentity, archive, digestHeader, guardrailLimits } = args;
    const entryReader = args.readEntry ?? defaultReadEntry;

    yield* Effect.fromResult(enforceArchiveContentType(archive.archiveContentType));
    yield* Effect.fromResult(enforceArchiveSizeLimit(archive.archiveBytes.length));

    const entries = yield* validateArchive(archive.archiveBytes, guardrailLimits);

    const manifest = yield* resolveManifest({
      type: declaredIdentity.type,
      entries,
      readEntry: (fileName) => {
        const entry = entries.find((candidate) => candidate.fileName === fileName);
        if (entry === undefined) {
          return Effect.fail(
            new ArchiveGuardrailError({
              code: "malformed_archive",
              message: `Entry "${fileName}" not found in archive.`,
              entry: fileName,
            }),
          );
        }
        return entryReader(archive.archiveBytes, entry);
      },
    });

    yield* Effect.fromResult(
      validateDeclaredManifestAlignment(declaredIdentity, manifest.identity),
    );

    yield* validateFilteredPackage({
      type: declaredIdentity.type,
      entries,
      manifest,
      readEntry: (fileName) => {
        const entry = entries.find((candidate) => candidate.fileName === fileName);
        return entry === undefined
          ? Effect.fail(
              new FilteredPackageError({
                code: "required_file_missing",
                detail: `Filtered package file "${fileName}" is missing.`,
                path: fileName,
              }),
            )
          : entryReader(archive.archiveBytes, entry);
      },
    });

    return {
      owner: declaredIdentity.owner,
      type: declaredIdentity.type,
      name: declaredIdentity.name,
      version: declaredIdentity.version,
      archiveBytes: archive.archiveBytes,
      archiveContentType: archive.archiveContentType ?? "application/zip",
      manifest,
      ...(archive.clientIntegrity === undefined
        ? {}
        : { clientIntegrity: archive.clientIntegrity }),
      ...(digestHeader === undefined ? {} : { digestHeader }),
    };
  });
