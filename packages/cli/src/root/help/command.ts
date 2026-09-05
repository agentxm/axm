import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { Argument, CliError, Command } from "effect/unstable/cli";

import { type AppError, makeAppError } from "../../app-error/index.js";
import { quietFlag } from "../../cli-flags/index.js";
import {
  Screen,
  InteractiveScreen,
  MachineScreen,
  markdownDoc,
  rawDoc,
  resolveCliOutputPolicy,
  suggestionsDoc,
  tableViewDoc,
  type TableView,
} from "../../screen/index.js";
import { resolveCliFormat, withArgvTracking } from "../../cli-runtime/index.js";
import { type SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import {
  HELP_TOPICS,
  HELP_TOPIC_KINDS,
  HELP_TOPIC_NAMES,
  type HelpTopicName,
} from "../../__generated__/help-topics.js";
import { HELP_TOPIC_DESCRIPTIONS } from "./help-topic-descriptions.js";

const helpConfig = {
  path: Argument.string("topic-or-command").pipe(
    Argument.withDescription(
      "Help topic or command path, such as basic-usage, skills install, or agents add",
    ),
    Argument.variadic(),
  ),
} as const;

const isHelpTopicName = (topic: string): topic is HelpTopicName =>
  HELP_TOPIC_NAMES.some((knownTopic) => knownTopic === topic);

// Curated reading order for the help index. Topics not listed here fall through
// to the end in alphabetical order, so adding a new topic file won't break the build.
const TOPIC_ORDER: ReadonlyArray<HelpTopicName> = [
  "getting-started",
  "basic-usage",
  "machine-output",
  "authoring",
  "skills",
  "skill-schema",
  "subagents",
  "subagent-schema",
  "hooks",
  "knowledge",
  "mcps",
  "rules",
  "packs",
  "pack-schema",
  "package-extensions",
  "settings",
  "settings-schema",
  "mcp-schema",
  "axm-lock-schema",
  "axm-package-meta-schema",
  "exit-codes",
];

export const ORDERED_TOPIC_NAMES: ReadonlyArray<HelpTopicName> = (() => {
  const rank = new Map(TOPIC_ORDER.map((name, index) => [name, index]));
  return [...HELP_TOPIC_NAMES].sort((a, b) => {
    const ra = rank.get(a) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b) ?? Number.MAX_SAFE_INTEGER;
    return ra === rb ? a.localeCompare(b) : ra - rb;
  });
})();

export const HelpIndexResultSchema = Schema.Struct({
  usage: Schema.String,
  topics: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      description: Schema.String,
    }),
  ),
});
export type HelpIndexResult = typeof HelpIndexResultSchema.Type;

export const HelpTopicResultSchema = Schema.Struct({
  topic: Schema.String,
  content: Schema.String,
});
export type HelpTopicResult = typeof HelpTopicResultSchema.Type;

interface HelpTopicRow {
  readonly topic: HelpTopicName;
  readonly description: string;
}

const HelpTopicTableView = {
  columns: {
    topic: { header: "Topic" },
    description: { header: "Description" },
  },
} as const satisfies TableView<HelpTopicRow>;

const HELP_INDEX_SUGGESTIONS = [
  {
    description: "Read a help topic",
    cmd: "axm help <topic>",
  },
  {
    description: "Show command help",
    cmd: "axm <command> --help",
  },
] as const satisfies ReadonlyArray<SuggestedAction>;

const UNKNOWN_TOPIC_SUGGESTIONS = [
  {
    description: "List available help topics.",
    cmd: "axm help",
  },
] as const satisfies ReadonlyArray<SuggestedAction>;

const helpRendererLayer = Layer.unwrap(
  Effect.gen(function* () {
    const format = yield* resolveCliFormat;
    const quiet = yield* quietFlag;
    const outputPolicy = resolveCliOutputPolicy({ quiet });

    return format === "json"
      ? MachineScreen({ quiet: outputPolicy.quiet })
      : InteractiveScreen({ outputPolicy });
  }),
);

