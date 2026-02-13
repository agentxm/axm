import * as Option from "effect/Option";
import type { CliError } from "./cli-error.js";

export const renderCliError = (error: CliError): string => {
  const lines: Array<string> = [];

  lines.push(`\u2717 ${error.what} (${error.code})`);

  for (const detail of error.details) {
    lines.push(`  ${detail}`);
  }

  if (Option.isSome(error.howToFix)) {
    lines.push(`  ${error.howToFix.value}`);
  }

  return lines.join("\n");
};

export const renderDefect = (error: unknown): string => {
  const lines: Array<string> = [];

  lines.push("\u2717 An unexpected error occurred");
  lines.push("  This is a bug. Please report it at https://github.com/agentxm/axm/issues");

  if (error instanceof Error) {
    lines.push(`  ${error.message}`);
  } else if (typeof error === "string") {
    lines.push(`  ${error}`);
  }

  return lines.join("\n");
};
