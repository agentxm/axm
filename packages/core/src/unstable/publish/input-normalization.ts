import * as Effect from "effect/Effect";
import { inflateRawSync } from "node:zlib";
import type { ExtensionType } from "../extensions/index.js";
import type { Handle } from "../extensions/handle.js";
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

export interface DeclaredPublishIdentity {
  readonly owner: Handle;
  readonly extensionType: ExtensionType;
  readonly name: string;
  readonly version: string;
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
  readonly extensionType: ExtensionType;
  readonly name: string;
  readonly version: string;
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
      const result = inflateRawSync(compressedData);
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
  IngestLimitError | IngestUnsupportedContentTypeError | ArchiveGuardrailError | ManifestError
> =>
  Effect.gen(function* () {
    const { declaredIdentity, archive, digestHeader, guardrailLimits } = args;
    const entryReader = args.readEntry ?? defaultReadEntry;

    yield* enforceArchiveContentType(archive.archiveContentType);
    yield* enforceArchiveSizeLimit(archive.archiveBytes.length);

    const entries = yield* validateArchive(archive.archiveBytes, guardrailLimits);

    const manifest = yield* resolveManifest({
      extensionType: declaredIdentity.extensionType,
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

    yield* validateDeclaredManifestAlignment(declaredIdentity, manifest.identity);

    return {
      owner: declaredIdentity.owner,
      extensionType: declaredIdentity.extensionType,
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
