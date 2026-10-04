/** Instruction ownership is observed per physical entry; runtime selection stays separate. */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";
import {
  combineNativeLocationOutcomes,
  captureNativeLocationSet,
  resolveNativeReadLocation,
  type NativeDirectoryInputs,
  type NativeLocationOutcome,
} from "../../locations/index.js";
import type { InstructionStatusItem } from "./instruction-status.js";

export const observeInstructionNativeLocations = (args: {
  readonly workspaceRoot: string;
  readonly scope: "project" | "user";
  readonly roots: ReadonlyArray<string>;
  readonly items: ReadonlyArray<InstructionStatusItem>;
  readonly configuredAgentIds: ReadonlyArray<string>;
  readonly nativeDirectoryInputs?: NativeDirectoryInputs;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const declaredReaders: Array<{
      agentId: string;
      lexical: string;
      condition?: string;
    }> = [];
    for (const root of args.scope === "user" ? [args.workspaceRoot] : args.roots)
      for (const descriptor of Object.values(AGENT_DESCRIPTORS)) {
        for (const declaration of descriptor.instructions?.locations ?? []) {
          if (declaration.shape !== "file") continue;
          const resolved = resolveNativeReadLocation(
            path,
            descriptor.id,
            declaration,
            { workspaceRoot: root, scope: args.scope },
            args.nativeDirectoryInputs ?? { skillsDirectoryOverrides: {} },
            { includeConditional: true },
          );
          if (resolved === undefined) continue;
          declaredReaders.push({
            agentId: descriptor.id,
            lexical: resolved.path,
            ...(declaration.applicability.kind === "conditional"
              ? { condition: declaration.applicability.condition }
              : {}),
          });
        }
      }
    const items = args.items.filter(
      (item) => item.mechanism !== "none" && item.mechanism !== "adapter",
    );
    // One finite inventory shares ancestor reads; the next observation captures anew.
    const observed = yield* captureNativeLocationSet({
      entries: [
        ...declaredReaders.map((reader) => reader.lexical),
        ...items.map((item) => item.targetFile),
      ],
    });
    const readers = yield* Effect.forEach(declaredReaders, (reader) =>
      Effect.gen(function* () {
        const address = yield* observed.entry(reader.lexical).pipe(Effect.option);
        const physical = Option.isSome(address)
          ? address.value.entryPath
          : reader.condition === undefined
            ? undefined
            : reader.lexical;
        return physical === undefined ? [] : [{ ...reader, physical }];
      }),
    ).pipe(Effect.map((groups) => groups.flat()));
    const locations = yield* Effect.forEach(items, (item) =>
      Effect.gen(function* () {
        const address = yield* observed.entry(item.targetFile).pipe(Effect.option);
        const physical = Option.isSome(address) ? address.value.entryPath : item.targetFile;
        const claimants = readers.filter((reader) => reader.physical === physical);
        const potentialReaders = [...new Set(claimants.map((reader) => reader.agentId))].sort();
        const configuredConsumers = [
          ...new Set([
            ...(args.configuredAgentIds.includes(item.agentId) ? [item.agentId] : []),
            ...claimants
              .filter(
                (reader) =>
                  reader.condition === undefined &&
                  args.configuredAgentIds.includes(reader.agentId),
              )
              .map((reader) => reader.agentId),
          ]),
        ].sort();
        const ownership = Option.isNone(address)
          ? "unverified"
          : address.value.kind === "absent" || item.ownership === "absent"
            ? "absent"
            : item.ownership === "unowned"
              ? "unowned"
              : "owned";
        return {
          scope: args.scope,
          address: { kind: item.mechanism === "native" ? "file" : "entry", path: physical },
          aliases: [
            ...new Set([item.targetFile, ...claimants.map((reader) => reader.lexical)]),
          ].sort(),
          configuredConsumers,
          potentialReaders,
          policyReasons: ["instruction-propagation"],
          ownership,
          ...(ownership === "owned"
            ? {
                proof:
                  item.mechanism === "native"
                    ? "canonical-source-coincidence"
                    : item.observedForm === "symlink" || item.observedForm === "broken-link"
                      ? "exact-canonical-source-link"
                      : "exact-instruction-copy-banner",
              }
            : {}),
          ...(item.mechanism === "symlink"
            ? { mechanism: "symlink" as const }
            : item.mechanism === "copy"
              ? { mechanism: "generated-file" as const }
              : {}),
          state:
            ownership === "unverified"
              ? "unverified"
              : ownership === "absent"
                ? "absent"
                : item.health === "ok"
                  ? "unchanged"
                  : "retained",
          availability: [...new Set([...configuredConsumers, ...potentialReaders])].map(
            (agentId) => ({
              agentId,
              state: "unverified" as const,
              reason: claimants.some(
                (reader) => reader.agentId === agentId && reader.condition !== undefined,
              )
                ? `Native reader applicability is unverified: ${claimants
                    .filter(
                      (reader) => reader.agentId === agentId && reader.condition !== undefined,
                    )
                    .map((reader) => reader.condition)
                    .join("; ")}`
                : "Native instruction content was observed; running-agent path selection and precedence are not observable.",
            }),
          ),
          ...(item.health === "ok" ? {} : { reason: item.details }),
        } satisfies NativeLocationOutcome;
      }),
    );
    const conditionalLocations = yield* Effect.forEach(
      readers.filter((reader) => reader.condition !== undefined),
      (reader) =>
        Effect.gen(function* () {
          const address = yield* observed.entry(reader.lexical).pipe(Effect.result);
          const ownership =
            address._tag === "Failure"
              ? ("unverified" as const)
              : address.success.kind === "absent"
                ? ("absent" as const)
                : ("unowned" as const);
          return {
            scope: args.scope,
            address: { kind: "entry", path: reader.physical },
            aliases: [reader.lexical],
            configuredConsumers: [],
            potentialReaders: [reader.agentId],
            policyReasons: ["instruction-propagation"],
            ownership,
            state: ownership === "absent" ? "absent" : "unverified",
            availability: [
              {
                agentId: reader.agentId,
                state: "unverified",
                reason: `Native reader applicability is unverified: ${reader.condition}`,
              },
            ],
          } satisfies NativeLocationOutcome;
        }),
    );
    return combineNativeLocationOutcomes([...locations, ...conditionalLocations]);
  });

export const instructionChangeLocations = (args: {
  readonly snapshot: { readonly nativeLocations: ReadonlyArray<NativeLocationOutcome> };
  readonly before?: { readonly nativeLocations: ReadonlyArray<NativeLocationOutcome> };
  readonly written: ReadonlyArray<string>;
  readonly removed: ReadonlyArray<string>;
}): ReadonlyArray<NativeLocationOutcome> => {
  const touches = (paths: ReadonlyArray<string>, location: NativeLocationOutcome) =>
    paths.includes(location.address.path) ||
    location.aliases.some((alias) => paths.includes(alias));
  const observed = args.snapshot.nativeLocations.map((location): NativeLocationOutcome => {
    if (!touches(args.written, location)) return location;
    const before = args.before?.nativeLocations.find(
      (prior) =>
        prior.address.kind === location.address.kind &&
        prior.address.path === location.address.path,
    );
    return { ...location, state: before?.ownership === "absent" ? "created" : "updated" };
  });
  const removed = (args.before ?? args.snapshot).nativeLocations
    .filter((location) => touches(args.removed, location))
    .map((location): NativeLocationOutcome => {
      const { proof: _proof, ...facts } = location;
      return { ...facts, ownership: "absent", state: "removed" };
    });
  return combineNativeLocationOutcomes([...observed, ...removed]);
};
