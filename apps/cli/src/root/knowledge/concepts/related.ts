import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { KnowledgeConceptRelatedOutputSchema, KnowledgeDiscovery } from "@agentxm/knowledge-query";

import { Screen, headlineDoc, tableViewDoc, type TableView } from "../../../screen/index.js";
import { withArgvTracking } from "../../../cli-runtime/index.js";
import {
  readOnlyCapabilities,
  withCommandCapabilities,
} from "../../shared/command-capabilities.js";

import { withRuntime, withWorkspace } from "../../../runtime.js";
import { scopeConfig } from "../flags.js";
import { knowledgeConceptFailures } from "../knowledge-errors.js";
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
  const screen = yield* Screen;
  const result = yield* Effect.catchTags(
    KnowledgeDiscovery.related({ reference, maximumDepth, includeIndexBacklinks }),
    knowledgeConceptFailures,
  );
  if (result.outcome === "corpus-changing") return yield* failKnowledgeCorpusChanging();
  const output = result.document;
  if (yield* screen.document(output, KnowledgeConceptRelatedOutputSchema)) return;
  if (output.items.length === 0) {
    yield* screen.note(headlineDoc("info", "No related installed knowledge concepts were found"));
    return;
  }
  yield* screen.result(
    tableViewDoc(
      output.items.map(({ depth, relation, ref, title }) => ({
        depth,
        relation,
        concept: sanitizeKnowledgeTerminalText(`${ref.bundle}#${ref.conceptId}`),
        title: sanitizeKnowledgeTerminalText(title ?? "—"),
      })),
      RelatedTable,
      `${output.items.length} related concept${output.items.length === 1 ? "" : "s"}`,
    ),
  );
});

const relatedConfig = {
  reference: Argument.String("reference").pipe(
    Argument.withDescription("Concept reference: @owner/knowledge/name#concept-id"),
  ),
  depth: Flag.Int("depth").pipe(
    Flag.withDescription("Maximum traversal depth (1-3; default 1)"),
    Flag.optional,
  ),
  includeIndexBacklinks: Flag.Boolean("include-index-backlinks").pipe(
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
