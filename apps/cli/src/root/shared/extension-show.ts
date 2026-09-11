import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import {
  Screen,
  detailViewDoc,
  tableViewDoc,
  type DetailView,
  type TableView,
} from "../../screen/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { readOnlyCapabilities, withCommandCapabilities } from "./command-capabilities.js";
import type { CatalogExtensionType } from "@agentxm/extension-model/unstable/extension-types";
import { extensionTypeSentenceLabels } from "@agentxm/extension-model/unstable/extensions";
import { ExtensionShowResultSchema, ShowExtension } from "@agentxm/workspace-inspection";

import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { extensionNotInstalledToAppError } from "../inspection-errors.js";

interface ShowDetailRow {
  readonly type: string;
  readonly name: string;
  readonly enabled: string;
  readonly source: string;
  readonly version: string;
  readonly scope: string;
  readonly locked: string;
}

const ShowDetail = {
  fields: {
    type: { label: "Type" },
    name: { label: "Name" },
    enabled: { label: "Enabled" },
    source: { label: "Source" },
    version: { label: "Version" },
    scope: { label: "Scope" },
    locked: { label: "Locked" },
  },
} as const satisfies DetailView<ShowDetailRow>;

interface ShowAgentRow {
  readonly agent: string;
  readonly status: string;
  readonly path: string;
  readonly detail: string;
}

const AgentTable = {
  columns: {
    agent: { header: "Agent" },
    status: { header: "Status" },
    path: { header: "Path" },
    detail: { header: "Detail" },
  },
} as const satisfies TableView<ShowAgentRow>;

const yesNo = (value: boolean): string => (value ? "yes" : "no");

export const handleExtensionShow = Effect.fn("ExtensionShow.handle")(function* (args: {
  readonly type: CatalogExtensionType;
  readonly name: string;
}) {
  const screen = yield* Screen;
  const result = yield* Effect.catchTag(
    ShowExtension.query(args),
    "ExtensionNotInstalled",
    (failure) => Effect.fail(extensionNotInstalledToAppError(failure)),
  );
  const label = extensionTypeSentenceLabels[args.type];

  if (yield* screen.document(result, ExtensionShowResultSchema)) return;

  yield* screen.result(
    detailViewDoc(
      {
        type: args.type,
        name: args.name,
        enabled: result.item.enabled === null ? "n/a" : yesNo(result.item.enabled),
        source: result.item.source,
        version: result.item.version ?? "n/a",
        scope: result.item.scope,
        locked: yesNo(result.item.locked),
      },
      ShowDetail,
      `${label} ${args.name}`,
    ),
  );

  if (result.agents.length > 0) {
    yield* screen.result(
      tableViewDoc(
        result.agents.map((agent) => ({
          agent: agent.agent,
          status: agent.status,
          path: agent.path ?? "",
          detail: `${agent.reasonCode}: ${
            agent.reason ??
            (agent.fields.length > 0
              ? agent.fields.join(", ")
              : agent.warnings.length > 0
                ? agent.warnings.join("; ")
                : "no additional detail")
          }`,
        })),
        AgentTable,
        "Agent placements",
      ),
    );
  }
});

/**
 * Builds one group's `show` verb. Every catalog type gets the same argument
 * shape and the same result document; only the type id differs.
 */
export const makeExtensionShowCommand = (args: {
  readonly type: CatalogExtensionType;
  readonly group: string;
  readonly exampleName: string;
}) => {
  const label = extensionTypeSentenceLabels[args.type];
  const showConfig = {
    name: Argument.String("name").pipe(Argument.withDescription(`Name of the ${label} to inspect`)),
    scope: scopeFlag.pipe(
      Flag.withDescription("Inspect project (default) or user-level configuration"),
    ),
  } as const;

  return Command.make("show", showConfig, ({ name, scope }) =>
    handleExtensionShow({ type: args.type, name }).pipe(
      withWorkspace({ scope, allowUninitialized: true }),
      withRuntime(`${args.group} show`),
    ),
  ).pipe(
    withArgvTracking(showConfig),
    withCommandCapabilities(readOnlyCapabilities()),
    Command.withDescription(`Inspect one installed ${label}`),
    Command.withExamples([
      {
        command: `axm ${args.group} show ${args.exampleName}`,
        description: `Inspect one installed ${label}`,
      },
      {
        command: `axm ${args.group} show ${args.exampleName} --scope user`,
        description: `Inspect a user-level ${label}`,
      },
    ]),
  );
};
