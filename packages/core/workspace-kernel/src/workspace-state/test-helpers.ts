import * as Predicate from "effect/Predicate";

export const expectRecord = (
  value: unknown,
  message = "Expected object record",
): Readonly<Record<string, unknown>> => {
  if (!Predicate.isObject(value)) {
    throw new Error(message);
  }

  return Object.fromEntries(Object.entries(value));
};
