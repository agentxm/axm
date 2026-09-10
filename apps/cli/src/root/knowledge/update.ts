import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { withArgvTracking } from "../../cli-runtime/index.js";

import { ignoreReleaseAgeFlag } from "../../cli-flags/index.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../runtime.js";
import {
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { resolveWorkspaceUpdateSelection, updateNameFilterFlag } from "../shared/update-targets.js";
import { handleWorkspaceUpdate } from "../update/workspace-update-handler.js";
import { mutationFlags, scopeConfig } from "./flags.js";

const COMMAND = "knowledge.update";
const PLAN_NAME = "Update Knowledge";
const PLAN_DESCRIPTION = "Update configured Knowledge bundles";

export interface KnowledgeUpdateHandlerArgs {
  readonly source: Option.Option<string>;
  readonly names: ReadonlyArray<string>;
  readonly preview: boolean;
}

export const handleKnowledgeUpdate = Effect.fn("KnowledgeUpdate.handle")(function* (
  args: KnowledgeUpdateHandlerArgs,
) {
  const selection = yield* resolveWorkspaceUpdateSelection({
    command: COMMAND,
    planName: PLAN_NAME,
    planDescription: PLAN_DESCRIPTION,
    resourceType: "knowledge",
    resourceLabel: "knowledge bundle",
    resourceLabelPlural: "knowledge bundles",
    source: args.source,
    nameFilters: args.names,
  });
  if (selection.type === "no-op") return;

  yield* handleWorkspaceUpdate({
    command: COMMAND,
    type: Option.some("knowledge"),
    planName: PLAN_NAME,
    planDescription: Option.some(PLAN_DESCRIPTION),
    flags: { preview: args.preview },
    ...(selection.type === "names" ? { names: selection.names } : {}),
  });
});

const updateConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription("Filter to Knowledge bundles matching a name or source"),
    Argument.optional,
  ),
  ...scopeConfig,
  name: updateNameFilterFlag.pipe(
    Flag.withDescription("Update only specific Knowledge bundles by name or glob pattern"),
  ),
  ...mutationFlags,
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

export const updateCommand = Command.make(
  "update",
  updateConfig,
  ({ source, scope, name, preview, ignoreReleaseAge }) =>
    handleKnowledgeUpdate({ source, names: name, preview }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("knowledge update"),
    ),
).pipe(
  withArgvTracking(updateConfig),
  withCommandCapabilities(previewableCapabilities("workspace", { trust: ["publisher-change"] })),
  Command.withDescription("Update configured Knowledge bundles"),
  Command.withExamples([
    {
      command: "axm knowledge update --preview",
      description: "Preview Knowledge bundle updates",
    },
    {
      command: "axm knowledge update --name platform",
      description: "Update one Knowledge bundle",
    },
  ]),
);
