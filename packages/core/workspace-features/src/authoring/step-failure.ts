/**
 * The rendering of the extension-authoring failure family — scaffolding,
 * fork and native import, owner policy, and Pack membership edits — and how
 * an authoring closure serializes any failure into the plan-step vocabulary.
 *
 * The authoring family renders here once. Every other family an authoring
 * step can surface renders through the kernel failure rendering, so an
 * authoring step reports the same category, sentence, and recovery a command
 * boundary would print for the same failure.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  type ScaffoldedExtensionUnresolved,
  makeStepFailure,
  type StepFailure,
} from "@agentxm/workspace-kernel/operations";
import type { ExtensionManagerFailure } from "@agentxm/workspace-kernel/materialization";
import type { NativeLocationError } from "@agentxm/workspace-kernel/locations";
import {
  PackGraphInvalid,
  PackManifestUnavailable,
  PackMemberAmbiguous,
  PackMemberNotDeclared,
  PackMemberNotFound,
  PackMemberUnmanaged,
  PackNotAuthored,
  PackNotConfigured,
  PackOwnerUnconfigured,
  PackSelectorAmbiguous,
  PackSelectorNotAPack,
  PackSourceMissing,
} from "./pack-membership/membership-errors.js";
import { kernelFailureDetail, renderKernelFailure } from "@agentxm/workspace-kernel/reconciliation";

import { AuthoringFailed } from "./errors.js";
import {
  AuthoringOwnerMismatch,
  AuthoringOwnerRequired,
  AuthoringScopeUnsupported,
  ScaffoldNameInvalid,
} from "./create/errors.js";
import {
  type AuthoredPackageError,
  CreateDestinationInspectionFailed,
  CreateNameConfigured,
  ForkPackageConflict,
  ForkPackageFailed,
  ForkPackageInvalid,
  NativeImportConflict,
  NativeImportFailed,
  NativeImportInvalid,
  NativeImportUnsupported,
  NativeSubagentRuntimeRequired,
  NativeSubagentImportUnsupported,
} from "./authored-package-errors.js";

/** Every failure the authoring feature and Pack membership edits construct. */
export type AuthoringFamilyFailure =
  | AuthoringFailed
  | CreateNameConfigured
  | CreateDestinationInspectionFailed
  | ForkPackageInvalid
  | ForkPackageConflict
  | ForkPackageFailed
  | NativeImportUnsupported
  | NativeSubagentRuntimeRequired
  | NativeSubagentImportUnsupported
  | NativeImportInvalid
  | NativeImportConflict
  | NativeImportFailed
  | AuthoringOwnerRequired
  | AuthoringOwnerMismatch
  | ScaffoldNameInvalid
  | AuthoringScopeUnsupported
  | PackSelectorNotAPack
  | PackNotConfigured
  | PackSelectorAmbiguous
  | PackSourceMissing
  | PackNotAuthored
  | PackOwnerUnconfigured
  | PackManifestUnavailable
  | PackGraphInvalid
  | PackMemberAmbiguous
  | PackMemberUnmanaged
  | PackMemberNotFound
  | PackMemberNotDeclared;

/**
 * Every class whose instances this feature renders, read when a failure is
 * recognized rather than at module load, so a class is never read before its
 * module has loaded.
 */
const authoringFailureClasses = () =>
  [
    AuthoringFailed,
    CreateNameConfigured,
    CreateDestinationInspectionFailed,
    ForkPackageInvalid,
    ForkPackageConflict,
    ForkPackageFailed,
    NativeImportUnsupported,
    NativeSubagentRuntimeRequired,
    NativeSubagentImportUnsupported,
    NativeImportInvalid,
    NativeImportConflict,
    NativeImportFailed,
    AuthoringOwnerRequired,
    AuthoringOwnerMismatch,
    ScaffoldNameInvalid,
    AuthoringScopeUnsupported,
    PackSelectorNotAPack,
    PackNotConfigured,
    PackSelectorAmbiguous,
    PackSourceMissing,
    PackNotAuthored,
    PackOwnerUnconfigured,
    PackManifestUnavailable,
    PackGraphInvalid,
    PackMemberAmbiguous,
    PackMemberUnmanaged,
    PackMemberNotFound,
    PackMemberNotDeclared,
  ] as const;

// The recognized classes and the rendered family are the same set: a failure
// this feature renders but cannot recognize, or the reverse, is a compile
// error here.
type RecognizedAuthoringFailure = InstanceType<ReturnType<typeof authoringFailureClasses>[number]>;
const _recognizesEveryRenderedFailure = (
  failure: AuthoringFamilyFailure,
): RecognizedAuthoringFailure => failure;
const _rendersEveryRecognizedFailure = (
  failure: RecognizedAuthoringFailure,
): AuthoringFamilyFailure => failure;
void _recognizesEveryRenderedFailure;
void _rendersEveryRecognizedFailure;

