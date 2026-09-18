import type { OperationEvent } from "@agentxm/workspace/transitions/planning";

import type { Doc } from "../../screen/doc.js";
import { liveLedgerDoc, type LivePlan } from "../../screen/live-ledger.js";
import { initialProgress, reduceProgress, type ProgressState } from "../../screen/progress.js";
import type { TerminalSize } from "../../screen/scene.js";

const STARTED_AT = 1_000;
const WAITING_SINCE = STARTED_AT + 300;
const NOW = WAITING_SINCE + 12_000;

const log: ReadonlyArray<OperationEvent> = [
  {
    _tag: "OperationStarted",
    seq: 1,
    atMs: STARTED_AT,
    operationId: "install-1",
    name: "Installing",
    mode: "apply",
  },
  {
    _tag: "Waiting",
    seq: 2,
    atMs: WAITING_SINCE,
    blockingClass: "resource-conflict",
    subject: "workspace-transition",
    detail: "axm sync (pid 4122)",
  },
];

const state: ProgressState = log.reduce(reduceProgress, initialProgress);

const plan: LivePlan = {
  title: "Installing",
  aside: "in this project, agents: claude-code, codex",
  columns: [
    { header: "Extension", role: "name" },
    { header: "Version", role: "fixed", priority: "optional" },
  ],
  rows: [
    {
      id: "@acme/skills/standup",
      mark: "create",
      cells: ["@acme/skills/standup", "0.4.2"],
    },
  ],
};

/**
 * Waiting on the system (*Reference cases*, board `4 · Going wrong
 * mid-flight`, frame *Waiting on the system — another operation holds the
 * workspace*).
 *
 * The wait names no unit, so it stands beneath the ledger in place of the
 * status line: what the operation is parked on and how long it has waited,
 * who holds the workspace, and what stopping costs — nothing, because
 * contention is decided before anything is written.
 */
export const refMidflightBusyWorkspace = (terminal: TerminalSize): Doc =>
  liveLedgerDoc(state, { plan, rows: terminal.rows - 2, nowMs: NOW });
