import {
  selectSubagentImplementation,
  type DecodedSubagentPackage,
} from "@agentxm/extension-content";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";
import { isConfigurableAgentId } from "@agentxm/extension-model/unstable/agent-capabilities/identity";
import {
  renderSubagent,
  bindSubagentResources,
  type SubagentRenderInput,
  type SubagentRenderOutput,
} from "../../agent-adapters/index.js";

import type { ConfiguredAgentReasonCode } from "../../operations/index.js";
import type { PackageResourceInvalid } from "../../locations/index.js";
import { computeSourceHash } from "../../workspace-state/index.js";

type SubagentImplementationMode = "portable" | "customized" | "native";

export type CompiledSubagentImplementation =
  | {
      readonly _tag: "Compiled";
      readonly mode: SubagentImplementationMode;
      readonly nativeName: string;
      readonly sourceDependencies: ReadonlyArray<string>;
      readonly qualifications: ReadonlyArray<string>;
      readonly input: SubagentRenderInput;
      readonly outputs: ReadonlyArray<SubagentRenderOutput>;
    }
  | {
      readonly _tag: "Unsupported";
      readonly mode?: SubagentImplementationMode;
      readonly reasonCode: ConfiguredAgentReasonCode;
      readonly reason: string;
      readonly sourceDependencies: ReadonlyArray<string>;
      /** Invalid bound resources prevent package mutation. */
      readonly resourceFailure?: PackageResourceInvalid;
    };

/** Native configuration retains external prerequisites, but package-relative
 * runtime paths cannot survive moving a definition into a host directory. */
