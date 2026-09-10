import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";
import * as SchemaTransformation from "effect/SchemaTransformation";
import {
  ExtensionNameSchema,
  ExtensionTypeSchema,
  isExtensionTypePlural,
  toExtensionType,
  toExtensionTypePlural,
  type ExtensionFqnParts,
} from "./common.js";
import { HandleSchema } from "./handle.js";

const INVALID_RELEASE_AGE_EXCLUDE_PATTERN_MESSAGE =
  "Expected @owner/<type>s/name, @owner/<type>s/*, or @owner/*";

const ReleaseAgeExcludePatternPartsSchema = Schema.Struct({
  owner: HandleSchema,
  type: Schema.Union([ExtensionTypeSchema, Schema.Literal("*")]),
  name: Schema.Union([ExtensionNameSchema, Schema.Literal("*")]),
});

const decodeReleaseAgeExcludePatternParts = Schema.decodeUnknownResult(
  ReleaseAgeExcludePatternPartsSchema,
);

export type ReleaseAgeExcludePattern = typeof ReleaseAgeExcludePatternPartsSchema.Type;

const parseReleaseAgeExcludePattern = (input: string) => {
  const segments = input.split("/");
  if (segments.length === 2) {
    const [owner, wildcard] = segments;
    if (owner === undefined || wildcard !== "*") return undefined;
    const decoded = decodeReleaseAgeExcludePatternParts({ owner, type: "*", name: "*" });
    return Result.isSuccess(decoded) ? decoded.success : undefined;
  }

  if (segments.length !== 3) return undefined;
  const [owner, typeSegment, name] = segments;
  if (
    owner === undefined ||
    typeSegment === undefined ||
    name === undefined ||
    !isExtensionTypePlural(typeSegment)
  ) {
    return undefined;
  }

  const decoded = decodeReleaseAgeExcludePatternParts({
    owner,
    type: toExtensionType(typeSegment),
    name,
  });
  return Result.isSuccess(decoded) ? decoded.success : undefined;
};

const formatReleaseAgeExcludePattern = (pattern: ReleaseAgeExcludePattern): string =>
  pattern.type === "*"
    ? `${pattern.owner}/*`
    : `${pattern.owner}/${toExtensionTypePlural(pattern.type)}/${pattern.name}`;

/** A validated publisher, type, or exact-extension release-age exemption. */
export const ReleaseAgeExcludePatternSchema = Schema.String.pipe(
  Schema.decodeTo(
    Schema.toType(ReleaseAgeExcludePatternPartsSchema),
    SchemaTransformation.transformOrFail({
      decode: (input: string) => {
        const parsed = parseReleaseAgeExcludePattern(input);
        return parsed === undefined
          ? Effect.fail(
              new SchemaIssue.Forbidden(
                { message: INVALID_RELEASE_AGE_EXCLUDE_PATTERN_MESSAGE },
                input,
              ),
            )
          : Effect.succeed(parsed);
      },
      encode: (pattern) => Effect.succeed(formatReleaseAgeExcludePattern(pattern)),
    }),
  ),
  Schema.annotate({
    identifier: "ReleaseAgeExcludePattern",
    title: "Minimum Release Age Exclude Pattern",
    description:
      "A registry extension exemption matching one exact FQN, one owner and extension type, or one owner.",
    message: INVALID_RELEASE_AGE_EXCLUDE_PATTERN_MESSAGE,
  }),
  Schema.annotateEncoded({
    examples: ["@acme/skills/code-review", "@acme/skills/*", "@acme/*"],
  }),
);

export const matchesReleaseAgeExcludePattern = (
  pattern: ReleaseAgeExcludePattern,
  identity: ExtensionFqnParts,
): boolean =>
  pattern.owner === identity.owner &&
  (pattern.type === "*" || pattern.type === identity.type) &&
  (pattern.name === "*" || pattern.name === identity.name);
