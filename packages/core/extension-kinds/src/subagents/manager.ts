/**
 * Subagent extension manager service.
 *
 * Implements Subagent materialization with canonical source
 * materialization, per-agent rendering via CodingAgent.addSubagent(),
 * and source-hash-based skip logic.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  combineNativeLocationOutcomes,
  nativeAuthorityRoots,
  assertNativeMutationWithinRoots,
  assertNativeMutationWithin,
  resolveNativeReferent,
  captureCopiedDirectory,
  readCopiedDirectory,
  retireCopiedDirectory,
  resolveNativeEntry,
} from "@agentxm/workspace-kernel/locations";
import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";
import { isConfigurableAgentId } from "@agentxm/extension-model/unstable/agent-capabilities/identity";
import * as FileSystem from "effect/FileSystem";
import { fromFileLocation } from "@agentxm/host-primitives";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import {
  LockfileReader,
  DesiredStateReader,
  SettingsReader,
  WorkspaceLocation,
  WorkspaceRecords,
  type SubagentPathSource,
  computeSubagentPathsForLayout,
  subagentContentFilename,
  subagentContentPath,
  sanitizeName,
  computeMaterializedTreeIntegrity,
  computePackageContentHash,
  computeSourceHash,
  RenderedFilePathSchema,
  acceptedCanonicalObservation,
  removableAcceptedCanonicalPath,
} from "@agentxm/workspace-kernel/workspace-state";

import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import {
  type ManagerRequirements,
  type SubagentMaterializationFacts,
  type ExtensionManagerFailure,
  acceptedResolutionFor,
  SubagentManager,
  type SubagentManagerService,
  acquireCanonicalForRef,
  verifyWorkspaceRefLocation,
  makeBaseManagerMembers,
  listMaterializableFromDisk,
} from "@agentxm/workspace-kernel/materialization";
import { SubagentContentUnreadable, SubagentDefinitionInvalid } from "./errors.js";
import {
  CodingAgentRepository,
  captureAgentOutputAuthority,
  managedSubagentRenderInput,
  renderManagedSubagentOutputs,
  managedFileFormatForPath,
  managedFileMarker,
  projectionGeneration,
  observeAgentOutputs,
  applyProjectionPlansWithResults,
  nativeArtifactLocationOutcomes,
  retiredNativeArtifactLocationOutcomes,
  planSingletonProjection,
  managedSubagentFile,
  insertManagedFileBanner,
  type ManagedFileProvenance,
} from "@agentxm/workspace-kernel/projection";
import {
  NativeWriteAuthority,
  type SubagentSyncOutcome,
  SubagentIoFailed,
  warnOnOrphanOverrides,
  removeSubagentFiles,
} from "@agentxm/workspace-kernel/agent-adapters";
import { makeWorkspaceRelativeSourcePath } from "@agentxm/extension-model/unstable/path-types";
import { parseSubagentMd } from "@agentxm/extension-content";
import {
  MANIFEST_FILENAME,
  SubagentManifestSchema,
} from "@agentxm/extension-model/unstable/subagents/manifest-schema";
import {
  protectWorkspacePath,
  recordFootprint,
  retireWorkspacePath,
} from "@agentxm/workspace-kernel/settlement";
import {
  copyExtensionDirectory,
  acquiredDirectoryForRef,
  configuredSubagentsToDiskRefs,
  retireCanonicalDirectory,
} from "@agentxm/workspace-kernel/acquisition";

const managedNativeShape = (agentId: string): boolean =>
  isConfigurableAgentId(agentId) &&
  AGENT_DESCRIPTORS[agentId].subagents?.writerSupported === true &&
  !AGENT_DESCRIPTORS[agentId].subagents?.locations.some((location) => location.shape === "file") &&
  agentId !== "kiro-cli";

const decodeSubagentManifest = Schema.decodeUnknownSync(SubagentManifestSchema);
const decodeRenderedFilePath = Schema.decodeUnknownSync(RenderedFilePathSchema);

/**
 * Strip the meta-only `agentOverrides` key from a frontmatter map so it does
 * not leak into rendered files. The map is treated as opaque otherwise.
 */
const stripAgentOverrides = (
  fm: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
  if (!("agentOverrides" in fm)) return fm;
  const { agentOverrides: _agentOverrides, ...rest } = fm;
  return rest;
};

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

