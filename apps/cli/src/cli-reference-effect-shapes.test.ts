import { describe, expect, it } from "@effect/vitest";
import { Command, Flag } from "effect/unstable/cli";

import { flattenCliReference, makeCliReferenceDocument } from "./cli-reference.js";
import { rootCommand } from "./app.js";

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

describe("CLI reference Effect shapes", () => {
  it("inspects every registered command and supported parameter wrapper", () => {
    const reference = makeCliReferenceDocument(rootCommand, "0.0.0-test");
    expect(flattenCliReference(reference.command)).toEqual(registeredCommandPaths(rootCommand));
  });

  it("rejects incomplete public command metadata", () => {
    const missingDescription = Command.make("probe").pipe(
      Command.withExamples([{ command: "probe" }]),
    );
    const missingExample = Command.make("probe").pipe(Command.withDescription("Probe"));
    const missingOptionDescription = Command.make("probe", {
      force: Flag.Boolean("force"),
    }).pipe(Command.withDescription("Probe"), Command.withExamples([{ command: "probe" }]));

    expect(() => makeCliReferenceDocument(missingDescription, "0.0.0-test")).toThrow(
      "probe: description",
    );
    expect(() => makeCliReferenceDocument(missingExample, "0.0.0-test")).toThrow("probe: example");
    expect(() => makeCliReferenceDocument(missingOptionDescription, "0.0.0-test")).toThrow(
      "probe: option:force:description",
    );
  });
});
