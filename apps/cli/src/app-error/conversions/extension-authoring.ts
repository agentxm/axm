/**
 * Conversions from the extension-authoring typed failure family into CLI-facing
 * `AppError` values. Each converter reproduces the detail template its
 * construction sites rendered before decoupling — the byte-for-byte contract
 * for this family lives in the table-driven conversion tests.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type {
  AuthoringOwnerMismatch,
  AuthoringOwnerRequired,
  AuthoringScopeUnsupported,
  CreateDestinationInspectionFailed,
  CreateNameConfigured,
  ForkPackageConflict,
  ForkPackageFailed,
  ForkPackageInvalid,
  NativeImportConflict,
  NativeImportFailed,
  NativeImportInvalid,
  NativeImportUnsupported,
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
  ScaffoldNameInvalid,
} from "@agentxm/extension-authoring";
import { makeAppError, type AppError } from "../app-error.js";

export const createNameConfiguredToAppError = (error: CreateNameConfigured): AppError =>
  makeAppError({
    code: "conflict",
    detail: `${error.subject} '${error.name}' already exists in settings`,
    recover: `Choose a different name or remove the existing ${error.subject.toLowerCase()} first`,
  });

/** Translate a create-destination inspection failure. */
export const createDestinationInspectionFailedToAppError = (
  error: CreateDestinationInspectionFailed,
): AppError =>
  makeAppError({
    code: "internal",
    detail: `Failed to inspect create destination: ${error.path}`,
    cause: error.cause,
  });

