import { makeAppError } from "../app-error/index.js";
import type { OutputWriteFailed } from "../screen/streams.js";

/** POSIX SIGPIPE status: the consumer stopped accepting output. */
export const CLOSED_PIPE_EXIT_CODE = 141;

export const isClosedOutputPipe = (failure: OutputWriteFailed): boolean =>
  failure.reason === "EPIPE";

/** Only code-owned stream facts enter diagnostics; never output bytes or foreign messages. */
export const outputFailureToAppError = (failure: OutputWriteFailed) =>
  makeAppError({
    code: "internal",
    title: "Output Failed",
    detail: `Could not write ${failure.channel} (${failure.reason}).`,
    cause: failure,
    diagnostic: {
      kind: `output.${failure.channel}.${failure.reason.toLowerCase()}`,
      operation: "runtime.output",
    },
    suggestions: [{ description: "Check the output destination and retry the command." }],
  });
