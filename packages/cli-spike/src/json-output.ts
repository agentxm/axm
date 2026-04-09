import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/ServiceMap";

import { JsonSchemaVersion, JsonSchemaVersionSchema } from "@axm.sh/core/unstable/cli-runtime";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";

export const JsonOutputSupported: ServiceMap.Reference<boolean> = ServiceMap.Reference(
  "axm-spike/json-output-supported",
  {
    defaultValue: () => false,
  },
);

export type DataDocument<S extends Schema.Top, TCommand extends string> = {
  readonly _version: typeof JsonSchemaVersion;
  readonly command: TCommand;
  readonly data: Schema.Schema.Type<S>;
};

export type ItemsDocument<S extends Schema.Top, TCommand extends string> = {
  readonly _version: typeof JsonSchemaVersion;
  readonly command: TCommand;
  readonly items: ReadonlyArray<Schema.Schema.Type<S>>;
  readonly count: number;
};

export type ResultDocument<S extends Schema.Top, TCommand extends string> = {
  readonly _version: typeof JsonSchemaVersion;
  readonly command: TCommand;
  readonly result: Schema.Schema.Type<S>;
};

export const makeDataDocumentSchema = <S extends Schema.Top, TCommand extends string>(
  command: TCommand,
  dataSchema: S,
) =>
  Schema.Struct({
    _version: JsonSchemaVersionSchema,
    command: Schema.Literal(command),
    data: dataSchema,
  });

export const makeItemsDocumentSchema = <S extends Schema.Top, TCommand extends string>(
  command: TCommand,
  itemSchema: S,
) =>
  Schema.Struct({
    _version: JsonSchemaVersionSchema,
    command: Schema.Literal(command),
    items: Schema.Array(itemSchema),
    count: Schema.Number,
  });

export const makeResultDocumentSchema = <S extends Schema.Top, TCommand extends string>(
  command: TCommand,
  resultSchema: S,
) =>
  Schema.Struct({
    _version: JsonSchemaVersionSchema,
    command: Schema.Literal(command),
    result: resultSchema,
  });

export const emitDataResult = <S extends Schema.Top, TCommand extends string>(
  command: TCommand,
  data: Schema.Schema.Type<S>,
  schema: S,
) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const document: DataDocument<S, TCommand> = {
      _version: JsonSchemaVersion,
      command,
      data,
    };

    return yield* renderer.result(document, makeDataDocumentSchema(command, schema));
  });

export const emitItemsResult = <S extends Schema.Top, TCommand extends string>(
  command: TCommand,
  items: ReadonlyArray<Schema.Schema.Type<S>>,
  itemSchema: S,
) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const document: ItemsDocument<S, TCommand> = {
      _version: JsonSchemaVersion,
      command,
      items,
      count: items.length,
    };

    return yield* renderer.result(document, makeItemsDocumentSchema(command, itemSchema));
  });

export const emitResultDocument = <S extends Schema.Top, TCommand extends string>(
  command: TCommand,
  result: Schema.Schema.Type<S>,
  schema: S,
) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const document: ResultDocument<S, TCommand> = {
      _version: JsonSchemaVersion,
      command,
      result,
    };

    return yield* renderer.result(document, makeResultDocumentSchema(command, schema));
  });
