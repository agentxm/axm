import type { McpServerManifest } from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import {
  validateMcpConnection,
  type McpAuth,
  type McpBinding,
  type McpConnection,
  type McpDistribution,
} from "./connection.js";
import { mcpRunner, selectMcpDistribution } from "./distribution.js";
import { resolveMcpInputs, substituteMcpVariables } from "./inputs.js";

export type McpInvocationResolution =
  | {
      readonly _tag: "resolved";
      readonly connection: McpConnection;
      readonly distribution: McpDistribution;
      readonly runtimeArtifactPinned: boolean;
      readonly warnings: ReadonlyArray<string>;
    }
  | { readonly _tag: "blocked"; readonly reason: string; readonly missing: ReadonlyArray<string> };

/** Selection and input binding happen once, independently of agent membership or order. */
export const resolveMcpInvocation = (args: {
  readonly manifest: McpServerManifest;
  readonly distribution?: McpDistribution | undefined;
  readonly bindings?: ReadonlyArray<McpBinding> | undefined;
  readonly auth?: McpAuth | undefined;
}): McpInvocationResolution => {
  const selected = selectMcpDistribution({ manifest: args.manifest, selector: args.distribution });
  if (selected._tag === "blocked") return { _tag: "blocked", reason: selected.reason, missing: [] };
  const { candidate } = selected;
  const inputs = resolveMcpInputs(candidate, args.bindings ?? []);
  if (inputs.findings.length > 0)
    return {
      _tag: "blocked",
      reason: inputs.findings.map(({ inputId, message }) => `${inputId}: ${message}`).join("; "),
      missing: inputs.findings
        .filter(({ code }) => code === "missing-binding")
        .map(({ inputId }) => inputId),
    };
  let connection: McpConnection;
  let runtimeArtifactPinned = false;
  if (candidate.kind === "remote") {
    connection = {
      transport: candidate.remote.type,
      url: substituteMcpVariables(candidate.remote.url, inputs.urlVariables),
      headers: inputs.headers,
    };
  } else {
    const runner = mcpRunner(candidate.package);
    if (runner._tag === "unsupported")
      return { _tag: "blocked", reason: runner.reason, missing: [] };
    runtimeArtifactPinned = runner.runtimeArtifactPinned;
    connection = {
      transport: "stdio",
      command: runner.command,
      args: [
        ...runner.beforeRuntime,
        ...inputs.runtimeArguments,
        ...(candidate.package.registryType === "oci"
          ? Object.keys(inputs.environment).flatMap((name) => ["-e", name])
          : []),
        ...runner.afterRuntime,
        ...(inputs.packageArguments.length === 0 ? [] : runner.beforeArguments),
        ...inputs.packageArguments,
      ],
      env: inputs.environment,
    };
  }
  const findings = validateMcpConnection(connection, args.auth);
  if (findings.length > 0)
    return {
      _tag: "blocked",
      reason: findings.map(({ message }) => message).join("; "),
      missing: [],
    };
  return {
    _tag: "resolved",
    connection,
    distribution: candidate.selector,
    runtimeArtifactPinned,
    warnings: [
      ...(candidate.kind === "package" && !runtimeArtifactPinned
        ? ["Runtime artifact is not immutably pinned by the accepted source"]
        : []),
      ...inputs.unverified.map(
        (id) => `${id}: native environment value and constraints are unverified`,
      ),
    ],
  };
};
