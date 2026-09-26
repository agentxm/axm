export const at = <T>(values: ReadonlyArray<T>, index: number, message?: string): T => {
  const value = values[index];
  if (value === undefined) {
    throw new Error(message ?? `Expected element at index ${index}`);
  }
  return value;
};

export const expectRecord = (
  value: unknown,
  message = "Expected object record",
): Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(message);
  }

  return Object.fromEntries(Object.entries(value));
};
