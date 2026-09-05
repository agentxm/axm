import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  ExtensionNameSchema,
  parseSourceQualifiedRegistrySourcePatternParts,
  type ExtensionName,
  type ExtensionType,
  type Handle,
  toExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import {
  VersionRangeSchema,
  type VersionRange,
} from "@agentxm/extension-model/unstable/version-constraints";

const decodeExtensionName = Schema.decodeUnknownResult(ExtensionNameSchema);
const decodeVersionRange = Schema.decodeUnknownResult(VersionRangeSchema);

export interface BareRegistryInstallTarget {
  readonly kind: "bare-name";
  readonly name: ExtensionName;
  readonly versionRange?: VersionRange | undefined;
}

export interface QualifiedRegistryInstallTarget {
  readonly kind: "registry";
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly versionRange?: VersionRange | undefined;
}

export type RegistryInstallTarget = BareRegistryInstallTarget | QualifiedRegistryInstallTarget;

export type RegistryInstallTargetParseError =
  | { readonly kind: "missing-name" }
  | { readonly kind: "wrong-type"; readonly actualType?: ExtensionType | undefined }
  | { readonly kind: "invalid-bare-name" }
  | { readonly kind: "invalid-version-constraint" }
  | { readonly kind: "not-registry" };

export interface ParseRegistryInstallTargetOptions {
  readonly expectedType: ExtensionType;
  readonly allowBareName: boolean;
  readonly allowBareVersionRange?: boolean | undefined;
}

const parseBareName = (
  input: string,
  options: ParseRegistryInstallTargetOptions,
): Result.Result<BareRegistryInstallTarget, RegistryInstallTargetParseError> => {
  if (input.startsWith("@")) {
    return Result.fail({ kind: "not-registry" });
  }

  const atIndex = input.indexOf("@");
  const rawName = atIndex === -1 ? input : input.slice(0, atIndex);
  const rawConstraint = atIndex === -1 ? undefined : input.slice(atIndex + 1);

  if (rawConstraint !== undefined && !options.allowBareVersionRange) {
    return Result.fail({ kind: "not-registry" });
  }

  const decodedName = decodeExtensionName(rawName);
  if (Result.isFailure(decodedName)) {
    return Result.fail({ kind: "invalid-bare-name" });
  }

  if (rawConstraint === undefined) {
    return Result.succeed({
      kind: "bare-name",
      name: decodedName.success,
    });
  }

  if (rawConstraint.length === 0) {
    return Result.fail({ kind: "invalid-version-constraint" });
  }

  const decodedConstraint = decodeVersionRange(rawConstraint);
  if (Result.isFailure(decodedConstraint)) {
    return Result.fail({ kind: "invalid-version-constraint" });
  }

  return Result.succeed({
    kind: "bare-name",
    name: decodedName.success,
    versionRange: decodedConstraint.success,
  });
};

export const parseRegistryInstallTarget = (
  input: string,
  options: ParseRegistryInstallTargetOptions,
): Result.Result<RegistryInstallTarget, RegistryInstallTargetParseError> => {
  const parsedRegistry = parseSourceQualifiedRegistrySourcePatternParts(input);
  if (parsedRegistry !== undefined) {
    const parsedSingularType =
      parsedRegistry.type !== undefined ? toExtensionType(parsedRegistry.type) : undefined;

    if (parsedSingularType === undefined || parsedSingularType !== options.expectedType) {
      return Result.fail({
        kind: "wrong-type",
        actualType: parsedSingularType,
      });
    }

    if (parsedRegistry.name === undefined) {
      return Result.fail({ kind: "missing-name" });
    }

    return Result.succeed({
      kind: "registry",
      owner: parsedRegistry.owner,
      type: parsedSingularType,
      name: parsedRegistry.name,
      versionRange: parsedRegistry.versionRange,
    });
  }

  if (!options.allowBareName) {
    return Result.fail({ kind: "not-registry" });
  }

  return parseBareName(input, options);
};
