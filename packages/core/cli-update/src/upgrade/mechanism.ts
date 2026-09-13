/**
 * Native ownership inspection for ambiguous package-manager installations.
 * Installer adapters return observations to CLI maintenance, which owns package
 * and script mutation ordering, verification, and recovery decisions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  Npm,
  Pnpm,
  Unknown,
  Yarn,
  type InstallMethodType,
} from "@agentxm/cli-maintenance/self-update/domain";

import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";

import { observeChildUnit } from "@agentxm/workspace-operations";

import {
  UpgradeWorkingDirectory,
  type CommandRecord,
} from "@agentxm/cli-maintenance/self-update/application";

import {
  Subprocess,
  type CommandResult,
  type RunCommandOptions,
} from "../subprocess/subprocess.js";

const displayArgument = (argument: string): string =>
  /^[A-Za-z0-9_./:@=-]+$/u.test(argument) ? argument : `'${argument.replaceAll("'", "'\\''")}'`;

const displayCommand = (executable: string, args: ReadonlyArray<string>): string =>
  [executable, ...args].map(displayArgument).join(" ");

const commandRecord = (
  purpose: CommandRecord["purpose"],
  executable: string,
  args: ReadonlyArray<string>,
  result: CommandResult | null,
  failureDetail = "",
): CommandRecord => ({
  purpose,
  executable,
  args: [...args],
  display: displayCommand(executable, args),
  executionState: result?.executionState ?? "not-started",
  exitCode: result?.exitCode ?? null,
  stdout: result?.stdout ?? "",
  stderr: result?.stderr ?? failureDetail,
  outputTruncated: result?.stdoutTruncated === true || result?.stderrTruncated === true,
});

/** How a finished external command settles its unit: silent when it worked. */
const commandOutcome = (result: CommandResult): string | null => {
  switch (result.executionState) {
    case "not-started":
      return "did not start";
    case "timed-out":
      return "timed out";
    case "exited":
      return result.exitCode === 0
        ? null
        : `exit ${result.exitCode === null ? "unavailable" : String(result.exitCode)}`;
  }
};

/**
 * Run one external command, recording its evidence and narrating it as a unit
 * nested under the step that delegated it. Every command AXM hands to another
 * tool is separately observable while it runs — the reader sees which tool is
 * working, not one unchanging line for the whole delegation. The record index
 * names the unit, so repeated verification commands stay distinct.
 */
const runRecorded = (
  records: Array<CommandRecord>,
  purpose: CommandRecord["purpose"],
  executable: string,
  args: ReadonlyArray<string>,
  options?: RunCommandOptions,
) => {
  const display = displayCommand(executable, args);
  return observeChildUnit(
    {
      id: `command-${String(records.length)}`,
      label: display,
      resolvedLabel: (result: CommandResult) => {
        const outcome = commandOutcome(result);
        return outcome === null ? display : `${display} · ${outcome}`;
      },
    },
    Effect.gen(function* () {
      const subprocess = yield* Subprocess;
      const workingDirectory = yield* UpgradeWorkingDirectory;
      const result = yield* subprocess.run(executable, args, {
        ...options,
        cwd: workingDirectory.path,
      });
      records.push(commandRecord(purpose, executable, args, result));
      return result;
    }),
  );
};

const normalizedOwnershipPath = (value: string): string =>
  value.replace(/\\/gu, "/").replace(/\/+$/u, "").toLowerCase();

const isInsideRoot = (candidate: string, root: string): boolean => {
  const normalizedCandidate = normalizedOwnershipPath(candidate);
  const normalizedRoot = normalizedOwnershipPath(root);
  return (
    normalizedRoot.length > 0 &&
    (normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`))
  );
};

export const resolveAmbiguousPackageManager = (
  method: InstallMethodType,
  records: Array<CommandRecord>,
) =>
  Effect.gen(function* () {
    if (
      method._tag !== "Unknown" ||
      method.reason !== "ambiguous" ||
      !(method.evidence ?? []).some((evidence) => evidence.includes("node_modules"))
    ) {
      return method;
    }

    const modulePath = fileURLToPath(import.meta.url);
    const npmRoot = yield* runRecorded(records, "detection", "npm", ["root", "-g"], {
      timeoutMs: 5_000,
    });
    const pnpmRoot = yield* runRecorded(records, "detection", "pnpm", ["root", "-g"], {
      timeoutMs: 5_000,
    });
    const yarnRoot = yield* runRecorded(records, "detection", "yarn", ["global", "dir"], {
      timeoutMs: 5_000,
    });
    const matches: Array<"npm" | "pnpm" | "yarn"> = [];
    if (npmRoot?.exitCode === 0 && isInsideRoot(modulePath, npmRoot.stdout.trim())) {
      matches.push("npm");
    }
    if (pnpmRoot?.exitCode === 0 && isInsideRoot(modulePath, pnpmRoot.stdout.trim())) {
      matches.push("pnpm");
    }
    if (
      yarnRoot?.exitCode === 0 &&
      isInsideRoot(modulePath, `${yarnRoot.stdout.trim()}/node_modules`)
    ) {
      matches.push("yarn");
    }

    if (matches.length === 0) return method;
    if (matches.length > 1) {
      return new Unknown({
        reason: "conflicting",
        detectionSource: "conflicting",
        evidence: matches.map((manager) => `package-manager-query:${manager}`),
        confidence: "low",
      });
    }

    const matchedManager = matches[0];
    if (matchedManager === undefined) return method;
    const fields = {
      importUrl: import.meta.url,
      detectionSource: "package-manager-query" as const,
      evidence: [`package-manager-query:${matchedManager}`],
      confidence: "high" as const,
      ...(process.argv[1] !== undefined &&
      normalizedOwnershipPath(process.argv[1]).includes("/axm.sh/")
        ? { managerOwnedExecutable: process.argv[1] }
        : {}),
    };
    switch (matchedManager) {
      case "npm":
        return new Npm(fields);
      case "pnpm":
        return new Pnpm(fields);
      case "yarn": {
        const version = yield* runRecorded(records, "detection", "yarn", ["--version"], {
          timeoutMs: 5_000,
        });
        const majorText = version?.stdout.trim().split(".")[0];
        const managerMajorVersion =
          majorText !== undefined && /^\d+$/u.test(majorText) ? Number(majorText) : undefined;
        return new Yarn({
          ...fields,
          ...(managerMajorVersion === undefined ? {} : { managerMajorVersion }),
        });
      }
    }
  });
