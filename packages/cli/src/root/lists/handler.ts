import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { RegistryUrl } from "@agentxm/client-core/unstable/auth";
import {
  CliRenderer,
  type DetailView,
  type TableView,
} from "@agentxm/client-core/unstable/cli-renderer";
import {
  extensionTypeToPlural,
  normalizeHandle,
  parseExtensionFqnParts,
  type ExtensionName,
  type ExtensionType,
  type Handle,
} from "@agentxm/client-core/unstable/extensions";
import {
  createRegistryClient,
  type RegistryList,
  type RegistryListDetail,
  type RegistryListItem,
} from "@agentxm/client-core/unstable/registry";

const LIST_NAME_PATTERN = /^[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?$/;

const ListVisibilitySchema = Schema.Literals(["public", "internal", "private"]);

const ListWireSchema = Schema.Struct({
  id: Schema.String,
  owner: Schema.String,
  name: Schema.String,
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  visibility: ListVisibilitySchema,
  listed: Schema.Boolean,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

const ListItemWireSchema = Schema.Struct({
  id: Schema.String,
  extensionOwner: Schema.String,
  extensionType: Schema.String,
  extensionName: Schema.String,
  position: Schema.Number,
  note: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  install: Schema.String,
});

const ListCollectionDocumentSchema = Schema.Struct({
  data: Schema.Struct({
    lists: Schema.Array(ListWireSchema),
  }),
});

const ListDetailDocumentSchema = Schema.Struct({
  data: Schema.Struct({
    list: ListWireSchema,
    items: Schema.Array(ListItemWireSchema),
  }),
});

const ListMutationDocumentSchema = Schema.Struct({
  data: Schema.Struct({
    owner: Schema.String,
    name: Schema.String,
    action: Schema.String,
  }),
});

interface ParsedListRef {
  readonly owner: Handle;
  readonly name: string;
}

interface ParsedExtensionRef {
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
}

interface ListTableRow {
  readonly name: string;
  readonly title: string;
  readonly visibility: string;
  readonly listed: string;
}

interface ListItemTableRow {
  readonly extension: string;
  readonly note: string;
  readonly install: string;
}

interface MutationDetailItem {
  readonly owner: string;
  readonly name: string;
  readonly action: string;
}

const ListTable = {
  columns: {
    name: { header: "Name" },
    title: { header: "Title" },
    visibility: { header: "Visibility" },
    listed: { header: "Listed" },
  },
} as const satisfies TableView<ListTableRow>;

const ListItemTable = {
  columns: {
    extension: { header: "Extension" },
    note: { header: "Note" },
    install: { header: "Install" },
  },
} as const satisfies TableView<ListItemTableRow>;

const MutationDetail = {
  fields: {
    owner: { label: "Owner" },
    name: { label: "List" },
    action: { label: "Action" },
  },
} as const satisfies DetailView<MutationDetailItem>;

const parseListRef = (raw: string): Effect.Effect<ParsedListRef, ReturnType<typeof makeAppError>> =>
  Effect.try({
    try: () => {
      const [ownerPart, namePart, extra] = raw.split("/");
      if (ownerPart === undefined || namePart === undefined || extra !== undefined) {
        throw new Error("Invalid list reference");
      }
      if (!LIST_NAME_PATTERN.test(namePart)) {
        throw new Error("Invalid list name");
      }
      return {
        owner: normalizeHandle(ownerPart),
        name: namePart,
      };
    },
    catch: () =>
      makeAppError({
        code: "validation",
        detail: `Invalid list reference: ${raw}`,
        suggestions: [{ description: "Use @owner/list-name." }],
      }),
  });

const parseOwner = (raw: string): Effect.Effect<Handle, ReturnType<typeof makeAppError>> =>
  Effect.try({
    try: () => normalizeHandle(raw),
    catch: () =>
      makeAppError({
        code: "validation",
        detail: `Invalid owner handle: ${raw}`,
        suggestions: [{ description: "Use a handle like @agentxm." }],
      }),
  });

const parseExtensionRef = (
  raw: string,
): Effect.Effect<ParsedExtensionRef, ReturnType<typeof makeAppError>> =>
  Effect.gen(function* () {
    const parts = parseExtensionFqnParts(raw);
    if (parts === undefined) {
      return yield* makeAppError({
        code: "validation",
        detail: `Invalid extension reference: ${raw}`,
        suggestions: [{ description: "Use @owner/skills/name or another extension FQN." }],
      });
    }
    return parts;
  });

const listUrl = (list: RegistryList): string => `${list.owner}/${list.name}`;

const itemInstall = (item: RegistryListItem): string =>
  `axm ${extensionTypeToPlural[item.extensionType]} install ${item.extensionOwner}/${extensionTypeToPlural[item.extensionType]}/${item.extensionName}`;

const normalizePosition = (position: RegistryListItem["position"]): number =>
  typeof position === "number" && Number.isFinite(position) ? position : 0;

const toListWire = (list: RegistryList) => ({
  id: list.id,
  owner: list.owner,
  name: list.name,
  title: list.title,
  description: list.description,
  visibility: list.visibility,
  listed: list.listed,
  createdAt: list.createdAt,
  updatedAt: list.updatedAt,
});

const toItemWire = (item: RegistryListItem) => ({
  id: item.id,
  extensionOwner: item.extensionOwner,
  extensionType: item.extensionType,
  extensionName: item.extensionName,
  position: normalizePosition(item.position),
  note: item.note,
  createdAt: item.createdAt,
  install: itemInstall(item),
});

const registryClient = Effect.gen(function* () {
  const registryUrl = yield* RegistryUrl;
  return yield* createRegistryClient(registryUrl);
});

export const handleListLists = (ownerInput: string) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const owner = yield* parseOwner(ownerInput);
    const client = yield* registryClient;
    const result = yield* client.listLists(owner);
    const lists = result.items.map(toListWire);

    if (yield* renderer.result({ data: { lists } }, ListCollectionDocumentSchema)) {
      return;
    }

    yield* renderer.table(
      lists.map((list) => ({
        name: list.name,
        title: list.title,
        visibility: list.visibility,
        listed: list.listed ? "yes" : "no",
      })),
      ListTable,
    );
  });

const renderListDetail = (detail: RegistryListDetail) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const list = toListWire(detail.list);
    const items = detail.items.map(toItemWire);

    if (yield* renderer.result({ data: { list, items } }, ListDetailDocumentSchema)) {
      return;
    }

    yield* renderer.detail(
      {
        owner: list.owner,
        name: list.name,
        action: `${list.title} (${list.visibility}${list.listed ? ", listed" : ", unlisted"})`,
      },
      MutationDetail,
      listUrl(detail.list),
    );

    if (items.length === 0) {
      yield* renderer.info("No visible items.");
      return;
    }

    yield* renderer.table(
      items.map((item) => ({
        extension: `${item.extensionOwner}/${extensionTypeToPlural[item.extensionType]}/${item.extensionName}`,
        note: item.note ?? "",
        install: item.install,
      })),
      ListItemTable,
    );
  });

