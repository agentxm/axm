import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { ExitCode, makeAppError } from "../../../app-error/index.js";
import { Screen, errorDoc, rawDoc } from "../../../screen/index.js";
import { effectCliExit, withArgvTracking } from "../../../cli-runtime/index.js";
import { getKnowledgeIndexConcept } from "@agentxm/knowledge-query";
import {
  KnowledgeRevisionSchema,
  parseConceptRef,
} from "@agentxm/extension-model/unstable/knowledge";

import { withRuntime, withWorkspace } from "../../../runtime.js";
import { scopeConfig } from "../flags.js";
import { captureInstalledKnowledgeIndex } from "../inspect.js";
import { KnowledgeConceptGetOutputSchema, type KnowledgeConceptGetOutput } from "./schemas.js";
import { failKnowledgeCorpusChanging } from "./failures.js";
import { sanitizeKnowledgeTerminalText } from "./terminal-text.js";

const decodeRevision = Schema.decodeUnknownResult(KnowledgeRevisionSchema);

export const handleKnowledgeConceptGet = Effect.fn("Knowledge.concepts.get")(function* (
  reference: string,
  options?: { readonly ifRevision?: string; readonly raw?: boolean },
) {
  const parsed = parseConceptRef(reference);
  if (!Result.isSuccess(parsed)) {
    return yield* makeAppError({
      code: "validation",
      detail: "Expected a concept reference in @owner/knowledge/name#concept-id form",
    });
  }
  const expectedRevision =
    options?.ifRevision === undefined ? undefined : decodeRevision(options.ifRevision);
  if (expectedRevision !== undefined && !Result.isSuccess(expectedRevision)) {
    return yield* makeAppError({
      code: "validation",
      detail: "--if-revision must be an opaque sha256: revision",
    });
  }

  const screen = yield* Screen;
  const captured = yield* captureInstalledKnowledgeIndex();
  if (captured.outcome === "corpus-changing") return yield* failKnowledgeCorpusChanging();
  const { snapshot } = captured;
  const indexed = getKnowledgeIndexConcept(
    snapshot,
    parsed.success.bundle,
    parsed.success.conceptId,
  );
  if (indexed === undefined) {
    return yield* makeAppError({
      code: "not_found",
      detail: `Knowledge concept "${reference}" was not found in the selected installed corpus`,
    });
  }
  if (
    expectedRevision !== undefined &&
    Result.isSuccess(expectedRevision) &&
    expectedRevision.success !== indexed.ref.contentRevision
  ) {
    const output: KnowledgeConceptGetOutput = {
      outcome: "failed",
      reason: "revision-changed",
      ref: indexed.ref,
      expectedRevision: expectedRevision.success,
      currentRevision: indexed.ref.contentRevision,
    };
    const machine = yield* screen.document(output, KnowledgeConceptGetOutputSchema, {
      ok: false,
    });
    if (!machine) {
      yield* screen.note(
        errorDoc("Knowledge concept revision changed; fetch the current revision"),
      );
    }
    return yield* Effect.die(effectCliExit(ExitCode.Conflict));
  }

  const source = indexed.source;
  const concept = {
    ref: indexed.ref,
    projectionRevision: indexed.projectionRevision,
    kind: source.kind,
    ...(source.authoredTitle === undefined ? {} : { title: source.authoredTitle }),
    ...(source.type === undefined ? {} : { type: source.type }),
    ...(source.description === undefined ? {} : { description: source.description }),
    ...(source.tags === undefined ? {} : { tags: source.tags }),
    ...(source.resource === undefined ? {} : { resource: source.resource }),
    ...(source.status === undefined ? {} : { status: source.status }),
    ...(source.staleAfter === undefined ? {} : { staleAfter: source.staleAfter }),
    ...(source.generated === undefined ? {} : { generated: source.generated }),
    ...(source.verified === undefined ? {} : { verified: source.verified }),
    ...(source.trust === undefined ? {} : { trust: source.trust }),
    ...(source.frontmatter === undefined ? {} : { frontmatter: source.frontmatter }),
    relativePath: source.relativePath,
    body: source.body,
    ...(options?.raw === true ? { raw: new TextDecoder().decode(indexed.sourceBytes) } : {}),
  };
  const output: KnowledgeConceptGetOutput = {
    outcome: "found",
    concept,
  };
  if (yield* screen.document(output, KnowledgeConceptGetOutputSchema)) return;
  const content = options?.raw === true ? (concept.raw ?? "") : concept.body;
  yield* screen.result(
    rawDoc(`${sanitizeKnowledgeTerminalText(content)}${content.endsWith("\n") ? "" : "\n"}`),
  );
});

const getConfig = {
  reference: Argument.string("reference").pipe(
    Argument.withDescription("Concept reference: @owner/knowledge/name#concept-id"),
  ),
  ifRevision: Flag.string("if-revision").pipe(
    Flag.withDescription("Fail if the current content revision differs"),
    Flag.optional,
  ),
  raw: Flag.boolean("raw").pipe(
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
  Command.withDescription("Get one installed knowledge concept by exact identity"),
  Command.withExamples([
    {
      command: "axm knowledge concepts get '@agentxm/knowledge/platform#auth/session-management'",
      description: "Read one concept and its resolved revision identity",
    },
  ]),
);
