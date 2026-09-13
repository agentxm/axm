import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import { observeChildUnit } from "@agentxm/workspace-operations";
import { formatRecommendedCommand } from "@agentxm/cli-maintenance/self-update/adapters/cli";
import type { CommandRecord } from "@agentxm/cli-maintenance/self-update/application";
import type { RunCommandOptions, SubprocessService } from "../../subprocess/subprocess.js";

/** A native command returns immutable evidence and owns its progress unit. */
export const makeCommandRunner = (
  subprocess: SubprocessService,
  counter: Ref.Ref<number>,
  prefix: string,
) => {
  return (
    purpose: CommandRecord["purpose"],
    executable: string,
    args: ReadonlyArray<string>,
    workingDirectory: string,
    options?: RunCommandOptions,
  ) =>
    Effect.gen(function* () {
      const sequence = yield* Ref.getAndUpdate(counter, (value) => value + 1);
      const display = formatRecommendedCommand({ executable, args, shellRequired: false });
      return yield* observeChildUnit(
        {
          id: `${prefix}-${String(sequence)}`,
          label: display,
          resolvedLabel: (record: CommandRecord) => {
            const outcome =
              record.executionState === "not-started"
                ? "did not start"
                : record.executionState === "timed-out"
                  ? "timed out"
                  : record.exitCode === 0
                    ? null
                    : `exit ${record.exitCode === null ? "unavailable" : String(record.exitCode)}`;
            return outcome === null ? display : `${display} · ${outcome}`;
          },
        },
        Effect.map(
          subprocess.run(executable, args, { ...options, cwd: workingDirectory }),
          (result): CommandRecord => ({
            purpose,
            executable,
            args,
            display,
            executionState: result.executionState,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            outputTruncated: result.stdoutTruncated === true || result.stderrTruncated === true,
          }),
        ),
      );
    });
};
