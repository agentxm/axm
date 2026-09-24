export type { OutputFormat } from "./output-mode.js";
export type {
  ProgressEvent,
  LogEvent,
  ErrorEvent,
  SuggestionEvent,
  MachineEvent as StreamEvent,
} from "../screen/machine-events.js";
export {
  ProgressEventSchema,
  LogEventSchema,
  ErrorEventSchema,
  SuggestionEventSchema,
} from "../screen/machine-events.js";
export {
  JsonEnvelopeSchema,
  JsonSuccessEnvelopeSchema,
  JsonErrorEnvelopeSchema,
  makeJsonSuccessEnvelope,
  makeJsonErrorEnvelope,
  makeJsonErrorEnvelopeFromAppError,
  type JsonEnvelope,
  type JsonSuccessEnvelope,
  type JsonErrorEnvelope,
} from "./json-envelope.js";
export {
  JsonArgDocSchema,
  JsonExampleDocSchema,
  JsonFlagDocSchema,
  JsonHelpDocSchema,
  JsonSubcommandDocSchema,
  JsonSubcommandGroupDocSchema,
  JsonVersionDocSchema,
  isSubcommandDoc,
  toJsonFlagDoc,
  toJsonHelpDoc,
  type JsonArgDoc,
  type JsonExampleDoc,
  type JsonFlagDoc,
  type JsonHelpDoc,
  type JsonSubcommandDoc,
  type JsonSubcommandGroupDoc,
  type JsonVersionDoc,
} from "./json-help-doc.js";
export {
  MACHINE_OUTPUT_CONTRACT_ID,
  MachineOutputDocumentKindSchema,
  MachineOutputDocumentSchema,
  detectMachineOutputDocumentKind,
  type MachineOutputDocument,
  type MachineOutputDocumentKind,
} from "./machine-output-document.js";
export { processOutcome, isProcessOutcome, type ProcessOutcome } from "./process-outcome.js";
export {
  hasExplicitJsonFlag,
  optionArgs,
  outputSelectorsFromArgv,
  resolveFormatFromArgv,
  resolveFormat,
} from "./resolve-format.js";
export { handleError, classifyError, type ErrorClassification } from "./handle-error.js";
export { withGracefulShutdown } from "./graceful-shutdown.js";
export {
  InterruptionSignalSourceLive,
  recordInterruptionSignal,
  requestedInterruptionSignal,
} from "./interruption.js";
export { ResolvePlanInteractionLive } from "./resolve-plan-interaction-live.js";
export { ExtensionSelectionLive } from "./extension-selection-interaction-live.js";
export { BundledAxmSkillAssetLive } from "./bundled-axm-skill-asset-live.js";
export { runCliMain, resolveCliContext, type CliMainContext } from "./run-cli-main.js";
export {
  type CliTelemetryConfig,
  type CliRuntimeFoundation,
  type WithCliRuntimeOptions,
  withCliRuntime,
  type ExpectedCliError,
  type WorkspaceInitializationCancelled,
  makeFoundationLayer,
  resolveCliFormat,
  withCliErrorHandling,
} from "./runtime-envelope.js";
export {
  trackCliCommand,
  trackCliCommandCompleted,
  recordCommandSettlement,
  setCommandSemanticProperties,
  getCommandSemanticProperties,
  observeLifecycleForTelemetry,
  CommandSemanticProperties,
  CommandSemanticPropertiesLive,
  ProductActivity,
  ProductActivityLive,
  startProductActivity,
  type CliCommandTelemetryOptions,
  type CliCommandCompletedOptions,
  type CommandSettlement,
  type CommandSettlementFailure,
  type ProductActivityIntent,
  type ProductActivityKind,
} from "./telemetry.js";
export {
  OperationExit,
  OperationExitLive,
  getOperationExitCode,
  setOperationExitCode,
} from "./operation-exit.js";
export {
  CommandCompletion,
  recordCommandCompletion,
  type CommandCompletionService,
} from "./command-completion.js";
export {
  CommandArgv,
  type CommandArgvService,
  withArgvTracking,
  serializeArgv,
  extractParamKinds,
} from "./command-argv.js";
export {
  summarizeCommandOutcome,
  type CommandOutcomeSummary,
  type CommandOutcome,
  type SubjectType,
  type SourceKind,
} from "./command-summary.js";
