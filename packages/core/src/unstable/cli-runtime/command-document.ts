import * as Schema from "effect/Schema";

import { JsonSchemaVersion, JsonSchemaVersionSchema } from "./json-envelope.js";

export type CommandDocument<TCommand extends string, TBody extends object> = {
  readonly _version: typeof JsonSchemaVersion;
  readonly command: TCommand;
} & TBody;

export const makeCommandDocument = <TCommand extends string, TBody extends object>(
  command: TCommand,
  body: TBody,
): CommandDocument<TCommand, TBody> => ({
  _version: JsonSchemaVersion,
  command,
  ...body,
});

export const makeCommandDocumentSchema = <
  TCommand extends string,
  const Fields extends Schema.Struct.Fields,
>(
  command: TCommand,
  fields: Fields,
) =>
  Schema.Struct({
    _version: JsonSchemaVersionSchema,
    command: Schema.Literal(command),
    ...fields,
  });
