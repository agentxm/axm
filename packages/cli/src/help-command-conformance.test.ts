import { describe, expect, it } from "@effect/vitest";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command } from "effect/unstable/cli";
import type { HelpDoc } from "effect/unstable/cli/HelpDoc";

import { TestRenderer } from "./screen/index.js";
import { toJsonHelpDoc } from "./cli-runtime/index.js";
import { rootCommand } from "./app.js";
import {
  captureHelpDoc,
  captureHelpRequestDoc,
  collectHelpFiles,
} from "./command-tree-test-helpers.js";
import { HELP_TOPIC_KINDS, HELP_TOPIC_NAMES, HELP_TOPICS } from "./__generated__/help-topics.js";
import { LearnMore } from "./formatter.js";
import { HelpTopicResultSchema, handleHelpPath } from "./root/help/command.js";

const helpSemantics = (doc: HelpDoc) =>
  toJsonHelpDoc(doc, { learnMore: ServiceMap.get(doc.annotations, LearnMore) });

const pathSegments = (commandPath: string): ReadonlyArray<string> =>
  commandPath.split(" ").slice(1);

interface CommandNode {
  readonly command: Command.Command.Any;
  readonly path: ReadonlyArray<string>;
}

const commandNodes = (
  command: Command.Command.Any = rootCommand,
  path: ReadonlyArray<string> = [],
): ReadonlyArray<CommandNode> => [
  { command, path },
  ...command.subcommands.flatMap((group) =>
    group.commands.flatMap((child) => commandNodes(child, [...path, child.name])),
  ),
];

const visibleSubcommands = (command: Command.Command.Any) => {
  const groups = command.subcommands.flatMap((group) => {
    const commands = group.commands
      .filter((child) => !child.unlisted)
      .map((child) => ({
        name: child.name,
        alias: child.alias,
        shortDescription: child.shortDescription,
        description: child.description ?? "",
      }));

    return commands.length === 0 ? [] : [{ group: group.group, commands }];
  });

  return groups.length === 0 ? undefined : groups;
};

