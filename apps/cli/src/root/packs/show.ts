import { withParameterDescription } from "../../cli-parameters.js";
import { withLiveOperation } from "../../operation-lifecycle.js";
import * as Effect from "effect/Effect";
import { Argument, Command } from "effect/cli";

import {
  emitResult,
  fieldsDoc,
  headlineDoc,
  tableDoc,
  type ViewField,
  type ViewColumn,
} from "../../screen/index.js";
import {
  PackShowResultSchema,
  ShowPack,
  type PackShowResult,
} from "@agentxm/workspace-features/inspection";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { agentFlag } from "../../cli-flags/agent-flag.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import { packInspectionRefusedToAppError } from "../inspection-errors.js";

type ShowRow = Omit<PackShowResult, "desiredDependencies" | "agentOutcomes"> & {
  readonly desiredCount: number;
};

const showFields: ReadonlyArray<ViewField<ShowRow>> = [
  { label: "Scope", value: (row) => row.scope },
  { label: "Pack", value: (row) => row.pack },
  { label: "Source authority", value: (row) => row.sourceAuthority },
  { label: "Canonical path", value: (row) => row.canonicalPath },
  { label: "Manifest version", value: (row) => row.manifestVersion },
  { label: "Resolution", value: (row) => row.acceptedResolution },
  { label: "Canonical", value: (row) => row.canonicalStatus },
  { label: "Desired members", value: (row) => String(row.desiredCount) },
  {
    label: "Problems",
    value: (row) => (row.problems.length === 0 ? "none" : row.problems.join("; ")),
  },
];

const memberColumns: ReadonlyArray<ViewColumn<PackShowResult["desiredDependencies"][number]>> = [
  { header: "Member", value: (row) => row.fqn },
  { header: "Constraint", value: (row) => row.constraint ?? "-" },
  { header: "Reachability", value: (row) => row.reachability ?? "not established" },
];

export const handlePacksShow = Effect.fn("PacksShow.handle")(function* (
  target: string,
  agents: ReadonlyArray<string> = [],
) {
  const result = yield* withLiveOperation(
    { command: "packs.show", name: "Inspect pack", mode: "query" },
    Effect.catchTag(ShowPack.query({ target, agents }), "PackInspectionRefused", (failure) =>
      Effect.fail(packInspectionRefusedToAppError(failure)),
    ),
  );
  yield* emitResult(result, PackShowResultSchema, () => [
    ...headlineDoc("neutral", `Pack ${result.pack}`),
    ...fieldsDoc(
      {
        scope: result.scope,
        pack: result.pack,
        sourceAuthority: result.sourceAuthority,
        canonicalPath: result.canonicalPath,
        manifestVersion: result.manifestVersion,
        acceptedResolution: result.acceptedResolution,
        canonicalStatus: result.canonicalStatus,
        desiredCount: result.desiredDependencies.length,
        problems: result.problems,
      },
      showFields,
    ),
    ...tableDoc(result.desiredDependencies, memberColumns),
    ...tableDoc(result.agentOutcomes, [
      { header: "Agent", value: (row) => row.agentId },
      { header: "Status", value: (row) => row.outcome },
      { header: "Detail", value: (row) => row.reason },
    ]),
  ]);
});

const showConfig = {
  target: Argument.String("name").pipe(
    withParameterDescription("Configured pack name or unique configured pack FQN"),
  ),
  scope: scopeFlag,
  agent: agentFlag.pipe(
    withParameterDescription(
      "Show only these agents' outcomes; unconfigured agents are reported as not configured",
    ),
  ),
} as const;

export const showCommand = Command.make("show", showConfig, ({ target, scope, agent }) =>
  handlePacksShow(target, agent).pipe(withWorkspace(scope), withRuntime("packs show")),
).pipe(
  withArgvTracking(showConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("Inspect desired, accepted, and canonical pack state"),
  Command.withExamples([
    {
      command: "axm packs show my-pack",
      description: "Inspect a configured pack by name",
    },
    {
      command: "axm packs show @acme/packs/my-pack --json",
      description: "Emit structured pack state",
    },
  ]),
);
