import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
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

const writeHelpTopicIndex = () =>
  Effect.sync(() => {
    process.stdout.write(
      [
        "USAGE",
        "  axm help <topic>",
        "",
        "TOPICS",
        ...HELP_TOPIC_NAMES.map((name) => `  ${name}`),
        "",
        "Use 'axm <command> --help' for command help.",
        "",
      ].join("\n"),
    );
  });

const handleHelpTopic = (topic: Option.Option<string>) =>
  Option.match(topic, {
    onNone: () => writeHelpTopicIndex(),
    onSome: (name) => {
      if (isHelpTopicName(name)) {
        return Effect.sync(() => {
          process.stdout.write(HELP_TOPICS[name]);
          if (!HELP_TOPICS[name].endsWith("\n")) process.stdout.write("\n");
        });
      }

      return Effect.fail(
        makeAppError({
          code: "HELP_UNKNOWN_TOPIC",
          what: `Unknown help topic '${name}'`,
          details: [`Available topics: ${HELP_TOPIC_NAMES.join(", ")}`],
          howToFix: "Run 'axm help' to list commands or 'axm help basic-usage' to begin.",
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
    { command: "axm help", description: "Show top-level help" },
    { command: "axm help basic-usage", description: "Start using an existing workspace" },
    { command: "axm help getting-started", description: "Read the getting started guide" },
    { command: "axm help exit-codes", description: "Read exit status meanings" },
  ]),
);
