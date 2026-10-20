export type { OutputFormat } from "./output-mode.js";
export { LogEventSchema } from "../screen/machine-events.js";
export { JsonErrorEnvelopeSchema, makeJsonErrorEnvelopeFromAppError } from "./json-envelope.js";
export {
  JsonHelpDocSchema,
  JsonVersionDocSchema,
  decodeFormatterDocument,
  toJsonHelpDoc,
  type JsonArgDoc,
  type JsonFlagDoc,
  type JsonHelpDoc,
  type JsonSubcommandDoc,
} from "./json-help-doc.js";
export { processOutcome, type ProcessOutcome } from "./process-outcome.js";
export { hasExplicitJsonFlag, hasPlainFlag, resolveFormatFromArgv } from "./resolve-format.js";
export { classifyError } from "./handle-error.js";
export { InterruptionSignalSourceLive, requestedInterruptionSignal } from "./interruption.js";
export { ResolvePlanInteractionLive } from "./resolve-plan-interaction-live.js";
export { InstallSelectionLive } from "./extension-selection-interaction-live.js";
export { BundledAxmSkillAssetLive } from "./bundled-axm-skill-asset-live.js";
export { runCliMain } from "./run-cli-main.js";
export {
  type ExpectedCliError,
  makeFoundationLayer,
  resolveCliFormat,
  withCliErrorHandling,
} from "./runtime-envelope.js";
export {
  recordSkillInstalls,
  withCommandFailureReport,
  withProcessTelemetry,
  setCommandSemanticProperties,
  getCommandSemanticProperties,
  observeLifecycleForTelemetry,
  CommandSemanticPropertiesLive,
  startProductActivity,
  type ProductActivityIntent,
} from "./telemetry.js";
export {
  OperationExitLive,
  getOperationExitCode,
  setOperationSettlement,
} from "./operation-exit.js";
export { recordCommandCompletion } from "./command-completion.js";
export { CommandArgv, withArgvTracking } from "./command-argv.js";
export {
  summarizeCommandOutcome,
  type CommandOutcomeSummary,
  type SubjectType,
  type SourceKind,
} from "./command-summary.js";
