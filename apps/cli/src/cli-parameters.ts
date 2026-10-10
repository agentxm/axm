/** Shared parser-derived parameter records for human help, machine help, and reference generation. */
import * as ServiceMap from "effect/Context";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Command, Param } from "effect/cli";
import * as Primitive from "effect/cli/Primitive";

interface WalkedParam {
  readonly single: Param.Single<Param.ParamKind, unknown>;
  readonly optional: boolean;
  readonly variadic?: {
    readonly min?: number;
    readonly max?: number;
  };
}

export const ParameterChoiceSchema = Schema.Struct({
  value: Schema.String,
});

export const ParameterVariadicSchema = Schema.Struct({
  min: Schema.optionalKey(Schema.Int),
  max: Schema.optionalKey(Schema.Int),
});

export const ParameterSchema = Schema.Struct({
  name: Schema.String,
  aliases: Schema.Array(Schema.String),
  type: Schema.String,
  required: Schema.Boolean,
  description: Schema.optionalKey(Schema.String),
  valueName: Schema.optionalKey(Schema.String),
  variadic: Schema.optionalKey(ParameterVariadicSchema),
  choices: Schema.optionalKey(Schema.Array(ParameterChoiceSchema)),
  default: Schema.optionalKey(Schema.Union([Schema.String, Schema.Number, Schema.Boolean])),
  range: Schema.optionalKey(Schema.Struct({ min: Schema.Number, max: Schema.Number })),
});

export type ParameterRecord = typeof ParameterSchema.Type;
interface ParameterFacts {
  readonly default?: string | number | boolean;
  readonly range?: { readonly min: number; readonly max: number };
}

// Definitions live for the registered command tree's lifetime. Weak keys do
// not retain temporary parser definitions built by tests or command factories.
const facts = new WeakMap<Param.Any, ParameterFacts>();
const parameterFacts = (param: Param.Any): ParameterFacts => {
  const own = facts.get(param);
  if (own !== undefined) return own;
  return "param" in param && Param.isParam(param.param) ? parameterFacts(param.param) : {};
};

export const withParameterDefault =
  <const D extends string | number | boolean>(value: D) =>
  <Kind extends Param.ParamKind, A>(self: Param.Param<Kind, A>): Param.Param<Kind, A | D> => {
    const next = Param.withDefault(self, value);
    facts.set(next, { ...parameterFacts(self), default: value });
    return next;
  };

/** Description changes preserve declared facts while Effect owns parsing. */
export const withParameterDescription =
  (description: string) =>
  <Kind extends Param.ParamKind, A>(self: Param.Param<Kind, A>): Param.Param<Kind, A> => {
    const next = Param.withDescription(self, description);
    facts.set(next, parameterFacts(self));
    return next;
  };

export const withParameterRange =
  (min: number, max: number) =>
  <Kind extends Param.ParamKind>(self: Param.Param<Kind, number>): Param.Param<Kind, number> => {
    const next = Param.filter(
      self,
      (value) => value >= min && value <= max,
      () => `Value must be between ${min} and ${max}`,
    );
    facts.set(next, { ...parameterFacts(self), range: { min, max } });
    return next;
  };

export const ParameterRecordsAnnotation = ServiceMap.Reference<
  ReadonlyArray<{ readonly kind: Param.ParamKind; readonly parameter: ParameterRecord }>
>("axm/help-parameters", { defaultValue: () => [] });

export const withParameterRecords =
  (config: Readonly<Record<string, unknown>>) =>
  <Name extends string, Input, ContextInput, E, R>(
    self: Command.Command<Name, Input, ContextInput, E, R>,
  ) =>
    Command.annotate(
      self,
      ParameterRecordsAnnotation,
      Object.values(config)
        .filter(Param.isParam)
        .map((param) => ({ kind: param.kind, parameter: toParameterReference(param) })),
    );

const largeChoiceReference = (name: string): string => {
  switch (name) {
    case "agent":
    case "render":
    case "source-agent":
      return "axm agents list --available";
    case "ecosystem":
      return "axm help package-extensions";
    default:
      throw new Error(`Large choice set ${name} needs a help reference`);
  }
};

