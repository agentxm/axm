import { redactSensitiveValue } from "../app-error/secret-redaction.js";

export interface ProgressEvent {
  readonly type: "progress";
  readonly phase: string;
  readonly percent: number;
  readonly message: string;
  readonly unit?: string;
  readonly state?: string;
  readonly reason?: string;
  readonly atMs?: number;
}

export interface LogEvent {
  readonly type: "log";
  readonly level: "info" | "warn" | "error";
  readonly message: string;
}

export interface ErrorEvent {
  readonly type: "error";
  readonly code: string;
  readonly message: string;
  readonly reason?: string;
  readonly signal?: "SIGINT" | "SIGTERM";
}

export interface SuggestionEvent {
  readonly type: "suggestion";
  readonly description: string;
  readonly cmd?: string;
  readonly url?: string;
}

export interface InstructionEvent {
  readonly type: "instruction";
  readonly message: string;
}

export type MachineEvent =
  ProgressEvent | LogEvent | ErrorEvent | SuggestionEvent | InstructionEvent;

export const progressEvent = (
  phase: string,
  percent: number,
  message: string,
  detail?: Omit<ProgressEvent, "type" | "phase" | "percent" | "message">,
): ProgressEvent => ({ type: "progress", phase, percent, message, ...detail });

export const logEvent = (level: LogEvent["level"], message: string): LogEvent => ({
  type: "log",
  level,
  message,
});

export const errorEvent = (
  code: string,
  message: string,
  detail?: Pick<ErrorEvent, "reason" | "signal">,
): ErrorEvent => ({ type: "error", code, message, ...detail });

export const suggestionEvent = (suggestion: {
  readonly description: string;
  readonly cmd?: string | undefined;
  readonly url?: string | undefined;
}): SuggestionEvent => ({
  type: "suggestion",
  description: suggestion.description,
  ...(suggestion.cmd === undefined ? {} : { cmd: suggestion.cmd }),
  ...(suggestion.url === undefined ? {} : { url: suggestion.url }),
});

export const instructionEvent = (message: string): InstructionEvent => ({
  type: "instruction",
  message,
});

export const encodeMachineEvent = (event: MachineEvent): string =>
  `${JSON.stringify(redactSensitiveValue(event))}\n`;