const unresolvedRuntimeReference = (
  agentId: string,
  configuration: Readonly<Record<string, unknown>>,
): string | undefined => {
  const visit = (value: unknown, keys: ReadonlyArray<string>): string | undefined => {
    if (typeof value === "string") {
      const key = keys.at(-1) ?? "";
      const field = keys.join(".");
      if (
        agentId === "claude-code" &&
        /\$\{(?:CLAUDE_PLUGIN_ROOT|CLAUDE_PLUGIN_DATA)\}/u.test(value)
      ) {
        return `${field}: ${value}`;
      }
      if (
        ["opencode", "kilo", "mimo-code"].includes(agentId) &&
        keys[0] === "prompt" &&
        /\{file:/u.test(value)
      ) {
        return `${field}: ${value}`;
      }
      const knownPath =
        agentId === "codex" && keys.length === 1 && key === "model_instructions_file";
      const commandContext = ["hooks", "mcpServers", "mcp_servers"].includes(keys[0] ?? "");
      const relative = /^\.\.?[\\/]/u.test(value);
      const absolute = /^(?:[\\/]|~[\\/]|[A-Za-z]:[\\/]|[a-z]+:\/\/)/u.test(value);
      if (
        (knownPath && value.length > 0 && !absolute) ||
        (commandContext && key === "cwd" && value.length > 0 && !absolute) ||
        (commandContext && key === "args" && relative)
      )
        return `${field}: ${value}`;
      if (commandContext && key === "command" && /(?:^|\s)["']?\.\.?[\\/]/u.test(value))
        return `${field}: ${value}`;
      return undefined;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        const found = visit(entry, keys);
        if (found !== undefined) return found;
      }
    } else if (typeof value === "object" && value !== null) {
      for (const [key, entry] of Object.entries(value)) {
        const found = visit(entry, [...keys, key]);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };
  return visit(configuration, []);
};

/** One deterministic compiler for previews, writes, inspection and currency.
 * Scoped placement remains the native adapter's responsibility. */
export const compileSubagentImplementation = (args: {
  readonly package: DecodedSubagentPackage;
  readonly agentId: string;
  readonly resources?: Effect.Success<ReturnType<typeof bindSubagentResources>>;
}): CompiledSubagentImplementation => {
  const selected = selectSubagentImplementation(args.package, args.agentId);
  if (selected.kind === "unsupported")
    return {
      _tag: "Unsupported",
      reasonCode: "subagent-implementation-unavailable",
      reason: selected.reason,
      sourceDependencies: selected.sourceDependencies,
    };
  const mode = selected.kind === "core" ? "portable" : selected.kind;
  const unsupported = (
    reasonCode: ConfiguredAgentReasonCode,
    reason: string,
  ): CompiledSubagentImplementation => ({
    _tag: "Unsupported",
    mode,
    reasonCode,
    reason,
    sourceDependencies: selected.sourceDependencies,
  });
  const descriptor = isConfigurableAgentId(args.agentId)
    ? AGENT_DESCRIPTORS[args.agentId].subagents
    : undefined;
  if (
    descriptor?.writerSupported !== true ||
    args.agentId === "kiro-cli" ||
    args.agentId === "kiro" ||
    descriptor.locations.some((location) => location.shape === "file")
  ) {
    return unsupported(
      "subagent-native-writer-unavailable",
      `Native Subagent ownership proof is not supported for ${args.agentId}`,
    );
  }
  if (args.agentId === "devin")
    return unsupported(
      "subagent-native-layout-unavailable",
      "Nested AGENT.md ownership is not supported for Devin",
    );
  if (args.agentId === "mistral-vibe" && selected.kind !== "native")
    return unsupported(
      "subagent-portable-instructions-unavailable",
      "Mistral Vibe requires a complete native definition; portable inline instructions are not supported",
    );
  const configuration =
    args.resources?.configuration ??
    (selected.kind === "native" ? selected.native.configuration : selected.configuration);
  const unresolved = unresolvedRuntimeReference(args.agentId, configuration);
  if (unresolved !== undefined)
    return unsupported(
      "subagent-runtime-reference-unresolved",
      `Native runtime reference requires a preserved resource base; AXM does not relocate runtime assets (${unresolved})`,
    );
  if (selected.kind === "native" && selected.native.format === "json") {
    return unsupported(
      "subagent-native-proof-unavailable",
      "Native JSON Subagent ownership is not supported",
    );
  }
  const nativeName = selected.kind === "native" ? selected.native.name : selected.name;
  const sourceDependencies = [
    ...new Set([
      ...selected.sourceDependencies,
      ...(args.resources?.resources.map((resource) => resource.path) ?? []),
    ]),
  ];
  const resourceInputs = args.resources?.resources.map((resource) => ({
    path: resource.path,
    digest: computeSourceHash(resource.content),
  }));
  const common = {
    agentId: args.agentId,
    name: nativeName,
    sourceDependencies,
    ...(resourceInputs === undefined || resourceInputs.length === 0 ? {} : { resourceInputs }),
  };
  const input: SubagentRenderInput =
    selected.kind === "native" && selected.native.format !== "json"
      ? {
          ...common,
          body: args.resources?.body ?? selected.native.instructions,
          frontmatter: configuration,
          native: args.resources?.native ?? {
            format: selected.native.format,
            content: selected.native.content,
          },
        }
      : {
          ...common,
          body:
            args.resources?.body ??
            (selected.kind === "native" ? selected.native.instructions : selected.instructions),
          frontmatter:
            selected.kind === "native"
              ? configuration
              : {
                  ...configuration,
                  name: nativeName,
                  description: selected.description,
                },
        };
  const rendered = renderSubagent(input);
  if (rendered === undefined || rendered._tag === "Skipped")
    return unsupported(
      "subagent-native-render-unavailable",
      rendered?.reason ?? `No Subagent renderer for ${args.agentId}`,
    );
  return {
    _tag: "Compiled",
    mode,
    nativeName,
    sourceDependencies,
    input,
    outputs: rendered.outputs,
    qualifications:
      mode === "portable"
        ? []
        : [
            "Native settings are preserved; runtime behavior remains governed by the host and its policy.",
          ],
  };
};

/** Bind selected runtime inputs while the candidate source tree is still alive. */
export const prepareSubagentImplementation = Effect.fn("axm.subagent.prepare")(function* (args: {
  readonly package: DecodedSubagentPackage;
  readonly agentId: string;
  readonly sourceRoot: string;
  readonly retainedRoot: string;
}) {
  const selected = selectSubagentImplementation(args.package, args.agentId);
  if (
    selected.kind === "unsupported" ||
    (selected.kind === "native" && selected.native.format === "json")
  )
    return yield* Effect.sync(() => compileSubagentImplementation(args)).pipe(
      Effect.withSpan("axm.subagent.compile"),
    );
  const path = yield* Path.Path;
  return yield* bindSubagentResources({
    agentId: args.agentId,
    configuration:
      selected.kind === "native" ? selected.native.configuration : selected.configuration,
    body: selected.kind === "native" ? selected.native.instructions : selected.instructions,
    ...(selected.kind === "native" && selected.native.format !== "json"
      ? { native: { format: selected.native.format, content: selected.native.content } }
      : {}),
    base: selected.kind === "native" ? path.dirname(selected.source) : ".",
    sourceRoot: args.sourceRoot,
    retainedRoot: args.retainedRoot,
  }).pipe(
    Effect.flatMap((resources) =>
      Effect.sync(() => compileSubagentImplementation({ ...args, resources })).pipe(
        Effect.withSpan("axm.subagent.compile"),
      ),
    ),
    Effect.catchTag("PackageResourceInvalid", (error) =>
      Effect.succeed({
        _tag: "Unsupported",
        mode: selected.kind === "core" ? "portable" : selected.kind,
        reasonCode: "subagent-runtime-reference-unresolved",
        reason: `${error.detail} (${error.reference})`,
        sourceDependencies: selected.sourceDependencies,
        resourceFailure: error,
      } satisfies CompiledSubagentImplementation),
    ),
  );
});