describe("axm help command conformance", () => {
  it.effect("returns every bundled topic with its full content", () =>
    Effect.gen(function* () {
      for (const topic of HELP_TOPIC_NAMES) {
        const renderer = TestRenderer.make();
        yield* handleHelpPath([topic], rootCommand).pipe(Effect.provide(renderer.layer));
        const result = Schema.decodeUnknownSync(HelpTopicResultSchema)(
          renderer.state.results[0]?.data,
        );
        expect(result, topic).toEqual({
          topic,
          content: HELP_TOPICS[topic].endsWith("\n")
            ? HELP_TOPICS[topic]
            : `${HELP_TOPICS[topic]}\n`,
        });
      }
    }),
  );

  it.effect("matches canonical --help semantics for every non-colliding command path", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      const topicNames: ReadonlySet<string> = new Set(HELP_TOPIC_NAMES);

      for (const [commandPath, canonicalDoc] of files) {
        const path = pathSegments(commandPath);
        if (path.length === 0 || (path.length === 1 && topicNames.has(path[0] ?? ""))) continue;

        for (const json of [false, true]) {
          const helpDoc = yield* captureHelpRequestDoc(path, { json });
          expect(helpSemantics(helpDoc), `${commandPath} json=${json}`).toStrictEqual(
            helpSemantics(canonicalDoc),
          );
        }
      }
    }),
  );

  it.effect("uses the canonical extension identity metavariables", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      const retiredNames = new Set([
        "fqn",
        "handle",
        "target",
        "selectors",
        "extensions",
        "skill",
        "subagent",
        "name-or-fqn",
        "pack",
      ]);
      const retiredArguments = Array.from(files).flatMap(([command, doc]) =>
        (doc.args ?? []).flatMap((arg) =>
          retiredNames.has(arg.name) ? [`${command} <${arg.name}>`] : [],
        ),
      );

      expect(retiredArguments).toEqual([]);

      const expectedArguments = new Map<string, ReadonlyArray<string>>([
        ["axm install", ["source"]],
        ["axm update", ["extension[@version]"]],
        ["axm uninstall", ["extension[@version]"]],
        ["axm adopt", ["extension"]],
        ["axm demote", ["extension", "source"]],
        ["axm fork", ["source", "extension"]],
        ["axm skills import", ["source", "extension"]],
        ["axm subagents import", ["source", "extension"]],
        ["axm sync", ["extension"]],
        ["axm view", ["extension", "field"]],
        ["axm version", ["extension", "bump", "version"]],
        ["axm publish", ["extension"]],
        ["axm skills publish", ["name"]],
        ["axm subagents publish", ["name"]],
        ["axm mcps publish", ["name"]],
        ["axm rules publish", ["name"]],
        ["axm hooks publish", ["name"]],
        ["axm knowledge publish", ["name"]],
        ["axm packs publish", ["name"]],
        ["axm packs show", ["extension"]],
        ["axm packs add", ["name", "extension"]],
        ["axm packs remove", ["name", "extension"]],
        ["axm skills uninstall", ["name"]],
        ["axm subagents uninstall", ["name"]],
      ]);

      for (const [command, expected] of expectedArguments) {
        const doc = files.get(command);
        expect(doc, `missing help for ${command}`).toBeDefined();
        expect(
          doc?.args?.map((arg) => arg.name),
          command,
        ).toEqual(expected);
      }
    }),
  );

  it.effect("derives every parent membership row from registered command metadata", () =>
    Effect.gen(function* () {
      for (const node of commandNodes()) {
        const doc = yield* captureHelpDoc(node.path);
        expect(doc.subcommands, node.path.join(" ") || "axm").toStrictEqual(
          visibleSubcommands(node.command),
        );
      }
    }),
  );

  it.effect("gives exact topics precedence and links every collision to command help", () =>
    Effect.gen(function* () {
      const rootChildren = new Set(
        rootCommand.subcommands.flatMap((group) => group.commands.map((command) => command.name)),
      );
      const collisions = HELP_TOPIC_NAMES.filter((topic) => rootChildren.has(topic));

      expect(collisions).toContain("upgrade");
      for (const topic of collisions) {
        expect(HELP_TOPIC_KINDS[topic], topic).toBe("markdown");
        expect(HELP_TOPICS[topic], topic).toContain(`axm ${topic} --help`);

        const renderer = TestRenderer.make();
        yield* handleHelpPath([topic], rootCommand).pipe(Effect.provide(renderer.layer));
        expect(renderer.state.results[0]?.data, topic).toEqual({
          topic,
          content: HELP_TOPICS[topic],
        });
      }
    }),
  );

  it.effect("uses one not-found policy for unknown root and nested paths", () =>
    Effect.gen(function* () {
      for (const path of [["not-a-topic"], ["skills", "not-a-command"], ["publish", "bogus"]]) {
        const renderer = TestRenderer.make();
        const error = yield* Effect.flip(
          handleHelpPath(path, rootCommand).pipe(Effect.provide(renderer.layer)),
        );
        expect(error, path.join(" ")).toMatchObject({
          _tag: "AppError",
          code: "not_found",
          detail: `Unknown help topic or command path '${path.join(" ")}'.`,
          suggestions: [
            {
              description: "List available help topics.",
              cmd: "axm help",
            },
          ],
        });
      }
    }),
  );

  it.effect(
    "runs topic and command routing without workspace, auth, registry, or network layers",
    () =>
      Effect.gen(function* () {
        const renderer = TestRenderer.make();

        yield* handleHelpPath(["basic-usage"], rootCommand).pipe(Effect.provide(renderer.layer));
        const commandSignal = yield* Effect.flip(
          handleHelpPath(["skills", "install"], rootCommand).pipe(Effect.provide(renderer.layer)),
        );

        expect(commandSignal).toMatchObject({
          _tag: "ShowHelp",
          commandPath: ["axm", "skills", "install"],
          errors: [],
        });
      }),
  );
});
