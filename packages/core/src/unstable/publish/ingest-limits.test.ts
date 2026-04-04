import { describe, expect, it } from "vitest";
import {
  enforceArchiveContentType,
  enforceArchiveSizeLimit,
  enforceRequestSizeLimit,
  REGISTRY_PUBLISH_MAX_ARCHIVE_BYTES,
  REGISTRY_PUBLISH_MAX_REQUEST_BYTES,
} from "./ingest-limits.js";

describe("enforceRequestSizeLimit", () => {
  it("passes when content-length is within limit", () => {
    expect(enforceRequestSizeLimit(1024)._tag).toBe("Success");
  });

  it("fails when content-length exceeds limit", () => {
    const result = enforceRequestSizeLimit(REGISTRY_PUBLISH_MAX_REQUEST_BYTES + 1);

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure.code).toBe("ingest_request_too_large");
    }
  });
});

describe("enforceArchiveSizeLimit", () => {
  it("passes when archive size equals the limit", () => {
    expect(
      enforceArchiveSizeLimit(
        REGISTRY_PUBLISH_MAX_ARCHIVE_BYTES,
        REGISTRY_PUBLISH_MAX_ARCHIVE_BYTES,
      )._tag,
    ).toBe("Success");
  });

  it("fails when archive size exceeds limit", () => {
    const result = enforceArchiveSizeLimit(REGISTRY_PUBLISH_MAX_ARCHIVE_BYTES + 1);

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure.code).toBe("ingest_archive_too_large");
    }
  });
});

describe("enforceArchiveContentType", () => {
  it("passes for application/zip", () => {
    expect(enforceArchiveContentType("application/zip")._tag).toBe("Success");
  });

  it("fails for unsupported content type", () => {
    const result = enforceArchiveContentType("application/x-tar");

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure._tag).toBe("IngestUnsupportedContentTypeError");
    }
  });
});
