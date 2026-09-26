import * as Effect from "effect/Effect";
import {
  KnowledgeListQueryResultSchema,
  ListKnowledge,
  type KnowledgeListRow,
} from "@agentxm/workspace/inspection";
import type { KnowledgeInstructionEntryResolution } from "@agentxm/workspace/projection";

import { inspectionFailureToAppError } from "../../feature-errors.js";
import { ABSENT, count, type ViewColumn } from "../../screen/index.js";
import { inventoryAgentOutcomes } from "../inventory-view.js";
import { makePerTypeListCommand } from "../shared/list-command.js";

const renderInstructionEntry = (
  resolution: KnowledgeInstructionEntryResolution | undefined,
): string =>
  resolution === undefined
    ? ABSENT
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

const { handler, command } = makePerTypeListCommand({
  type: "knowledge",
  query: () => ListKnowledge.query().pipe(Effect.mapError(inspectionFailureToAppError)),
  schema: KnowledgeListQueryResultSchema,
  columns: BundleColumns,
  summary: (_document, rows) => count(rows.length, "knowledge bundle"),
  agentFilter: false,
});

export const handleList = handler;
export const listCommand = command;
