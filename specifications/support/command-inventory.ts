/** Navigation metadata; requirement files retain authority for their statements. */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import * as Schema from "effect/Schema";

const strings = Schema.Array(Schema.String);
const bindingFields = {
  requirements: Schema.optionalKey(strings),
  when: Schema.optionalKey(Schema.String),
  openTopics: Schema.optionalKey(strings),
  details: Schema.optionalKey(strings),
};
const binding = Schema.Struct(bindingFields);
const flagHelp = Schema.Struct({
  aliases: strings,
  type: Schema.String,
  required: Schema.Boolean,
});
const flag = Schema.Struct({
  name: Schema.String,
  rawHelp: flagHelp,
  occurrences: Schema.optionalKey(
    Schema.Struct({
      minimumOccurrences: Schema.Number,
      repeatable: Schema.Boolean,
    }),
  ),
});
const argument = Schema.Struct({
  name: Schema.String,
  rawHelp: Schema.Struct({
    type: Schema.String,
    required: Schema.Boolean,
    variadic: Schema.Boolean,
  }),
});
export const CommandInventorySchema = Schema.Struct({
  formatVersion: Schema.Literal(1),
  globals: Schema.Record(
    Schema.String,
    Schema.Struct({
      rawHelp: flagHelp,
      bindings: Schema.Array(binding),
    }),
  ),
  openTopics: Schema.Record(
    Schema.String,
    Schema.Struct({
      topic: Schema.String,
      nearestSpecification: Schema.optionalKey(Schema.String),
    }),
  ),
  routes: Schema.Record(
    Schema.String,
    Schema.Struct({
      flags: Schema.Array(flag),
      arguments: Schema.Array(argument),
      relatedRequirements: strings,
      conditionalLinks: Schema.optionalKey(
        Schema.Array(
          Schema.Struct({
            requirement: Schema.String,
            when: Schema.String,
            openTopics: Schema.optionalKey(strings),
          }),
        ),
      ),
      parameterBindings: Schema.Array(
        Schema.Struct({
          parameters: strings,
          ...bindingFields,
        }),
      ),
    }),
  ),
});
export type CommandInventory = typeof CommandInventorySchema.Type;

export const readCommandInventory = () => {
  const value: unknown = JSON.parse(
    fs.readFileSync(new URL("./command-behavior-allocation.json", import.meta.url), "utf8"),
  );
  return Schema.decodeUnknownEffect(CommandInventorySchema, { onExcessProperty: "error" })(value);
};

const specificationsRoot = fileURLToPath(new URL("..", import.meta.url));

/** Static identity extraction does not import or execute a specification file. */
const declaredIdentity = (source: ts.SourceFile): string | undefined => {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== "specification") continue;
      const initializer = declaration.initializer;
      if (initializer === undefined || !ts.isCallExpression(initializer)) continue;
      if (
        !ts.isIdentifier(initializer.expression) ||
        initializer.expression.text !== "defineSpecification"
      )
        continue;
      const metadata = initializer.arguments[0];
      if (metadata === undefined || !ts.isObjectLiteralExpression(metadata)) continue;
      for (const property of metadata.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        if (!ts.isIdentifier(property.name) || property.name.text !== "requirement") continue;
        if (ts.isStringLiteral(property.initializer)) return property.initializer.text;
      }
    }
  }
  return undefined;
};

/** One validator serves route, parameter, conditional, global, and topic links. */
export const makeCanonicalRequirementValidator = () => {
  const checked = new Set<string>();
  return (identity: string): void => {
    if (checked.has(identity)) return;
    if (!/^[a-z0-9-]+(?:\/[a-z0-9-]+)+$/u.test(identity)) {
      throw new Error(`Invalid requirement identity: ${identity}`);
    }
    const filename = path.join(specificationsRoot, `${identity}.spec.ts`);
    const source = ts.createSourceFile(
      filename,
      fs.readFileSync(filename, "utf8"),
      ts.ScriptTarget.Latest,
      false,
    );
    if (declaredIdentity(source) !== identity) {
      throw new Error(`Requirement identity does not match its canonical file: ${identity}`);
    }
    checked.add(identity);
  };
};
