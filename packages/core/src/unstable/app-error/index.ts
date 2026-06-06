export {
  AppError,
  AppErrorCodeSchema,
  AppErrorCodes,
  ExitCode,
  defaultSuggestionsFor,
  defaultDetailFor,
  defaultTitleFor,
  effectiveSuggestionsFor,
  errorClassForAppErrorCode,
  exitCodeFor,
  makeAppError,
  type AppErrorClass,
  type AppErrorMetadata,
  type AppErrorCode,
} from "./app-error.js";
export {
  BC,
  errAuthRequired,
  errAuthTokenRequired,
  errInstallFailed,
  errPublishConflict,
  errRegistryPublishRejected,
} from "./builders.js";
export { renderAppError, renderDefect } from "./render.js";
export { serializeErrorCauseChain, type SerializedErrorCause } from "./cause-chain.js";
