import { fileURLToPath } from "node:url";
import * as Effect from "effect/Effect";
import { Npm, Pnpm, Unknown, Yarn, type InstallMethodType } from "../../../domain/index.js";
import type { makeCommandRunner } from "../subprocess/command-evidence.js";

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

/** Native manager queries return installation facts and their immutable command evidence. */
export const inspectPackageManagerOwnership = (
  method: InstallMethodType,
  run: ReturnType<typeof makeCommandRunner>,
  workingDirectory: string,
) =>
  Effect.gen(function* () {
    if (
      method._tag !== "Unknown" ||
      method.reason !== "ambiguous" ||
      !(method.evidence ?? []).some((evidence) => evidence.includes("node_modules"))
    ) {
      return { method, commands: [] };
    }

    const modulePath = fileURLToPath(import.meta.url);
    const npmRoot = yield* run("detection", "npm", ["root", "-g"], workingDirectory, {
      timeoutMs: 5_000,
    });
    const pnpmRoot = yield* run("detection", "pnpm", ["root", "-g"], workingDirectory, {
      timeoutMs: 5_000,
    });
    const yarnRoot = yield* run("detection", "yarn", ["global", "dir"], workingDirectory, {
      timeoutMs: 5_000,
    });
    const commands = [npmRoot, pnpmRoot, yarnRoot];
    const matches = [
      ...(npmRoot.exitCode === 0 && isInsideRoot(modulePath, npmRoot.stdout.trim())
        ? (["npm"] as const)
        : []),
      ...(pnpmRoot.exitCode === 0 && isInsideRoot(modulePath, pnpmRoot.stdout.trim())
        ? (["pnpm"] as const)
        : []),
      ...(yarnRoot.exitCode === 0 &&
      isInsideRoot(modulePath, `${yarnRoot.stdout.trim()}/node_modules`)
        ? (["yarn"] as const)
        : []),
    ];
    if (matches.length > 1) {
      return {
        method: new Unknown({
          reason: "conflicting",
          detectionSource: "conflicting",
          evidence: matches.map((manager) => `package-manager-query:${manager}`),
          confidence: "low",
        }),
        commands,
      };
    }

    const matchedManager = matches[0];
    if (matchedManager === undefined) return { method, commands };
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
        return { method: new Npm(fields), commands };
      case "pnpm":
        return { method: new Pnpm(fields), commands };
      case "yarn": {
        const version = yield* run("detection", "yarn", ["--version"], workingDirectory, {
          timeoutMs: 5_000,
        });
        const majorText = version.stdout.trim().split(".")[0];
        const managerMajorVersion =
          majorText !== undefined && /^\d+$/u.test(majorText) ? Number(majorText) : undefined;
        return {
          method: new Yarn({
            ...fields,
            ...(managerMajorVersion === undefined ? {} : { managerMajorVersion }),
          }),
          commands: [...commands, version],
        };
      }
    }
  });
