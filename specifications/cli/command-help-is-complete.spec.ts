import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import type { Command } from "effect/unstable/cli";

import {
  captureHelpDoc,
  collectCommandPaths,
  formatCommandPath,
  rootCommand,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/specification-metadata";
import { makeDirectoryFixture } from "../support/directory-harness.js";
import { writeMalformedWorkspaceState } from "../support/malformed-workspace-fixture.js";
import { snapshotWorkspaceContent } from "../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/command-help-is-complete",
  title: "Every supported command describes its invocation and purpose",
  statement:
    "Every supported command shall present help identifying its invocation and purpose, and the rendered help tree shall list exactly the supported command paths.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access"],
  boundary: "process",
  boundaryRationale:
    "Registered-tree examples establish help completeness; built CLI controls establish that malformed populated project and user workspace inputs do not prevent the required help reply or cause workspace writes.",
  methods: ["model", "example"],
  derivedFrom: ["cli/command-help-is-complete-and-alias-free"],
  supersedes: ["cli/command-help-is-complete-and-alias-free"],
  assumptions: [],
  openQuestions: [],
});

interface RegisteredCommand {
  readonly path: ReadonlyArray<string>;
  readonly unlisted: boolean;
}

const registeredCommands = (
  command: Command.Command.Any = rootCommand,
  path: ReadonlyArray<string> = [],
  unlisted = false,
): ReadonlyArray<RegisteredCommand> => [
  { path, unlisted },
  ...command.subcommands.flatMap((group) =>
    group.commands.flatMap((child) =>
      registeredCommands(child, [...path, child.name], unlisted || child.unlisted === true),
    ),
  ),
];

describe("Command help completeness", () => {
  it.effect("every registered command describes its invocation and purpose", () =>
    Effect.gen(function* () {
      const commands = registeredCommands();
      expect(commands.length).toBeGreaterThan(1);
      for (const command of commands) {
        const doc = yield* captureHelpDoc(command.path);
        expect(doc.usage, formatCommandPath(command.path)).toContain(
          formatCommandPath(command.path),
        );
        expect(doc.description.trim().length, formatCommandPath(command.path)).toBeGreaterThan(0);
      }
    }),
  );

  it.effect("the rendered help walk reaches exactly the listed command tree", () =>
    Effect.gen(function* () {
      const rendered = yield* collectCommandPaths();
      const listed = new Set(
        registeredCommands()
          .filter((command) => !command.unlisted)
          .map((command) => formatCommandPath(command.path)),
      );
      expect(new Set(rendered)).toEqual(listed);
    }),
  );

  it.each([
    { name: "root", command: [] },
    { name: "skills install", command: ["skills", "install"] },
  ])(
    "$name help replies without changing malformed populated project or user workspaces",
    async ({ command }) => {
      const fixture = makeDirectoryFixture();
      try {
        const args = [...command, "--help"];
        const clean = await fixture.run(args);
        expect(clean.exitCode, clean.stdout + clean.stderr).toBe(0);
        expect(clean.stdout).toContain(["axm", ...command].join(" "));
        expect(clean.stdout.length).toBeGreaterThan(0);
        writeMalformedWorkspaceState(fixture.invoking, fixture.home);
        const before = snapshotWorkspaceContent(fixture.root);
        const malformed = await fixture.run(args);
        expect(malformed.exitCode, malformed.stdout + malformed.stderr).toBe(0);
        expect(malformed.stdout).toBe(clean.stdout);
        expect(malformed.stderr).toBe(clean.stderr);
        expect(snapshotWorkspaceContent(fixture.root)).toEqual(before);
      } finally {
        fixture.cleanup();
      }
    },
  );
});