export const parameterHelpLine = (parameter: ParameterRecord): string => {
  const facts: Array<string> = [];
  if (parameter.choices !== undefined)
    facts.push(
      `choices: ${parameter.choices.length <= 12 ? parameter.choices.map(({ value }) => value).join(", ") : `see ${largeChoiceReference(parameter.name)}`}`,
    );
  else if (parameter.range !== undefined)
    facts.push(`${parameter.range.min}-${parameter.range.max}`);
  // Boolean absence is the normal switch convention; an enabled default is a
  // material fact. Both values remain explicit in the machine record.
  if (parameter.default !== undefined && parameter.default !== false)
    facts.push(`default ${String(parameter.default)}`);
  if (parameter.variadic !== undefined) facts.push("repeatable");
  if (parameter.required) facts.push("required");
  return `${parameter.description ?? ""}${facts.length === 0 ? "" : ` (${facts.join("; ")})`}`;
};

const optionToUndefined = <A>(value: Option.Option<A>): A | undefined =>
  Option.getOrUndefined(value);
const decodeChoiceKeys = Schema.decodeUnknownOption(Schema.Array(Schema.String));

const isSingleParam = (param: Param.Any): param is Param.Single<Param.ParamKind, unknown> =>
  param._tag === "Single" &&
  "name" in param &&
  typeof param.name === "string" &&
  "aliases" in param &&
  Array.isArray(param.aliases) &&
  "primitiveType" in param;

const isMappedParam = (
  param: Param.Any,
): param is
  | Param.Map<Param.ParamKind, unknown, unknown>
  | Param.Transform<Param.ParamKind, unknown, unknown> =>
  (param._tag === "Map" || param._tag === "Transform") && "param" in param;

const isOptionalParam = (param: Param.Any): param is Param.Optional<Param.ParamKind, unknown> =>
  param._tag === "Optional" && "param" in param;

const isVariadicParam = (param: Param.Any): param is Param.Variadic<Param.ParamKind, unknown> =>
  param._tag === "Variadic" && "param" in param && "min" in param && "max" in param;

const walkParam = (param: Param.Any): WalkedParam => {
  if (isSingleParam(param)) return { single: param, optional: false };
  if (isMappedParam(param)) return walkParam(param.param);
  if (isOptionalParam(param)) {
    const walked = walkParam(param.param);
    return { ...walked, optional: true };
  }
  if (isVariadicParam(param)) {
    const walked = walkParam(param.param);
    const min = optionToUndefined(param.min);
    const max = optionToUndefined(param.max);
    return {
      ...walked,
      variadic: {
        ...(min === undefined ? {} : { min }),
        ...(max === undefined ? {} : { max }),
      },
    };
  }
  throw new Error(`Unsupported CLI parameter node: ${param._tag}`);
};

const getChoiceKeys = (
  primitive: Primitive.Primitive<unknown>,
): ReadonlyArray<string> | undefined => {
  if (primitive._tag !== "Choice" || !("choiceKeys" in primitive)) return undefined;
  return Option.getOrUndefined(decodeChoiceKeys(primitive.choiceKeys));
};

const isRequired = (walked: WalkedParam): boolean => {
  if (
    walked.single.kind === "flag" &&
    Primitive.getTypeName(walked.single.primitiveType) === "boolean"
  ) {
    return false;
  }
  if (walked.optional) return false;
  return walked.variadic === undefined ? true : (walked.variadic.min ?? 0) > 0;
};

const formatAlias = (alias: string): string => (alias.length === 1 ? `-${alias}` : `--${alias}`);

export const toParameterReference = (param: Param.Any): ParameterRecord => {
  const walked = walkParam(param);
  const single = walked.single;
  const description = optionToUndefined(single.description);
  const valueName = single.typeName;
  const choices = getChoiceKeys(single.primitiveType)?.map((value) => ({ value }));
  return {
    name: single.name,
    aliases: single.aliases.map(formatAlias),
    type: Primitive.getTypeName(single.primitiveType),
    required: isRequired(walked),
    ...parameterFacts(param),
    ...(description === undefined ? {} : { description }),
    ...(valueName === undefined ? {} : { valueName }),
    ...(walked.variadic === undefined ? {} : { variadic: walked.variadic }),
    ...(choices === undefined ? {} : { choices }),
  };
};
