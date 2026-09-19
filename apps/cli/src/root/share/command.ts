import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";
import { ShareWorkspace, ShareWorkspaceDocumentSchema } from "@agentxm/workspace/sharing";
import { observeUnit } from "@agentxm/workspace/transitions/planning";

import { withArgvTracking } from "../../cli-runtime/index.js";
import { shareFailureToAppError } from "../../feature-errors.js";
import { withLiveOperation } from "../../operation-lifecycle.js";
import { Screen } from "../../screen/index.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import { shareDoc } from "./view.js";

const shareConfig = {} as const;

const handleShare = Effect.fn("Share.handle")(function* () {
  const screen = yield* Screen;
  const result = yield* withLiveOperation(
    { command: "share", name: "Share authored extensions", mode: "preview" },
    observeUnit(
      { id: "repository", label: "repository share command" },
      ShareWorkspace.query().pipe(Effect.mapError(shareFailureToAppError)),
    ),
  );
  if (yield* screen.document(result, ShareWorkspaceDocumentSchema)) return;
  yield* screen.result(shareDoc(result));
});

export const shareCommand = Command.make("share", shareConfig, () =>
  handleShare().pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withRuntime("share")),
).pipe(
  withArgvTracking(shareConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription(
    "Print an install command for distributable authored extensions; opt-out is not confidentiality",
  ),
  Command.withExamples([
    { command: "axm share", description: "Print a live-checked install command for origin" },
    { command: "axm share --json", description: "Emit the share result as structured data" },
  ]),
);