export const SubagentManagerLive = Layer.effect(
  SubagentManager,
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const lockfile = yield* LockfileReader;
    const records = yield* WorkspaceRecords;
    const currentLayout = () => Ref.getUnsafe(location.layout);
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const agentRepo = yield* CodingAgentRepository;
    const baseDir = location.baseDir;
    const nativeRoots = nativeAuthorityRoots(
      path,
      { workspaceRoot: baseDir, scope: location.scope },
      location.nativeDirectoryInputs,
    );
    const roleSkillContent = (args: {
      readonly agentId: string;
      readonly name: string;
      readonly body: string;
      readonly description: string;
      readonly managedFile: ManagedFileProvenance;
    }) =>
      insertManagedFileBanner(
        `---\nname: ${args.name}\ndescription: ${args.description}\n---\n\n# ${args.name} role\n\nAdopt this role for the current task. This is an advisory role-skill fallback for agents without a managed native subagent surface.\n\n${args.body.trim()}\n`,
        {
          ...args.managedFile,
          helpTopic: "subagents",
          format: "markdown",
          generation: projectionGeneration([
            "subagent-role-skill-v1",
            args.managedFile.ext,
            args.managedFile.source.kind,
            args.managedFile.source.path,
            args.name,
            args.description,
            args.body,
          ]),
        },
      );
    const generatedFileCurrent = (args: {
      readonly content: string;
      readonly expected: string;
      readonly outputPath: string;
    }): boolean => {
      const format = managedFileFormatForPath(args.outputPath);
      if (format === undefined) {
        return args.content === args.expected;
      }
      const actualMarker = managedFileMarker(args.content, format);
      const expectedMarker = managedFileMarker(args.expected, format);
      return (
        Option.isSome(actualMarker) &&
        Option.isSome(expectedMarker) &&
        actualMarker.value.ext === expectedMarker.value.ext &&
        actualMarker.value.src === expectedMarker.value.src &&
        actualMarker.value.generation === expectedMarker.value.generation
      );
    };

    const roleSkillDirectory = (args: {
      readonly name: string;
      readonly body: string;
      readonly description: string;
      readonly managedFile: ManagedFileProvenance;
    }) =>
      path.join(
        baseDir,
        ".axm/build/polyfills/subagents",
        sanitizeName(args.name),
        computeSourceHash(
          JSON.stringify({
            name: args.name,
            body: args.body,
            description: args.description,
            ext: args.managedFile.ext,
            source: args.managedFile.source,
          }),
        ),
      );

    // Currency follows the authoritative render inputs. Receipt byte hashes
    // remain the separate, stricter authority for replacement and withdrawal.
    const roleSkillProjectionCurrent = (targetPath: string, source: string, expected: string) =>
      Effect.gen(function* () {
        const receipt = yield* readCopiedDirectory(targetPath);
        const physicalFamily = yield* resolveNativeReferent(path.dirname(source)).pipe(
          Effect.option,
        );
        if (
          Option.isNone(receipt) ||
          Option.isNone(physicalFamily) ||
          path.dirname(receipt.value.source) !== physicalFamily.value
        )
          return false;
        const content = yield* fs
          .readFileString(path.join(targetPath, "SKILL.md"))
          .pipe(Effect.option);
        return Option.exists(content, (value) =>
          generatedFileCurrent({ content: value, expected, outputPath: "SKILL.md" }),
        );
      });

    const materializeRoleSkillFallback = (args: {
      readonly agentId: string;
      readonly name: string;
      readonly sanitized: string;
      readonly body: string;
      readonly description: string;
      readonly targetDir: string;
      readonly managedFile: ManagedFileProvenance;
      readonly previousManagedFiles: ReadonlyArray<{ readonly ext: string; readonly src: string }>;
      readonly nativeInsertionEligible: boolean;
      readonly nativeInsertionEligiblePaths?: ReadonlySet<string>;
    }): Effect.Effect<SubagentSyncOutcome, ExtensionManagerFailure, ManagerRequirements> =>
      Effect.gen(function* () {
        const authority = yield* NativeWriteAuthority;
        const desired = yield* (yield* DesiredStateReader).graph();
        if (
          desired.nodes.some(
            (node) => node.type === "skill" && node.name === args.name && node.enabled,
          )
        )
          return yield* new SubagentDefinitionInvalid({
            detail: `Subagent role skill conflicts with enabled Skill ${args.name}`,
          });
        const polyfillDir = roleSkillDirectory(args);
        const skillMdPath = path.join(polyfillDir, "SKILL.md");
        const skillContent = roleSkillContent(args);
        yield* assertNativeMutationWithin(baseDir, skillMdPath, "content");
        const current = yield* fs.readFileString(skillMdPath).pipe(Effect.option);
        if (
          Option.isSome(current) &&
          !generatedFileCurrent({
            content: current.value,
            expected: skillContent,
            outputPath: "SKILL.md",
          })
        )
          return yield* new SubagentDefinitionInvalid({
            detail: `Preserved modified role Skill source: ${skillMdPath}`,
          });
        if (Option.isNone(current)) {
          const capture = yield* authority.captureInsertion({
            path: skillMdPath,
            unit: JSON.stringify(["subagent-role-source", skillMdPath]),
            beforeRaw: current,
            eligible: args.nativeInsertionEligible,
          });
          const createdDirectories = yield* authority.createParentDirectories(skillMdPath);
          yield* protectWorkspacePath(skillMdPath);
          yield* fs.writeFileString(skillMdPath, skillContent);
          yield* recordFootprint({ path: skillMdPath, change: "created" });
          yield* authority.recordInsertion({ capture, afterRaw: skillContent, createdDirectories });
        }
        const { address } = yield* assertNativeMutationWithinRoots(
          nativeRoots,
          path.join(args.targetDir, args.sanitized),
          "entry",
          baseDir,
        );
        const targetPath = address.entryPath;
        const source = yield* resolveNativeReferent(polyfillDir);
        const wasCurrent = yield* roleSkillProjectionCurrent(targetPath, source, skillContent);
        if (!wasCurrent) {
          if (address.kind !== "absent") {
            const receipt = yield* readCopiedDirectory(targetPath);
            const fallbackRoot = yield* resolveNativeReferent(path.dirname(polyfillDir));
            if (Option.isNone(receipt) || path.dirname(receipt.value.source) !== fallbackRoot) {
              return yield* new SubagentDefinitionInvalid({
                detail: `Preserved unowned or colliding Skill entry: ${targetPath}`,
              });
            }
            const outputPath = path.join(targetPath, "SKILL.md");
            const { address: output } = yield* assertNativeMutationWithinRoots(
              nativeRoots,
              outputPath,
              "content",
              baseDir,
            );
            const raw = yield* fs.readFileString(outputPath).pipe(Effect.option);
            const marker = Option.flatMap(raw, (value) => managedFileMarker(value, "markdown"));
            const proofs = [
              ...args.previousManagedFiles,
              { ext: args.managedFile.ext, src: args.managedFile.source.path },
            ];
            if (
              output.kind !== "absent" &&
              (output.kind !== "file" ||
                Option.isNone(marker) ||
                !proofs.some(
                  (proof) => proof.ext === marker.value.ext && proof.src === marker.value.src,
                ))
            ) {
              return yield* new SubagentDefinitionInvalid({
                detail: `Preserved unowned role Skill file: ${outputPath}`,
              });
            }
            // Forward generation owns this file only. Never recreate a stale
            // copy receipt or touch foreign siblings after an accepted edit.
            yield* protectWorkspacePath(outputPath);
            yield* fs.writeFileString(outputPath, skillContent);
            yield* recordFootprint({
              path: outputPath,
              change: output.kind === "absent" ? "created" : "modified",
            });
          } else
            yield* Effect.scoped(
              Effect.gen(function* () {
                const capture = yield* authority.captureCreatedDirectories({
                  path: targetPath,
                  unit: JSON.stringify(["subagent-role-parent-directories", targetPath]),
                  eligible:
                    args.nativeInsertionEligible ||
                    args.nativeInsertionEligiblePaths?.has(path.dirname(targetPath)) === true,
                });
                const createdDirectories = yield* authority.createParentDirectories(targetPath);
                const temporary = yield* fs.makeTempDirectoryScoped({
                  directory: path.dirname(targetPath),
                  prefix: ".axm-role-skill-",
                });
                const staged = path.join(temporary, "entry");
                yield* fs.makeDirectory(staged);
                yield* copyExtensionDirectory(source, staged, { forAgentArtifact: true });
                if (Option.isNone(yield* captureCopiedDirectory(staged, source)))
                  return yield* new SubagentDefinitionInvalid({
                    detail: `Cannot establish role-skill copy ownership: ${targetPath}`,
                  });
                if ((yield* resolveNativeEntry(targetPath)).kind !== "absent")
                  return yield* new SubagentDefinitionInvalid({
                    detail: `Preserved new Skill entry at Subagent role-skill target: ${targetPath}`,
                  });
                yield* protectWorkspacePath(targetPath);
                yield* fs.rename(staged, targetPath);
                yield* recordFootprint({ path: targetPath, change: "created" });
                yield* authority.recordCreatedDirectories({ capture, createdDirectories });
              }),
            );
        }
        yield* Effect.logWarning(
          `Degraded subagent ${args.name} to a role skill for ${args.agentId}`,
        );
        return {
          _tag: "success",
          renderedFilePaths: [targetPath],
          nativeTargets: [
            {
              path: targetPath,
              kind: "skill",
              change: wasCurrent ? "unchanged" : address.kind === "absent" ? "created" : "updated",
            },
          ],
          warnings: [`Degraded subagent ${args.name} to a role skill for ${args.agentId}`],
        } satisfies SubagentSyncOutcome;
      }).pipe(
        Effect.mapError((cause) =>
          cause._tag === "WorkspaceSnapshotError"
            ? cause
            : new SubagentIoFailed({
                detail: `Failed to materialize subagent fallback for ${args.agentId}`,
                cause,
              }),
        ),
      );

    // Compute canonical paths for a subagent ref
    const getCanonicalPaths = (ref: SubagentExtensionRef) => {
      const sanitized = sanitizeName(ref.subagent.name);
      const source: SubagentPathSource = ref;
      const paths = computeSubagentPathsForLayout(path.join, currentLayout(), source, sanitized);
      return { sanitized, paths };
    };

    // Read and parse subagent content from canonical source
    const readSubagentContent = (subagentSrcPath: string, name: string) =>
      Effect.gen(function* () {
        const expectedFilename = subagentContentFilename(name);
        const contentPath = subagentContentPath(path.join, subagentSrcPath, name);
        const rawContent = yield* fs.readFileString(contentPath).pipe(
          Effect.mapError(
            (cause) =>
              new SubagentContentUnreadable({
                expectedFilename,
                subagentSrcPath,
                contentPath,
                cause,
              }),
          ),
        );
        const parsed = yield* parseSubagentMd(rawContent, name);
        return { rawContent, parsed };
      });

    // Materialize canonical source for any ref type
    const materializeCanonical = (
      ref: SubagentExtensionRef,
      sanitized: string,
      canonicalPath: string,
      subagentSrcPath: string,
      force = false,
      nativeInsertionEligible = false,
    ) =>
      Effect.gen(function* () {
        const configuredAgents = yield* agentRepo
          .getConfiguredAgents()
          .pipe(Effect.provideService(SettingsReader, settings));
        const previous =
          (yield* captureAgentOutputAuthority()).expectedSubagentFiles[ref.subagent.name] ?? [];
        const skillCollision = (yield* (yield* DesiredStateReader).graph()).nodes.some(
          (node) => node.type === "skill" && node.name === ref.subagent.name && node.enabled,
        );
        const sourcePath = path.relative(
          baseDir,
          subagentContentPath(path.join, subagentSrcPath, ref.subagent.name),
        );
        const managedFile = managedSubagentFile(ref, sourcePath);
        const proofs = [...previous, { ext: managedFile.ext, src: managedFile.source.path }];
        const preflight = (packageRoot: string) =>
          Effect.gen(function* () {
            const { parsed } = yield* readSubagentContent(
              path.join(packageRoot, "src"),
              ref.subagent.name,
            );
            const manifest = yield* fs
              .readFileString(path.join(packageRoot, MANIFEST_FILENAME))
              .pipe(Effect.option);
            const fallback =
              ref.fallback ??
              (Option.isNone(manifest)
                ? undefined
                : yield* Effect.try({
                    try: () => decodeSubagentManifest(JSON.parse(manifest.value)).fallback,
                    catch: (cause) =>
                      new SubagentDefinitionInvalid({
                        detail: `Invalid ${MANIFEST_FILENAME}`,
                        cause,
                      }),
                  }));
            const frontmatter = stripAgentOverrides(
              Option.getOrElse(parsed.frontmatter, () => ({})),
            );
            const overrides = Option.getOrUndefined(parsed.agentOverrides);
            const claims = new Map<string, string>();
            for (const agent of configuredAgents) {
              const native = yield* agent.resolveEffectiveSubagentsDir({
                workspaceRoot: baseDir,
                scope: location.scope,
              });
              if (native._tag === "disabled") continue;
              if (native._tag === "misconfigured")
                return yield* new SubagentDefinitionInvalid({ detail: native.reason });
              if (native._tag === "supported" && managedNativeShape(agent.id)) {
                const rendered = renderManagedSubagentOutputs({
                  managedFile,
                  input: {
                    agentId: agent.id,
                    name: ref.subagent.name,
                    body: parsed.body,
                    frontmatter,
                    agentOverrides: overrides?.[agent.id],
                  },
                });
                if (rendered?._tag === "Skipped") continue;
                if (rendered?._tag === "Rendered") {
                  for (const output of rendered.outputs) {
                    const { address } = yield* assertNativeMutationWithinRoots(
                      nativeRoots,
                      path.join(native.dir, output.path),
                      "content",
                      baseDir,
                    );
                    const target = address.referentPath ?? address.entryPath;
                    const priorClaim = claims.get(target);
                    if (priorClaim !== undefined && priorClaim !== output.content)
                      return yield* new SubagentDefinitionInvalid({
                        detail: `Configured consumers require incompatible Subagent bytes at ${target}`,
                      });
                    claims.set(target, output.content);
                    if (address.kind === "absent") continue;
                    const content = yield* fs.readFileString(target).pipe(Effect.option);
                    const format = managedFileFormatForPath(output.path);
                    const marker =
                      Option.isNone(content) || format === undefined
                        ? Option.none()
                        : managedFileMarker(content.value, format);
                    if (
                      Option.isNone(marker) ||
                      !proofs.some(
                        (proof) => proof.ext === marker.value.ext && proof.src === marker.value.src,
                      )
                    )
                      return yield* new SubagentDefinitionInvalid({
                        detail: `Preserved unowned Subagent file: ${target}`,
                      });
                  }
                  continue;
                }
              }
              if (fallback === "none")
                return yield* new SubagentDefinitionInvalid({
                  detail: `Subagent ${ref.subagent.name} requires native subagent support for ${agent.id} because fallback is none`,
                });
              const skills = yield* agent.resolveEffectiveSkillsDir({
                workspaceRoot: baseDir,
                scope: location.scope,
              });
              if (skills._tag === "misconfigured")
                return yield* new SubagentDefinitionInvalid({ detail: skills.reason });
              if (skills._tag !== "supported") continue;
              if (skillCollision)
                return yield* new SubagentDefinitionInvalid({
                  detail: `Subagent role skill conflicts with enabled Skill ${ref.subagent.name}`,
                });
              const { address } = yield* assertNativeMutationWithinRoots(
                nativeRoots,
                path.join(skills.dir, sanitized),
                "entry",
                baseDir,
              );
              if (address.kind === "absent") continue;
              const receipt = yield* readCopiedDirectory(address.entryPath);
              const content = yield* fs
                .readFileString(path.join(address.entryPath, "SKILL.md"))
                .pipe(Effect.option);
              const marker = Option.flatMap(content, (raw) => managedFileMarker(raw, "markdown"));
              const root = yield* resolveNativeReferent(
                path.join(baseDir, ".axm/build/polyfills/subagents", sanitized),
              );
              const { address: output } = yield* assertNativeMutationWithinRoots(
                nativeRoots,
                path.join(address.entryPath, "SKILL.md"),
                "content",
                baseDir,
              );
              if (
                Option.isNone(receipt) ||
                path.dirname(receipt.value.source) !== root ||
                (output.kind !== "absent" &&
                  (output.kind !== "file" ||
                    Option.isNone(marker) ||
                    !proofs.some(
                      (proof) => proof.ext === marker.value.ext && proof.src === marker.value.src,
                    )))
              )
                return yield* new SubagentDefinitionInvalid({
                  detail: `Preserved unowned or colliding Skill entry: ${address.entryPath}`,
                });
            }
          }).pipe(
            Effect.mapError((cause) =>
              cause instanceof SubagentDefinitionInvalid
                ? cause
                : new SubagentDefinitionInvalid({
                    detail: "Subagent native destination preflight failed",
                    cause,
                  }),
            ),
          );
        if (ref.refType === "workspace") {
          yield* verifyWorkspaceRefLocation({
            ref,
            scope: location.scope,
            canonicalPath,
            invalid: (detail) => new SubagentDefinitionInvalid({ detail }),
          });
          const exists = yield* fs.exists(subagentSrcPath).pipe(
            Effect.mapError(
              (cause) =>
                new SubagentIoFailed({
                  detail: `Failed to inspect workspace subagent source: ${subagentSrcPath}`,
                  cause,
                }),
            ),
          );
          if (!exists) {
            return yield* new SubagentDefinitionInvalid({
              detail: `Workspace subagent source is missing: ${subagentSrcPath}`,
            });
          }
          yield* preflight(canonicalPath);
          return yield* computeMaterializedTreeIntegrity(canonicalPath);
        }
        if (ref.refType !== "registry") {
          yield* preflight(yield* acquiredDirectoryForRef(ref, fromFileLocation(ref.location)));
        }
        const materialized = yield* acquireCanonicalForRef({
          ref,
          type: "subagent",
          nativeInsertionEligible,
          baseDir,
          canonicalPath,
          accepted: yield* lockfile.entry("subagent", ref.subagent.name),
          force,
          validate: preflight,
          copyFailure: {
            code: "internal",
            detail: (target) => `Failed to copy subagent files to ${target}`,
          },
          external: {
            sourcePath: (packageRoot) =>
              currentLayout().scope === "project" ? packageRoot : path.join(packageRoot, "src"),
            targetPath: currentLayout().scope === "project" ? canonicalPath : subagentSrcPath,
          },
        });
        if (materialized.reused) yield* preflight(canonicalPath);
        return materialized.treeIntegrity;
      });

    const materializeInstall: SubagentManagerService["materializeInstall"] = Effect.fn(
      "SubagentManager.materializeInstall",
    )(function* ({ ref, force, nativeInsertionEligible, nativeInsertionEligiblePaths }) {
      const { sanitized, paths } = getCanonicalPaths(ref);
      const { canonicalPath, subagentSrcPath } = paths;
      const previousManagedFiles =
        (yield* captureAgentOutputAuthority()).expectedSubagentFiles[ref.subagent.name] ?? [];

      // --- Materialize canonical source ---
      const treeIntegrity = yield* materializeCanonical(
        ref,
        sanitized,
        canonicalPath,
        subagentSrcPath,
        force === true,
        nativeInsertionEligible === true,
      );
      const manifestRaw = yield* fs
        .readFileString(path.join(canonicalPath, MANIFEST_FILENAME))
        .pipe(Effect.option);
      const manifestFallback = Option.isNone(manifestRaw)
        ? undefined
        : yield* Effect.try({
            try: () => decodeSubagentManifest(JSON.parse(manifestRaw.value)).fallback,
            catch: (cause) =>
              new SubagentDefinitionInvalid({
                detail: `Failed to parse ${MANIFEST_FILENAME}`,
                cause,
              }),
          });

      // --- Read content file ---
      const contentPath = subagentContentPath(path.join, subagentSrcPath, ref.subagent.name);
      const sourcePath = makeWorkspaceRelativeSourcePath(path, baseDir, contentPath);
      if (Option.isNone(sourcePath)) {
        return yield* new SubagentIoFailed({
          detail: `Subagent source path escapes workspace root: ${contentPath}`,
        });
      }
      const managedFile = managedSubagentFile(ref, sourcePath.value);
      const { parsed } = yield* readSubagentContent(subagentSrcPath, ref.subagent.name);

      // --- Resolve configured agents ---
      const configuredAgents = yield* agentRepo
        .getConfiguredAgents()
        .pipe(Effect.provideService(SettingsReader, settings));

      // --- Extract frontmatter fields ---
      const frontmatter: Readonly<Record<string, unknown>> = Option.getOrElse(
        parsed.frontmatter,
        () => ({}),
      );
      const agentOverrides = Option.getOrUndefined(parsed.agentOverrides);
      const renderFrontmatter = stripAgentOverrides(frontmatter);

      // --- Warn on overrides for agents not configured for this workspace ---
      yield* warnOnOrphanOverrides(
        `Subagent "${ref.subagent.name}"`,
        agentOverrides,
        configuredAgents.map((a) => a.id),
      );

      // --- Render to all agents concurrently ---
      const renderResults = yield* applyProjectionPlansWithResults(
        configuredAgents.map((agent) =>
          planSingletonProjection({
            unitId: "subagent:native-profile",
            // Some adapters co-locate multiple agent profiles. A shared key
            // deliberately serializes until the adapter exposes its exact file.
            targetFile: `subagent:${ref.subagent.name}:configured-agents`,
            contributor: ref,
            adapter: {
              observe: () =>
                Effect.succeed({
                  unitId: "subagent:native-profile",
                  path: `${agent.id}:${ref.subagent.name}`,
                  present: false,
                  current: false,
                  expectedContributors: [ref.subagent.name],
                  observedContributors: [],
                }),
              apply: () =>
                agent
                  .addSubagent({
                    workspaceRoot: baseDir,
                    scope: location.scope,
                    previousManagedFiles,
                    nativeRoots,
                    nativeInsertionEligible: nativeInsertionEligible === true,
                    ...(nativeInsertionEligiblePaths === undefined
                      ? {}
                      : { nativeInsertionEligiblePaths }),
                    input: managedSubagentRenderInput({
                      managedFile,
                      input: {
                        agentId: agent.id,
                        name: ref.subagent.name,
                        body: parsed.body,
                        frontmatter: renderFrontmatter,
                        agentOverrides: agentOverrides?.[agent.id],
                      },
                    }),
                    force: false,
                  })
                  .pipe(
                    Effect.flatMap(
                      (
                        outcome,
                      ): Effect.Effect<
                        SubagentSyncOutcome,
                        ExtensionManagerFailure,
                        ManagerRequirements
                      > => {
                        if (outcome._tag !== "unsupported") {
                          return Effect.succeed<SubagentSyncOutcome>(outcome);
                        }
                        if ((ref.fallback ?? manifestFallback) === "none") {
                          return new SubagentDefinitionInvalid({
                            detail: `Subagent ${ref.subagent.name} requires native subagent support for ${agent.id} because fallback is none`,
                          });
                        }
                        return agent
                          .resolveEffectiveSkillsDir({
                            workspaceRoot: baseDir,
                            scope: location.scope,
                          })
                          .pipe(
                            Effect.flatMap((skillsOutcome) => {
                              if (skillsOutcome._tag !== "supported") {
                                return Effect.succeed<SubagentSyncOutcome>(outcome);
                              }
                              const description = Option.getOrElse(
                                ref.subagent.description,
                                () => `Adopt the ${ref.subagent.name} role`,
                              );
                              return materializeRoleSkillFallback({
                                agentId: agent.id,
                                name: ref.subagent.name,
                                sanitized,
                                body: parsed.body,
                                description,
                                nativeInsertionEligible: nativeInsertionEligible === true,
                                ...(nativeInsertionEligiblePaths === undefined
                                  ? {}
                                  : { nativeInsertionEligiblePaths }),
                                targetDir: skillsOutcome.dir,
                                managedFile,
                                previousManagedFiles,
                              }).pipe(
                                Effect.mapError(
                                  (cause) =>
                                    new SubagentIoFailed({
                                      detail: `Failed to materialize subagent fallback for ${agent.id}`,
                                      cause,
                                    }),
                                ),
                              );
                            }),
                          );
                      },
                    ),
                    Effect.map((outcome) => ({ agentId: agent.id, outcome })),
                  ),
            },
          }),
        ),
      );
      const conflict = renderResults.find(({ outcome }) => outcome._tag === "conflict");
      if (conflict?.outcome._tag === "conflict")
        return yield* new SubagentDefinitionInvalid({ detail: conflict.outcome.reason });
      yield* Effect.forEach(renderResults, ({ agentId, outcome }) => {
        if (outcome._tag !== "success") return Effect.void;
        return Effect.logDebug(`Rendered ${ref.subagent.name} for ${agentId}`);
      });
      const successfulResults = renderResults.filter(({ outcome }) => outcome._tag === "success");
      const agentIdsByPath = new Map<string, Array<string>>();
      for (const { agentId, outcome } of successfulResults) {
        if (outcome._tag !== "success") continue;
        for (const renderedFilePath of outcome.renderedFilePaths) {
          const relativePath = path.isAbsolute(renderedFilePath)
            ? path.relative(baseDir, renderedFilePath)
            : path.normalize(renderedFilePath);
          const agentIds = agentIdsByPath.get(relativePath) ?? [];
          if (!agentIds.includes(agentId)) agentIds.push(agentId);
          agentIdsByPath.set(relativePath, agentIds);
        }
      }
      return {
        sourceHash: Option.some(yield* computePackageContentHash(canonicalPath)),
        treeIntegrity: Option.fromUndefinedOr(treeIntegrity),
        observation: {
          nativeLocations: yield* nativeArtifactLocationOutcomes({
            workspaceRoot: baseDir,
            scope: location.scope,
            agents: yield* agentRepo.all,
            configuredAgentIds: new Set(configuredAgents.map((agent) => agent.id)),
            sharedSkillPolicy: false,
            targets: successfulResults.flatMap(({ outcome }) =>
              outcome._tag === "success"
                ? (outcome.nativeTargets ?? []).map((target) => ({
                    path: target.path,
                    kind: target.kind,
                    state: target.change,
                  }))
                : [],
            ),
          }).pipe(
            Effect.mapError(
              (cause) =>
                new SubagentIoFailed({ detail: "Cannot observe native Subagent locations", cause }),
            ),
          ),
          agents: successfulResults.map(({ agentId }) => agentId),
          targets: Array.from(agentIdsByPath.entries())
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([targetPath, agentIds]) => ({
              path: targetPath,
              agentIds,
            })),
        },
      } satisfies SubagentMaterializationFacts;
    });

    const makeMaterializeRemoval = (
      retainCanonical: boolean,
    ): SubagentManagerService["materializeUninstall"] =>
      Effect.fn("SubagentManager.materializeRemoval")(function* ({ target }) {
        const sanitized = sanitizeName(target.name);
        const canonical = yield* acceptedCanonicalObservation({
          type: "subagent",
          name: target.name,
        });
        const authority = yield* captureAgentOutputAuthority();
        const expectedManagedFiles = authority.expectedSubagentFiles[target.name] ?? [];
        const agents = yield* agentRepo.all;
        const configuredAgentIds = new Set(yield* settings.configuredAgents);
        const inventory = yield* observeAgentOutputs({
          nativeDirectoryInputs: location.nativeDirectoryInputs,
          workspaceRoot: baseDir,
          scope: location.scope,
          desiredAgentIds: configuredAgentIds,
          expectedNames: {
            skill: new Set<string>(),
            subagent: new Set<string>(),
            hook: new Set<string>(),
            "mcp-server": new Set<string>(),
          },
          ...authority,
          authoredSkills: { layout: currentLayout(), entries: yield* settings.entries("skill") },
        }).pipe(Effect.provideService(CodingAgentRepository, agentRepo));
        const owned = inventory.outputs.filter(
          (output) =>
            output.extensionType === "subagent" &&
            output.entryName === sanitized &&
            output.ownership === "owned",
        );
        const nativeBefore = yield* nativeArtifactLocationOutcomes({
          workspaceRoot: baseDir,
          scope: location.scope,
          agents,
          configuredAgentIds,
          sharedSkillPolicy: false,
          targets: owned.map((output) => ({
            path: output.path,
            kind: output.proof === "copied-directory-receipt" ? "skill" : "subagent",
            state: "unchanged",
          })),
        }).pipe(
          Effect.mapError(
            (cause) =>
              new SubagentIoFailed({
                detail: "Cannot observe native Subagent removal targets",
                cause,
              }),
          ),
        );
        const roleSources = yield* Effect.forEach(
          owned.filter((output) => output.proof === "copied-directory-receipt"),
          (output) =>
            readCopiedDirectory(output.path).pipe(
              Effect.map((receipt) =>
                Option.isSome(receipt)
                  ? { target: output.path, source: receipt.value.source }
                  : undefined,
              ),
              Effect.mapError(
                (cause) =>
                  new SubagentIoFailed({
                    detail: "Cannot observe role Skill source ownership",
                    cause,
                  }),
              ),
            ),
        );
        const removals = yield* Effect.forEach(owned, (output) =>
          Effect.gen(function* () {
            if (output.proof === "copied-directory-receipt") {
              const receipt = yield* readCopiedDirectory(output.path);
              const expectedRoot = yield* resolveNativeReferent(
                path.join(baseDir, ".axm/build/polyfills/subagents", sanitized),
              ).pipe(
                Effect.mapError(
                  (cause) =>
                    new SubagentIoFailed({
                      detail: "Cannot resolve Subagent role Skill source authority",
                      cause,
                    }),
                ),
              );
              const content = yield* fs
                .readFileString(path.join(output.path, "SKILL.md"))
                .pipe(Effect.option);
              const marker = Option.flatMap(content, (raw) => managedFileMarker(raw, "markdown"));
              if (
                Option.isNone(receipt) ||
                !receipt.value.source.startsWith(`${expectedRoot}${path.sep}`) ||
                Option.isNone(marker) ||
                !expectedManagedFiles.some(
                  (expected) =>
                    marker.value.ext === expected.ext && marker.value.src === expected.src,
                )
              )
                return undefined;
              yield* assertNativeMutationWithinRoots(
                nativeRoots,
                output.path,
                "entry",
                baseDir,
              ).pipe(
                Effect.mapError(
                  (cause) =>
                    new SubagentIoFailed({
                      detail: `Unsafe Subagent role Skill retirement: ${output.path}`,
                      cause,
                    }),
                ),
              );
              yield* protectWorkspacePath(output.path);
              const changed = yield* retireCopiedDirectory(output.path, retireWorkspacePath).pipe(
                Effect.mapError(
                  (cause) =>
                    new SubagentIoFailed({
                      detail: `Failed to retire Subagent role skill: ${output.path}`,
                      cause,
                    }),
                ),
              );
              yield* (yield* NativeWriteAuthority).retireCreatedDirectories({
                path: output.path,
                unit: JSON.stringify(["subagent-role-parent-directories", output.path]),
              });
              return changed ? output : undefined;
            }
            for (const expectedManagedFile of expectedManagedFiles) {
              const result = yield* removeSubagentFiles({
                nativeRoots,
                workspaceRoot: baseDir,
                scope: location.scope,
                subagentName: target.name,
                expectedManagedFile,
                renderedFilePaths: [decodeRenderedFilePath(path.relative(baseDir, output.path))],
              });
              if (result._tag === "success" && result.renderedFilePaths.length > 0) return output;
            }
            return undefined;
          }),
        );
        const withdrawnOutputs = removals.filter((output) => output !== undefined);
        const withdrawnPaths = new Set(withdrawnOutputs.map((output) => output.path));
        for (const source of new Set(
          roleSources.flatMap((role) => (role === undefined ? [] : [role.source])),
        )) {
          if (
            roleSources.some((role) => role?.source === source && !withdrawnPaths.has(role.target))
          )
            continue;
          const file = path.join(source, "SKILL.md");
          const raw = yield* fs.readFileString(file).pipe(Effect.option);
          const marker = Option.flatMap(raw, (content) => managedFileMarker(content, "markdown"));
          if (
            Option.isNone(raw) ||
            Option.isNone(marker) ||
            !expectedManagedFiles.some(
              (expected) => marker.value.ext === expected.ext && marker.value.src === expected.src,
            )
          )
            continue;
          yield* (yield* NativeWriteAuthority).retireInsertion({
            path: file,
            unit: JSON.stringify(["subagent-role-source", file]),
            raw: raw.value,
            empty: true,
          });
        }
        const nativeLocations = yield* retiredNativeArtifactLocationOutcomes(nativeBefore).pipe(
          Effect.mapError(
            (cause) =>
              new SubagentIoFailed({
                detail: "Cannot observe retired native Subagent locations",
                cause,
              }),
          ),
        );
        const withdrawn: SubagentMaterializationFacts = {
          sourceHash: Option.none(),
          treeIntegrity: Option.none(),
          observation: {
            nativeLocations,
            agents: [
              ...new Set(withdrawnOutputs.flatMap((output) => output.claimantAgentIds)),
            ].sort(),
            targets: withdrawnOutputs.map((output) => ({
              path: path.relative(baseDir, output.path),
              agentIds: output.claimantAgentIds,
            })),
          },
        };

        // --- Remove canonical source directory ---
        if (!retainCanonical) {
          const packageRoot = removableAcceptedCanonicalPath(canonical);
          if (Option.isSome(packageRoot)) yield* retireCanonicalDirectory(packageRoot.value);
        }
        return withdrawn;
      });
    const materializeUninstall = makeMaterializeRemoval(false);
    const materializeDeactivate = makeMaterializeRemoval(true);

    const projectionObservation = Effect.fn("SubagentManager.projectionObservation")(
      function* (ref: SubagentExtensionRef) {
        const { sanitized, paths } = getCanonicalPaths(ref);
        const manifestRaw = yield* fs
          .readFileString(path.join(paths.canonicalPath, MANIFEST_FILENAME))
          .pipe(Effect.option);
        const manifestFallback = Option.isNone(manifestRaw)
          ? undefined
          : yield* Effect.try({
              try: () => decodeSubagentManifest(JSON.parse(manifestRaw.value)).fallback,
              catch: (cause) =>
                new SubagentDefinitionInvalid({
                  detail: `Failed to parse ${MANIFEST_FILENAME}`,
                  cause,
                }),
            });
        const contentPath = subagentContentPath(
          path.join,
          paths.subagentSrcPath,
          ref.subagent.name,
        );
        const sourcePath = makeWorkspaceRelativeSourcePath(path, baseDir, contentPath);
        if (Option.isNone(sourcePath))
          return { present: false, current: false, nativeLocations: [] };
        const managedFile = managedSubagentFile(ref, sourcePath.value);
        const { parsed } = yield* readSubagentContent(paths.subagentSrcPath, ref.subagent.name);
        const frontmatter: Readonly<Record<string, unknown>> = Option.getOrElse(
          parsed.frontmatter,
          () => ({}),
        );
        const agentOverrides = Option.getOrUndefined(parsed.agentOverrides);
        const renderFrontmatter = stripAgentOverrides(frontmatter);
        const configuredAgents = yield* agentRepo
          .getConfiguredAgents()
          .pipe(Effect.provideService(SettingsReader, settings));

        const current = yield* Effect.forEach(configuredAgents, (agent) =>
          agent
            .resolveEffectiveSubagentsDir({ workspaceRoot: baseDir, scope: location.scope })
            .pipe(
              Effect.flatMap((resolved) => {
                if (resolved._tag === "disabled") {
                  return Effect.succeed({ present: true, current: true, nativeLocations: [] });
                }
                if (resolved._tag === "misconfigured") {
                  return Effect.succeed({ present: false, current: false, nativeLocations: [] });
                }
                if (resolved._tag === "supported" && managedNativeShape(agent.id)) {
                  const rendered = renderManagedSubagentOutputs({
                    managedFile,
                    input: {
                      agentId: agent.id,
                      name: ref.subagent.name,
                      body: parsed.body,
                      frontmatter: renderFrontmatter,
                      agentOverrides: agentOverrides?.[agent.id],
                    },
                  });
                  if (rendered === undefined)
                    return Effect.succeed({ present: false, current: false, nativeLocations: [] });
                  if (rendered._tag === "Skipped") {
                    return Effect.succeed({ present: true, current: true, nativeLocations: [] });
                  }
                  return Effect.forEach(rendered.outputs, (output) =>
                    fs.readFileString(path.resolve(resolved.dir, output.path)).pipe(Effect.option),
                  ).pipe(
                    Effect.flatMap((contents) => {
                      const matches = contents.map((content, index) => {
                        const output = rendered.outputs[index];
                        return (
                          Option.isSome(content) &&
                          output !== undefined &&
                          generatedFileCurrent({
                            content: content.value,
                            expected: output.content,
                            outputPath: output.path,
                          })
                        );
                      });
                      return nativeArtifactLocationOutcomes({
                        workspaceRoot: baseDir,
                        scope: location.scope,
                        agents: configuredAgents,
                        configuredAgentIds: new Set(configuredAgents.map(({ id }) => id)),
                        sharedSkillPolicy: false,
                        targets: rendered.outputs.map((output, index) => ({
                          path: path.resolve(resolved.dir, output.path),
                          kind: "subagent",
                          state:
                            contents[index] === undefined || Option.isNone(contents[index])
                              ? "created"
                              : matches[index] === true
                                ? "unchanged"
                                : "updated",
                        })),
                      }).pipe(
                        Effect.map((nativeLocations) => ({
                          present: contents.every(Option.isSome),
                          current: matches.every(Boolean),
                          nativeLocations,
                        })),
                      );
                    }),
                  );
                }
                if ((ref.fallback ?? manifestFallback) === "none") {
                  return Effect.succeed({ present: false, current: false, nativeLocations: [] });
                }
                return agent
                  .resolveEffectiveSkillsDir({ workspaceRoot: baseDir, scope: location.scope })
                  .pipe(
                    Effect.flatMap((skills) => {
                      if (skills._tag === "disabled" || skills._tag === "unsupported") {
                        return Effect.succeed({
                          present: true,
                          current: true,
                          nativeLocations: [],
                        });
                      }
                      if (skills._tag === "misconfigured" || skills._tag === "unverified") {
                        return Effect.succeed({
                          present: false,
                          current: false,
                          nativeLocations: [],
                        });
                      }
                      const description = Option.getOrElse(
                        ref.subagent.description,
                        () => `Adopt the ${ref.subagent.name} role`,
                      );
                      const expected = roleSkillContent({
                        agentId: agent.id,
                        name: ref.subagent.name,
                        body: parsed.body,
                        description,
                        managedFile,
                      });
                      return Effect.gen(function* () {
                        const fallbackPath = path.join(path.normalize(skills.dir), sanitized);
                        const content = yield* fs
                          .readFileString(path.join(fallbackPath, "SKILL.md"))
                          .pipe(Effect.option);
                        const source = roleSkillDirectory({
                          name: ref.subagent.name,
                          body: parsed.body,
                          description,
                          managedFile,
                        });
                        return {
                          present: Option.isSome(content),
                          current: yield* roleSkillProjectionCurrent(
                            fallbackPath,
                            source,
                            expected,
                          ),
                          nativeLocations: yield* nativeArtifactLocationOutcomes({
                            workspaceRoot: baseDir,
                            scope: location.scope,
                            agents: configuredAgents,
                            configuredAgentIds: new Set(configuredAgents.map(({ id }) => id)),
                            sharedSkillPolicy: false,
                            targets: [
                              {
                                path: fallbackPath,
                                kind: "skill",
                                state: Option.isNone(content)
                                  ? "created"
                                  : content.value === expected
                                    ? "unchanged"
                                    : "updated",
                              },
                            ],
                          }),
                        };
                      });
                    }),
                  );
              }),
            ),
        );
        return {
          nativeLocations: combineNativeLocationOutcomes(
            current.flatMap((observation) => observation.nativeLocations),
          ),
          present: current.every(({ present }) => present),
          current: current.every((observation) => observation.current),
        };
      },
      Effect.mapError((cause) =>
        cause._tag === "NativeLocationError"
          ? new SubagentDefinitionInvalid({
              detail: "Cannot observe planned native Subagent locations",
              cause,
            })
          : cause,
      ),
    );

    return {
      projectionObservation,
      ...makeBaseManagerMembers({
        type: "subagent",
        spanPrefix: "SubagentManager",
        records,
        settings,
        refName: (ref) => ref.subagent.name,
        materializeInstall,
      }),
      materializeInstall,
      acquireCanonical: ({ ref, force, nativeInsertionEligible }) =>
        Effect.gen(function* () {
          const {
            sanitized,
            paths: { canonicalPath, subagentSrcPath },
          } = getCanonicalPaths(ref);
          const treeIntegrity = yield* materializeCanonical(
            ref,
            sanitized,
            canonicalPath,
            subagentSrcPath,
            force === true,
            nativeInsertionEligible === true,
          );
          yield* readSubagentContent(subagentSrcPath, ref.subagent.name);
          return {
            sourceHash: Option.some(yield* computePackageContentHash(canonicalPath)),
            treeIntegrity: Option.fromUndefinedOr(treeIntegrity),
            observation: { agents: [], targets: [] },
          };
        }),
      listMaterializable: () =>
        listMaterializableFromDisk({
          type: "subagent",
          records,
          toDiskRefs: configuredSubagentsToDiskRefs,
          env: { fs, path, baseDir, scope: location.scope, layout: currentLayout() },
        }),
      materializeUninstall,
      materializeDeactivate,

      acceptedResolution: Effect.fn("SubagentManager.acceptedResolution")(function* ({
        ref,
        materialization,
      }: {
        readonly ref: SubagentExtensionRef;
        readonly materialization: Option.Option<SubagentMaterializationFacts>;
      }) {
        const workspaceRelativeLocalSourcePath =
          ref.refType === "local"
            ? makeWorkspaceRelativeSourcePath(
                path,
                baseDir,
                ref.sourcePath ?? fromFileLocation(ref.location),
              )
            : Option.none();
        if (ref.refType === "local" && Option.isNone(workspaceRelativeLocalSourcePath)) {
          return yield* new SubagentDefinitionInvalid({
            detail: `Local subagent source path must stay within the workspace root: ${ref.source.path}`,
          });
        }
        return yield* acceptedResolutionFor({
          ref,
          acquired: Option.map(
            Option.flatMap(materialization, (facts) =>
              Option.all({ sourceHash: facts.sourceHash, treeIntegrity: facts.treeIntegrity }),
            ),
            (identity) => ({ ...identity, workspaceRelativeLocalSourcePath }),
          ),
        });
      }),

      withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
    } satisfies SubagentManagerService;
  }),
);
