export {
  AppError,
  AppErrorCodeSchema,
  AppErrorCodes,
  AppErrorProblemSchema,
  ExitCode,
  ExitCodeDefinitions,
  defaultSuggestionsFor,
  defaultDetailFor,
  defaultTitleFor,
  effectiveSuggestionsFor,
  errorClassForAppErrorCode,
  exitCodeFor,
  makeAppError,
  type AppErrorClass,
  type AppErrorAction,
  type AppErrorInput,
  type AppErrorMetadata,
  type AppErrorCode,
  type AppErrorProblem,
  type AppErrorSuggestedAction,
} from "./app-error.js";
export {
  BC,
  errSignedOut,
  errInstallFailed,
  errPublishConflict,
  errRegistryPublishRejected,
  withAppErrorSemantics,
} from "./builders.js";
export { appErrorDoc, defectDoc, renderAppError } from "./view.js";
export { serializeErrorCauseChain, type SerializedErrorCause } from "./cause-chain.js";
export {
  REDACTED_SECRET,
  collectSensitiveStrings,
  redactAppErrorMetadata,
  redactSensitiveText,
  redactSensitiveValue,
  redactSuggestedAction,
} from "./secret-redaction.js";
