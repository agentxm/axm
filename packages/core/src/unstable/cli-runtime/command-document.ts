import * as Schema from "effect/Schema";

export type CommandDocument<TCommand extends string, TBody extends object> = {
  readonly command: TCommand;
} & TBody;

export const makeCommandDocument = <TCommand extends string, TBody extends object>(
  command: TCommand,
  body: TBody,
): CommandDocument<TCommand, TBody> => ({
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
    command: Schema.Literal(command),
    ...fields,
  });
