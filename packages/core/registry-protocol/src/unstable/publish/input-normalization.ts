import * as Effect from "effect/Effect";
import { inflateRawSync } from "node:zlib";
import type { ExtensionName, ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  ArchiveGuardrailError,
  type ArchiveGuardrailLimits,
  ZIP_LOCAL_SIGNATURE,
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

const LOCAL_FILE_HEADER_SIZE = 30;

export const defaultReadEntry = (
  archiveBytes: Uint8Array,
  entry: ZipEntry,
): Effect.Effect<Uint8Array, ArchiveGuardrailError> =>
  Effect.gen(function* () {
    const { localHeaderOffset, compressedSize, compressionMethod, fileName } = entry;

    if (localHeaderOffset + LOCAL_FILE_HEADER_SIZE > archiveBytes.length) {
      return yield* new ArchiveGuardrailError({
        code: "malformed_archive",
        message: `Local file header for entry "${fileName}" exceeds archive bounds.`,
        entry: fileName,
      });
    }

    const view = new DataView(
      archiveBytes.buffer,
      archiveBytes.byteOffset,
      archiveBytes.byteLength,
    );

    const signature = view.getUint32(localHeaderOffset, true);
    if (signature !== ZIP_LOCAL_SIGNATURE) {
      return yield* new ArchiveGuardrailError({
        code: "malformed_archive",
        message: `Invalid local file header signature for entry "${fileName}".`,
        entry: fileName,
      });
    }

    const fileNameLength = view.getUint16(localHeaderOffset + 26, true);
    const extraFieldLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart =
      localHeaderOffset + LOCAL_FILE_HEADER_SIZE + fileNameLength + extraFieldLength;

    if (dataStart + compressedSize > archiveBytes.length) {
      return yield* new ArchiveGuardrailError({
        code: "malformed_archive",
        message: `Compressed data for entry "${fileName}" exceeds archive bounds.`,
        entry: fileName,
      });
    }

    const compressedData = archiveBytes.slice(dataStart, dataStart + compressedSize);

    if (compressionMethod === 0) {
      return compressedData;
    }

    if (compressionMethod === 8) {
      // Cap actual decompression at the declared (guardrail-validated) size so a
      // small deflate stream cannot expand into a memory bomb, and route any
      // inflate throw into the typed error channel instead of an uncaught defect.
      const result = yield* Effect.try({
        try: () => inflateRawSync(compressedData, { maxOutputLength: entry.uncompressedSize }),
        catch: (error) => {
          const errorCode =
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            typeof error.code === "string"
              ? error.code
              : "";
          return errorCode === "ERR_BUFFER_TOO_LARGE"
            ? new ArchiveGuardrailError({
                code: "decompression_limit_exceeded",
                message: `Entry "${fileName}" decompresses beyond its declared size of ${entry.uncompressedSize} bytes.`,
                entry: fileName,
              })
            : new ArchiveGuardrailError({
                code: "malformed_archive",
                message: `Failed to decompress entry "${fileName}".`,
                entry: fileName,
              });
        },
      });
      return new Uint8Array(result.buffer, result.byteOffset, result.byteLength);
    }

    return yield* new ArchiveGuardrailError({
      code: "unsupported_compression",
      message: `Unsupported compression method ${compressionMethod} for entry "${fileName}".`,
      entry: fileName,
    });
  });

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
