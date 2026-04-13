import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  ExtensionNameSchema,
  parseRegistrySourcePatternParts,
  type ExtensionName,
  type ExtensionType,
  type Handle,
  toExtensionType,
} from "@agentxm/client-core/unstable/extensions";
import {
  VersionConstraintSchema,
  type VersionConstraint,
} from "@agentxm/client-core/unstable/version-constraints";

const decodeExtensionName = Schema.decodeUnknownResult(ExtensionNameSchema);
const decodeVersionConstraint = Schema.decodeUnknownResult(VersionConstraintSchema);

export interface BareRegistryInstallTarget {
  readonly kind: "bare-name";
  readonly name: ExtensionName;
  readonly versionConstraint?: VersionConstraint | undefined;
}

export interface QualifiedRegistryInstallTarget {
  readonly kind: "registry";
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly versionConstraint?: VersionConstraint | undefined;
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
  readonly allowBareVersionConstraint?: boolean | undefined;
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

  if (rawConstraint !== undefined && !options.allowBareVersionConstraint) {
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

  const decodedConstraint = decodeVersionConstraint(rawConstraint);
  if (Result.isFailure(decodedConstraint)) {
    return Result.fail({ kind: "invalid-version-constraint" });
  }

  return Result.succeed({
    kind: "bare-name",
    name: decodedName.success,
    versionConstraint: decodedConstraint.success,
  });
};

export const parseRegistryInstallTarget = (
  input: string,
  options: ParseRegistryInstallTargetOptions,
): Result.Result<RegistryInstallTarget, RegistryInstallTargetParseError> => {
  const parsedRegistry = parseRegistrySourcePatternParts(input);
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
      versionConstraint: parsedRegistry.versionConstraint,
    });
  }

  if (!options.allowBareName) {
    return Result.fail({ kind: "not-registry" });
  }

  return parseBareName(input, options);
};
