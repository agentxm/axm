import * as Effect from "effect/Effect";
import { Command, Flag } from "effect/unstable/cli";

import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  packageMetadataEcosystems,
  ShareFailed,
  ShareWorkspace,
  ShareWorkspaceDocumentSchema,
} from "@agentxm/workspace/sharing";
import { observeUnit } from "@agentxm/workspace/transitions/planning";

import { withArgvTracking } from "../../cli-runtime/index.js";
import { shareFailureToAppError } from "../../feature-errors.js";
import { withLiveOperation } from "../../operation-lifecycle.js";
import { Screen } from "../../screen/index.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import { shareDoc } from "./view.js";

const ecosystemFlag = (ecosystem: string) =>
  Flag.Boolean(ecosystem).pipe(
    Flag.withDescription(
      `Emit portable ${ecosystem} package metadata with the Git source locator for the tag at HEAD`,
    ),
    Flag.withDefault(false),
  );

const shareConfig = {
  bazel: ecosystemFlag("bazel"),
  cargo: ecosystemFlag("cargo"),
  cocoapods: ecosystemFlag("cocoapods"),
  composer: ecosystemFlag("composer"),
  conan: ecosystemFlag("conan"),
  conda: ecosystemFlag("conda"),
  cpan: ecosystemFlag("cpan"),
  cran: ecosystemFlag("cran"),
  docker: ecosystemFlag("docker"),
  gem: ecosystemFlag("gem"),
  golang: ecosystemFlag("golang"),
  hackage: ecosystemFlag("hackage"),
  hex: ecosystemFlag("hex"),
  huggingface: ecosystemFlag("huggingface"),
  jsr: ecosystemFlag("jsr"),
  julia: ecosystemFlag("julia"),
  luarocks: ecosystemFlag("luarocks"),
  maven: ecosystemFlag("maven"),
  mojo: ecosystemFlag("mojo"),
  npm: ecosystemFlag("npm"),
  nuget: ecosystemFlag("nuget"),
  opam: ecosystemFlag("opam"),
  pub: ecosystemFlag("pub"),
  pypi: ecosystemFlag("pypi"),
  swift: ecosystemFlag("swift"),
  zig: ecosystemFlag("zig"),
};

const handleShare = Effect.fn("Share.handle")(function* (config: {
  readonly [E in (typeof packageMetadataEcosystems)[number]]: boolean;
}) {
  const screen = yield* Screen;
  const selectedEcosystems = packageMetadataEcosystems.filter((ecosystem) => config[ecosystem]);
  if (selectedEcosystems.length > 1) {
    return yield* Effect.fail(
      new ShareFailed({
        category: "validation",
        detail: "Choose at most one package ecosystem flag per share command.",
      }),
    ).pipe(Effect.mapError(shareFailureToAppError));
  }
  const ecosystem = selectedEcosystems[0];
  const result = yield* withLiveOperation(
    { command: "share", name: "Share authored extensions", mode: "preview" },
    observeUnit(
      { id: "repository", label: "repository share command" },
      ShareWorkspace.query(ecosystem === undefined ? undefined : { ecosystem }).pipe(
        Effect.mapError(shareFailureToAppError),
      ),
    ),
  );
  if (yield* screen.document(result, ShareWorkspaceDocumentSchema)) return;
  yield* screen.result(shareDoc(result));
});

export const shareCommand = Command.make("share", shareConfig, (config) =>
  handleShare(config).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withRuntime("share")),
).pipe(
  withArgvTracking(shareConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription(
    "Print a Git locator install command for distributable authored extensions; opt-out is not confidentiality",
  ),
  Command.withExamples([
    {
      command: "axm share",
      description: "Print a live-checked install command with origin's self-describing locator",
    },
    {
      command: "axm share --npm",
      description: "Emit package.json metadata for the tag at HEAD",
    },
    { command: "axm share --json", description: "Emit the share result as structured data" },
  ]),
);
