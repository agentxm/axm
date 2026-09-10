import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { KnowledgeLintQueryResultSchema, lintKnowledge } from "@agentxm/knowledge-query";

import { ExitCode } from "../../app-error/index.js";
import { Screen, errorDoc, headlineDoc, successDoc } from "../../screen/index.js";
import { effectCliExit, withArgvTracking } from "../../cli-runtime/index.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { scopeConfig } from "./flags.js";
import { knowledgeFailureToAppError } from "./knowledge-errors.js";

export const handleKnowledgeLint = Effect.fn("Knowledge.lint")(function* (
  name?: string,
  packagePath?: string,
) {
  const screen = yield* Screen;
  const result = yield* Effect.catchTags(
    lintKnowledge({
      ...(name === undefined ? {} : { bundle: name }),
      ...(packagePath === undefined ? {} : { packagePath }),
    }),
    {
      KnowledgeRequestInvalid: (failure) => Effect.fail(knowledgeFailureToAppError(failure)),
      KnowledgeCorpusUnavailable: (failure) => Effect.fail(knowledgeFailureToAppError(failure)),
    },
  );
  const document = result.document;
  if (!(yield* screen.document(document, KnowledgeLintQueryResultSchema, { ok: document.valid }))) {
    if (document.diagnostics.length === 0) {
      yield* screen.result(
        successDoc(
          `Knowledge validation passed for ${result.bundleCount} bundle${result.bundleCount === 1 ? "" : "s"}`,
        ),
      );
    } else {
      for (const diagnostic of document.diagnostics) {
        const coordinate =
          diagnostic.line === undefined
            ? ""
            : `:${diagnostic.line}${diagnostic.column === undefined ? "" : `:${diagnostic.column}`}`;
        const message = `${diagnostic.bundle}/${diagnostic.relativePath}${coordinate}: ${diagnostic.message}`;
        if (diagnostic.severity === "error") yield* screen.note(errorDoc(message));
        else yield* screen.note(headlineDoc("warn", message));
      }
      if (result.errorCount > 0) {
        yield* screen.note(
          errorDoc(
            `${result.errorCount} knowledge validation error${result.errorCount === 1 ? "" : "s"}`,
          ),
        );
      }
    }
  }
  // Exit non-zero without a second stdout document: the findings above are the
  // command's only output, so signal failure with an exit code rather than an
  // AppError envelope (mirrors `axm lint`).
  if (result.errorCount > 0) {
    return yield* Effect.die(effectCliExit(ExitCode.Issues));
  }
});

const lintConfig = {
  bundle: Argument.string("bundle").pipe(
    Argument.withDescription("Optional installed bundle name"),
    Argument.optional,
  ),
  path: Flag.string("path").pipe(
    Flag.withDescription("Validate a locally authored Knowledge package directory"),
    Flag.optional,
  ),
  ...scopeConfig,
} as const;

export const lintCommand = Command.make("lint", lintConfig, ({ bundle, path, scope }) =>
  handleKnowledgeLint(Option.getOrUndefined(bundle), Option.getOrUndefined(path)).pipe(
    withWorkspace(scope),
    withRuntime("knowledge lint"),
  ),
).pipe(
  withArgvTracking(lintConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("Validate installed or locally authored Open Knowledge Format bundles"),
  Command.withExamples([
    { command: "axm knowledge lint", description: "Validate all installed knowledge bundles" },
    {
      command: "axm knowledge lint platform",
      description: "Validate one installed knowledge bundle",
    },
    {
      command: "axm knowledge lint --path ./knowledge/platform",
      description: "Validate a locally authored Knowledge package",
    },
  ]),
);
