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

type DataDocument<S extends Schema.Encoder<unknown, never>, TCommand extends string> = {
  readonly schemaVersion: typeof JsonSchemaVersion;
  readonly command: TCommand;
  readonly data: S["Type"];
};

type ItemsDocument<S extends Schema.Encoder<unknown, never>, TCommand extends string> = {
  readonly schemaVersion: typeof JsonSchemaVersion;
  readonly command: TCommand;
  readonly items: ReadonlyArray<S["Type"]>;
  readonly count: number;
};

type ResultDocument<S extends Schema.Encoder<unknown, never>, TCommand extends string> = {
  readonly schemaVersion: typeof JsonSchemaVersion;
  readonly command: TCommand;
  readonly result: S["Type"];
};

const makeDataDocumentSchema = <S extends Schema.Encoder<unknown, never>, TCommand extends string>(
  command: TCommand,
  dataSchema: S,
) =>
  Schema.Struct({
    schemaVersion: JsonSchemaVersionSchema,
    command: Schema.Literal(command),
    data: dataSchema,
  });

const makeItemsDocumentSchema = <S extends Schema.Encoder<unknown, never>, TCommand extends string>(
  command: TCommand,
  itemSchema: S,
) =>
  Schema.Struct({
    schemaVersion: JsonSchemaVersionSchema,
    command: Schema.Literal(command),
    items: Schema.Array(itemSchema),
    count: Schema.Number,
  });

const makeResultDocumentSchema = <
  S extends Schema.Encoder<unknown, never>,
  TCommand extends string,
>(
  command: TCommand,
  resultSchema: S,
) =>
  Schema.Struct({
    schemaVersion: JsonSchemaVersionSchema,
    command: Schema.Literal(command),
    result: resultSchema,
  });

export const emitDataResult = <S extends Schema.Encoder<unknown, never>, TCommand extends string>(
  command: TCommand,
  data: S["Type"],
  schema: S,
) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const document: DataDocument<S, TCommand> = {
      schemaVersion: JsonSchemaVersion,
      command,
      data,
    };

    return yield* renderer.result(document, makeDataDocumentSchema(command, schema));
  });

export const emitItemsResult = <S extends Schema.Encoder<unknown, never>, TCommand extends string>(
  command: TCommand,
  items: ReadonlyArray<S["Type"]>,
  itemSchema: S,
) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const document: ItemsDocument<S, TCommand> = {
      schemaVersion: JsonSchemaVersion,
      command,
      items,
      count: items.length,
    };

    return yield* renderer.result(document, makeItemsDocumentSchema(command, itemSchema));
  });

export const emitResultDocument = <
  S extends Schema.Encoder<unknown, never>,
  TCommand extends string,
>(
  command: TCommand,
  result: S["Type"],
  schema: S,
) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const document: ResultDocument<S, TCommand> = {
      schemaVersion: JsonSchemaVersion,
      command,
      result,
    };

    return yield* renderer.result(document, makeResultDocumentSchema(command, schema));
  });
