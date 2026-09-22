import { withLiveOperation } from "../../operation-lifecycle.js";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import {
  emitResult,
  fieldsDoc,
  headlineDoc,
  tableDoc,
  type ViewColumn,
  type ViewField,
} from "../../screen/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { readOnlyCapabilities, withCommandCapabilities } from "./command-capabilities.js";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { extensionTypeSentenceLabels } from "@agentxm/extension-model/unstable/extensions";
import { ExtensionShowResultSchema, ShowExtension } from "@agentxm/workspace/inspection";

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

const showFields: ReadonlyArray<ViewField<ShowDetailRow>> = [
  { label: "Type", value: (row) => row.type },
  { label: "Name", value: (row) => row.name },
  { label: "Enabled", value: (row) => row.enabled },
  { label: "Source", value: (row) => row.source },
  { label: "Version", value: (row) => row.version },
  { label: "Scope", value: (row) => row.scope },
  { label: "Locked", value: (row) => row.locked },
];

interface ShowAgentRow {
  readonly agent: string;
  readonly status: string;
  readonly path: string;
  readonly detail: string;
}

const agentColumns: ReadonlyArray<ViewColumn<ShowAgentRow>> = [
  { header: "Agent", value: (row) => row.agent },
  { header: "Status", value: (row) => row.status },
  { header: "Path", value: (row) => row.path },
  { header: "Detail", value: (row) => row.detail },
];

const yesNo = (value: boolean): string => (value ? "yes" : "no");

export const handleExtensionShow = Effect.fn("ExtensionShow.handle")(function* (args: {
  readonly type: InstallableExtensionType;
  readonly name: string;
}) {
  const result = yield* withLiveOperation(
    { command: "extension.show", name: "Inspect extension", mode: "preview" },
    Effect.catchTag(ShowExtension.query(args), "ExtensionNotInstalled", (failure) =>
      Effect.fail(extensionNotInstalledToAppError(failure)),
    ),
  );
  const label = extensionTypeSentenceLabels[args.type];

  yield* emitResult(result, ExtensionShowResultSchema, () => [
    ...headlineDoc("neutral", `${label} ${args.name}`),
    ...fieldsDoc(
      {
        type: args.type,
        name: args.name,
        enabled: result.item.enabled === null ? "n/a" : yesNo(result.item.enabled),
        source: result.item.source,
        version: result.item.version ?? "n/a",
        scope: result.item.scope,
        locked: yesNo(result.item.locked),
      },
      showFields,
    ),
    ...(result.agents.length > 0
      ? tableDoc(
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
          agentColumns,
          { caption: "Agent placements" },
        )
      : []),
  ]);
});

/**
 * Builds one group's `show` verb. Every installable type gets the same argument
 * shape and the same result document; only the type id differs.
 */
export const makeExtensionShowCommand = (args: {
  readonly type: InstallableExtensionType;
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
