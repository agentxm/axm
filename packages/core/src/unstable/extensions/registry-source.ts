import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";
import * as SchemaTransformation from "effect/SchemaTransformation";
import { ExtensionNameSchema, ExtensionTypePluralSchema } from "./common.js";
import { HandleSchema } from "./handle.js";
import { VersionConstraintSchema } from "../version-constraints/version-constraints.js";

const invalidRegistrySourcePattern = (input: string) =>
  `Expected registry source pattern in @handle, @handle/<plural-type>, or @handle/<plural-type>/<name>@<constraint> form, got: ${input}`;

const invalidRegistrySourceRef = (input: string) =>
  `Expected registry source ref in @handle/<plural-type>/<name>@<constraint> form, got: ${input}`;

export const RegistrySourcePatternPartsSchema = Schema.Struct({
  owner: HandleSchema,
  type: Schema.optional(ExtensionTypePluralSchema),
  name: Schema.optional(ExtensionNameSchema),
  versionConstraint: Schema.optional(VersionConstraintSchema),
})
  .pipe(
    Schema.check(
      Schema.makeFilter((value) => {
        if (value.type === undefined) {
          return value.name === undefined && value.versionConstraint === undefined
            ? undefined
            : "Registry source pattern cannot include name or versionConstraint without type";
        }

        if (value.name === undefined) {
          return value.versionConstraint === undefined
            ? undefined
            : "Registry source pattern cannot include versionConstraint without name";
        }

        return undefined;
      }),
    ),
  )
  .annotate({
    identifier: "RegistrySourcePatternParts",
    title: "Registry Source Pattern",
    description:
      "Structured registry source pattern: @handle, @handle/<type>, or @handle/<type>/<name>@<constraint>.",
  });

export type RegistrySourcePatternParts = Schema.Schema.Type<
  typeof RegistrySourcePatternPartsSchema
>;

export const RegistrySourceRefPartsSchema = Schema.Struct({
  owner: HandleSchema,
  type: ExtensionTypePluralSchema,
  name: ExtensionNameSchema,
  versionConstraint: Schema.optional(VersionConstraintSchema),
}).annotate({
  identifier: "RegistrySourceRefParts",
  title: "Registry Source Ref",
  description:
    "Structured registry source ref: @handle/<type>/<name> with optional version constraint.",
});

export type RegistrySourceRefParts = Schema.Schema.Type<typeof RegistrySourceRefPartsSchema>;

const decodeRegistrySourcePatternParts = Schema.decodeUnknownResult(
  RegistrySourcePatternPartsSchema,
);
const decodeRegistrySourceRefParts = Schema.decodeUnknownResult(RegistrySourceRefPartsSchema);

const parseNameAndConstraintSegment = (
  segment: string,
): { readonly name: string; readonly versionConstraint?: string | undefined } | undefined => {
  const atIndex = segment.indexOf("@");
  if (atIndex === 0) {
    return undefined;
  }

  if (atIndex === -1) {
    return { name: segment };
  }

  const name = segment.slice(0, atIndex);
  const versionConstraint = segment.slice(atIndex + 1);
  if (name.length === 0 || versionConstraint.length === 0) {
    return undefined;
  }

  return { name, versionConstraint };
};

export const parseRegistrySourcePatternParts = (
  input: string,
): RegistrySourcePatternParts | undefined => {
  if (!input.startsWith("@")) {
    return undefined;
  }

  const segments = input.split("/");
  if (segments.length < 1 || segments.length > 3) {
    return undefined;
  }

  const owner = segments[0];
  if (owner === undefined) {
    return undefined;
  }

  let candidate:
    | {
        readonly owner: string;
        readonly type?: string | undefined;
        readonly name?: string | undefined;
        readonly versionConstraint?: string | undefined;
      }
    | undefined;

  if (segments.length === 1) {
    candidate = { owner };
  } else if (segments.length === 2) {
    const type = segments[1];
    if (type !== undefined) {
      candidate = { owner, type };
    }
  } else {
    const type = segments[1];
    const third = segments[2];
    if (type !== undefined && third !== undefined) {
      const parsedName = parseNameAndConstraintSegment(third);
      if (parsedName !== undefined) {
        candidate = {
          owner,
          type,
          name: parsedName.name,
          versionConstraint: parsedName.versionConstraint,
        };
      }
    }
  }

  if (candidate === undefined) {
    return undefined;
  }

  const result = decodeRegistrySourcePatternParts(candidate);
  return Result.isSuccess(result) ? result.success : undefined;
};

export const parseRegistrySourceRef = (input: string): RegistrySourceRefParts | undefined => {
  const parsed = parseRegistrySourcePatternParts(input);
  if (parsed?.type === undefined || parsed.name === undefined) {
    return undefined;
  }

  const result = decodeRegistrySourceRefParts(parsed);
  return Result.isSuccess(result) ? result.success : undefined;
};

export const formatRegistrySourcePatternParts = (value: RegistrySourcePatternParts): string => {
  let output: string = value.owner;

  if (value.type !== undefined) {
    output += `/${value.type}`;
  }

  if (value.name !== undefined) {
    output += `/${value.name}`;
  }

  if (value.versionConstraint !== undefined) {
    output += `@${value.versionConstraint}`;
  }

  return output;
};

export const formatRegistrySourceRef = (value: RegistrySourceRefParts): string =>
  formatRegistrySourcePatternParts(value);

export const RegistrySourcePatternSchema = Schema.String.pipe(
  Schema.decodeTo(
    Schema.toType(RegistrySourcePatternPartsSchema),
    SchemaTransformation.transformOrFail({
      decode: (input: string) => {
        const parsed = parseRegistrySourcePatternParts(input);
        return parsed === undefined
          ? Effect.fail(
              new SchemaIssue.Forbidden(Option.some(input), {
                message: invalidRegistrySourcePattern(input),
              }),
            )
          : Effect.succeed(parsed);
      },
      encode: (value) => Effect.succeed(formatRegistrySourcePatternParts(value)),
    }),
  ),
);

export const RegistrySourceRefSchema = Schema.String.pipe(
  Schema.decodeTo(
    Schema.toType(RegistrySourceRefPartsSchema),
    SchemaTransformation.transformOrFail({
      decode: (input: string) => {
        const parsed = parseRegistrySourceRef(input);
        return parsed === undefined
          ? Effect.fail(
              new SchemaIssue.Forbidden(Option.some(input), {
                message: invalidRegistrySourceRef(input),
              }),
            )
          : Effect.succeed(parsed);
      },
      encode: (value) => Effect.succeed(formatRegistrySourceRef(value)),
    }),
  ),
);
