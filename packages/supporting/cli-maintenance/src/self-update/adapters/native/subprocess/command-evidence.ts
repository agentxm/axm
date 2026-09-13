import * as Effect from "effect/Effect";
import type { CommandRecord, UpgradeExecutionObserverService } from "../../../application/index.js";
import type { RunCommandOptions, SubprocessService } from "./subprocess.js";

/** Native execution returns facts; an owner-defined observer may report its lifetime. */
export const makeCommandRunner = (
  subprocess: SubprocessService,
  observeCommand: UpgradeExecutionObserverService["command"],
) => {
  return (
    purpose: CommandRecord["purpose"],
    executable: string,
    args: ReadonlyArray<string>,
    workingDirectory: string,
    options?: RunCommandOptions,
  ) =>
    observeCommand(
      { purpose, executable, args },
      Effect.map(
        subprocess.run(executable, args, { ...options, cwd: workingDirectory }),
        (result): CommandRecord => ({
          purpose,
          executable,
          args,
          executionState: result.executionState,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          outputTruncated: result.stdoutTruncated === true || result.stderrTruncated === true,
        }),
      ),
    );
};
