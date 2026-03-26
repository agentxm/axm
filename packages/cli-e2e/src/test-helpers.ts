export const expectDefined = <T>(
  value: T | null | undefined,
  message = "Expected value to be defined",
): T => {
  if (value == null) {
    throw new Error(message);
  }

  return value;
};

export const getOutput = (result: { stdout: string; stderr: string }): string =>
  `${result.stdout}\n${result.stderr}`;
