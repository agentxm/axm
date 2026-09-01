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
export {
  InterruptionSignalSourceLive,
  recordInterruptionSignal,
  requestedInterruptionSignal,
} from "./interruption.js";
export { ResolvePlanInteractionLive } from "./resolve-plan-interaction-live.js";
export { WorkspaceInitializationInteractionLive } from "./workspace-initialization-interaction-live.js";
export { runCliMain, resolveCliContext, type CliMainContext } from "./run-cli-main.js";
export {
  type CliTelemetryConfig,
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
  type CliCommandTelemetryOptions,
  type CliCommandCompletedOptions,
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
export { AgentPresenceProbeLive } from "./agent-presence-live.js";
export { AxmSkillCandidateGateLive } from "./axm-skill-gate-live.js";
export { WorkspaceCatalogLive } from "./workspace-catalog-live.js";
