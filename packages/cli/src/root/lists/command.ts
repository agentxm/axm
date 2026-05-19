import { Argument, Command, Flag } from "effect/unstable/cli";

import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { withAuthRuntime } from "../../runtime.js";
import {
  handleAddListItem,
  handleCreateList,
  handleDeleteList,
  handleGetList,
  handleListLists,
  handleRemoveListItem,
  handleUpdateList,
} from "./handler.js";

const visibilityValues = ["public", "internal", "private"] as const;

const listRefArgument = Argument.string("list").pipe(
  Argument.withDescription("List reference in @owner/list-name form"),
);

const extensionRefArgument = Argument.string("extension").pipe(
  Argument.withDescription("Extension reference in @owner/<type>/<name> form"),
);

const listListsConfig = {
  owner: Argument.string("owner").pipe(Argument.withDescription("Owner handle, e.g. @agentxm")),
} as const;

const getListConfig = {
  ref: listRefArgument,
} as const;

const createListConfig = {
  ref: listRefArgument,
  title: Flag.string("title").pipe(Flag.withDescription("List title")),
  description: Flag.string("description").pipe(
    Flag.withDescription("Optional list description"),
    Flag.optional,
  ),
  visibility: Flag.choice("visibility", visibilityValues).pipe(
    Flag.withDescription("List visibility"),
    Flag.withDefault("public" as const),
  ),
  unlisted: Flag.boolean("unlisted").pipe(Flag.withDescription("Hide from listed owner lists")),
} as const;

const updateListConfig = {
  ref: listRefArgument,
  name: Flag.string("name").pipe(Flag.withDescription("New list slug"), Flag.optional),
  title: Flag.string("title").pipe(Flag.withDescription("New list title"), Flag.optional),
  description: Flag.string("description").pipe(
    Flag.withDescription("New list description"),
    Flag.optional,
  ),
  clearDescription: Flag.boolean("clear-description").pipe(
    Flag.withDescription("Clear the list description"),
  ),
  visibility: Flag.choice("visibility", visibilityValues).pipe(
    Flag.withDescription("New list visibility"),
    Flag.optional,
  ),
  listed: Flag.boolean("listed").pipe(Flag.withDescription("Show in listed owner lists")),
  unlisted: Flag.boolean("unlisted").pipe(Flag.withDescription("Hide from listed owner lists")),
} as const;

const addItemConfig = {
  ref: listRefArgument,
  extension: extensionRefArgument,
  note: Flag.string("note").pipe(Flag.withDescription("Optional curator note"), Flag.optional),
} as const;

const removeItemConfig = {
  ref: listRefArgument,
  extension: extensionRefArgument,
} as const;

const listListsCommand = Command.make("list", listListsConfig, ({ owner }) =>
  handleListLists(owner).pipe(withAuthRuntime("lists list")),
).pipe(
  withArgvTracking(listListsConfig),
  Command.withDescription("List curated extension lists for an owner"),
  Command.withExamples([
    { command: "axm lists list @agentxm", description: "Show public lists for @agentxm" },
  ]),
);

const viewListCommand = Command.make("view", getListConfig, ({ ref }) =>
  handleGetList(ref).pipe(withAuthRuntime("lists view")),
).pipe(
  withArgvTracking(getListConfig),
  Command.withDescription("View a curated extension list"),
  Command.withExamples([
    { command: "axm lists view @agentxm/starter-kit", description: "View a list and its items" },
  ]),
);

const createListCommand = Command.make("create", createListConfig, (args) =>
  handleCreateList(args).pipe(withAuthRuntime("lists create")),
).pipe(
  withArgvTracking(createListConfig),
  Command.withDescription("Create a curated extension list"),
  Command.withExamples([
    {
      command: 'axm lists create @me/favorites --title "Favorites"',
      description: "Create a list",
    },
  ]),
);

const updateListCommand = Command.make("update", updateListConfig, (args) =>
  handleUpdateList(args).pipe(withAuthRuntime("lists update")),
).pipe(
  withArgvTracking(updateListConfig),
  Command.withDescription("Update a curated extension list"),
  Command.withExamples([
    {
      command: 'axm lists update @me/favorites --title "Favorite tools"',
      description: "Rename a list title",
    },
  ]),
);

const deleteListCommand = Command.make("delete", getListConfig, ({ ref }) =>
  handleDeleteList(ref).pipe(withAuthRuntime("lists delete")),
).pipe(
  withArgvTracking(getListConfig),
  Command.withDescription("Delete a curated extension list"),
  Command.withExamples([
    { command: "axm lists delete @me/favorites", description: "Delete a list" },
  ]),
);

const addListItemCommand = Command.make("add", addItemConfig, (args) =>
  handleAddListItem(args).pipe(withAuthRuntime("lists add")),
).pipe(
  withArgvTracking(addItemConfig),
  Command.withDescription("Add an extension to a list"),
  Command.withExamples([
    {
      command: "axm lists add @me/favorites @agentxm/skills/code-review",
      description: "Add an extension to a list",
    },
  ]),
);

const removeListItemCommand = Command.make("remove", removeItemConfig, ({ ref, extension }) =>
  handleRemoveListItem(ref, extension).pipe(withAuthRuntime("lists remove")),
).pipe(
  withArgvTracking(removeItemConfig),
  Command.withDescription("Remove an extension from a list"),
  Command.withExamples([
    {
      command: "axm lists remove @me/favorites @agentxm/skills/code-review",
      description: "Remove an extension from a list",
    },
  ]),
);

export const listsCommand = Command.make("lists").pipe(
  Command.withDescription("Manage curated extension lists"),
  Command.withSubcommands([
    listListsCommand,
    viewListCommand,
    createListCommand,
    updateListCommand,
    deleteListCommand,
    addListItemCommand,
    removeListItemCommand,
  ]),
  Command.withExamples([
    { command: "axm lists list @agentxm", description: "Show public lists for @agentxm" },
    { command: "axm lists view @agentxm/starter-kit", description: "View a list and its items" },
    {
      command: 'axm lists create @me/favorites --title "Favorites"',
      description: "Create a list",
    },
    {
      command: "axm lists add @me/favorites @agentxm/skills/code-review",
      description: "Add an extension to a list",
    },
  ]),
);
