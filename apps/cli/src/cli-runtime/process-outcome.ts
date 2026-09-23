/** A command's displayed result and the process status it requests. */
export interface ProcessOutcome {
  readonly _tag: "ProcessOutcome";
  readonly exitCode: number;
}

export const processOutcome = (exitCode: number): ProcessOutcome => ({
  _tag: "ProcessOutcome",
  exitCode,
});

export const isProcessOutcome = (value: unknown): value is ProcessOutcome =>
  typeof value === "object" &&
  value !== null &&
  "_tag" in value &&
  value._tag === "ProcessOutcome" &&
  "exitCode" in value &&
  typeof value.exitCode === "number";
