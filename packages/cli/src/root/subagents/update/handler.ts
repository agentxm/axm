import type { SubagentExtensionRef } from "@agentxm/client-core/unstable/subagents";
import { SubagentManager } from "@agentxm/client-core/unstable/subagents";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { expandGlobs } from "@agentxm/client-core/unstable/utils";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";

import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { Handle } from "@agentxm/client-core/unstable/extensions";
import { parseRegistrySourcePatternParts } from "@agentxm/client-core/unstable/extensions";
import {
  resolveInstalledIdentifierNameOrInput,
  resolveSource,
} from "@agentxm/client-core/unstable/source-resolution";
import { buildInstallOperation } from "@agentxm/client-core/unstable/extensions";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { emitNoOpResult, emitPlanResolutionResult } from "../../../json-output.js";
import { buildUpdatePlan, type UpdateOperation, type MakeRunClosure } from "./plan.js";

export interface UpdateHandlerArgs {
  readonly source: Option.Option<string>;
  readonly agents: readonly string[];
  readonly subagents: readonly string[];
  readonly force: boolean;
  readonly yes: boolean;
  readonly preview: boolean;
}

const toRegistrySubagentPattern = (source: string) => {
  const parsed = parseRegistrySourcePatternParts(source);
  if (parsed === undefined) return Option.none();
  if (parsed.type !== undefined && parsed.type !== "subagents") {
    return Option.none();
  }
  return Option.some(parsed);
};

