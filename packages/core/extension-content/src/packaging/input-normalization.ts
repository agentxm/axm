import * as Effect from "effect/Effect";
import type { ExtensionName, ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  ArchiveGuardrailError,
  type ArchiveGuardrailLimits,
  ValidatedArchive,
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

interface DeclaredPublishIdentity {
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly version: Version;
}

export interface PublishArchiveInput {
  readonly content: Uint8Array | ValidatedArchive;
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
  readonly archive: ValidatedArchive;
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
    yield* Effect.fromResult(enforceArchiveContentType(archive.archiveContentType));
    yield* Effect.fromResult(enforceArchiveSizeLimit(archive.content.byteLength));
    yield* Effect.annotateCurrentSpan(
      "axm.work.reused",
      archive.content instanceof ValidatedArchive,
    );
    const admitted = yield* validateArchive(archive.content, guardrailLimits);
    const { entries } = admitted;
    // Only the built-in reader has immutable input semantics. A custom reader
    // remains a fresh call and receives its own byte copy on every invocation.
    const members = new Map<string, Uint8Array>();
    const readEntry = (fileName: string): Effect.Effect<Uint8Array, ArchiveGuardrailError> =>
      Effect.gen(function* () {
        const customReader = args.readEntry;
        if (customReader !== undefined) {
          const entry = admitted.entry(fileName);
          if (entry === undefined)
            return yield* new ArchiveGuardrailError({
              code: "malformed_archive",
              message: `Entry "${fileName}" not found in archive.`,
              entry: fileName,
            });
          return yield* customReader(admitted.copyBytes(), entry);
        }
        const cached = members.get(fileName);
        if (cached !== undefined) return cached;
        const bytes = yield* admitted.readEntry(fileName);
        members.set(fileName, bytes);
        return bytes;
      });

    const manifest = yield* resolveManifest({
      type: declaredIdentity.type,
      entries,
      readEntry,
    });

    yield* Effect.fromResult(
      validateDeclaredManifestAlignment(declaredIdentity, manifest.identity),
    );

    yield* validateFilteredPackage({
      type: declaredIdentity.type,
      entries,
      manifest,
      readEntry,
    });

    return {
      owner: declaredIdentity.owner,
      type: declaredIdentity.type,
      name: declaredIdentity.name,
      version: declaredIdentity.version,
      archive: admitted,
      archiveContentType: archive.archiveContentType ?? "application/zip",
      manifest,
      ...(archive.clientIntegrity === undefined
        ? {}
        : { clientIntegrity: archive.clientIntegrity }),
      ...(digestHeader === undefined ? {} : { digestHeader }),
    };
  }).pipe(Effect.withSpan("axm.archive.normalize"));