const writeHelpTopicIndex = () =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    const rows: ReadonlyArray<HelpTopicRow> = ORDERED_TOPIC_NAMES.map((topic) => ({
      topic,
      description: HELP_TOPIC_DESCRIPTIONS[topic],
    }));
    const emitted = yield* screen.document(
      {
        usage: "axm help <topic>",
        topics: rows.map(({ topic, description }) => ({ name: topic, description })),
      },
      HelpIndexResultSchema,
      { suggestions: HELP_INDEX_SUGGESTIONS },
    );
    if (emitted) return;
    // Render the index through the renderer's structured table so topics align
    // in columns and pick up the standard chrome — no Markdown reflow.
    yield* screen.result(tableViewDoc(rows, HelpTopicTableView));
    yield* screen.note(suggestionsDoc(HELP_INDEX_SUGGESTIONS));
  });

const writeHelpTopic = (name: HelpTopicName) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    const raw = HELP_TOPICS[name];
    const content = raw.endsWith("\n") ? raw : `${raw}\n`;
    const emitted = yield* screen.document({ topic: name, content }, HelpTopicResultSchema);
    if (emitted) return;
    if (HELP_TOPIC_KINDS[name] === "json-schema") {
      yield* screen.result(rawDoc(content));
      return;
    }
    yield* screen.result(markdownDoc(content));
  });

export const resolveCommandPath = (
  root: Command.Command.Any,
  requestedPath: ReadonlyArray<string>,
): ReadonlyArray<string> | undefined => {
  let current = root;
  const canonicalPath: Array<string> = [];

  for (const segment of requestedPath) {
    const child = current.subcommands
      .flatMap((group) => group.commands)
      .find((command) => command.name === segment || command.alias === segment);
    if (child === undefined) return undefined;

    canonicalPath.push(child.name);
    current = child;
  }

  return canonicalPath;
};

export const handleHelpPath = (
  path: ReadonlyArray<string>,
  root: Command.Command.Any,
): Effect.Effect<void, AppError | CliError.ShowHelp, Screen> => {
  if (path.length === 0) return writeHelpTopicIndex();

  const [singleTopic] = path;
  if (path.length === 1 && singleTopic !== undefined && isHelpTopicName(singleTopic)) {
    return writeHelpTopic(singleTopic);
  }

  const canonicalPath = resolveCommandPath(root, path);
  if (canonicalPath !== undefined) {
    return Effect.fail(
      new CliError.ShowHelp({ commandPath: [root.name, ...canonicalPath], errors: [] }),
    );
  }

  const requested = path.join(" ");
  return Effect.fail(
    makeAppError({
      code: "not_found",
      detail: `Unknown help topic or command path '${requested}'.`,
      suggestions: UNKNOWN_TOPIC_SUGGESTIONS,
    }),
  );
};

export const makeHelpCommand = (getRootCommand: () => Command.Command.Any) =>
  Command.make("help", helpConfig, ({ path }) => handleHelpPath(path, getRootCommand())).pipe(
    Command.provide(helpRendererLayer),
    withArgvTracking(helpConfig),
    Command.withDescription("Show general help, a topic page, raw schema, or command help"),
    Command.withShortDescription("Show topic or command help"),
    Command.withExamples([
      { command: "axm help", description: "View help topics" },
      { command: "axm help basic-usage", description: "How to use AXM" },
      { command: "axm help skills install", description: "Show nested command help" },
      { command: "axm help getting-started", description: "How to set up and configure AXM" },
      { command: "axm help skills", description: "Managing agent skills with AXM" },
      {
        command: "axm help subagents",
        description: "Managing subagents with AXM",
      },
      { command: "axm help skill-schema", description: "Print the skill manifest JSON Schema" },
      { command: "axm help exit-codes", description: "Exit code conventions" },
    ]),
  );
