export type {
  OutputFormat,
  ProgressEvent,
  LogEvent,
  ErrorEvent,
  SuggestionEvent,
  StreamEvent,
} from "./output-mode.js";
export {
  ProgressEventSchema,
  LogEventSchema,
  ErrorEventSchema,
  SuggestionEventSchema,
  emitEvent,
} from "./output-mode.js";
export {
  SuggestedActionSchema,
  isSafeSuggestedAxmCommand,
  sanitizeSuggestedAction,
  type SuggestedAction,
} from "./suggested-action.js";
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
export { EffectCliExit, effectCliExit, isEffectCliExit } from "./effect-cli-exit.js";
export { resolveFormatFromArgv, resolveFormat } from "./resolve-format.js";
export { handleError, classifyError, type ErrorClassification } from "./handle-error.js";
export { withGracefulShutdown } from "./graceful-shutdown.js";
export { runCliMain, resolveCliContext, type CliMainContext } from "./run-cli-main.js";
export { makeCliTelemetryLayer, type CliTelemetryConfigService } from "./telemetry-layer.js";
export {
  type CliRuntimeFoundation,
  type WithCliRuntimeOptions,
  withCliRuntime,
  type ExpectedCliError,
  makeFoundationLayer,
  resolveCliFormat,
  withCliErrorHandling,
} from "./runtime-envelope.js";
export {
  trackCliCommand,
  trackCliCommandCompleted,
  reportCliDefect,
  reportCliError,
  setCommandSemanticProperties,
  getCommandSemanticProperties,
  CommandSemanticProperties,
  CommandSemanticPropertiesLive,
  type CommandSemanticPropertiesService,
  type CliCommandTelemetryOptions,
  type CliCommandCompletedOptions,
} from "./telemetry.js";
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
export {
  OperationPlanFields,
  OperationPlanSchema,
  makeOperationPlan,
  makeSingleStepOperationPlan,
  type OperationPlan,
  type OperationPlanStep,
  type OperationPlanStepArtifact,
} from "./operation-plan.js";
export {
  applyPlanExecution,
  confirmationRecoverySuggestions,
  namedPolicyRecoverySuggestions,
  credentialFreeLocatorRecoveryValue,
  preapprovedPlanExecution,
  promptablePlanExecution,
  previewPlanExecution,
  protectedRecoveryValue,
  publicRecoveryValue,
  recoveryOption,
  recoveryPositional,
  recoverySwitch,
  renderConfirmationRecoveryCommand,
  unclassifiedRecoveryValue,
  type ConfirmationRecovery,
  type ConfirmationRecoveryArgument,
  type ConfirmationRecoveryValue,
  type PlanExecution,
  type PlanExecutionRequest,
} from "./confirmation-recovery.js";
