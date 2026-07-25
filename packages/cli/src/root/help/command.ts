import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Argument, Command } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer, type TableView } from "@agentxm/client-core/unstable/cli-renderer";
import { type SuggestedAction, withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  HELP_TOPICS,
  HELP_TOPIC_KINDS,
  HELP_TOPIC_NAMES,
  type HelpTopicName,
} from "../../__generated__/help-topics.js";
import { withRuntime } from "../../runtime.js";
import { HELP_TOPIC_DESCRIPTIONS } from "./help-topic-descriptions.js";

const helpConfig = {
  topic: Argument.string("topic").pipe(
    Argument.withDescription("Help topic, such as basic-usage or getting-started"),
    Argument.optional,
  ),
} as const;

const isHelpTopicName = (topic: string): topic is HelpTopicName =>
  HELP_TOPIC_NAMES.some((knownTopic) => knownTopic === topic);

// Curated reading order for the help index. Topics not listed here fall through
// to the end in alphabetical order, so adding a new topic file won't break the build.
const TOPIC_ORDER: ReadonlyArray<HelpTopicName> = [
  "getting-started",
  "basic-usage",
  "skills",
  "skill-schema",
  "subagents",
  "subagent-schema",
  "commands",
  "command-schema",
  "files",
  "files-schema",
  "hooks",
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

const HelpIndexResultSchema = Schema.Struct({
  usage: Schema.String,
  topics: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      description: Schema.String,
    }),
  ),
});

const HelpTopicResultSchema = Schema.Struct({
  topic: Schema.String,
  content: Schema.String,
});

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

const writeHelpTopicIndex = () =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const rows: ReadonlyArray<HelpTopicRow> = ORDERED_TOPIC_NAMES.map((topic) => ({
      topic,
      description: HELP_TOPIC_DESCRIPTIONS[topic],
    }));
    const emitted = yield* renderer.result(
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
    yield* renderer.table(rows, HelpTopicTableView);
    yield* renderer.suggestions(HELP_INDEX_SUGGESTIONS);
  });

const writeHelpTopic = (name: HelpTopicName) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const raw = HELP_TOPICS[name];
    const content = raw.endsWith("\n") ? raw : `${raw}\n`;
    const emitted = yield* renderer.result({ topic: name, content }, HelpTopicResultSchema);
    if (emitted) return;
    if (HELP_TOPIC_KINDS[name] === "json-schema") {
      yield* renderer.raw(content);
      return;
    }
    yield* renderer.markdown(content);
  });

export const handleHelpTopic = (topic: Option.Option<string>) =>
  Option.match(topic, {
    onNone: () => writeHelpTopicIndex(),
    onSome: (rawName) => {
      const name = rawName;
      if (isHelpTopicName(name)) {
        return writeHelpTopic(name);
      }

      return Effect.fail(
        makeAppError({
          code: "not_found",
          detail: `Unknown help topic '${rawName}'. Known topics include: ${ORDERED_TOPIC_NAMES.join(", ")}`,
          suggestions: [
            {
              description: "List available help topics.",
              cmd: "axm help",
            },
          ],
        }),
      );
    },
  });

export const helpCommand = Command.make("help", helpConfig, ({ topic }) =>
  handleHelpTopic(topic).pipe(withRuntime("help")),
).pipe(
  withArgvTracking(helpConfig),
  Command.withDescription("Show general help, a topic page, or a raw schema"),
  Command.withExamples([
    { command: "axm help", description: "View help topics" },
    { command: "axm help basic-usage", description: "How to use AXM" },
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
