import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { defineSpecification } from "@agentxm/specification-metadata";
import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import type { Command } from "effect/unstable/cli";

import {
  CliReferenceDocumentSchema,
  flattenCliReference,
  makeCliReferenceDocument,
  makeCliReferenceJsonSchema,
} from "./cli-reference.js";
import { rootCommand } from "./app.js";
import { loadVersion } from "./version.js";

export const specification = defineSpecification({
  requirement: "cli/reference-asset-reflects-command-tree",
  title: "The command reference reflects the released CLI",
  statement:
    "Each AXM release shall provide a deterministic, schema-versioned command-reference document containing every registered command and its CLI-owned names, aliases, descriptions, examples, arguments, options and choices, and generation shall fail when required command metadata is missing.",
  class: "functional",
  role: "interface",
  goals: ["knowledge-access", "machine-automation"],
  boundary: "memory",
  methods: ["contract", "example"],
  derivedFrom: ["cli/command-help-is-complete"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const generatedRoot = resolve(import.meta.dirname, "../site-content/__generated__/cli-reference");

const registeredCommandPaths = (
  command: Command.Command.Any,
  path: ReadonlyArray<string> = [],
): ReadonlyArray<ReadonlyArray<string>> => {
  const commandPath = [...path, command.name];
  return [
    commandPath,
    ...command.subcommands.flatMap((group) =>
      group.commands.flatMap((child) => registeredCommandPaths(child, commandPath)),
    ),
  ];
};

const parseJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

describe("Released CLI reference", () => {
  it("matches the command tree and committed schema", () => {
    const generated = Schema.decodeUnknownSync(CliReferenceDocumentSchema, {
      onExcessProperty: "error",
    })(parseJson(resolve(generatedRoot, "cli-reference.json")));
    expect(generated.cliVersion).toBe(loadVersion());
    expect(flattenCliReference(generated.command)).toEqual(registeredCommandPaths(rootCommand));
    expect(parseJson(resolve(generatedRoot, "cli-reference.schema.json"))).toEqual(
      makeCliReferenceJsonSchema(),
    );
  });

  it("is deterministic and contains no editorial overlay", () => {
    const first = makeCliReferenceDocument(rootCommand, "0.0.0-test");
    const second = makeCliReferenceDocument(rootCommand, "0.0.0-test");
    expect(second).toEqual(first);
    expect(JSON.stringify(first)).not.toMatch(
      /"(?:category|whenToUse|requirements|sideEffects|group)":/u,
    );
  });
});