/** Whether an untyped failure is one the authoring feature renders. */
export const isAuthoringFamilyFailure = (failure: unknown): failure is AuthoringFamilyFailure =>
  authoringFailureClasses().some((failureClass) => failure instanceof failureClass);

const authoringOwnerRequiredFailure = (error: AuthoringOwnerRequired): StepFailure => {
  const [candidate] = error.candidates;
  return makeStepFailure({
    category: "validation",
    detail: `No owner configured for ${error.subject} creation`,
    suggestions: [
      candidate === undefined
        ? {
            description: `Name the owner to create under; it becomes the workspace owner in \`${error.settingsPath}\`.`,
            cmd: `axm ${error.command} ${error.name} --owner @handle`,
          }
        : {
            description: `Create under ${error.candidates.join(" or ")}, recording it as the workspace owner in \`${error.settingsPath}\`.`,
            cmd: `axm ${error.command} ${error.name} --owner ${candidate}`,
          },
    ],
  });
};

const packManifestUnavailableFailure = (error: PackManifestUnavailable): StepFailure => {
  switch (error.reason) {
    case "unreadable":
      return makeStepFailure({
        category: "not_found",
        detail: `Pack manifest not found at ${error.path}`,
        suggestions: [{ description: "Ensure the pack exists on disk" }],
        cause: error.cause,
      });
    case "unparsable":
      return makeStepFailure({
        category: "validation",
        detail: `Failed to parse pack manifest: ${error.path}`,
        cause: error.cause,
      });
    case "invalid":
      return makeStepFailure({
        category: "validation",
        detail: `Invalid pack manifest: ${error.path}`,
        cause: error.cause,
      });
  }
};

