import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { decodeExtensionNameSync, formatFqn } from "@agentxm/extension-model/unstable/extensions";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import {
  AcceptedResolutionWriter,
  SettingsReader,
  SettingsWriter,
  lockEntryToSourceParams,
  type LockEntryByType,
} from "@agentxm/workspace-state";

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
    // Inline and workspace MCP definitions already carry their desired authority.
    if (ref.type === "mcp-server" && ref.refType !== "registry") return;
    const source = Option.match(args.resolution, {
      onNone: () => "workspace",
      onSome: ({ entry }) =>
        entry.type === "registry"
          ? `${entry.sourceName}:${formatFqn({ owner: entry.owner, type: ref.type, name: decodeExtensionNameSync(name) })}${Option.isSome(args.versionRange) ? `@${args.versionRange.value}` : ""}`
          : printSourceParams(lockEntryToSourceParams(entry)),
    });
    if (ref.type === "mcp-server") {
      const current = (yield* reader.entries("mcp-server"))[name];
      yield* writer.setEntry("mcp-server", name, {
        ...current,
        kind: "sourced",
        source,
        enabled: current?.enabled ?? true,
        env: current?.env ?? {},
      });
    } else {
      const current = (yield* reader.entries(ref.type))[name];
      yield* writer.setEntry(ref.type, name, {
        ...current,
        source,
        enabled: current?.enabled ?? true,
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
