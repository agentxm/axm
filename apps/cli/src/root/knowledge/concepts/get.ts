import { withParameterDefault, withParameterDescription } from "../../../cli-parameters.js";
import { withLiveOperation } from "../../../operation-lifecycle.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/cli";

import {
  KnowledgeConceptGetOutputSchema,
  KnowledgeDiscovery,
} from "@agentxm/workspace-features/knowledge-query";

import { ExitCode } from "../../../app-error/index.js";
import { emitResult, errorDoc, rawDoc } from "../../../screen/index.js";
import { processOutcome, withArgvTracking } from "../../../cli-runtime/index.js";
import {
  readOnlyCapabilities,
  withCommandCapabilities,
} from "../../shared/command-capabilities.js";

import { withRuntime, withWorkspace } from "../../../runtime.js";
import { scopeConfig } from "../flags.js";
import { knowledgeConceptFailures } from "../knowledge-errors.js";
import { failKnowledgeCorpusChanging } from "./failures.js";
import { sanitizeKnowledgeTerminalText } from "./terminal-text.js";

export const handleKnowledgeConceptGet = Effect.fn("Knowledge.concepts.get")(function* (
  reference: string,
  options?: { readonly ifRevision?: string; readonly raw?: boolean },
) {
  const result = yield* withLiveOperation(
    { command: "knowledge.concepts.get", name: "Read knowledge concept", mode: "query" },
    Effect.catchTags(
      KnowledgeDiscovery.get({
        reference,
        ...(options?.ifRevision === undefined ? {} : { ifRevision: options.ifRevision }),
        ...(options?.raw === undefined ? {} : { raw: options.raw }),
      }),
      knowledgeConceptFailures,
    ),
  );
  if (result.outcome === "corpus-changing") return yield* failKnowledgeCorpusChanging();
  if (result.outcome === "revision-changed") {
    yield* emitResult(
      result.document,
      KnowledgeConceptGetOutputSchema,
      () => errorDoc("Knowledge concept revision changed; fetch the current revision"),
      {
        ok: false,
      },
    );
    return processOutcome(ExitCode.Conflict);
  }
  yield* emitResult(result.document, KnowledgeConceptGetOutputSchema, () => {
    const concept = result.document.concept;
    const content = (options?.raw === true ? concept?.raw : concept?.body) ?? "";
    return rawDoc(`${sanitizeKnowledgeTerminalText(content)}${content.endsWith("\n") ? "" : "\n"}`);
  });
  return processOutcome(ExitCode.Success);
});

const getConfig = {
  reference: Argument.String("reference").pipe(
    withParameterDescription(
      "Reference: @owner/knowledge/name#concept-id or canonical HTTPS concept URL",
    ),
  ),
  ifRevision: Flag.String("if-revision").pipe(
    withParameterDescription(
      "Fail with a conflict unless contentRevision matches this value from an earlier --json",
    ),
    Flag.optional,
  ),
  raw: Flag.Boolean("raw").pipe(
    withParameterDescription(
      "Show the exact source with frontmatter instead of the body; JSON adds concept.raw",
    ),
    withParameterDefault(false),
  ),
  ...scopeConfig,
} as const;

export const getCommand = Command.make("get", getConfig, ({ reference, ifRevision, raw, scope }) =>
  handleKnowledgeConceptGet(reference, {
    raw,
    ...Option.match(ifRevision, {
      onNone: () => ({}),
      onSome: (value) => ({ ifRevision: value }),
    }),
  }).pipe(withWorkspace(scope), withRuntime("knowledge concepts get")),
).pipe(
  withArgvTracking(getConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("Get one installed knowledge concept by exact identity"),
  Command.withExamples([
    {
      command: "axm knowledge concepts get '@agentxm/knowledge/platform#auth/session-management'",
      description: "Read one concept and its resolved revision identity",
    },
  ]),
);
