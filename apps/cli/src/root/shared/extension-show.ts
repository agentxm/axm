import { withParameterDescription } from "../../cli-parameters.js";
import { withLiveOperation } from "../../operation-lifecycle.js";
import * as Effect from "effect/Effect";
import { agentFlag } from "../../cli-flags/agent-flag.js";
import { Argument, Command } from "effect/cli";

import {
  ABSENT,
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
import { ExtensionShowResultSchema, ShowExtension } from "@agentxm/workspace-features/inspection";

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
  readonly agents?: ReadonlyArray<string>;
}) {
  const result = yield* withLiveOperation(
    { command: "extension.show", name: "Inspect extension", mode: "query" },
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
        enabled: result.item.enabled === null ? ABSENT : yesNo(result.item.enabled),
        source: result.item.source,
        version: result.item.version ?? ABSENT,
        scope: result.item.scope,
        locked: yesNo(result.item.locked),
      },
      showFields,
    ),
    ...(result.mcp === undefined
      ? []
      : [
          ...fieldsDoc(result.mcp, [
            { label: "Runtime", value: (row) => row.runtime },
            { label: "Working directory", value: (row) => row.cwd },
            {
              label: "Runtime artifact pinned",
              value: (row) =>
                row.runtimeArtifactPinned === null
                  ? "not applicable"
                  : yesNo(row.runtimeArtifactPinned),
            },
          ]),
          ...tableDoc(
            result.mcp.distributions.map((candidate) => ({
              id: candidate.id,
              transport: `${candidate.kind}: ${candidate.transport}; ${candidate.destination}`,
              state: `${candidate.selected ? "selected; " : ""}${candidate.supported ? "supported" : (candidate.reason ?? "unsupported")}`,
              inputs: candidate.inputs
                .map(
                  (input) =>
                    `${input.id}${input.required ? " required" : ""}${input.secret ? " secret reference" : ""}${input.repeated ? " repeated" : ""}${input.hasDefault ? " default available" : ""}`,
                )
                .join("; "),
            })),
            [
              { header: "Distribution", value: (row) => row.id },
              { header: "Transport", value: (row) => row.transport },
              { header: "State", value: (row) => row.state },
              { header: "Inputs", value: (row) => row.inputs },
            ],
          ),
        ]),
    ...(result.agentOutcomes.length > 0
      ? tableDoc(
          result.agentOutcomes.map((agent) => ({
            agent: agent.agentId,
            status: agent.outcome,
            path: agent.path ?? "",
            detail: `${agent.runtime === undefined ? "" : `readiness=${agent.readiness}; runtime=${agent.runtime}; `}${agent.reasonCode}: ${
              agent.mechanism === undefined ? agent.reason : `${agent.mechanism}: ${agent.reason}`
            }${agent.manualActions === undefined ? "" : `; ${agent.manualActions.join(" ")}`}`,
          })),
          agentColumns,
          { caption: "Agent placements" },
        )
      : []),
    ...result.agentOutcomes.flatMap((agent) => {
      const hook = agent.hook;
      if (hook === undefined) return [];
      return [
        ...headlineDoc("neutral", `${agent.agentId}: ${hook.implementationId}`),
        ...fieldsDoc(
          {
            protocol: hook.protocol,
            runtime: hook.runtimeAvailability,
            invocation: hook.nativeInvocation,
            conditions: hook.conditions.join("; ") || ABSENT,
            evidence: `${hook.fixtureEvidence.state}: ${hook.fixtureEvidence.reason}`,
          },
          [
            { label: "Protocol", value: (row) => row.protocol },
            { label: "Runtime availability", value: (row) => row.runtime },
            { label: "Native invocation", value: (row) => row.invocation },
            { label: "Conditions", value: (row) => row.conditions },
            { label: "Fixture evidence", value: (row) => row.evidence },
          ],
        ),
        ...tableDoc(hook.bindings, [
          { header: "Binding", value: (row) => row.id },
          { header: "Event", value: (row) => row.event },
          { header: "Matcher", value: (row) => row.matcher ?? ABSENT },
          { header: "Runtime", value: (row) => row.runtime },
          { header: "Entrypoint", value: (row) => row.entrypoint },
          {
            header: "Required outcomes",
            value: (row) => row.requiredOutcomes.join(", ") || ABSENT,
          },
          {
            header: "Required operations",
            value: (row) => row.requiredOperations.join(", ") || ABSENT,
          },
        ]),
        ...fieldsDoc(hook.configuration, [{ label: "Configuration", value: (row) => row.status }]),
        ...tableDoc(hook.configuration.fields, [
          { header: "Setting", value: (row) => row.key },
          { header: "Source", value: (row) => row.source },
          {
            header: "Value",
            value: (row) =>
              row.redacted ? "[redacted]" : row.value === null ? ABSENT : JSON.stringify(row.value),
          },
        ]),
        ...tableDoc(hook.configuration.issues, [
          { header: "Setting", value: (row) => row.key },
          { header: "Issue", value: (row) => row.message },
        ]),
        ...(hook.fixtureEvidence.receipt === undefined
          ? []
          : tableDoc(
              hook.fixtureEvidence.receipt.fixtures,
              [
                { header: "Fixture", value: (row) => row.fixture },
                { header: "Implementation", value: (row) => row.implementation },
                { header: "Result", value: (row) => row.outcome },
                { header: "Detail", value: (row) => row.detail },
              ],
              { caption: "Recorded fixture execution; native invocation was not observed" },
            )),
      ];
    }),
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
    name: Argument.String("name").pipe(withParameterDescription(`Name of the ${label} to show`)),
    scope: scopeFlag,
    agent: agentFlag.pipe(
      withParameterDescription(
        "Show only these agents' outcomes; unconfigured agents are reported as not configured",
      ),
    ),
  } as const;
  const command = Command.make("show", showConfig, ({ name, scope, agent }) =>
    handleExtensionShow({ type: args.type, name, agents: agent }).pipe(
      withWorkspace({ scope, allowUninitialized: true }),
      withRuntime(`${args.group} show`),
    ),
  ).pipe(withArgvTracking(showConfig));
  return command.pipe(
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
