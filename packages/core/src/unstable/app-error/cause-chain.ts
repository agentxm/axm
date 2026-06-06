import type { AppError, AppErrorCode } from "./app-error.js";

export interface SerializedErrorCause {
  readonly _tag: string;
  readonly code?: AppErrorCode;
  readonly message: string;
  readonly stack?: string;
}

const MAX_CAUSE_DEPTH = 16;

const isAppError = (cause: unknown): cause is AppError =>
  typeof cause === "object" &&
  cause !== null &&
  "_tag" in cause &&
  cause._tag === "AppError" &&
  "detail" in cause &&
  "code" in cause;

const getStringField = (value: unknown, field: string): string | undefined => {
  if (value === null || value === undefined || typeof value !== "object") {
    return undefined;
  }

  const fieldValue: unknown = Reflect.get(value, field);
  return typeof fieldValue === "string" && fieldValue.length > 0 ? fieldValue : undefined;
};

const getStringArrayField = (value: unknown, field: string): ReadonlyArray<string> | undefined => {
  if (value === null || value === undefined || typeof value !== "object") {
    return undefined;
  }

  const fieldValue: unknown = Reflect.get(value, field);
  if (!Array.isArray(fieldValue) || fieldValue.length === 0) return undefined;
  return fieldValue.every((item: unknown) => typeof item === "string") ? fieldValue : undefined;
};

const errorTag = (error: Error): string =>
  error.constructor.name.length > 0 ? error.constructor.name : "Error";

const objectTag = (cause: unknown): string => getStringField(cause, "_tag") ?? "Object";

const structuredObjectMessage = (cause: unknown): string | undefined => {
  const message = getStringField(cause, "message") ?? getStringField(cause, "detail");
  if (message !== undefined) return message;

  const issues = getStringArrayField(cause, "issues");
  if (issues !== undefined) return issues.join("; ");

  return getStringField(cause, "path");
};

const causeMessage = (cause: unknown): string => {
  if (typeof cause === "string" || typeof cause === "number" || typeof cause === "boolean") {
    return String(cause);
  }
  if (cause === null) return "null";
  if (cause === undefined) return "undefined";

  const structuredMessage = structuredObjectMessage(cause);
  if (structuredMessage !== undefined) return structuredMessage;

  try {
    return JSON.stringify(cause) ?? String(cause);
  } catch {
    return "[unserializable object]";
  }
};

const nestedCause = (cause: unknown): unknown => {
  if (cause === null || cause === undefined || typeof cause !== "object") return undefined;
  return Reflect.get(cause, "cause");
};

const serializeCause = (
  cause: unknown,
  options: { readonly debug: boolean },
): SerializedErrorCause => {
  if (isAppError(cause)) {
    return {
      _tag: "AppError",
      code: cause.code,
      message: cause.detail,
    };
  }

  if (cause instanceof Error) {
    return {
      _tag: errorTag(cause),
      message: cause.message.length > 0 ? cause.message : causeMessage(cause),
      ...(options.debug && cause.stack !== undefined ? { stack: cause.stack } : {}),
    };
  }

  return {
    _tag: typeof cause === "object" ? objectTag(cause) : typeof cause,
    message: causeMessage(cause),
  };
};

export const serializeErrorCauseChain = (
  cause: unknown,
  options: { readonly debug?: boolean } = {},
): ReadonlyArray<SerializedErrorCause> => {
  if (cause === undefined || cause === null) return [];

  const chain: Array<SerializedErrorCause> = [];
  let current: unknown = cause;
  let depth = 0;
  while (current !== undefined && current !== null && depth < MAX_CAUSE_DEPTH) {
    chain.push(serializeCause(current, { debug: options.debug === true }));
    current = nestedCause(current);
    depth += 1;
  }
  return chain;
};
