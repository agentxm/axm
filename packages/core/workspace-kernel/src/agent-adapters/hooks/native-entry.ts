/** Native command shape shared by workspace projection and bounded export. */
import type { HookEntryDialect } from "@agentxm/extension-model/unstable/agent-capabilities";

export const renderNativeHookGroup = (
  dialect: HookEntryDialect,
  args: {
    readonly command: string;
    readonly matcher?: string | undefined;
    readonly timeoutMs?: number | undefined;
    readonly name?: string | undefined;
    readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  },
): Record<string, unknown> => {
  const entry: Record<string, unknown> = { type: "command", command: args.command };
  if (args.metadata !== undefined) entry["x-axm"] = args.metadata;
  if (dialect.commandNameSerialization === "manifest" && args.name !== undefined)
    entry["name"] = args.name;
  if (args.timeoutMs !== undefined)
    entry["timeout"] =
      dialect.timeoutSerialization === "seconds" ? args.timeoutMs / 1000 : args.timeoutMs;
  const group: Record<string, unknown> =
    dialect.serializer === "flat-command-stdin" ? entry : { hooks: [entry] };
  if (args.matcher !== undefined)
    group["matcher"] =
      dialect.matcherSerialization === "slash-delimited" ? `/${args.matcher}/` : args.matcher;
  return group;
};
