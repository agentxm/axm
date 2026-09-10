import * as Schema from "effect/Schema";

/** @experimental This API is unstable and may change without notice. */
export const EXTENSION_METADATA_MAX_BYTES = 65_536;

/** @experimental This API is unstable and may change without notice. */
export const EXTENSION_METADATA_MAX_DEPTH = 16;

const textEncoder = new TextEncoder();

/** @experimental This API is unstable and may change without notice. */
export const extensionMetadataCompactByteLength = (metadata: Schema.JsonObject): number => {
  const compact = JSON.stringify(metadata);
  return compact === undefined ? 0 : textEncoder.encode(compact).length;
};

/** @experimental This API is unstable and may change without notice. */
export const extensionMetadataContainerDepth = (metadata: Schema.JsonObject): number => {
  let maximum = 1;
  const pending: Array<{ readonly value: Schema.Json; readonly depth: number }> = [
    { value: metadata, depth: 1 },
  ];

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;

    if (Array.isArray(current.value)) {
      maximum = Math.max(maximum, current.depth);
      for (const value of current.value) {
        pending.push({ value, depth: current.depth + 1 });
      }
    } else if (typeof current.value === "object" && current.value !== null) {
      maximum = Math.max(maximum, current.depth);
      for (const value of Object.values(current.value)) {
        pending.push({ value, depth: current.depth + 1 });
      }
    }
  }

  return maximum;
};

const validateExtensionMetadata = (
  metadata: Schema.JsonObject,
): ReadonlyArray<Schema.FilterIssue> => {
  const issues: Array<Schema.FilterIssue> = [];
  const bytes = extensionMetadataCompactByteLength(metadata);
  if (bytes > EXTENSION_METADATA_MAX_BYTES) {
    issues.push(
      `metadata must use at most 65,536 compact UTF-8 JSON bytes; received ${bytes.toLocaleString("en-US")}`,
    );
  }

  const depth = extensionMetadataContainerDepth(metadata);
  if (depth > EXTENSION_METADATA_MAX_DEPTH) {
    issues.push(`metadata must have container depth at most 16; received ${depth}`);
  }
  return issues;
};

/**
 * Bounded, opaque consumer-defined metadata carried by an extension manifest.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionMetadataSchema = Schema.Record(Schema.String, Schema.Json)
  .annotate({
    identifier: "ExtensionMetadata",
    title: "Extension Metadata",
    description:
      "Opaque consumer-defined JSON metadata. The compact UTF-8 JSON representation is limited to 65,536 bytes and container depth 16.",
  })
  .check(Schema.makeFilter(validateExtensionMetadata));

/** @experimental This API is unstable and may change without notice. */
export type ExtensionMetadata = typeof ExtensionMetadataSchema.Type;
