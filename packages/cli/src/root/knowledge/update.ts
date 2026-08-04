import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { resolveWorkspaceUpdateSelection, updateNameFilterFlag } from "../shared/update-targets.js";
import { handleWorkspaceUpdate } from "../update/workspace-update-handler.js";
import { mutationFlags, scopeConfig } from "./flags.js";

const COMMAND = "knowledge.update";
const PLAN_NAME = "Update Knowledge";
const PLAN_DESCRIPTION = "Update configured Knowledge bundles";

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
} as const;

export const updateCommand = Command.make(
  "update",
  updateConfig,
  ({ source, scope, name, yes, force, preview }) =>
    Effect.gen(function* () {
      const selection = yield* resolveWorkspaceUpdateSelection({
        command: COMMAND,
        planName: PLAN_NAME,
        planDescription: PLAN_DESCRIPTION,
        resourceType: "knowledge",
        resourceLabel: "knowledge bundle",
        resourceLabelPlural: "knowledge bundles",
        source,
        nameFilters: name,
      });
      if (selection.type === "no-op") return;

      yield* handleWorkspaceUpdate({
        command: COMMAND,
        type: Option.some("knowledge"),
        planName: PLAN_NAME,
        planDescription: Option.some(PLAN_DESCRIPTION),
        flags: { yes, force, preview },
        ...(selection.type === "names" ? { names: selection.names } : {}),
      });
    }).pipe(withWorkspace(scope), withRuntime("knowledge update")),
).pipe(
  withArgvTracking(updateConfig),
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
