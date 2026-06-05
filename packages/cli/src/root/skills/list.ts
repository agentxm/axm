import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import {
  CliRenderer,
  registerEntity,
  type TableView,
} from "@agentxm/client-core/unstable/cli-renderer";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { INSTALL_SKILL_FROM_REGISTRY } from "../suggested-actions.js";

export interface ListHandlerArgs {
  readonly agents: readonly string[];
}

interface SkillListItem {
  readonly name: string;
  readonly type: string;
  readonly agents: ReadonlyArray<string>;
}

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

registerEntity<SkillListItem>("skill", {
  list: {
    columns: SkillListTable.columns,
    emptyMessage: "No skills installed",
    singularLabel: "installed skill",
    pluralLabel: "installed skills",
  },
});

export const handleList = Effect.fn("List.handle")(function* (args: ListHandlerArgs) {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
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
    yield* renderer.list("skill", {
      items,
      count: items.length,
      emptyMessage:
        args.agents.length === 0
          ? "No skills installed"
          : "No skills matched the selected agent filter.",
      suggestions: items.length === 0 ? [INSTALL_SKILL_FROM_REGISTRY] : [],
    })
  ) {
    return;
  }
  if (items.length === 0) return;

  yield* renderer.table(items, SkillListTable, "Installed skills");
});

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List skills from project (default) or user-level configuration"),
  ),
  agent: Flag.string("agent").pipe(
    Flag.withDescription("Show only skills installed for specific agents"),
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
