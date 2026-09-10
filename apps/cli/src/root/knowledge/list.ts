import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { Screen, count, inventoryDoc, type ViewColumn } from "../../screen/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import {
  KnowledgeListQueryResultSchema,
  ListKnowledge,
  type KnowledgeListRow,
} from "@agentxm/workspace-inspection";
import type { KnowledgeInstructionEntryResolution } from "@agentxm/workspace-projection";

import { inspectionFailureToAppError } from "../../feature-errors.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { scopeConfig } from "./flags.js";
import { inventoryAgentOutcomes } from "../inventory-view.js";

const renderInstructionEntry = (
  resolution: KnowledgeInstructionEntryResolution | undefined,
): string =>
  resolution === undefined
    ? "n/a"
    : `${resolution.included ? "included" : "excluded"} (${resolution.reason})`;

const BundleColumns = [
  { header: "Bundle", priority: "required", value: (row: KnowledgeListRow) => row.name },
  { header: "Concepts", align: "right", value: (row: KnowledgeListRow) => String(row.concepts) },
  {
    header: "Diagnostics",
    align: "right",
    value: (row: KnowledgeListRow) => String(row.diagnostics),
  },
  { header: "Source", priority: "optional", value: (row: KnowledgeListRow) => row.sourceRoot },
  {
    header: "Instruction entry",
    priority: "optional",
    value: (row: KnowledgeListRow) => renderInstructionEntry(row.instructionEntry),
  },
  {
    header: "Agent outcomes",
    priority: "optional",
    value: (row: KnowledgeListRow) => inventoryAgentOutcomes(row.agentOutcomes),
  },
] satisfies ReadonlyArray<ViewColumn<KnowledgeListRow>>;

export const handleKnowledgeList = Effect.fn("Knowledge.list")(function* () {
  const screen = yield* Screen;
  const { document, rows } = yield* ListKnowledge.query().pipe(
    Effect.mapError(inspectionFailureToAppError),
  );
  if (yield* screen.document(document, KnowledgeListQueryResultSchema)) return;
  yield* screen.result(
    inventoryDoc({
      rows,
      columns: BundleColumns,
      summary: count(rows.length, "knowledge bundle"),
      empty: "No knowledge bundles installed",
    }),
  );
});

export const listCommand = Command.make("list", scopeConfig, ({ scope }) =>
  handleKnowledgeList().pipe(
    withWorkspace({ scope, allowUninitialized: true }),
    withRuntime("knowledge list"),
  ),
).pipe(
  withArgvTracking(scopeConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("List installed knowledge bundles"),
  Command.withExamples([
    { command: "axm knowledge list", description: "List installed knowledge bundles" },
  ]),
);
