import { registryFlag } from "../../cli-flags/index.js";
import { VIEW_FIELDS } from "@agentxm/workspace-features/inspection";
import { withParameterDescription } from "../../cli-parameters.js";
import { Argument, Command, Flag } from "effect/cli";
import * as Effect from "effect/Effect";
import { makeAppError } from "../../app-error/index.js";
import * as Option from "effect/Option";

import { withArgvTracking } from "../../cli-runtime/index.js";
import { parseExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import { installableExtensionTypes } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import { handleDefaultRegistryFqnView, handleView } from "./handler.js";

const viewConfig = {
  handle: Argument.String("extension").pipe(
    withParameterDescription(
      "Extension FQN in @owner/<plural-type>/<name> form, or a local name with --type",
    ),
  ),
  field: Argument.Literals("field", VIEW_FIELDS).pipe(
    withParameterDescription("Field to print"),
    Argument.optional,
  ),
  registry: registryFlag,
  type: Flag.Literals("type", [...installableExtensionTypes]).pipe(
    withParameterDescription("Extension type of a bare name"),
    Flag.optional,
  ),
} as const;

export const viewCommand = Command.make("view", viewConfig, ({ handle, field, registry, type }) => {
  const parts = parseExtensionFqnParts(handle);
  if (parts === undefined && Option.isNone(type)) {
    return Effect.fail(
      makeAppError({
        code: "usage",
        detail: `Local name "${handle}" requires --type`,
        suggestions: [{ description: "Show metadata lookup syntax", cmd: "axm view --help" }],
      }),
    );
  }
  // A fully qualified handle needs no workspace to name what it views; the
  // effective default Registry is still the settings-selected one, so the
  // workspace is read as it is, initialized or not.
  if (Option.isNone(registry) && Option.isNone(type) && parts !== undefined) {
    return handleDefaultRegistryFqnView({ handle, field, parts }).pipe(
      withWorkspace({ scope: DEFAULT_WORKSPACE_SCOPE, allowUninitialized: true }),
      withRuntime("view"),
    );
  }
  return handleView({ handle, field, registry, type }).pipe(
    withWorkspace({ scope: DEFAULT_WORKSPACE_SCOPE, allowUninitialized: parts !== undefined }),
    withRuntime("view", { registry }),
  );
}).pipe(
  withArgvTracking(viewConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("View published extension metadata"),
  Command.withExamples([
    {
      command: "axm view @acme/skills/code-review",
      description: "Show published metadata for an extension",
    },
    {
      command: "axm view @acme/subagents/reviewer version",
      description: "Print the latest published version",
    },
    {
      command: "axm view @acme/skills/code-review versions --json",
      description: "Emit published versions as JSON",
    },
  ]),
);
