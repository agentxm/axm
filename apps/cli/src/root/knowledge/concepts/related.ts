import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { makeAppError } from "../../../app-error/index.js";
import { Screen, headlineDoc, tableViewDoc, type TableView } from "../../../screen/index.js";
import { withArgvTracking } from "../../../cli-runtime/index.js";
import {
  readOnlyCapabilities,
  withCommandCapabilities,
} from "../../shared/command-capabilities.js";
import { getKnowledgeIndexConcept, relatedKnowledgeConcepts } from "@agentxm/knowledge-query";
import { parseConceptRef } from "@agentxm/extension-model/unstable/knowledge";

import { withRuntime, withWorkspace } from "../../../runtime.js";
import { scopeConfig } from "../flags.js";
import { captureInstalledKnowledgeIndex } from "../inspect.js";
import { KnowledgeConceptRelatedOutputSchema } from "./schemas.js";
import { failKnowledgeCorpusChanging } from "./failures.js";
import { sanitizeKnowledgeTerminalText } from "./terminal-text.js";

interface RelatedRow {
  readonly depth: number;
  readonly relation: string;
  readonly concept: string;
  readonly title: string;
}

const RelatedTable = {
  columns: {
    depth: { header: "Depth" },
    relation: { header: "Relation" },
    concept: { header: "Concept" },
    title: { header: "Title" },
  },
} as const satisfies TableView<RelatedRow>;

export const handleKnowledgeConceptRelated = Effect.fn("Knowledge.concepts.related")(function* (
  reference: string,
  maximumDepth = 1,
  includeIndexBacklinks = false,
) {
  const parsed = parseConceptRef(reference);
  if (!Result.isSuccess(parsed)) {
    return yield* makeAppError({
      code: "validation",
      detail: "Expected a concept reference in @owner/knowledge/name#concept-id form",
    });
  }
  if (!Number.isSafeInteger(maximumDepth) || maximumDepth < 1 || maximumDepth > 3) {
    return yield* makeAppError({ code: "validation", detail: "Depth must be between 1 and 3" });
  }
  const screen = yield* Screen;
  const captured = yield* captureInstalledKnowledgeIndex();
  if (captured.outcome === "corpus-changing") return yield* failKnowledgeCorpusChanging();
  const { snapshot } = captured;
  const root = getKnowledgeIndexConcept(snapshot, parsed.success.bundle, parsed.success.conceptId);
  if (root === undefined) {
    return yield* makeAppError({
      code: "not_found",
      detail: `Knowledge concept "${reference}" was not found in the selected installed corpus`,
    });
  }
  const items = relatedKnowledgeConcepts(snapshot, parsed.success, maximumDepth, {
    includeIndexBacklinks,
  });
  const output = {
    ref: root.ref,
    maximumDepth,
    includesIndexBacklinks: includeIndexBacklinks,
    items,
    count: items.length,
    corpusFingerprint: snapshot.fingerprint,
  };
  if (yield* screen.document(output, KnowledgeConceptRelatedOutputSchema)) return;
  if (items.length === 0) {
    yield* screen.note(headlineDoc("info", "No related installed knowledge concepts were found"));
    return;
  }
  yield* screen.result(
    tableViewDoc(
      items.map(({ depth, relation, ref, title }) => ({
        depth,
        relation,
        concept: sanitizeKnowledgeTerminalText(`${ref.bundle}#${ref.conceptId}`),
        title: sanitizeKnowledgeTerminalText(title ?? "—"),
      })),
      RelatedTable,
      `${items.length} related concept${items.length === 1 ? "" : "s"}`,
    ),
  );
});

const relatedConfig = {
  reference: Argument.string("reference").pipe(
    Argument.withDescription("Concept reference: @owner/knowledge/name#concept-id"),
  ),
  depth: Flag.integer("depth").pipe(
    Flag.withDescription("Maximum traversal depth (1-3; default 1)"),
    Flag.optional,
  ),
  includeIndexBacklinks: Flag.boolean("include-index-backlinks").pipe(
    Flag.withDescription("Include backlinks authored by reserved index documents"),
    Flag.withDefault(false),
  ),
  ...scopeConfig,
} as const;

export const relatedCommand = Command.make(
  "related",
  relatedConfig,
  ({ reference, depth, includeIndexBacklinks, scope }) =>
    handleKnowledgeConceptRelated(
      reference,
      Option.match(depth, { onNone: () => 1, onSome: (value) => value }),
      includeIndexBacklinks,
    ).pipe(withWorkspace(scope), withRuntime("knowledge concepts related")),
).pipe(
  withArgvTracking(relatedConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("Traverse authored links and derived backlinks"),
  Command.withExamples([
    {
      command:
        "axm knowledge concepts related '@agentxm/knowledge/platform#auth/session-management' --depth 2",
      description: "Traverse related concepts with cycle suppression",
    },
  ]),
);
