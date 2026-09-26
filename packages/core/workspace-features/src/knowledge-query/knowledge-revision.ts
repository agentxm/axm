import { createHash } from "node:crypto";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { KnowledgeProjectedConcept } from "./knowledge-projection.js";
import {
  KnowledgeRevisionSchema,
  type KnowledgeRevision,
} from "@agentxm/extension-model/unstable/knowledge/concept-ref";

export interface KnowledgeCorpusSource {
  readonly bundle: string;
  readonly relativePath: string;
  /** Filesystem observation metadata is explicitly excluded from the fingerprint. */
  readonly modifiedAt?: number;
}

export interface CapturedKnowledgeSource extends KnowledgeCorpusSource {
  readonly bytes: Uint8Array;
  readonly sourceRevision: KnowledgeRevision;
}

export interface CapturedKnowledgeCorpus {
  readonly fingerprint: KnowledgeRevision;
  readonly sources: ReadonlyArray<CapturedKnowledgeSource>;
}

export class KnowledgeCorpusChangingError extends Data.TaggedError("KnowledgeCorpusChangingError")<{
  readonly attempts: number;
}> {}

const decodeRevision = Schema.decodeUnknownSync(KnowledgeRevisionSchema);

const revision = (domain: string, parts: ReadonlyArray<string | Uint8Array>): KnowledgeRevision => {
  const hash = createHash("sha256");
  const update = (part: string | Uint8Array): void => {
    const bytes = typeof part === "string" ? new TextEncoder().encode(part) : part;
    hash.update(String(bytes.byteLength));
    hash.update(":");
    hash.update(bytes);
    hash.update(";");
  };
  update(domain);
  for (const part of parts) update(part);
  return decodeRevision(`sha256:${hash.digest("hex")}`);
};

const normalizedRelativePath = (value: string): string =>
  value
    .replace(/\\/gu, "/")
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".")
    .join("/");

const compareSource = (left: KnowledgeCorpusSource, right: KnowledgeCorpusSource): number =>
  left.bundle.localeCompare(right.bundle) ||
  normalizedRelativePath(left.relativePath).localeCompare(
    normalizedRelativePath(right.relativePath),
  );

export const computeKnowledgeSourceRevision = (bytes: Uint8Array): KnowledgeRevision =>
  revision("axm-knowledge-source-revision-v1", [bytes]);

export const computeKnowledgeCorpusFingerprint = (
  sources: ReadonlyArray<CapturedKnowledgeSource>,
): KnowledgeRevision => {
  const parts: Array<string | Uint8Array> = [];
  for (const source of [...sources].sort(compareSource)) {
    parts.push(source.bundle, normalizedRelativePath(source.relativePath), source.bytes);
  }
  return revision("axm-knowledge-corpus-fingerprint-v1", parts);
};

const canonicalValue = (value: unknown, seen = new Map<object, number>()): string => {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return `string:${value.length}:${value}`;
    case "number":
      return `number:${Object.is(value, -0) ? "-0" : String(value)}`;
    case "boolean":
      return value ? "boolean:true" : "boolean:false";
    case "undefined":
      return "undefined";
    case "bigint":
      return `bigint:${String(value)}`;
    case "object":
      if (value instanceof Uint8Array) {
        return `bytes:${value.byteLength}:${Buffer.from(value).toString("base64")}`;
      }
      if (seen.has(value)) return `reference:${seen.get(value)}`;
      seen.set(value, seen.size);
      if (Array.isArray(value)) {
        return `array:[${value.map((entry) => canonicalValue(entry, seen)).join(",")}]`;
      }
      return `object:{${Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => `${canonicalValue(key, seen)}=${canonicalValue(entry, seen)}`)
        .join(",")}}`;
    default:
      return `${typeof value}:${String(value)}`;
  }
};

export const computeKnowledgeProjectionRevision = (
  concept: KnowledgeProjectedConcept,
): KnowledgeRevision => revision("axm-knowledge-projection-revision-v1", [canonicalValue(concept)]);

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength && left.every((byte, index) => right[index] === byte);

const captureOnce = <E>(
  sources: ReadonlyArray<KnowledgeCorpusSource>,
  readSource: (source: KnowledgeCorpusSource) => Effect.Effect<Uint8Array, E>,
): Effect.Effect<ReadonlyArray<CapturedKnowledgeSource>, E> =>
  Effect.forEach(
    [...sources].sort(compareSource),
    (source) =>
      readSource(source).pipe(
        Effect.map((bytes) => ({
          ...source,
          relativePath: normalizedRelativePath(source.relativePath),
          bytes,
          sourceRevision: computeKnowledgeSourceRevision(bytes),
        })),
      ),
    { concurrency: 16 },
  );

/**
 * Capture one internally consistent corpus. Every source is read twice; a
 * changing source retries the complete capture and never yields a mixed view.
 */
export const captureKnowledgeCorpus = <E>(
  sources: ReadonlyArray<KnowledgeCorpusSource>,
  readSource: (source: KnowledgeCorpusSource) => Effect.Effect<Uint8Array, E>,
  options?: { readonly maxAttempts?: number },
): Effect.Effect<CapturedKnowledgeCorpus, E | KnowledgeCorpusChangingError> =>
  Effect.gen(function* () {
    const maxAttempts = Math.max(1, options?.maxAttempts ?? 3);
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const captured = yield* captureOnce(sources, readSource);
      const confirmed = yield* captureOnce(sources, readSource);
      if (
        captured.length === confirmed.length &&
        captured.every(
          (source, index) =>
            source.bundle === confirmed[index]?.bundle &&
            source.relativePath === confirmed[index]?.relativePath &&
            equalBytes(source.bytes, confirmed[index]?.bytes ?? new Uint8Array()),
        )
      ) {
        return {
          fingerprint: computeKnowledgeCorpusFingerprint(captured),
          sources: captured,
        };
      }
    }
    return yield* new KnowledgeCorpusChangingError({ attempts: maxAttempts });
  });
