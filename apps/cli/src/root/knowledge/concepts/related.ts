import { withLiveOperation } from "../../../operation-lifecycle.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import {
  KnowledgeConceptRelatedOutputSchema,
  KnowledgeDiscovery,
} from "@agentxm/workspace/knowledge/query";

import { ABSENT, emitResult, inventoryDoc, type ViewColumn } from "../../../screen/index.js";
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

interface RelatedRow {
  readonly depth: number;
  readonly relation: string;
  readonly concept: string;
  readonly title: string;
}

const relatedColumns: ReadonlyArray<ViewColumn<RelatedRow>> = [
  { header: "Depth", value: (row) => String(row.depth), align: "right" },
  { header: "Relation", value: (row) => row.relation },
  { header: "Concept", value: (row) => row.concept },
  { header: "Title", value: (row) => row.title },
];

export const handleKnowledgeConceptRelated = Effect.fn("Knowledge.concepts.related")(function* (
  reference: string,
  maximumDepth = 1,
  includeIndexBacklinks = false,
) {
  const result = yield* withLiveOperation(
    {
      command: "knowledge.concepts.related",
      name: "Inspect related knowledge concepts",
      mode: "preview",
    },
    Effect.catchTags(
      KnowledgeDiscovery.related({ reference, maximumDepth, includeIndexBacklinks }),
      knowledgeConceptFailures,
    ),
  );
  if (result.outcome === "corpus-changing") return yield* failKnowledgeCorpusChanging();
  const output = result.document;
  yield* emitResult(output, KnowledgeConceptRelatedOutputSchema, () => {
    const rows = output.items.map(({ depth, relation, ref, title }) => ({
      depth,
      relation,
      concept: sanitizeKnowledgeTerminalText(`${ref.bundle}#${ref.conceptId}`),
      title: sanitizeKnowledgeTerminalText(title ?? ABSENT),
    }));
    return inventoryDoc({
      rows,
      columns: relatedColumns,
      summary: `${rows.length} related concept${rows.length === 1 ? "" : "s"}`,
      empty: "No related installed knowledge concepts were found",
    });
  });
  return processOutcome(0);
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
