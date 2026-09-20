// @effect-diagnostics nodeBuiltinImport:off globalConsole:off — deterministic build-time generation.
import * as fs from "node:fs";
import * as path from "node:path";

import { format as formatWithPrettier, resolveConfig as resolvePrettierConfig } from "prettier";
import * as Schema from "effect/Schema";

import { makeCliReferenceDocument, makeCliReferenceJsonSchema } from "../src/cli-reference.js";
import { rootCommand } from "../src/app.js";

const cliRoot = path.resolve(import.meta.dirname, "..");
const outputRoot = path.join(cliRoot, "site-content/__generated__/cli-reference");
const packageJsonSchema = Schema.Struct({ version: Schema.String });

const readCliVersion = (): string => {
  const parsed: unknown = JSON.parse(fs.readFileSync(path.join(cliRoot, "package.json"), "utf8"));
  return Schema.decodeUnknownSync(packageJsonSchema, { onExcessProperty: "ignore" })(parsed)
    .version;
};

const writeJson = async (name: string, value: unknown): Promise<void> => {
  const outputPath = path.join(outputRoot, name);
  const prettierConfig = (await resolvePrettierConfig(outputPath)) ?? {};
  const formatted = await formatWithPrettier(JSON.stringify(value), {
    ...prettierConfig,
    filepath: outputPath,
    parser: "json",
  });
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(outputPath, formatted);
  console.log(`Generated: ${path.relative(cliRoot, outputPath)}`);
};

await writeJson("cli-reference.json", makeCliReferenceDocument(rootCommand, readCliVersion()));
await writeJson("cli-reference.schema.json", makeCliReferenceJsonSchema());
