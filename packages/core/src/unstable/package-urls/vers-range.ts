import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";
import * as SchemaTransformation from "effect/SchemaTransformation";

const VERS_PREFIX = "vers:";

const SENTINEL_SCHEMES = [
  "all",
  "none",
  "semver",
  "generic",
  "intdot",
  "lexicographic",
  "datetime",
] as const;

export const CONCRETE_ECOSYSTEM_SCHEMES = [
  "apk",
  "bazel",
  "cargo",
  "cocoapods",
  "composer",
  "conan",
  "conda",
  "cpan",
  "cran",
  "deb",
  "docker",
  "gem",
  "golang",
  "hackage",
  "hex",
  "huggingface",
  "julia",
  "jsr",
  "luarocks",
  "maven",
  "mojo",
  "npm",
  "nuget",
  "opam",
  "pub",
  "pypi",
  "rpm",
  "swift",
  "zig",
] as const;

export const VersComparatorSchema = Schema.Literals(["=", "!=", "<", "<=", ">", ">="]).annotate({
  identifier: "VersComparator",
  title: "VERS Comparator",
  description: "A comparator inside an AgentXM-supported VERS constraint.",
});

export type VersComparator = Schema.Schema.Type<typeof VersComparatorSchema>;

export const VersConstraintSchema = Schema.Struct({
  comparator: VersComparatorSchema,
  version: Schema.NonEmptyString,
}).annotate({
  identifier: "VersConstraint",
  title: "VERS Constraint",
  description: "A parsed comparator and version from an AgentXM-supported VERS range.",
});

export type VersConstraint = Schema.Schema.Type<typeof VersConstraintSchema>;

const VersRangeDecodedSchema = Schema.Struct({
  raw: Schema.NonEmptyString,
  scheme: Schema.NonEmptyString,
  constraints: Schema.Array(VersConstraintSchema),
}).annotate({
  identifier: "VersRangeDecoded",
  title: "VERS Range",
  description: "A decoded VERS range with its raw value, ecosystem scheme, and constraints.",
});

const isSentinelScheme = (scheme: string): boolean =>
  SENTINEL_SCHEMES.some((candidate) => candidate === scheme);

export const isConcreteEcosystemScheme = (scheme: string): boolean =>
  CONCRETE_ECOSYSTEM_SCHEMES.some((candidate) => candidate === scheme);

const parseComparator = (constraint: string): VersComparator | undefined => {
  if (constraint.startsWith(">=")) return ">=";
  if (constraint.startsWith("<=")) return "<=";
  if (constraint.startsWith("!=")) return "!=";
  if (constraint.startsWith(">")) return ">";
  if (constraint.startsWith("<")) return "<";
  if (constraint.startsWith("=")) return "=";
  return undefined;
};

const parseConstraint = (constraint: string): VersConstraint | string => {
  const comparator = parseComparator(constraint);
  if (comparator === undefined) {
    return `Expected VERS constraint to start with one of =, !=, <, <=, >, or >=, got: ${constraint}`;
  }

  const version = constraint.slice(comparator.length);
  if (version.length === 0) {
    return `Expected VERS constraint version after ${comparator}`;
  }

  return { comparator, version };
};

export const splitVersAtScheme = (
  value: string,
): { readonly scheme: string; readonly constraintsText: string } | string => {
  if (!value.startsWith(VERS_PREFIX)) {
    return "Expected VERS range to start with the vers: prefix.";
  }

  const withoutPrefix = value.slice(VERS_PREFIX.length);
  const slashIndex = withoutPrefix.indexOf("/");
  if (slashIndex <= 0) {
    return "Expected VERS range to include a non-empty scheme before '/'.";
  }

  const scheme = withoutPrefix.slice(0, slashIndex);
  const constraintsText = withoutPrefix.slice(slashIndex + 1);
  if (constraintsText.length === 0) {
    return "Expected VERS range to include at least one constraint after '/'.";
  }

  return { scheme, constraintsText };
};

export const parseVersRange = (
  value: string,
): Schema.Schema.Type<typeof VersRangeDecodedSchema> | string => {
  if (value.includes("%")) {
    return "VERS percent-encoded values are not supported yet.";
  }

  const split = splitVersAtScheme(value);
  if (typeof split === "string") {
    return split;
  }

  if (isSentinelScheme(split.scheme)) {
    return `VERS scheme '${split.scheme}' is a generic scheme; generic schemes are not accepted for companion packages.`;
  }

  if (!isConcreteEcosystemScheme(split.scheme)) {
    return `VERS scheme '${split.scheme}' is not a known concrete package ecosystem.`;
  }

  if (split.constraintsText === "*") {
    return 'omit versionRange to express "any version"; wildcard-only VERS ranges are not accepted.';
  }

  const constraints: Array<VersConstraint> = [];
  for (const constraintText of split.constraintsText.split("|")) {
    if (constraintText.length === 0) {
      return "Expected VERS range constraints to be non-empty.";
    }

    const constraint = parseConstraint(constraintText);
    if (typeof constraint === "string") {
      return constraint;
    }

    constraints.push(constraint);
  }

  return {
    raw: value,
    scheme: split.scheme,
    constraints,
  };
};

const parseVersRangeEffect = (value: string) => {
  const result = parseVersRange(value);
  return typeof result === "string"
    ? Effect.fail(new SchemaIssue.Forbidden(Option.some(value), { message: result }))
    : Effect.succeed(result);
};

export const VersRangeSchema = Schema.NonEmptyString.pipe(
  Schema.decodeTo(
    Schema.toType(VersRangeDecodedSchema),
    SchemaTransformation.transformOrFail({
      decode: parseVersRangeEffect,
      encode: (value) => Effect.succeed(value.raw),
    }),
  ),
  Schema.annotate({
    identifier: "VersRange",
    title: "VERS Range",
    description:
      "A VERS version range like vers:npm/>=1.0.0|<2.0.0. Use a concrete package ecosystem scheme matching the companion purl type. Omit versionRange for any-version compatibility.",
    message: "Expected a VERS range like vers:npm/>=1.0.0|<2.0.0",
  }),
  Schema.annotateEncoded({
    examples: ["vers:npm/>=18.0.0|<19.0.0", "vers:pypi/>=2.31.0", "vers:cargo/>=1.0.0"],
  }),
  Schema.brand("VersRange"),
);

export type VersRange = Schema.Schema.Type<typeof VersRangeSchema>;