export const handleUpdate = Effect.fn("SubagentsUpdate.handle")(function* (
  args: UpdateHandlerArgs,
) {
  const ws = yield* WorkspaceMutations;
  const sources = yield* SourceHostProviders;
  const renderer = yield* CliRenderer;

  yield* renderer.info(`axm subagents update (${ws.scope})`);

  // Step 1: Load configured subagents and filter to enabled
  const allSubagents = yield* ws.records.getConfiguredSubagents();
  const lockedSubagents = yield* ws.getLockedSubagents();

  const subagentEntries = yield* Effect.forEach(Object.entries(allSubagents), ([name, entry]) =>
    Effect.gen(function* () {
      if (!entry.enabled) {
        yield* renderer.info(`Skipping ${name} (disabled)`);
        return Option.none<readonly [string, string]>();
      }
      return Option.some([name, entry.source] as const);
    }),
  ).pipe(Effect.map(Array.getSomes));

  if (subagentEntries.length === 0) {
    if (
      yield* emitNoOpResult("subagents.update", {
        planName: "Update subagent(s)",
        planDescription: "Update installed subagents",
        message: "No subagents installed. Nothing to update.",
      })
    ) {
      return;
    }

    yield* renderer.info("No subagents installed. Nothing to update.");
    return;
  }

  // Step 2: Filter by source argument if provided
  const sourceValue = Option.getOrUndefined(args.source);
  const sourceFilteredEntries =
    sourceValue !== undefined
      ? yield* Effect.gen(function* () {
          const sourceArg = yield* resolveSource(sourceValue).pipe(
            Effect.mapError((error) =>
              makeAppError({
                code: "validation",
                message: `Invalid source: ${error.message}`,
                cause: error,
              }),
            ),
          );
          const sourceArgOrigin = sources.origin(sourceArg);
          return yield* Effect.forEach(
            subagentEntries,
            ([name, sourceStr]) =>
              resolveSource(sourceStr).pipe(
                Effect.map((resolved) =>
                  sources.origin(resolved) === sourceArgOrigin
                    ? Option.some<readonly [string, string]>([name, sourceStr])
                    : Option.none<[string, string]>(),
                ),
                Effect.catch(() => Effect.succeed(Option.none<[string, string]>())),
              ),
            { concurrency: "unbounded" },
          ).pipe(Effect.map(Array.getSomes));
        })
      : subagentEntries;

  // Step 3: Filter by --subagent glob patterns
  const subagentFilters = yield* Effect.forEach(args.subagents, (subagent) =>
    subagent.includes("*")
      ? Effect.succeed(subagent)
      : resolveInstalledIdentifierNameOrInput({
          input: subagent,
          resourceType: "subagent",
        }),
  );
  const filteredEntries = (() => {
    if (args.subagents.length === 0) return sourceFilteredEntries;
    const allNames = sourceFilteredEntries.map(([name]) => name);
    const matchedNames = expandGlobs(subagentFilters, allNames);
    const matchedSet = new Set(matchedNames);
    return sourceFilteredEntries.filter(([name]) => matchedSet.has(name));
  })();
  if (args.subagents.length > 0) {
    if (filteredEntries.length === 0) {
      if (
        yield* emitNoOpResult("subagents.update", {
          planName: "Update subagent(s)",
          planDescription: "Update installed subagents",
          message: "No installed subagents match the --subagent filter. Nothing to update.",
        })
      ) {
        return;
      }

      yield* renderer.warn(
        "No installed subagents match the --subagent filter. Nothing to update.",
      );
      return;
    }
  }

  // Step 4: Re-resolve each source and discover subagents
  const findSubagentRefs = (
    source: SubagentExtensionRef["source"],
    options: {
      readonly subagentNames: ReadonlyArray<string>;
      readonly owner: Option.Option<Handle>;
      readonly versionRange: Option.Option<string>;
    },
  ) =>
    sources
      .find(source, {
        names: options.subagentNames,
        type: "subagent",
        owner: options.owner,
        versionRange: options.versionRange,
      })
      .pipe(
        Effect.map((refs) =>
          Array.filter(refs, (ref): ref is SubagentExtensionRef => ref.type === "subagent"),
        ),
      );

  type ResolveResult = {
    readonly type: "match";
    readonly ref: SubagentExtensionRef;
  };

  const results = yield* renderer.withSpinner(
    "Resolving sources...",
    () =>
      Effect.forEach(
        filteredEntries,
        ([name, sourceStr]) =>
          Effect.gen(function* () {
            const source = yield* resolveSource(sourceStr);
            const registryPattern = toRegistrySubagentPattern(sourceStr);

            const requestedOwner = Option.match(registryPattern, {
              onNone: () => Option.none<Handle>(),
              onSome: (pattern) => Option.some(pattern.owner),
            });

            const namedRefs = yield* findSubagentRefs(source, {
              subagentNames: [name],
              owner: requestedOwner,
              versionRange: Option.none(),
            });
            const subagentRef = namedRefs.find((r) => r.subagent.name === name);

            if (subagentRef) {
              return Option.some<ResolveResult>({
                type: "match",
                ref: subagentRef,
              });
            }

            yield* renderer.warn(
              `Subagent "${name}" not found in source ${sources.origin(source)}`,
            );
            return Option.none<ResolveResult>();
          }).pipe(
            Effect.catch((error) => {
              return renderer
                .warn(`Failed to resolve "${name}": ${String(error)}`)
                .pipe(Effect.map(() => Option.none<ResolveResult>()));
            }),
          ),
        { concurrency: "unbounded" },
      ),
    { successMessage: "Sources resolved" },
  );

  // Step 5: Collect successful resolutions
  const resolved = Array.getSomes(results);
  if (resolved.length === 0) {
    return yield* makeAppError({
      code: "network",
      message: "All source re-resolutions failed. Nothing to update.",
      breadcrumbs: [{ description: "Verify the original source paths are still accessible." }],
    });
  }

  // Step 6: Capture services for run closures
  const subagentMgr = yield* SubagentManager;

  const makeRunClosure: MakeRunClosure = (op) => {
    const step = buildInstallOperation(subagentMgr, {
      ref: op.ref,
      versionRange: Option.none(),
    });
    if (step.readiness === "error") {
      return Effect.fail(
        makeAppError({
          code: "conflict",
          message: step.errorMessage,
        }),
      );
    }
    return step.run;
  };

  // Step 7: Build operations
  const ops: ReadonlyArray<UpdateOperation> = resolved.map((item) => ({
    ref: item.ref,
    force: args.force,
  }));

  // Step 8: Build plan
  const plan = buildUpdatePlan(
    ops,
    { lockfileVersion: 1, subagents: lockedSubagents },
    "Update subagent(s)",
    Option.some("Update installed subagents"),
    makeRunClosure,
  );

  // Step 9: Resolve plan
  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("subagents.update", resolution);

  yield* renderer.success("Done");
});
