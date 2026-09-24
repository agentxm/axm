import { redactRegistryText, redactRegistryValue } from "@agentxm/registry-client";
import * as Schema from "effect/Schema";
import { AppErrorCodeSchema, type AppError } from "./app-error.js";
import { StepFailure } from "@agentxm/workspace/transitions/planning";

/**
 * One serialized entry of a failure's cause chain, as every machine document
 * that carries a cause chain declares it.
 */
export const SerializedErrorCauseSchema = Schema.Struct({
  _tag: Schema.String,
  code: Schema.optional(AppErrorCodeSchema),
  message: Schema.String,
  stack: Schema.optional(Schema.String),
}).annotate({
  identifier: "ErrorCause",
  title: "Error Cause",
  description: "One serialized entry from a failure's cause chain.",
});
export type SerializedErrorCause = typeof SerializedErrorCauseSchema.Type;

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

const causeMessage = (cause: unknown, secrets: ReadonlyArray<string>): string => {
  if (typeof cause === "string" || typeof cause === "number" || typeof cause === "boolean") {
    return redactRegistryText(String(cause), { secrets });
  }
  if (cause === null) return "null";
  if (cause === undefined) return "undefined";

  const structuredMessage = structuredObjectMessage(cause);
  if (structuredMessage !== undefined) return redactRegistryText(structuredMessage, { secrets });

  try {
    return JSON.stringify(redactRegistryValue(cause, { secrets })) ?? String(cause);
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
  options: { readonly debug: boolean; readonly secrets: ReadonlyArray<string> },
): SerializedErrorCause => {
  if (isAppError(cause)) {
    return {
      _tag: "AppError",
      code: cause.code,
      message: redactRegistryText(cause.detail, { secrets: options.secrets }),
    };
  }

  if (cause instanceof StepFailure) {
    return {
      _tag: "StepFailure",
      code: cause.category,
      message: redactRegistryText(cause.detail, { secrets: options.secrets }),
    };
  }

  if (cause instanceof Error) {
    const message = getStringField(cause, "message");
    return {
      _tag: errorTag(cause),
      message:
        message === undefined
          ? causeMessage(cause, options.secrets)
          : redactRegistryText(message, { secrets: options.secrets }),
      ...(options.debug && cause.stack !== undefined
        ? { stack: redactRegistryText(cause.stack, { secrets: options.secrets }) }
        : {}),
    };
  }

  return {
    _tag: typeof cause === "object" ? objectTag(cause) : typeof cause,
    message: causeMessage(cause, options.secrets),
  };
};

export const serializeErrorCauseChain = (
  cause: unknown,
  options: {
    readonly debug?: boolean;
    readonly secrets?: ReadonlyArray<string>;
  } = {},
): ReadonlyArray<SerializedErrorCause> => {
  if (cause === undefined || cause === null) return [];

  const chain: Array<SerializedErrorCause> = [];
  let current: unknown = cause;
  let depth = 0;
  while (current !== undefined && current !== null && depth < MAX_CAUSE_DEPTH) {
    chain.push(
      serializeCause(current, {
        debug: options.debug === true,
        secrets: options.secrets ?? [],
      }),
    );
    current = nestedCause(current);
    depth += 1;
  }
  return chain;
};
