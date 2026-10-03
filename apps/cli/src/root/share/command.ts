import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { makeAbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  packageMetadataEcosystems,
  ShareFailed,
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

const ecosystemFlag = (ecosystem: string) =>
  Flag.Boolean(ecosystem).pipe(
    Flag.withDescription(
      `Emit portable ${ecosystem} package metadata with the Git source locator for the tag at HEAD`,
    ),
    Flag.withDefault(false),
  );

const shareConfig = {
  directory: Argument.String("directory").pipe(
    Argument.withDescription(
      "Repository or skill collection to share; defaults to the current directory",
    ),
    Argument.optional,
  ),
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
  yield* emitResult(result, ShareWorkspaceDocumentSchema, () => shareDoc(result));
});

export const shareCommand = Command.make("share", shareConfig, (config) =>
  Effect.gen(function* () {
    const directory = yield* ExecutionDirectory;
    const path = yield* Path.Path;
    const projectRoot = makeAbsolutePath(
      path,
      path.resolve(
        directory.path,
        Option.getOrElse(config.directory, () => "."),
      ),
    );
    return yield* handleShare(config).pipe(
      withWorkspace({ scope: DEFAULT_WORKSPACE_SCOPE, projectRoot, allowUninitialized: true }),
    );
  }).pipe(withRuntime("share")),
).pipe(
  withArgvTracking(shareConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription(
    "Print a Git install command for existing skills or extensions without AXM setup; opt-out is not confidentiality",
  ),
  Command.withShortDescription("Print an install command for an existing repository"),
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
