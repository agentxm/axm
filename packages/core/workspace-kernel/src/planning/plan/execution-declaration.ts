/**
 * Reviewer-facing descriptions of a hook's or MCP server's execution
 * declaration, shared by exposure review and withdrawal so a withdrawal
 * describes what review accepted. Pure: callers own every read and failure.
 */
import { platform } from "node:os";
import { redactCredentialText } from "@agentxm/host-primitives";
import { isConfigurableAgentId } from "@agentxm/extension-model/unstable/agent-capabilities/identity";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { resolveHookImplementation } from "@agentxm/extension-model/unstable/hooks/resolution";
import { resolveMcpInvocation, selectMcpDistribution } from "../../agent-adapters/index.js";

/** Visit decoded declarations only. Environment references remain symbolic. */
export const secretReferences = (value: unknown): string[] => {
  if (typeof value !== "object" || value === null) return [];
  if (Array.isArray(value)) return value.flatMap(secretReferences);
  return Object.entries(value).flatMap(([key, child]) =>
    key === "env" && typeof child === "string" ? [child] : secretReferences(child),
  );
};

export const destination = (value: unknown): string => {
  if (typeof value !== "string") return "symbolic endpoint";
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return redactCredentialText(url.href);
  } catch {
    return "endpoint unavailable";
  }
};

/** The source an execution declaration comes from, without credentials. */
export const describeExecutionSource = (ref: ExtensionRef): string =>
  ref.refType === "registry"
    ? `${ref.source.location.href} ${ref.owner}/${ref.name}@${ref.version}`
    : ref.refType === "git-hosted"
      ? `Git ${destination(ref.source.url.href)}@${ref.gitCommitSha}`
      : ref.refType === "http"
        ? `HTTPS ${destination(ref.source.url.href)}`
        : "local external package";

/** Binding lines and handler input requests of the implementations `targets` select. */
export const describeHookBindings = (
  manifest: Parameters<typeof resolveHookImplementation>[0],
  targets: ReadonlyArray<string>,
  scope: Parameters<typeof resolveHookImplementation>[2]["scope"],
): { details: string[]; references: string[] } => {
  const details: string[] = [];
  const references: string[] = [];
  for (const agent of targets) {
    if (!isConfigurableAgentId(agent)) continue;
    const selection = resolveHookImplementation(manifest, agent, {
      scope,
      platform: platform(),
    });
    if (selection.status !== "selected" && selection.status !== "conditional") continue;
    for (const binding of selection.implementation.bindings) {
      details.push(
        `${agent}: ${binding.event}, ${binding.handler.runtime} ${binding.handler.entrypoint}`,
      );
      references.push(...secretReferences(binding.handler));
    }
  }
  return { details, references };
};

/** Connection and package lines and input requests of a resolved MCP invocation. */
export const describeMcpConnection = (
  manifest: Parameters<typeof resolveMcpInvocation>[0]["manifest"],
  invocation: Extract<ReturnType<typeof resolveMcpInvocation>, { readonly _tag: "resolved" }>,
): { details: string[]; references: string[] } => {
  const details: string[] = [];
  const connection = invocation.connection;
  details.push(
    connection.transport === "stdio"
      ? `stdio: ${redactCredentialText(connection.command)}`
      : `${connection.transport}: ${destination(connection.url)}`,
  );
  const distribution = selectMcpDistribution({ manifest, selector: invocation.distribution });
  if (distribution._tag !== "blocked" && distribution.candidate.kind === "package") {
    const pkg = distribution.candidate.package;
    details.push(
      `${pkg.registryType}: ${redactCredentialText(pkg.identifier)}${pkg.version === undefined ? " (version unspecified)" : `@${pkg.version}`}`,
    );
  }
  return { details, references: secretReferences(connection) };
};
