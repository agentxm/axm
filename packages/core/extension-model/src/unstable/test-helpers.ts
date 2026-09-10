/** Test-only decoding helpers shared by this package's internal tests. */
import { decodeExtensionNameSync, type ExtensionName } from "./extensions/common.js";
import { decodeHandleSync, type Handle } from "./extensions/handle.js";
import { PackageTypeSchema, type PackageType } from "./packaging/package-type.js";
import * as Schema from "effect/Schema";
import {
  decodeVersionRangeSync,
  decodeVersionSync,
  type Version,
  type VersionRange,
} from "./version-constraints/version-constraints.js";

export const handle = (value: string): Handle => decodeHandleSync(value);

export const extensionName = (value: string): ExtensionName => decodeExtensionNameSync(value);

export const exactVersion = (value: string): Version => decodeVersionSync(value);

export const versionRange = (value: string): VersionRange => decodeVersionRangeSync(value);

export const packageType = (value: string): PackageType =>
  Schema.decodeUnknownSync(PackageTypeSchema)(value);
