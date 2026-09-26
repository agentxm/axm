import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { formatFqn } from "@agentxm/extension-model/unstable/extensions";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import {
  AcceptedResolutionWriter,
  SettingsReader,
  SettingsWriter,
  lockEntryToSourceParams,
  type LockEntryByType,
} from "../../desired-state/index.js";

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
    const source = Option.match(args.resolution, {
      onNone: () => "workspace",
      onSome: ({ entry }) =>
        entry.source.type === "registry" && ref.refType === "registry"
          ? `${ref.source.name}:${formatFqn({ owner: ref.owner, type: ref.type, name: ref.name })}${Option.isSome(args.versionRange) ? `@${args.versionRange.value}` : ""}`
          : printSourceParams(lockEntryToSourceParams(entry)),
    });
    // Declaring a materialization intentionally creates acquisition intent.
    // Where an entry already carried member preferences, they cross over; the
    // markers that only exist to prove a configuration entry declares nothing
    // do not.
    if (ref.type === "mcp-server") {
      const current = (yield* reader.entries("mcp-server"))[name];
      yield* writer.setEntry("mcp-server", name, {
        kind: "sourced",
        source,
        enabled: current?.enabled ?? true,
        ...(current?.distribute === undefined ? {} : { distribute: current.distribute }),
        env: current?.env ?? {},
      });
    } else if (ref.type === "knowledge") {
      const current = (yield* reader.entries("knowledge"))[name];
      yield* writer.setEntry("knowledge", name, {
        source,
        enabled: current?.enabled ?? true,
        ...(current?.distribute === undefined ? {} : { distribute: current.distribute }),
        ...(current?.instructionEntry === undefined
          ? {}
          : { instructionEntry: current.instructionEntry }),
      });
    } else if (ref.type === "skill") {
      const current = (yield* reader.entries("skill"))[name];
      yield* writer.setEntry("skill", name, {
        source,
        enabled: current?.enabled ?? true,
        ...(current?.distribute === undefined ? {} : { distribute: current.distribute }),
        ...(current?.origin === undefined ? {} : { origin: current.origin }),
      });
    } else {
      const current = (yield* reader.entries(ref.type))[name];
      yield* writer.setEntry(ref.type, name, {
        source,
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