export const handleGetList = (refInput: string) =>
  Effect.gen(function* () {
    const ref = yield* parseListRef(refInput);
    const client = yield* registryClient;
    const detail = yield* client.getList(ref);
    yield* renderListDetail(detail);
  });

const renderMutation = (item: MutationDetailItem) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    if (yield* renderer.result({ data: item }, ListMutationDocumentSchema)) {
      return;
    }
    yield* renderer.detail(item, MutationDetail, "List updated");
  });

export interface CreateListArgs {
  readonly ref: string;
  readonly title: string;
  readonly description: Option.Option<string>;
  readonly visibility: "public" | "internal" | "private";
  readonly unlisted: boolean;
}

export const handleCreateList = (args: CreateListArgs) =>
  Effect.gen(function* () {
    const ref = yield* parseListRef(args.ref);
    const client = yield* registryClient;
    const list = yield* client.createList({
      owner: ref.owner,
      payload: {
        name: ref.name,
        title: args.title,
        description: Option.getOrNull(args.description),
        visibility: args.visibility,
        listed: !args.unlisted,
      },
    });
    yield* renderMutation({ owner: list.owner, name: list.name, action: "created" });
  });

export interface UpdateListArgs {
  readonly ref: string;
  readonly name: Option.Option<string>;
  readonly title: Option.Option<string>;
  readonly description: Option.Option<string>;
  readonly clearDescription: boolean;
  readonly visibility: Option.Option<"public" | "internal" | "private">;
  readonly listed: boolean;
  readonly unlisted: boolean;
}

export const handleUpdateList = (args: UpdateListArgs) =>
  Effect.gen(function* () {
    if (args.listed && args.unlisted) {
      return yield* makeAppError({
        code: "validation",
        detail: "Use either --listed or --unlisted, not both.",
      });
    }

    const ref = yield* parseListRef(args.ref);
    const client = yield* registryClient;
    const list = yield* client.updateList({
      owner: ref.owner,
      name: ref.name,
      payload: {
        ...(Option.isSome(args.name) ? { name: args.name.value } : {}),
        ...(Option.isSome(args.title) ? { title: args.title.value } : {}),
        ...(Option.isSome(args.description) ? { description: args.description.value } : {}),
        ...(args.clearDescription ? { description: null } : {}),
        ...(Option.isSome(args.visibility) ? { visibility: args.visibility.value } : {}),
        ...(args.listed ? { listed: true } : {}),
        ...(args.unlisted ? { listed: false } : {}),
      },
    });
    yield* renderMutation({ owner: list.owner, name: list.name, action: "updated" });
  });

export const handleDeleteList = (refInput: string) =>
  Effect.gen(function* () {
    const ref = yield* parseListRef(refInput);
    const client = yield* registryClient;
    yield* client.deleteList(ref);
    yield* renderMutation({ owner: ref.owner, name: ref.name, action: "deleted" });
  });

export interface AddListItemArgs {
  readonly ref: string;
  readonly extension: string;
  readonly note: Option.Option<string>;
}

export const handleAddListItem = (args: AddListItemArgs) =>
  Effect.gen(function* () {
    const ref = yield* parseListRef(args.ref);
    const extension = yield* parseExtensionRef(args.extension);
    const client = yield* registryClient;
    yield* client.addListItem({
      owner: ref.owner,
      name: ref.name,
      payload: {
        owner: extension.owner,
        type: extension.type,
        name: extension.name,
        note: Option.getOrNull(args.note),
      },
    });
    yield* renderMutation({ owner: ref.owner, name: ref.name, action: "item added" });
  });

export const handleRemoveListItem = (refInput: string, extensionInput: string) =>
  Effect.gen(function* () {
    const ref = yield* parseListRef(refInput);
    const extension = yield* parseExtensionRef(extensionInput);
    const client = yield* registryClient;
    yield* client.removeListItem({
      owner: ref.owner,
      name: ref.name,
      extensionOwner: extension.owner,
      extensionType: extension.type,
      extensionName: extension.name,
    });
    yield* renderMutation({ owner: ref.owner, name: ref.name, action: "item removed" });
  });
