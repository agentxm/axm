import * as Schema from "effect/Schema";

const CommandDocumentVersion = 1;
const CommandDocumentVersionSchema = Schema.Literal(CommandDocumentVersion);

export type CommandDocument<TCommand extends string, TBody extends object> = {
  readonly _version: typeof CommandDocumentVersion;
  readonly command: TCommand;
} & TBody;

export const makeCommandDocument = <TCommand extends string, TBody extends object>(
  command: TCommand,
  body: TBody,
): CommandDocument<TCommand, TBody> => ({
  _version: CommandDocumentVersion,
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
    _version: CommandDocumentVersionSchema,
    command: Schema.Literal(command),
    ...fields,
  });
