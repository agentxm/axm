export const getOutput = (result: { stdout: string; stderr: string }): string =>
  `${result.stdout}\n${result.stderr}`;
