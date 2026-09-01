/**
 * Compatibility resolution for agent MCP writers that share one config file.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type {
  McpActivationFieldRepresentation,
  McpConfig,
  McpConfigTarget,
  McpTypeField,
  McpTypeFieldRepresentation,
} from "@agentxm/extension-model/unstable/agent-capabilities";

export type SharedMcpTransport = "stdio" | "streamable-http" | "sse";

export interface SharedMcpTargetMember {
  readonly agentId: string;
  readonly config: McpConfig;
  readonly target: McpConfigTarget;
}

export interface SharedMcpTargetConflict {
  readonly _tag: "conflict";
  readonly path: string;
  readonly agentIds: ReadonlyArray<string>;
  readonly axis: string;
  readonly reason: string;
}

export interface ResolvedSharedMcpTarget {
  readonly _tag: "resolved";
  readonly path: string;
  readonly agentIds: ReadonlyArray<string>;
  readonly config: McpConfig;
  readonly target: McpConfigTarget;
}

export type SharedMcpTargetResolution = ResolvedSharedMcpTarget | SharedMcpTargetConflict;

type MaterializedTypeField = { readonly name: string; readonly value: string } | null;

const typeFieldKey = (value: MaterializedTypeField): string =>
  value === null ? "omitted" : value.name + "=" + value.value;

const activationFieldKey = (value: McpActivationFieldRepresentation | null): string =>
  value === null
    ? "omitted"
    : value.name + ":enabled=" + String(value.enabled) + ":disabled=" + String(value.disabled);

const materializeTypeField = (
  value: McpTypeFieldRepresentation | null,
  transport: SharedMcpTransport,
): MaterializedTypeField => {
  if (value === null) return null;
  if (typeof value.value === "string") return { name: value.name, value: value.value };
  if (transport === "stdio") return null;
  const transportValue = value.value[transport];
  return transportValue === undefined ? null : { name: value.name, value: transportValue };
};

interface CompatibleValue<A> {
  readonly _tag: "compatible";
  readonly value: A;
}

interface IncompatibleValue {
  readonly _tag: "incompatible";
}

const chooseCompatible = <A>(args: {
  readonly policies: ReadonlyArray<{
    readonly required: A;
    readonly accepted: ReadonlyArray<A>;
  }>;
  readonly key: (value: A) => string;
  readonly preferPresent: boolean;
}): CompatibleValue<A> | IncompatibleValue => {
  const first = args.policies[0];
  if (first === undefined) return { _tag: "incompatible" };
  let common = new Set(first.accepted.map(args.key));
  for (const policy of args.policies.slice(1)) {
    const accepted = new Set(policy.accepted.map(args.key));
    common = new Set([...common].filter((key) => accepted.has(key)));
  }
  if (common.size === 0) return { _tag: "incompatible" };

  const requiredCounts = new Map<string, number>();
  for (const policy of args.policies) {
    const key = args.key(policy.required);
    if (!common.has(key)) continue;
    requiredCounts.set(key, (requiredCounts.get(key) ?? 0) + 1);
  }
  const keys = [...common].sort((left, right) => {
    const count = (requiredCounts.get(right) ?? 0) - (requiredCounts.get(left) ?? 0);
    if (count !== 0) return count;
    if (args.preferPresent) {
      if (left === "omitted" && right !== "omitted") return 1;
      if (right === "omitted" && left !== "omitted") return -1;
    }
    return left.localeCompare(right);
  });
  const selected = keys[0];
  if (selected === undefined) return { _tag: "incompatible" };
  for (const policy of args.policies) {
    const value = policy.accepted.find((candidate) => args.key(candidate) === selected);
    if (value !== undefined) return { _tag: "compatible", value };
  }
  return { _tag: "incompatible" };
};

const conflict = (args: {
  readonly members: ReadonlyArray<SharedMcpTargetMember>;
  readonly axis: string;
  readonly detail: string;
}): SharedMcpTargetConflict => {
  const path = args.members[0]?.target.path ?? "unknown";
  const agentIds = args.members.map((member) => member.agentId).sort();
  return {
    _tag: "conflict",
    path,
    agentIds,
    axis: args.axis,
    reason:
      "MCP config target '" +
      path +
      "' has no compatible " +
      args.axis +
      " for " +
      agentIds.join(", ") +
      ": " +
      args.detail,
  };
};

const allEqual = (values: ReadonlyArray<string>): boolean =>
  values.length < 2 || values.every((value) => value === values[0]);

const resolveTypeField = (
  policies: ReadonlyArray<McpTypeField>,
  transport: SharedMcpTransport,
): CompatibleValue<MaterializedTypeField> | IncompatibleValue =>
  chooseCompatible({
    policies: policies.map((policy) => ({
      required: materializeTypeField(policy.required, transport),
      accepted: policy.accepted.map((value) => materializeTypeField(value, transport)),
    })),
    key: typeFieldKey,
    preferPresent: true,
  });

const compatibleTargetFormat = (members: ReadonlyArray<SharedMcpTargetMember>): boolean => {
  const formats = members.map((member) => member.target.format);
  if (allEqual(formats)) return true;
  return formats.every((format) => format === "json" || format === "jsonc");
};

export const resolveSharedMcpTarget = (args: {
  readonly members: ReadonlyArray<SharedMcpTargetMember>;
  readonly transport: SharedMcpTransport;
}): SharedMcpTargetResolution => {
  const members = [...args.members].sort((left, right) =>
    left.agentId.localeCompare(right.agentId),
  );
  const first = members[0];
  if (first === undefined) {
    return conflict({ members, axis: "writer configuration", detail: "no writers were provided" });
  }
  if (!members.every((member) => member.target.path === first.target.path)) {
    return conflict({ members, axis: "target path", detail: "writers target different files" });
  }
  if (!compatibleTargetFormat(members)) {
    return conflict({
      members,
      axis: "target format",
      detail: members.map((member) => member.agentId + "=" + member.target.format).join(", "),
    });
  }
  if (!allEqual(members.map((member) => member.config.serversKey))) {
    return conflict({
      members,
      axis: "servers key",
      detail: members.map((member) => member.agentId + "=" + member.config.serversKey).join(", "),
    });
  }

  const activation = chooseCompatible({
    policies: members.map((member) => member.config.activationField),
    key: activationFieldKey,
    preferPresent: false,
  });
  if (activation._tag === "incompatible") {
    return conflict({
      members,
      axis: "activation field",
      detail: "accepted activation representations have an empty intersection",
    });
  }

  if (args.transport === "stdio") {
    const dialects = members.flatMap((member) =>
      member.config.stdio === null ? [] : [member.config.stdio],
    );
    if (dialects.length !== members.length) {
      return conflict({
        members,
        axis: "stdio transport",
        detail: "one or more readers reject stdio",
      });
    }
    if (!allEqual(dialects.map((dialect) => dialect.command + ":" + (dialect.envKey ?? "")))) {
      return conflict({
        members,
        axis: "stdio shape",
        detail: "command or environment representations differ",
      });
    }
    const typeField = resolveTypeField(
      dialects.map((dialect) => dialect.typeField),
      args.transport,
    );
    if (typeField._tag === "incompatible") {
      return conflict({
        members,
        axis: "stdio discriminator",
        detail: "accepted type representations have an empty intersection",
      });
    }
    const base = dialects[0];
    if (base === undefined) {
      return conflict({ members, axis: "stdio transport", detail: "no stdio dialect exists" });
    }
    return {
      _tag: "resolved",
      path: first.target.path,
      agentIds: members.map((member) => member.agentId),
      target: first.target,
      config: {
        ...first.config,
        targets: [first.target],
        activationField: { ...first.config.activationField, required: activation.value },
        stdio: {
          ...base,
          typeField: { ...base.typeField, required: typeField.value },
        },
      },
    };
  }

  const remoteTransport = args.transport;

  const dialects = members.flatMap((member) =>
    member.config.remote === null ? [] : [member.config.remote],
  );
  if (dialects.length !== members.length) {
    return conflict({
      members,
      axis: args.transport + " transport",
      detail: "one or more readers reject this remote transport",
    });
  }
  const remoteShape = dialects.map((dialect) =>
    [
      dialect.urlKey[remoteTransport] ?? "",
      dialect.headersKey ?? "",
      dialect.bearerTokenEnvKey ?? "",
      dialect.envHeadersKey ?? "",
    ].join(":"),
  );
  if (!allEqual(remoteShape) || remoteShape[0]?.startsWith(":") === true) {
    return conflict({
      members,
      axis: args.transport + " shape",
      detail: "URL, header, or credential representations differ",
    });
  }
  const typeField = resolveTypeField(
    dialects.map((dialect) => dialect.typeField),
    args.transport,
  );
  if (typeField._tag === "incompatible") {
    return conflict({
      members,
      axis: args.transport + " discriminator",
      detail: "accepted type representations have an empty intersection",
    });
  }
  const base = dialects[0];
  if (base === undefined) {
    return conflict({ members, axis: args.transport, detail: "no remote dialect exists" });
  }
  return {
    _tag: "resolved",
    path: first.target.path,
    agentIds: members.map((member) => member.agentId),
    target: first.target,
    config: {
      ...first.config,
      targets: [first.target],
      activationField: { ...first.config.activationField, required: activation.value },
      remote: {
        ...base,
        typeField: { ...base.typeField, required: typeField.value },
      },
    },
  };
};
