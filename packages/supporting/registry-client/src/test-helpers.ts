/**
 * Shared decode helpers for registry-client internal tests.
 */

import * as Schema from "effect/Schema";
import {
  decodeExtensionNameSync,
  ExtensionDependencyConstraintMapSchema,
  type ExtensionDependencyConstraintMap,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeHandleSync, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  decodeVersionRangeSync,
  decodeVersionSync,
  type Version,
  type VersionRange,
} from "@agentxm/extension-model/unstable/version-constraints";
import { PackageTypeSchema, type PackageType } from "@agentxm/extension-model/unstable/packaging";
import {
  PackageUrlSchema,
  type PackageUrlParts,
} from "@agentxm/extension-model/unstable/packaging/package-url";
import {
  PackageExtensionDeclarationSchema,
  type PackageExtensionDeclaration,
} from "./axm-package-meta.js";

export const handle = (value: string): Handle => decodeHandleSync(value);

export const extensionName = (value: string): ExtensionName => decodeExtensionNameSync(value);

export const exactVersion = (value: string): Version => decodeVersionSync(value);

export const versionRange = (value: string): VersionRange => decodeVersionRangeSync(value);

export const packageType = (value: string): PackageType =>
  Schema.decodeUnknownSync(PackageTypeSchema)(value);

export const packageUrl = (value: string): PackageUrlParts =>
  Schema.decodeUnknownSync(PackageUrlSchema)(value);

export const packageExtensionDeclaration = (
  value: typeof PackageExtensionDeclarationSchema.Encoded,
): PackageExtensionDeclaration =>
  Schema.decodeUnknownSync(PackageExtensionDeclarationSchema)(value);

export const dependencyConstraints = (
  value: Record<string, string>,
): ExtensionDependencyConstraintMap =>
  Schema.decodeUnknownSync(ExtensionDependencyConstraintMapSchema)(value);

const expectDefined = <T>(value: T | null | undefined, message = "Expected value"): T => {
  if (value == null) {
    throw new Error(message);
  }
  return value;
};

export const at = <T>(values: ReadonlyArray<T>, index: number, message?: string): T =>
  expectDefined(values[index], message ?? `Expected value at index ${index}`);
