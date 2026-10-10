import { withParameterDescription } from "../../cli-parameters.js";
import type { OutputWriteFailed } from "../../screen/index.js";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { Argument, CliError, Command } from "effect/cli";

import { type AppError, makeAppError } from "../../app-error/index.js";
import { quietFlag } from "../../cli-flags/index.js";
import {
  emitResult,
  type Screen,
  // eslint-disable-next-line @typescript-eslint/no-restricted-imports -- Pre-runtime help owns its Screen composition.
  InteractiveScreen,
  // eslint-disable-next-line @typescript-eslint/no-restricted-imports -- Pre-runtime help owns its Screen composition.
  MachineScreen,
  markdownDoc,
  rawDoc,
  resolveCliOutputPolicy,
  suggestionsDoc,
  tableDoc,
  type ViewColumn,
} from "../../screen/index.js";
import {
  resolveCliFormat,
  withArgvTracking,
  withCommandFailureReport,
} from "../../cli-runtime/index.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import { type SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import {
  HELP_TOPICS,
  HELP_TOPIC_KINDS,
  HELP_TOPIC_NAMES,
  type HelpTopicName,
} from "../../__generated__/help-topics.js";
import { HELP_TOPIC_DESCRIPTIONS } from "./help-topic-descriptions.js";

const helpConfig = {
  path: Argument.String("topic-or-command").pipe(
    withParameterDescription(
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
  "machine-output-schema",
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
  "agent-extensions-schema",
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
      kind: Schema.Literals(["markdown", "json-schema"]),
    }),
  ),
});
export type HelpIndexResult = typeof HelpIndexResultSchema.Type;

const JsonSchemaObject = Schema.Record(Schema.String, Schema.Unknown);

export const HelpTopicResultSchema = Schema.Union([
  Schema.Struct({
    topic: Schema.String,
    kind: Schema.Literal("markdown"),
    content: Schema.String,
  }),
  Schema.Struct({
    topic: Schema.String,
    kind: Schema.Literal("json-schema"),
    schema: JsonSchemaObject,
  }),
]);
export type HelpTopicResult = typeof HelpTopicResultSchema.Type;

interface HelpTopicRow {
  readonly topic: HelpTopicName;
  readonly description: string;
}

const helpTopicColumns: ReadonlyArray<ViewColumn<HelpTopicRow>> = [
  { header: "Topic", value: (row) => row.topic },
  { header: "Description", value: (row) => row.description },
];

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
    const rows: ReadonlyArray<HelpTopicRow> = ORDERED_TOPIC_NAMES.map((topic) => ({
      topic,
      description: HELP_TOPIC_DESCRIPTIONS[topic],
    }));
    yield* emitResult(
      {
        usage: "axm help <topic>",
        topics: rows.map(({ topic, description }) => ({
          name: topic,
          description,
          kind: HELP_TOPIC_KINDS[topic],
        })),
      },
      HelpIndexResultSchema,
      () => [...tableDoc(rows, helpTopicColumns), ...suggestionsDoc(HELP_INDEX_SUGGESTIONS)],
      { suggestions: HELP_INDEX_SUGGESTIONS },
    );
  });

const writeHelpTopic = (name: HelpTopicName) =>
  Effect.gen(function* () {
    const raw = HELP_TOPICS[name];
    const content = raw.endsWith("\n") ? raw : `${raw}\n`;
    // Bundled schemas are generated and validated at build time. A malformed
    // bundled asset violates that invariant rather than representing user input.
    const result: HelpTopicResult =
      HELP_TOPIC_KINDS[name] === "json-schema"
        ? {
            topic: name,
            kind: "json-schema",
            schema: Schema.decodeUnknownSync(Schema.fromJsonString(JsonSchemaObject))(raw),
          }
        : { topic: name, kind: "markdown", content };
    yield* emitResult(result, HelpTopicResultSchema, () =>
      result.kind === "json-schema" ? rawDoc(content) : markdownDoc(content),
    );
  });

export const resolveCommandPath = (
  root: Command.Command.Any,
  requestedPath: ReadonlyArray<string>,
): { readonly complete: boolean; readonly canonicalPath: ReadonlyArray<string> } => {
  let current = root;
  const canonicalPath: Array<string> = [];

  for (const segment of requestedPath) {
    const child = current.subcommands
      .flatMap((group) => group.commands)
      .find((command) => command.name === segment || command.alias === segment);
    if (child === undefined) return { complete: false, canonicalPath };

    canonicalPath.push(child.name);
    current = child;
  }

  return { complete: true, canonicalPath };
};

export const handleHelpPath = (
  path: ReadonlyArray<string>,
  root: Command.Command.Any,
): Effect.Effect<void, AppError | CliError.ShowHelp | OutputWriteFailed, Screen> => {
  if (path.length === 0) return writeHelpTopicIndex();

  const [singleTopic] = path;
  if (path.length === 1 && singleTopic !== undefined && isHelpTopicName(singleTopic)) {
    return writeHelpTopic(singleTopic);
  }

  const { complete, canonicalPath } = resolveCommandPath(root, path);
  if (complete) {
    return Effect.fail(
      new CliError.ShowHelp({ commandPath: [root.name, ...canonicalPath], errors: [] }),
    );
  }

  const requested = path.join(" ");
  return Effect.fail(
    makeAppError({
      code: "not_found",
      detail: `Unknown help topic or command path '${requested}'.`,
      suggestions: [
        {
          description: "Show command help",
          cmd: [root.name, ...canonicalPath, "--help"].join(" "),
        },
        { description: "List available help topics", cmd: "axm help" },
      ],
    }),
  );
};

export const makeHelpCommand = (getRootCommand: () => Command.Command.Any) =>
  Command.make("help", helpConfig, ({ path }) =>
    handleHelpPath(path, getRootCommand()).pipe(withCommandFailureReport("help")),
  ).pipe(
    Command.provide(helpRendererLayer),
    withArgvTracking(helpConfig),
    withCommandCapabilities(readOnlyCapabilities()),
    Command.withDescription("Show general help, a topic page, raw schema, or command help"),
    Command.withShortDescription("Show topic or command help"),
    Command.withExamples([
      { command: "axm help", description: "View help topics" },
      { command: "axm help basic-usage", description: "Read the basic usage guide" },
      { command: "axm help skills install", description: "Show nested command help" },
      {
        command: "axm help getting-started",
        description: "Read the setup and configuration guide",
      },
      { command: "axm help skills", description: "Read the skills topic" },
      {
        command: "axm help subagents",
        description: "Read the subagents topic",
      },
      { command: "axm help skill-schema", description: "Print the skill manifest JSON Schema" },
      { command: "axm help exit-codes", description: "Read the exit-code conventions" },
    ]),
  );
