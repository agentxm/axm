import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { KnowledgeConceptGetOutputSchema, KnowledgeDiscovery } from "@agentxm/knowledge-query";

import { ExitCode } from "../../../app-error/index.js";
import { Screen, errorDoc, rawDoc } from "../../../screen/index.js";
import { effectCliExit, withArgvTracking } from "../../../cli-runtime/index.js";
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
  const screen = yield* Screen;
  const result = yield* Effect.catchTags(
    KnowledgeDiscovery.get({
      reference,
      ...(options?.ifRevision === undefined ? {} : { ifRevision: options.ifRevision }),
      ...(options?.raw === undefined ? {} : { raw: options.raw }),
    }),
    knowledgeConceptFailures,
  );
  if (result.outcome === "corpus-changing") return yield* failKnowledgeCorpusChanging();
  if (result.outcome === "revision-changed") {
    const machine = yield* screen.document(result.document, KnowledgeConceptGetOutputSchema, {
      ok: false,
    });
    if (!machine) {
      yield* screen.note(
        errorDoc("Knowledge concept revision changed; fetch the current revision"),
      );
    }
    return yield* Effect.die(effectCliExit(ExitCode.Conflict));
  }
  if (yield* screen.document(result.document, KnowledgeConceptGetOutputSchema)) return;
  const concept = result.document.concept;
  const content = (options?.raw === true ? concept?.raw : concept?.body) ?? "";
  yield* screen.result(
    rawDoc(`${sanitizeKnowledgeTerminalText(content)}${content.endsWith("\n") ? "" : "\n"}`),
  );
});

const getConfig = {
  reference: Argument.String("reference").pipe(
    Argument.withDescription("Concept reference: @owner/knowledge/name#concept-id"),
  ),
  ifRevision: Flag.String("if-revision").pipe(
    Flag.withDescription("Fail if the current content revision differs"),
    Flag.optional,
  ),
  raw: Flag.Boolean("raw").pipe(
    Flag.withDescription("Include the exact source document in machine output"),
    Flag.withDefault(false),
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
