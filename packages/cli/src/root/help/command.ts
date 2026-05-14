import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Argument, Command } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  HELP_TOPICS,
  HELP_TOPIC_NAMES,
  type HelpTopicName,
} from "../../__generated__/help-topics.js";
import { withRuntime } from "../../runtime.js";

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
  "subagents",
  "commands",
  "packs",
  "package-extensions",
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
  content: Schema.String,
  topics: Schema.Array(Schema.String),
});

const HelpTopicResultSchema = Schema.Struct({
  topic: Schema.String,
  content: Schema.String,
});

const buildHelpIndexText = (): string =>
  [
    "USAGE",
    "  axm help <topic>",
    "",
    "TOPICS",
    ...ORDERED_TOPIC_NAMES.map((name) => `  ${name}`),
    "",
    "Use 'axm <command> --help' for command help.",
    "",
  ].join("\n");

const writeHelpTopicIndex = () =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const content = buildHelpIndexText();
    const emitted = yield* renderer.result(
      { content, topics: ORDERED_TOPIC_NAMES },
      HelpIndexResultSchema,
    );
    if (emitted) return;
    yield* renderer.markdown(content);
  });

const writeHelpTopic = (name: HelpTopicName) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const raw = HELP_TOPICS[name];
    const content = raw.endsWith("\n") ? raw : `${raw}\n`;
    const emitted = yield* renderer.result({ topic: name, content }, HelpTopicResultSchema);
    if (emitted) return;
    yield* renderer.markdown(content);
  });

export const handleHelpTopic = (topic: Option.Option<string>) =>
  Option.match(topic, {
    onNone: () => writeHelpTopicIndex(),
    onSome: (name) => {
      if (isHelpTopicName(name)) {
        return writeHelpTopic(name);
      }

      return Effect.fail(
        makeAppError({
          code: "not_found",
          detail: `Unknown help topic '${name}'`,
          breadcrumbs: [
            {
              description: "Run 'axm help' to list commands or 'axm help basic-usage' to begin.",
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
  Command.withDescription("Show general help or a markdown topic page"),
  Command.withExamples([
    { command: "axm help", description: "View help topics" },
    { command: "axm help basic-usage", description: "How to use AXM" },
    { command: "axm help getting-started", description: "How to set up and configure AXM" },
    { command: "axm help skills", description: "Managing agent skills with AXM" },
    {
      command: "axm help subagents",
      description: "Managing subagents with AXM",
    },
    { command: "axm help exit-codes", description: "Exit code conventions" },
  ]),
);
