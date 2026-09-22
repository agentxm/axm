import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { gitHostedSkillArtifactSource } from "./artifact.js";

export interface SkillInstallationInspection {
  readonly installed: boolean;
  readonly previousVersion: string | undefined;
  readonly sourceHash: string | undefined;
  readonly scope: "project" | "user";
  readonly displayPath: string;
  readonly agents: ReadonlyArray<string>;
  readonly unknownAgents: ReadonlyArray<string>;
  readonly unavailableAgents: ReadonlyArray<string>;
  readonly targets: ReadonlyArray<{
    readonly path: string;
    readonly agentIds?: ReadonlyArray<string>;
    readonly state: "absent" | "current" | "different";
  }>;
}

/** Facts needed by skill installation; storage and native-agent formats stay outside policy. */
export interface SkillInstallationFacts<E, Preparation, Execution> {
  readonly inspect: (
    ref: SkillExtensionRef,
    installedBefore?: boolean,
  ) => Effect.Effect<SkillInstallationInspection, E, Preparation>;
  /** Applicable shared release-age evidence, if the source can supply it. */
  readonly releaseAge: (
    ref: Extract<SkillExtensionRef, { readonly refType: "registry" }>,
  ) => Effect.Effect<
    Option.Option<{ readonly minimumAge: string; readonly mature: boolean }>,
    E,
    Preparation
  >;
  /** Read after the transition has realized the content, never during preview. */
  readonly readContent: (ref: SkillExtensionRef) => Effect.Effect<
    {
      readonly fileCount: number;
      readonly sourceHash: string;
    },
    E,
    Execution
  >;
}

/** Install and update share skill policy, including deferred artifact evidence. */
export const prepareSkillInstallation = <E, Preparation, Execution>(
  facts: SkillInstallationFacts<E, Preparation, Execution>,
  input: {
    readonly ref: SkillExtensionRef;
    readonly operation: "install" | "update";
    readonly installedBefore?: boolean;
  },
) =>
  Effect.gen(function* () {
    const ref = input.ref;
    const before = yield* facts.inspect(ref, input.installedBefore);
    const targets = before.targets.map(
      ({ state, ...target }) =>
        ({
          ...target,
          change: state === "absent" ? "created" : state === "current" ? "unchanged" : "updated",
        }) as const,
    );
    const warnings: Array<string> = [];
    if (input.operation === "install" && !before.installed && ref.refType === "registry") {
      const age = yield* facts.releaseAge(ref);
      if (Option.isSome(age) && !age.value.mature) {
        warnings.push(
          `${ref.owner}/skills/${ref.name}@${ref.version} was published less than ${age.value.minimumAge} ago — installing it because you requested this version explicitly`,
        );
      }
    }
    const agentWarnings = [
      ...(before.unknownAgents.length === 0
        ? []
        : [`Skipping unknown configured agents: ${before.unknownAgents.join(", ")}`]),
      ...(before.unavailableAgents.length === 0
        ? []
        : [`Skipping non-installable configured agents: ${before.unavailableAgents.join(", ")}`]),
    ];
    if (agentWarnings.length > 0) warnings.push(agentWarnings.join("; "));

    const version = ref.refType === "registry" ? ref.version : undefined;
    return {
      installedBefore: before.installed,
      warnings,
      buildArtifact: ({ installedBefore }: { readonly installedBefore: boolean }) =>
        Effect.gen(function* () {
          const content = yield* facts.readContent(ref);
          const unchanged =
            before.previousVersion === version && before.sourceHash === content.sourceHash;
          const fallbackChange = !installedBefore ? "created" : unchanged ? "unchanged" : "updated";
          const change =
            targets.length === 0
              ? fallbackChange
              : targets.some((target) => target.change === "created")
                ? "created"
                : targets.some((target) => target.change === "updated")
                  ? "updated"
                  : fallbackChange === "updated"
                    ? "updated"
                    : "unchanged";
          const source = gitHostedSkillArtifactSource(ref);
          return {
            path: before.displayPath.length === 0 ? "." : before.displayPath,
            scope: before.scope,
            agents: before.agents,
            ...(version === undefined ? {} : { version }),
            change,
            ...(before.previousVersion !== undefined && before.previousVersion !== version
              ? { previousVersion: before.previousVersion }
              : {}),
            fileCount: content.fileCount,
            ...(targets.length === 0 ? {} : { targets }),
            ...(source === undefined ? {} : { source }),
          } as const;
        }),
    };
  });
