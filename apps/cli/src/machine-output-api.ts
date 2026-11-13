// Machine-output decoding surface for JavaScript and TypeScript automation.
// The machine-output help topic points consumers here, so the published
// `axm.sh/runtime` entry exports the schema and kind detector without loading
// the command application's composition graph.
export {
  MachineOutputDocumentSchema,
  detectMachineOutputDocumentKind,
} from "./cli-runtime/machine-output-document.js";
export { MachineEventSchema, type MachineEvent } from "./screen/machine-events.js";
export {
  TraceReceiptSchema,
  TraceReceiptDocumentSchema,
  TraceCaptureStateSchema,
  type TraceReceipt,
  type TraceReceiptDocument,
} from "./cli-runtime/local-trace-receipt.js";
export {
  inspectLocalTrace,
  traceRetrievalPlan,
  decodeTraceRetrieval,
  traceRetrievalColumns,
  TraceEvidenceFailure,
  TraceExpectationSchema,
  type TraceExpectation,
  type TraceWorkSummary,
} from "./cli-runtime/local-trace-inspection.js";
export {
  ConfiguredAgentOutcomeSchema,
  ConfiguredAgentReasonCodeSchema,
  type ConfiguredAgentOutcome,
  type ConfiguredAgentReasonCode,
} from "@agentxm/workspace-kernel/operations";
