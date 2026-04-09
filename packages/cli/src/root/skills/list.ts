import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { CliRenderer, type TableView } from "@axm.sh/core/unstable/cli-renderer";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

export interface ListHandlerArgs {
  readonly agents: readonly string[];
}

const SkillListItemSchema = Schema.Struct({
  name: Schema.String,
  type: Schema.String,
  agents: Schema.Array(Schema.String),
});
type SkillListItem = typeof SkillListItemSchema.Type;

const SkillListDocumentFields = {
  items: Schema.Array(SkillListItemSchema),
  count: Schema.Number,
} satisfies Schema.Struct.Fields;

const SkillListTable = {
  columns: {
    name: { header: "Name" },
    type: { header: "Type" },
    agents: {
      header: "Agents",
      render: (value: ReadonlyArray<string>) => (value.length === 0 ? "none" : value.join(", ")),
    },
  },
} as const satisfies TableView<SkillListItem>;

export const handleList = Effect.fn("List.handle")(function* (args: ListHandlerArgs) {
  const renderer = yield* CliRenderer;
  const ws = yield* Workspace;
  const skills = yield* ws.getLockedSkills();

  // Filter by agents if specified
  const entries = Object.entries(skills);
  const filtered =
    args.agents.length > 0
      ? entries.filter(([, entry]) => args.agents.some((agent) => entry.agents.includes(agent)))
      : entries;

  const items = filtered.map(([name, entry]) => ({
    name,
    type: entry.type,
    agents: entry.agents,
  }));

  if (
    yield* renderer.document("skills.list", { items, count: items.length }, SkillListDocumentFields)
  ) {
    return;
  }

  if (filtered.length === 0) {
    yield* renderer.info(
      args.agents.length === 0
        ? "No skills installed"
        : "No skills matched the selected agent filter.",
    );
    return;
  }

  yield* renderer.table(items, SkillListTable, "Installed skills");
});

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List skills from project (default) or user-level configuration"),
  ),
  agent: Flag.string("agent").pipe(
    Flag.withDescription("Show only skills installed for specific agent(s)"),
    Flag.atLeast(0),
  ),
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope, agent }) =>
  handleList({ agents: agent }).pipe(withWorkspace(scope), withRuntime("skills list")),
).pipe(
  withArgvTracking(listConfig),
  Command.withAlias("ls"),
  Command.withDescription("List installed skills"),
  Command.withExamples([
    { command: "axm skills list", description: "See what skills are installed" },
    {
      command: "axm skills list --scope user",
      description: "Check user-level skills",
    },
    {
      command: "axm skills list --agent claude-code",
      description: "See skills for a specific agent",
    },
  ]),
);
