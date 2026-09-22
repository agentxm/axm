import type { OperationEvent } from "@agentxm/workspace/transitions/planning";

import type { Doc } from "../../screen/doc.js";
import { progressActivity } from "../../screen/progress-view.js";
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

export const refMidflightBusyWorkspace = (terminal: TerminalSize): Doc =>
  progressActivity(state)({ ...terminal, nowMs: NOW, spinner: "◒" });
