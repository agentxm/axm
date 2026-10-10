import { LearnMore, formatLearnMore } from "../../formatter.js";
import { withParameterDescription } from "../../cli-parameters.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/cli";

import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  packageMetadataEcosystems,
  ShareWorkspace,
  ShareWorkspaceDocumentSchema,
} from "@agentxm/workspace-features/sharing";
import { observeUnit } from "@agentxm/workspace-kernel/operations";

import { withArgvTracking } from "../../cli-runtime/index.js";
import { ExecutionDirectory } from "../../execution-directory.js";
import { shareFailureToAppError } from "../../feature-errors.js";
import { withLiveOperation } from "../../operation-lifecycle.js";
import { emitResult } from "../../screen/index.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import { shareDoc } from "./view.js";

const shareConfig = {
  ecosystem: Flag.Literals("ecosystem", packageMetadataEcosystems).pipe(
    Flag.optional,
    withParameterDescription(
      "Emit package metadata with the Git source locator for the tag at HEAD",
    ),
  ),
};

const handleShare = Effect.fn("Share.handle")(function* (config: {
  readonly ecosystem: Option.Option<(typeof packageMetadataEcosystems)[number]>;
}) {
  const ecosystem = Option.getOrUndefined(config.ecosystem);
  const result = yield* withLiveOperation(
    { command: "share", name: "Share authored extensions", mode: "query" },
    observeUnit(
      { id: "repository", label: "repository share command" },
      ShareWorkspace.query(ecosystem === undefined ? undefined : { ecosystem }).pipe(
        Effect.mapError(shareFailureToAppError),
      ),
    ),
  );
  yield* emitResult(result, ShareWorkspaceDocumentSchema, () => shareDoc(result));
});

export const shareCommand = Command.make("share", shareConfig, (config) =>
  Effect.gen(function* () {
    const directory = yield* ExecutionDirectory;
    return yield* handleShare(config).pipe(
      withWorkspace({
        scope: DEFAULT_WORKSPACE_SCOPE,
        projectRoot: directory.path,
        allowUninitialized: true,
      }),
    );
  }).pipe(withRuntime("share")),
).pipe(
  withArgvTracking(shareConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription(
    "Print a Git install command for existing skills or extensions without AXM setup",
  ),
  Command.annotate(
    LearnMore,
    formatLearnMore([["axm help settings", "Read discovery opt-out and confidentiality guidance"]]),
  ),
  Command.withShortDescription("Print an install command for an existing repository"),
  Command.withExamples([
    {
      command: "axm share",
      description: "Print a live-checked install command with origin's self-describing locator",
    },
    {
      command: "axm share --ecosystem npm",
      description: "Emit package.json metadata for the tag at HEAD",
    },
    { command: "axm share --json", description: "Emit the share result as structured data" },
  ]),
);
