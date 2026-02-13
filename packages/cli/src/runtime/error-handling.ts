import { type CliError, renderCliError } from "../cli-error/index.js";
import type { PromptCancelled } from "../tui/index.js";

export type ErrorClassification =
  | { readonly exitCode: 0 }
  | { readonly exitCode: 1; readonly message: string };

export const classifyError = (error: CliError | PromptCancelled): ErrorClassification => {
  switch (error._tag) {
    case "PromptCancelled":
      return { exitCode: 0 };
    case "CliError":
      return { exitCode: 1, message: renderCliError(error) };
  }
};