/** Translate a path-safety violation. */
export const forkPackageInvalidToAppError = (error: ForkPackageInvalid): AppError =>
  makeAppError({
    code: "validation",
    detail: error.detail,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate a fork conflict; the site owns the fact sentence. */
export const forkPackageConflictToAppError = (error: ForkPackageConflict): AppError =>
  makeAppError({ code: "conflict", detail: error.detail });

/** Translate a fork filesystem failure; the site owns the fact sentence. */
export const forkPackageFailedToAppError = (error: ForkPackageFailed): AppError =>
  makeAppError({ code: "internal", detail: error.detail, cause: error.cause });

/** Translate an unsupported native-import type. */
export const nativeImportUnsupportedToAppError = (error: NativeImportUnsupported): AppError =>
  makeAppError({
    code: "usage",
    detail: `Native package import is not supported for ${error.type}`,
  });

/** Translate a native-import validation failure; the site owns the fact sentence. */
export const nativeImportInvalidToAppError = (error: NativeImportInvalid): AppError =>
  makeAppError({
    code: "validation",
    detail: error.detail,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate a native-import target collision. */
export const nativeImportConflictToAppError = (error: NativeImportConflict): AppError =>
  makeAppError({ code: "conflict", detail: `Import target already exists: ${error.targetDir}` });

/** Translate a native-import filesystem failure; the site owns the fact sentence. */
export const nativeImportFailedToAppError = (error: NativeImportFailed): AppError =>
  makeAppError({ code: "internal", detail: error.detail, cause: error.cause });

/** Translate a refused source-authority transition with its recovery facts. */

/**
 * Translate the refusal that no owner is configured. The candidates the
 * feature named become the recovery command; when it named none, the
 * recovery asks for a handle instead of inventing one.
 */
export const authoringOwnerRequiredToAppError = (error: AuthoringOwnerRequired): AppError => {
  const [candidate] = error.candidates;
  return makeAppError({
    code: "validation",
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

/** Translate a requested owner that disagrees with the workspace's. */
export const authoringOwnerMismatchToAppError = (error: AuthoringOwnerMismatch): AppError =>
  makeAppError({
    code: "conflict",
    detail: `Package owner ${error.requested} does not match workspace owner ${error.configured}`,
  });

/** Translate a name an authored package cannot carry, naming the rule. */
export const scaffoldNameInvalidToAppError = (error: ScaffoldNameInvalid): AppError =>
  makeAppError({
    code: "validation",
    detail: `Invalid ${error.subject} name: "${error.name}"`,
    recover: `Choose a name matching /${error.pattern}/ (max ${error.maxLength} chars)`,
  });

/** Translate authoring requested in a scope that holds no authored packages. */
export const authoringScopeUnsupportedToAppError = (error: AuthoringScopeUnsupported): AppError =>
  makeAppError({
    code: "validation",
    detail: `New ${error.subject}s can only be scaffolded in a project workspace`,
  });

/** Translate a pack selector that names something other than a pack. */
export const packSelectorNotAPackToAppError = (error: PackSelectorNotAPack): AppError =>
  makeAppError({
    code: "validation",
    detail: `Pack selector '${error.selector}' does not identify a pack`,
  });

/** Translate a pack selector no configured pack answers to. */
export const packNotConfiguredToAppError = (error: PackNotConfigured): AppError =>
  makeAppError({
    code: "not_found",
    detail: `Pack '${error.selector}' not found; it is not configured in this workspace`,
  });

/**
 * Translate an ambiguous pack identity. The recovery names each configured
 * pack; the command shell that knows the rest of the invocation turns them
 * into runnable commands.
 */
export const packSelectorAmbiguousToAppError = (error: PackSelectorAmbiguous): AppError =>
  makeAppError({
    code: "conflict",
    detail: `Pack selector '${error.selector}' matches multiple configured packs`,
    suggestions: error.configuredNames.map((name) => ({
      description: `Use configured pack name ${name}`,
    })),
  });

/** Translate a configured pack that declares no source. */
export const packSourceMissingToAppError = (error: PackSourceMissing): AppError =>
  makeAppError({ code: "validation", detail: `Pack "${error.pack}" has no source.` });

/** Translate an edit requested against a pack the workspace does not author. */
export const packNotAuthoredToAppError = (error: PackNotAuthored): AppError =>
  makeAppError({
    code: "conflict",
    detail: `Cannot edit non-workspace pack "${error.pack}"`,
    recover: "Adopt or copy the pack into workspace authorship before editing its manifest.",
  });

/** Translate an authored pack in a workspace that records no owner. */
export const packOwnerUnconfiguredToAppError = (error: PackOwnerUnconfigured): AppError =>
  makeAppError({
    code: "validation",
    detail: `Pack "${error.pack}" has a workspace source and no workspace owner is configured`,
    suggestions: [
      {
        description: `Set \`owner\` in \`${error.settingsPath}\` before modifying this pack.`,
        cmd: "axm setup",
      },
    ],
  });

/** Translate a pack manifest that could not be read, parsed, or decoded. */
export const packManifestUnavailableToAppError = (error: PackManifestUnavailable): AppError => {
  switch (error.reason) {
    case "unreadable":
      return makeAppError({
        code: "not_found",
        detail: `Pack manifest not found at ${error.path}`,
        suggestions: [{ description: "Ensure the pack exists on disk" }],
        cause: error.cause,
      });
    case "unparsable":
      return makeAppError({
        code: "validation",
        detail: `Failed to parse pack manifest: ${error.path}`,
        cause: error.cause,
      });
    case "invalid":
      return makeAppError({
        code: "validation",
        detail: `Invalid pack manifest: ${error.path}`,
        cause: error.cause,
      });
  }
};

/** Translate a membership edit refused while the pack itself is invalid. */
export const packGraphInvalidToAppError = (error: PackGraphInvalid): AppError =>
  makeAppError({
    code: "conflict",
    detail: `Cannot add dependencies while pack ${error.packFqn} is invalid.`,
    recover: "Inspect the pack drift, then explicitly accept or restore the current content.",
    suggestions: [
      {
        description: "Preview workspace reconciliation",
        cmd: `axm sync ${error.packFqn} --preview`,
      },
    ],
  });

/** Translate a bare member name installed under more than one type. */
export const packMemberAmbiguousToAppError = (error: PackMemberAmbiguous): AppError =>
  makeAppError({
    code: "validation",
    detail: `Extension '${error.selector}' is installed as ${[
      ...new Set(error.matches.map((match) => match.type)),
    ].join(", ")}`,
    recover: "Pass the fully qualified name to choose one.",
    suggestions: error.matches.map((match) => ({
      description: `Add the ${match.type}`,
      cmd: `axm packs add ${error.pack} ${match.fqn}`,
    })),
  });

/** Translate a member the workspace holds without a resolved version. */
export const packMemberUnmanagedToAppError = (error: PackMemberUnmanaged): AppError =>
  makeAppError({
    code: "validation",
    detail: `Extension '${error.selector}' is not a managed, versioned extension`,
    suggestions: [
      { description: "Only managed registry or workspace extensions can be added to packs" },
    ],
  });

/** Translate a member selector nothing in the workspace answers to. */
export const packMemberNotFoundToAppError = (error: PackMemberNotFound): AppError =>
  error.pattern
    ? makeAppError({
        code: "not_found",
        detail: `No managed, versioned extensions match '${error.selector}'`,
        suggestions: [{ description: "Inspect installed extensions", cmd: "axm packs list" }],
      })
    : makeAppError({
        code: "not_found",
        detail: `Extension '${error.selector}' not found in workspace`,
        suggestions: [{ description: "Install the extension first", cmd: "axm install <source>" }],
      });

/** Translate a member selector nothing in the pack manifest answers to. */
export const packMemberNotDeclaredToAppError = (error: PackMemberNotDeclared): AppError =>
  error.pattern
    ? makeAppError({
        code: "not_found",
        detail: `No extensions in pack match '${error.selector}'`,
        suggestions: [{ description: "Check pack contents" }],
      })
    : makeAppError({
        code: "not_found",
        detail: `Extension '${error.selector}' is not in the pack`,
        suggestions: [{ description: "Check the pack manifest for available extensions" }],
      });
