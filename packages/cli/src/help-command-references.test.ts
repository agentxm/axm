import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";

import { extensionTypePluralSegments } from "@agentxm/client-core/unstable/extensions";

import { AXM_SKILL_MD } from "./__generated__/bundled-axm-skill.js";
import { HELP_TOPIC_KINDS, HELP_TOPIC_NAMES, HELP_TOPICS } from "./__generated__/help-topics.js";
import { collectHelpFiles, type HelpFiles } from "./command-tree-test-helpers.js";
import { perTypeInstallPluralSegments } from "./root/shared/per-type-install.js";

/**
 * Guards shipped guidance against command renames: every `axm …` command named
 * in a help topic, in the bundled AXM skill, or in a CLI suggestion must
 * resolve against the command tree the CLI actually registers.
 */

interface CommandTree {
  /** Every registered command path, formatted as `axm <path>`. */
  readonly paths: ReadonlySet<string>;
  /** Subcommand names keyed by the parent's `axm <path>`. */
  readonly children: ReadonlyMap<string, ReadonlySet<string>>;
}

interface Reference {
  readonly origin: string;
  readonly text: string;
}

interface UnresolvedReference {
  readonly origin: string;
  readonly text: string;
  readonly unknownCommand: string;
}

const buildCommandTree = (files: HelpFiles): CommandTree => {
  const children = new Map<string, ReadonlySet<string>>();

  for (const [commandPath, doc] of files) {
    children.set(
      commandPath,
      new Set(
        (doc.subcommands ?? []).flatMap((group) =>
          group.commands.map((subcommand) => subcommand.name),
        ),
      ),
    );
  }

  return { paths: new Set(files.keys()), children };
};

/** A bare word that could name a subcommand — not a flag, FQN, or placeholder. */
const LITERAL_TOKEN = /^[a-z][a-z0-9-]*$/;

/** A one-level choice group such as `<add|remove>` or `[enable|disable]`. */
const ALTERNATION_TOKEN = /^[<[]([a-z][a-z0-9-]*(?:\|[a-z][a-z0-9-]*)+)[>\]]$/;

const hasChildren = (tree: CommandTree, commandPath: string): boolean =>
  (tree.children.get(commandPath)?.size ?? 0) > 0;

/**
 * Walks a reference's command-path prefix, ignoring arguments and flags.
 *
 * Consumption stops at the first token that cannot name a subcommand, or once
 * the walk reaches a leaf command. A bare word that is not a registered
 * subcommand of a group *is* reported: at that position the reference can only
 * have meant a command.
 */
const unknownCommandsIn = (reference: Reference, tree: CommandTree): ReadonlyArray<string> => {
  const [head, ...rest] = reference.text.replaceAll("\\|", "|").trim().split(/\s+/);

  if (head !== "axm" && head !== "!axm") {
    return [];
  }

  let commandPath = "axm";

  for (const token of rest) {
    const alternation = ALTERNATION_TOKEN.exec(token);
    if (alternation !== null) {
      const [, members = ""] = alternation;
      return members
        .split("|")
        .map((member) => `${commandPath} ${member}`)
        .filter((candidate) => !tree.paths.has(candidate));
    }

    if (!LITERAL_TOKEN.test(token)) {
      break;
    }

    const candidate = `${commandPath} ${token}`;
    if (tree.paths.has(candidate)) {
      commandPath = candidate;
      if (!hasChildren(tree, candidate)) {
        break;
      }
      continue;
    }

    if (hasChildren(tree, commandPath)) {
      return [candidate];
    }

    break;
  }

  return [];
};

const unresolvedIn = (
  references: ReadonlyArray<Reference>,
  tree: CommandTree,
): ReadonlyArray<UnresolvedReference> =>
  references.flatMap((reference) =>
    unknownCommandsIn(reference, tree).map((unknownCommand) => ({
      origin: reference.origin,
      text: reference.text,
      unknownCommand,
    })),
  );

/** Backticked `axm …` spans, including the `!axm …` invocation form. */
const BACKTICKED_COMMAND = /`(!?axm(?:[^`]*)?)`/g;

const markdownReferences = (origin: string, content: string): ReadonlyArray<Reference> =>
  Array.from(content.matchAll(BACKTICKED_COMMAND), ([, text = ""]) => ({ origin, text }));

/** `cmd:` / `command:` suggestion and example strings in CLI source. */
const SOURCE_COMMAND_LITERAL = /(?:cmd|command):\s*(["'`])(axm[^"'`]*)\1/g;

const sourceFiles = (root: string): ReadonlyArray<string> =>
  fs
    .readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".ts") &&
        !entry.name.endsWith(".test.ts") &&
        !entry.parentPath.includes("__generated__"),
    )
    .map((entry) => path.join(entry.parentPath, entry.name));

const docReferences = (): ReadonlyArray<Reference> => [
  ...HELP_TOPIC_NAMES.filter((name) => HELP_TOPIC_KINDS[name] === "markdown").flatMap((name) =>
    markdownReferences(`axm help ${name}`, HELP_TOPICS[name]),
  ),
  ...markdownReferences("@agentxm/skills/axm SKILL.md", AXM_SKILL_MD),
];

const suggestionReferences = (): ReadonlyArray<Reference> => {
  const srcRoot = import.meta.dirname;

  return sourceFiles(srcRoot).flatMap((file) =>
    Array.from(
      fs.readFileSync(file, "utf-8").matchAll(SOURCE_COMMAND_LITERAL),
      ([, , text = ""]) => ({
        origin: path.relative(srcRoot, file),
        text,
      }),
    ),
  );
};

const loadCommandTree = async (): Promise<CommandTree> =>
  buildCommandTree(await Effect.runPromise(collectHelpFiles()));

describe("shipped command references", () => {
  it("names only commands the CLI registers, in help topics and the bundled skill", async () => {
    const tree = await loadCommandTree();
    const references = docReferences();

    expect(references.length).toBeGreaterThan(100);
    expect(unresolvedIn(references, tree)).toEqual([]);
  });

  it("names only commands the CLI registers, in suggestion and example strings", async () => {
    const tree = await loadCommandTree();
    const references = suggestionReferences();

    expect(references.length).toBeGreaterThan(100);
    expect(unresolvedIn(references, tree)).toEqual([]);
  });

  it("keeps per-type install guidance aligned with the groups that register install", async () => {
    const tree = await loadCommandTree();
    const groupsWithInstall = extensionTypePluralSegments.filter((segment) =>
      tree.paths.has(`axm ${segment} install`),
    );

    expect(Array.from(perTypeInstallPluralSegments)).toEqual(groupsWithInstall);
  });

  it("names only help topics that exist", () => {
    const topicNames: ReadonlySet<string> = new Set(HELP_TOPIC_NAMES);
    const unknownTopics = docReferences().flatMap((reference) => {
      const [head, verb, topic] = reference.text.trim().split(/\s+/);
      return (head === "axm" || head === "!axm") &&
        verb === "help" &&
        topic !== undefined &&
        LITERAL_TOKEN.test(topic) &&
        !topicNames.has(topic)
        ? [`${reference.origin}: ${reference.text}`]
        : [];
    });

    expect(unknownTopics).toEqual([]);
  });
});