/** Translate one authoring or Pack membership failure. */
const renderAuthoringFailureDetails = (error: AuthoringFamilyFailure): StepFailure => {
  switch (error._tag) {
    case "AuthoringFailed":
      return makeStepFailure({
        category: error.category,
        detail: error.detail,
        recover: error.recover,
        suggestions: error.suggestions,
        cause: error.cause,
      });
    case "CreateNameConfigured":
      return makeStepFailure({
        category: "conflict",
        detail: `${error.subject} '${error.name}' already exists in settings`,
        recover: `Choose a different name or remove the existing ${error.subject.toLowerCase()} first`,
      });
    case "CreateDestinationInspectionFailed":
      return makeStepFailure({
        category: "internal",
        detail: `Failed to inspect create destination: ${error.path}`,
        cause: error.cause,
      });
    case "ForkPackageInvalid":
    case "NativeImportInvalid":
      return makeStepFailure({ category: "validation", detail: error.detail, cause: error.cause });
    case "ForkPackageConflict":
      return makeStepFailure({ category: "conflict", detail: error.detail });
    case "ForkPackageFailed":
    case "NativeImportFailed":
      return makeStepFailure({ category: "internal", detail: error.detail, cause: error.cause });
    case "NativeImportUnsupported":
      return makeStepFailure({
        category: "usage",
        detail: `Native package import is not supported for ${error.type}`,
      });
    case "NativeSubagentRuntimeRequired":
      return makeStepFailure({
        category: "usage",
        detail: "Native subagent runtime is ambiguous; specify --source-agent",
      });
    case "NativeSubagentImportUnsupported":
      return makeStepFailure({
        category: "usage",
        detail: `Native subagent import is not supported for ${error.agentId}`,
      });
    case "NativeImportConflict":
      return makeStepFailure({
        category: "conflict",
        detail: `Import target already exists: ${error.targetDir}`,
      });
    case "AuthoringOwnerRequired":
      return authoringOwnerRequiredFailure(error);
    case "AuthoringOwnerMismatch":
      return makeStepFailure({
        category: "conflict",
        detail: `Package owner ${error.requested} does not match workspace owner ${error.configured}`,
      });
    case "ScaffoldNameInvalid":
      return makeStepFailure({
        category: "validation",
        title: `Invalid ${error.subject} name`,
        detail: `Invalid ${error.subject} name: "${error.name}"`,
        inputs: [{ label: "Name", value: `"${error.name}"` }],
        recover: `Choose a name matching /${error.pattern}/ (max ${error.maxLength} chars)`,
      });
    case "AuthoringScopeUnsupported":
      return makeStepFailure({
        category: "validation",
        detail: `New ${error.subject}s can only be scaffolded in a project workspace`,
      });
    case "PackSelectorNotAPack":
      return makeStepFailure({
        category: "validation",
        detail: `Pack selector '${error.selector}' does not identify a pack`,
      });
    case "PackNotConfigured":
      return makeStepFailure({
        category: "not_found",
        detail: `Pack '${error.selector}' not found; it is not configured in this workspace`,
      });
    case "PackSelectorAmbiguous":
      return makeStepFailure({
        category: "conflict",
        detail: `Pack selector '${error.selector}' matches multiple configured packs`,
        suggestions: error.configuredNames.map((name) => ({
          description: `Use configured pack name ${name}`,
        })),
      });
    case "PackSourceMissing":
      return makeStepFailure({
        category: "validation",
        detail: `Pack "${error.pack}" has no source.`,
      });
    case "PackNotAuthored":
      return makeStepFailure({
        category: "conflict",
        detail: `Cannot edit non-workspace pack "${error.pack}"`,
        recover: "Adopt or copy the pack into workspace authorship before editing its manifest.",
      });
    case "PackOwnerUnconfigured":
      return makeStepFailure({
        category: "validation",
        detail: `Pack "${error.pack}" has a workspace source and no workspace owner is configured`,
        suggestions: [
          {
            description: `Set \`owner\` in \`${error.settingsPath}\` before modifying this pack.`,
            cmd: "axm setup",
          },
        ],
      });
    case "PackManifestUnavailable":
      return packManifestUnavailableFailure(error);
    case "PackGraphInvalid":
      return makeStepFailure({
        category: "conflict",
        detail: `Cannot add dependencies while pack ${error.packFqn} is invalid.`,
        recover: "Inspect the pack drift, then explicitly accept or restore the current content.",
        suggestions: [
          {
            description: "Preview workspace reconciliation",
            cmd: `axm sync ${error.packFqn} --preview`,
          },
        ],
      });
    case "PackMemberAmbiguous":
      return makeStepFailure({
        category: "validation",
        detail: `Extension '${error.selector}' is installed as ${[
          ...new Set(error.matches.map((match) => match.type)),
        ].join(", ")}`,
        recover: "Pass the fully qualified name to choose one.",
        suggestions: error.matches.map((match) => ({
          description: `Add the ${match.type}`,
          cmd: `axm packs add ${error.pack} ${match.fqn}`,
        })),
      });
    case "PackMemberUnmanaged":
      return makeStepFailure({
        category: "validation",
        detail: `Extension '${error.selector}' is not a managed, versioned extension`,
        suggestions: [
          { description: "Only managed registry or workspace extensions can be added to packs" },
        ],
      });
    case "PackMemberNotFound":
      return error.pattern
        ? makeStepFailure({
            category: "not_found",
            detail: `No managed, versioned extensions match '${error.selector}'`,
            suggestions: [{ description: "Inspect installed extensions", cmd: "axm packs list" }],
          })
        : makeStepFailure({
            category: "not_found",
            detail: `Extension '${error.selector}' not found in workspace`,
            suggestions: [
              { description: "Install the extension first", cmd: "axm install <source>" },
            ],
          });
    case "PackMemberNotDeclared":
      return error.pattern
        ? makeStepFailure({
            category: "not_found",
            detail: `No extensions in pack match '${error.selector}'`,
            suggestions: [{ description: "Check pack contents" }],
          })
        : makeStepFailure({
            category: "not_found",
            detail: `Extension '${error.selector}' is not in the pack`,
            suggestions: [{ description: "Check the pack manifest for available extensions" }],
          });
  }
};

/** Retain the admitted authoring producer's identity and original causal chain. */
export const authoringFailureToStepFailure = (error: AuthoringFamilyFailure): StepFailure =>
  makeStepFailure({
    ...renderAuthoringFailureDetails(error),
    cause: error,
    diagnostic: {
      kind: error._tag.replace(/([a-z0-9])([A-Z])/gu, "$1-$2").toLowerCase(),
      operation: "workspace.operation",
    },
  });

/** Every failure an authoring closure can settle a plan step with. */
export type AuthoringStepFailure =
  | NativeLocationError
  | ExtensionManagerFailure
  | ScaffoldedExtensionUnresolved
  | AuthoredPackageError
  | AuthoringFailed
  | StepFailure;

/** The sentence a transition's deciding failure reads with inside an authoring step. */
const authoringFailureDetail = (failure: unknown): string | undefined =>
  isAuthoringFamilyFailure(failure)
    ? authoringFailureToStepFailure(failure).detail
    : kernelFailureDetail(failure);

/**
 * Serialize one authoring-closure failure into the plan-step vocabulary, the
 * same rendering the command boundary projects for that failure.
 */
export const authoringStepFailure = (failure: AuthoringStepFailure): StepFailure =>
  isAuthoringFamilyFailure(failure)
    ? authoringFailureToStepFailure(failure)
    : renderKernelFailure(failure, { detailOf: authoringFailureDetail });
