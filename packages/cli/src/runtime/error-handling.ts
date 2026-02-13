import { type CliError, renderCliError, renderDefect } from "../cli-error/index.js";

export type ErrorClassification =
  | { readonly exitCode: 0 }
  | { readonly exitCode: 1; readonly message: string }
  | { readonly exitCode: 2; readonly message: string };

export const classifyError = (error: unknown): ErrorClassification => {
  const tag = (error as { readonly _tag?: string })._tag;
  if (tag === "PromptCancelled") {
    return { exitCode: 0 };
  }
  if (tag === "CliError") {
    return { exitCode: 1, message: renderCliError(error as CliError) };
  }
  return { exitCode: 2, message: renderDefect(error) };
};
