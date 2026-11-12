import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { rootCommand } from "../src/app.js";
import { HELP_TOPIC_KINDS, HELP_TOPIC_NAMES } from "../src/__generated__/help-topics.js";
import { makeCliReferenceDocument, type CliCommandReference } from "../src/cli-reference.js";
import {
  groupCapabilities,
  registeredCommandCapabilities,
} from "../src/root/shared/command-capabilities.js";

/** Structural inspection stays in the CLI owner; benchmarks consume JSON. */
const program = Effect.try(() => {
  const repoRoot = path.resolve(import.meta.dirname, "../../..");
  const outputPath =
    process.env["AXM_COMMAND_INVENTORY_OUTPUT"] ??
    path.join(repoRoot, "test-results/benchmarks/cli-operations/command-inventory.json");
  const cliVersion = Schema.decodeUnknownSync(Schema.Struct({ version: Schema.String }))(
    JSON.parse(fs.readFileSync(path.join(repoRoot, "apps/cli/package.json"), "utf8")),
  ).version;
  const reference = makeCliReferenceDocument(rootCommand, cliVersion);
  const references = new Map<string, CliCommandReference>();
  const walk = (node: CliCommandReference, route: ReadonlyArray<string>): void => {
    references.set(route.join(" "), node);
    for (const child of node.subcommands) walk(child, [...route, child.name]);
  };
  walk(reference.command, []);
  const parameter = ({
    name,
    type,
    required,
    description,
    choices,
    default: defaultValue,
  }: CliCommandReference["options"][number]) => ({
    name,
    type,
    required,
    ...(description === undefined ? {} : { description }),
    ...(choices === undefined ? {} : { choices: choices.map((choice) => choice.value) }),
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
  });
  const entries = registeredCommandCapabilities(rootCommand).map((entry) => {
    const command = references.get(entry.path.join(" "));
    if (command === undefined || entry.capabilities === undefined)
      throw new Error(`Incomplete benchmark inventory registration: ${entry.path.join(" ")}`);
    return {
      path: entry.path,
      aliases: command.aliases,
      description: command.description,
      childCount: command.subcommands.length,
      groupOnly: entry.capabilities === groupCapabilities,
      capabilities: {
        preview: entry.capabilities.preview,
        effect: entry.capabilities.effect,
        inputs: entry.capabilities.inputs,
        modes: entry.capabilities.modes ?? [],
      },
      flags: command.options.map(parameter),
      arguments: command.arguments.map(parameter),
    };
  });
  const snapshot = {
    schemaVersion: 1,
    revision: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim(),
    cliVersion,
    globalFlags: reference.command.globalOptions.map(parameter),
    entries,
    helpTopics: HELP_TOPIC_NAMES.map((name) => ({ name, kind: HELP_TOPIC_KINDS[name] })),
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Exported ${entries.length} registered routes to ${outputPath}`);
});

await Effect.runPromise(program);
