import * as Data from "effect/Data";
import * as Result from "effect/Result";

export const REGISTRY_PUBLISH_MAX_REQUEST_BYTES = 35 * 1024 * 1024;
export const REGISTRY_PUBLISH_MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;

export class IngestLimitError extends Data.TaggedError("IngestLimitError")<{
  readonly code:
    | "ingest_request_too_large"
    | "ingest_archive_too_large"
    | "ingest_decompression_limit";
  readonly detail: string;
  readonly limit?: number;
  readonly actual?: number;
}> {}

export class IngestUnsupportedContentTypeError extends Data.TaggedError(
  "IngestUnsupportedContentTypeError",
)<{
  readonly detail: string;
}> {}

export const enforceRequestSizeLimit = (
  contentLength: number | undefined,
  maxBytes: number = REGISTRY_PUBLISH_MAX_REQUEST_BYTES,
): Result.Result<void, IngestLimitError> => {
  if (contentLength !== undefined && contentLength > maxBytes) {
    return Result.fail(
      new IngestLimitError({
        code: "ingest_request_too_large",
        detail: `Request body exceeds maximum size of ${maxBytes} bytes.`,
        limit: maxBytes,
        actual: contentLength,
      }),
    );
  }

  return Result.void;
};

export const enforceArchiveSizeLimit = (
  archiveBytes: number,
  maxBytes: number = REGISTRY_PUBLISH_MAX_ARCHIVE_BYTES,
): Result.Result<void, IngestLimitError> => {
  if (archiveBytes > maxBytes) {
    return Result.fail(
      new IngestLimitError({
        code: "ingest_archive_too_large",
        detail: `Archive exceeds maximum size of ${maxBytes} bytes.`,
        limit: maxBytes,
        actual: archiveBytes,
      }),
    );
  }

  return Result.void;
};

const V1_ARCHIVE_CONTENT_TYPES = new Set(["application/zip"]);

export const enforceArchiveContentType = (
  contentType: string | undefined,
): Result.Result<void, IngestUnsupportedContentTypeError> => {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase();
  if (!normalized || !V1_ARCHIVE_CONTENT_TYPES.has(normalized)) {
    return Result.fail(
      new IngestUnsupportedContentTypeError({
        detail: `Unsupported archive content type: ${contentType ?? "(none)"}. Supported: application/zip.`,
      }),
    );
  }

  return Result.void;
};
