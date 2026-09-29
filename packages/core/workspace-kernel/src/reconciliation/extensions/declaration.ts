import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  formatFqn,
  parseSourceQualifiedRegistrySourcePatternParts,
} from "@agentxm/extension-model/unstable/extensions";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import {
  AcceptedResolutionWriter,
  DesiredStateReader,
  SettingsReader,
  SettingsWriter,
  lockEntryToSourceParams,
  type LockEntryByType,
} from "../../workspace-state/index.js";

/**
 * The Registry locator a declaration records: the author's spelling when the
 * current settings entry already declares the same binding, with only its
 * range replaced; otherwise the locator qualified by the resolved source.
 *
 * "The same binding" is the desired-state graph's canonical identity: the
 * node that entry declares is held under Registry authority with the resolved
 * FQN, bound to the resolved configured source and its endpoint. A bare entry
 * bound to the default Registry therefore stays bare, a qualified one stays
 * qualified, and an entry bound anywhere else is rewritten.
 */
const registryDeclarationSource = (args: {
  readonly ref: Extract<ExtensionRef, { readonly refType: "registry" }>;
  readonly name: string;
  readonly versionRange: Option.Option<string>;
  readonly current: string | undefined;
}) =>
  Effect.gen(function* () {
    const { ref } = args;
    const fqn = formatFqn({ owner: ref.owner, type: ref.type, name: ref.name });
    const unqualified = `${fqn}${Option.isSome(args.versionRange) ? `@${args.versionRange.value}` : ""}`;
    const qualified = `${ref.source.name}:${unqualified}`;
    const current = args.current;
    if (current === undefined) return qualified;
    const graph = yield* (yield* DesiredStateReader).graph();
    const node = graph.nodes.find(
      (candidate) =>
        candidate.type === ref.type &&
        candidate.name === args.name &&
        candidate.origins.some((origin) => origin.type === "settings" && origin.source === current),
    );
    const identity = node?.identity;
    const sameBinding =
      identity?.authority === "registry" &&
      identity.fqn === fqn &&
      identity.registry.sourceName === ref.source.name &&
      identity.registry.endpoint?.href === ref.source.location.href;
    if (!sameBinding) return qualified;
    const spelledSource = parseSourceQualifiedRegistrySourcePatternParts(current)?.sourceName;
    return spelledSource !== undefined && Option.isNone(spelledSource) ? unqualified : qualified;
  });

export interface AcceptedMaterialization<TRef extends ExtensionRef> {
  readonly key: string;
  readonly entry: LockEntryByType[TRef["type"]];
}

/** Intent is a reconciliation decision, independent of recording accepted facts. */
export const declareMaterialization = <TRef extends ExtensionRef>(args: {
  readonly ref: TRef;
  readonly name: string;
  readonly versionRange: Option.Option<string>;
  readonly resolution: Option.Option<AcceptedMaterialization<TRef>>;
}) =>
  Effect.gen(function* () {
    const writer = yield* SettingsWriter;
    const reader = yield* SettingsReader;
    const { ref, name } = args;
    // The MCP install operation declares its connection row. This generic
    // declaration path still serves source transitions such as demote.
    // Inline and workspace MCP definitions already carry their desired authority.
    if (ref.type === "mcp-server" && ref.refType !== "registry") return;
    const sourceFor = (current: string | undefined) =>
      Option.match(args.resolution, {
        onNone: () => Effect.succeed("workspace"),
        onSome: ({ entry }) =>
          entry.source.type === "registry" && ref.refType === "registry"
            ? registryDeclarationSource({
                ref,
                name,
                versionRange: args.versionRange,
                current,
              })
            : Effect.succeed(printSourceParams(lockEntryToSourceParams(entry))),
      });
    // Declaring a materialization intentionally creates acquisition intent.
    // Where an entry already carried member preferences, they cross over; the
    // markers that only exist to prove a configuration entry declares nothing
    // do not.
    if (ref.type === "mcp-server") {
      const current = (yield* reader.entries("mcp-server"))[name];
      yield* writer.setEntry("mcp-server", name, {
        kind: "sourced",
        source: yield* sourceFor(current?.kind === "sourced" ? current.source : undefined),
        enabled: current?.enabled ?? true,
        ...(current?.distribute === undefined ? {} : { distribute: current.distribute }),
        env: current?.env ?? {},
      });
    } else if (ref.type === "knowledge") {
      const current = (yield* reader.entries("knowledge"))[name];
      yield* writer.setEntry("knowledge", name, {
        source: yield* sourceFor(current?.source),
        enabled: current?.enabled ?? true,
        ...(current?.distribute === undefined ? {} : { distribute: current.distribute }),
        ...(current?.instructionEntry === undefined
          ? {}
          : { instructionEntry: current.instructionEntry }),
      });
    } else if (ref.type === "skill") {
      const current = (yield* reader.entries("skill"))[name];
      yield* writer.setEntry("skill", name, {
        source: yield* sourceFor(current?.source),
        enabled: current?.enabled ?? true,
        ...(current?.distribute === undefined ? {} : { distribute: current.distribute }),
        ...(current?.origin === undefined ? {} : { origin: current.origin }),
      });
    } else {
      const current = (yield* reader.entries(ref.type))[name];
      yield* writer.setEntry(ref.type, name, {
        source: yield* sourceFor(current?.source),
        enabled: current?.enabled ?? true,
        ...(current?.distribute === undefined ? {} : { distribute: current.distribute }),
      });
    }
  });

export const recordMaterialization = <TRef extends ExtensionRef>(args: {
  readonly ref: TRef;
  readonly name: string;
  readonly resolution: Option.Option<AcceptedMaterialization<TRef>>;
}) =>
  Effect.gen(function* () {
    const writer = yield* AcceptedResolutionWriter;
    if (Option.isSome(args.resolution)) {
      yield* writer.setAccepted(
        args.ref.type,
        args.resolution.value.key,
        args.resolution.value.entry,
      );
    } else if (args.ref.type !== "mcp-server") {
      yield* writer.removeAccepted(args.ref.type, args.name);
    }
  });
