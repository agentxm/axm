import * as Data from "effect/Data";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { ExtensionFqnSchema, parseExtensionFqnParts } from "../extensions/common.js";

const KNOWLEDGE_BUNDLE_FQN_MESSAGE =
  "Expected a Knowledge bundle FQN in @owner/knowledge/name form";
const CONCEPT_ID_MESSAGE = "Expected a non-empty safe bundle-relative concept ID without .md";
const REVISION_MESSAGE = "Expected an opaque SHA-256 revision";

export const KnowledgeBundleFqnSchema = ExtensionFqnSchema.check(
  Schema.makeFilter((value: string) =>
    parseExtensionFqnParts(value)?.type === "knowledge" ? undefined : KNOWLEDGE_BUNDLE_FQN_MESSAGE,
  ),
).annotate({
  identifier: "KnowledgeBundleFqn",
  title: "Knowledge Bundle FQN",
  description: "A fully qualified Knowledge bundle identity.",
  message: KNOWLEDGE_BUNDLE_FQN_MESSAGE,
});

export type KnowledgeBundleFqn = typeof KnowledgeBundleFqnSchema.Type;

export const KnowledgeConceptIdSchema = Schema.String.check(
  Schema.makeFilter((value: string) => {
    if (
      value.length === 0 ||
      value.startsWith("/") ||
      value.endsWith("/") ||
      value.includes("\\") ||
      value.toLowerCase().endsWith(".md") ||
      value
        .split("/")
        .some((segment) => segment.length === 0 || segment === "." || segment === "..")
    ) {
      return CONCEPT_ID_MESSAGE;
    }
    return undefined;
  }),
).annotate({
  identifier: "KnowledgeConceptId",
  title: "Knowledge Concept ID",
  description: "A bundle-relative Markdown path without the .md suffix.",
  message: CONCEPT_ID_MESSAGE,
});

export type KnowledgeConceptId = typeof KnowledgeConceptIdSchema.Type;

export const KnowledgeRevisionSchema = Schema.String.check(
  Schema.isPattern(/^sha256:[0-9a-f]{64}$/u, { message: REVISION_MESSAGE }),
).annotate({
  identifier: "KnowledgeRevision",
  title: "Knowledge Content Revision",
  description: "An opaque deterministic content revision.",
  message: REVISION_MESSAGE,
});

export type KnowledgeRevision = typeof KnowledgeRevisionSchema.Type;

export const ConceptRefSchema = Schema.Struct({
  bundle: KnowledgeBundleFqnSchema,
  conceptId: KnowledgeConceptIdSchema,
}).annotate({
  identifier: "ConceptRef",
  title: "Knowledge Concept Reference",
  description: "Logical Knowledge concept identity: bundle FQN plus concept ID.",
});

export type ConceptRef = typeof ConceptRefSchema.Type;

export const ResolvedConceptRefSchema = Schema.Struct({
  bundle: KnowledgeBundleFqnSchema,
  conceptId: KnowledgeConceptIdSchema,
  bundleVersion: Schema.String.check(Schema.isNonEmpty()),
  bundleFingerprint: KnowledgeRevisionSchema,
  contentRevision: KnowledgeRevisionSchema,
}).annotate({
  identifier: "ResolvedConceptRef",
  title: "Resolved Knowledge Concept Reference",
  description: "Logical concept identity resolved to one bundle and content revision.",
});

export type ResolvedConceptRef = typeof ResolvedConceptRefSchema.Type;

export class ConceptRefInvalidError extends Data.TaggedError("ConceptRefInvalidError")<{
  readonly input: string;
}> {}

const decodeConceptRef = Schema.decodeUnknownResult(ConceptRefSchema);

const decodeComponent = (value: string): string | undefined => {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
};

const validatedRef = (input: string, bundle: string, conceptId: string) => {
  const decoded = decodeConceptRef({ bundle, conceptId });
  return Result.isSuccess(decoded)
    ? Result.succeed(decoded.success)
    : Result.fail(new ConceptRefInvalidError({ input }));
};

/** Parse a compact `FQN#concept` or canonical AgentXM HTTPS concept reference. */
export const parseConceptRef = (
  input: string,
): Result.Result<ConceptRef, ConceptRefInvalidError> => {
  if (input.startsWith("https://")) {
    try {
      const url = new URL(input);
      const marker = "/concepts/";
      const markerIndex = url.pathname.indexOf(marker);
      if (
        url.origin !== "https://agentxm.ai" ||
        url.username.length > 0 ||
        url.password.length > 0 ||
        url.search.length > 0 ||
        url.hash.length > 0 ||
        markerIndex <= 0
      ) {
        return Result.fail(new ConceptRefInvalidError({ input }));
      }
      const bundle = decodeComponent(url.pathname.slice(1, markerIndex));
      const conceptId = decodeComponent(url.pathname.slice(markerIndex + marker.length));
      return bundle === undefined || conceptId === undefined
        ? Result.fail(new ConceptRefInvalidError({ input }))
        : validatedRef(input, bundle, conceptId);
    } catch {
      return Result.fail(new ConceptRefInvalidError({ input }));
    }
  }

  const separator = input.indexOf("#");
  if (separator <= 0) return Result.fail(new ConceptRefInvalidError({ input }));
  const bundle = input.slice(0, separator);
  const conceptId = decodeComponent(input.slice(separator + 1));
  return conceptId === undefined
    ? Result.fail(new ConceptRefInvalidError({ input }))
    : validatedRef(input, bundle, conceptId);
};

export type ConceptRefFormat = "compact" | "url";

export const formatConceptRef = (ref: ConceptRef, format: ConceptRefFormat = "compact"): string =>
  format === "compact"
    ? `${ref.bundle}#${encodeURIComponent(ref.conceptId)}`
    : `https://agentxm.ai/${ref.bundle}/concepts/${ref.conceptId
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`;
