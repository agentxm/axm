export {
  AppError,
  AppErrorCodeSchema,
  AppErrorCodes,
  ExitCode,
  ExitCodeDefinitions,
  defaultSuggestionsFor,
  defaultTitleFor,
  effectiveSuggestionsFor,
  errorClassForAppErrorCode,
  exitCodeFor,
  makeAppError,
  type AppErrorClass,
  type AppErrorAction,
  type AppErrorCode,
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
  redactCredentialBearingLocator,
  redactAppErrorMetadata,
  redactSensitiveText,
  redactSensitiveValue,
  redactSuggestedAction,
} from "./secret-redaction.js";
