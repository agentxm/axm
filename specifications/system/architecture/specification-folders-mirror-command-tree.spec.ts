import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import type { Command } from "effect/unstable/cli";

import { rootCommand } from "axm.sh/unstable/specification-harness";

import { defineSpecification } from "../../support/contract.js";

export const specification = defineSpecification({
  requirement: "system/architecture/specification-folders-mirror-command-tree",
  title: "Specification layout mirrors the command tree and declared identities",
  class: "architecture",
  role: "supporting",
  goals: ["dependable-change-process"],
  boundary: "repository",
  methods: ["contract"],
});

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
const specificationsRoot = path.join(repoRoot, "specifications");
const SPECIFICATION_AREAS = ["cli", "client-core", "system"] as const;
const SKIPPED_ENTRIES = new Set(["node_modules", "out-tsc", "dist"]);

const registeredCommandPaths = (
  command: Command.Command.Any = rootCommand,
  segments: ReadonlyArray<string> = [],
): ReadonlyArray<string> => [
  segments.join("/"),
  ...command.subcommands.flatMap((group) =>
    group.commands.flatMap((child) => registeredCommandPaths(child, [...segments, child.name])),
  ),
];

interface WalkedEntry {
  readonly relativePath: string;
  readonly kind: "directory" | "file" | "symbolic-link";
}

const walkArea = (directory: string, prefix: ReadonlyArray<string>): ReadonlyArray<WalkedEntry> =>
  fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => !SKIPPED_ENTRIES.has(entry.name))
    .flatMap((entry) => {
      const segments = [...prefix, entry.name];
      const relativePath = segments.join("/");
      if (entry.isSymbolicLink()) {
        return [{ relativePath, kind: "symbolic-link" as const }];
      }
      if (entry.isDirectory()) {
        return [
          { relativePath, kind: "directory" as const },
          ...walkArea(path.join(directory, entry.name), segments),
        ];
      }
      return [{ relativePath, kind: "file" as const }];
    });

const walkedEntries = (): ReadonlyArray<WalkedEntry> =>
  SPECIFICATION_AREAS.flatMap((area) => walkArea(path.join(specificationsRoot, area), [area]));

const REQUIREMENT_LITERAL = /requirement:\s*"([^"]+)"/;

describe("Specification layout mirrors the command tree", () => {
  it.effect("every specification directory under cli names a registered command path", () =>
    Effect.sync(() => {
      const commandPaths = new Set(registeredCommandPaths());
      const directories = walkedEntries()
        .filter((entry) => entry.kind === "directory" && entry.relativePath.startsWith("cli/"))
        .map((entry) => entry.relativePath.replace(/^cli\//, ""));
      expect(directories.length).toBeGreaterThan(0);
      for (const directory of directories) {
        expect(commandPaths, directory).toContain(directory);
      }
    }),
  );

  it.effect("no symbolic link hides specification content from discovery", () =>
    Effect.sync(() => {
      const symbolicLinks = walkedEntries().filter((entry) => entry.kind === "symbolic-link");
      expect(symbolicLinks).toEqual([]);
    }),
  );

  it.effect("every requirement identity equals its specification file path", () =>
    Effect.sync(() => {
      const sources = walkedEntries().filter(
        (entry) => entry.kind === "file" && entry.relativePath.endsWith(".spec.ts"),
      );
      expect(sources.length).toBeGreaterThan(0);
      for (const source of sources) {
        const contents = fs.readFileSync(
          path.join(specificationsRoot, source.relativePath),
          "utf8",
        );
        const declared = REQUIREMENT_LITERAL.exec(contents)?.[1];
        const expected = source.relativePath.replace(/\.spec\.ts$/, "");
        expect(declared, source.relativePath).toBe(expected);
      }
    }),
  );
});
