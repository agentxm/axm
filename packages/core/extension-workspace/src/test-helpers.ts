/**
 * Shared decode helpers for extension-workspace internal tests.
 */

import * as crypto from "node:crypto";
import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import * as Schema from "effect/Schema";
import {
  decodeExtensionNameSync,
  ExtensionFqnSchema,
  type ExtensionFqn,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeHandleSync, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  decodeVersionSync,
  type Version,
} from "@agentxm/extension-model/unstable/version-constraints";
import {
  PackageUrlSchema,
  type PackageUrlParts,
} from "@agentxm/extension-model/unstable/packaging/package-url";
import { TreeIntegritySchema, type TreeIntegrity } from "@agentxm/workspace-state";

export const handle = (value: string): Handle => decodeHandleSync(value);

export const extensionName = (value: string): ExtensionName => decodeExtensionNameSync(value);

export const exactVersion = (value: string): Version => decodeVersionSync(value);

export const fullyQualifiedName = (value: string): ExtensionFqn =>
  Schema.decodeUnknownSync(ExtensionFqnSchema)(value);

export const packageUrl = (value: string): PackageUrlParts =>
  Schema.decodeUnknownSync(PackageUrlSchema)(value);

export const computeMaterializedTreeIntegritySync = (root: string): TreeIntegrity => {
  const files: Array<{ readonly relativePath: string; readonly absolutePath: string }> = [];
  const walk = (directory: string, relativeDirectory: string): void => {
    const entries = nodeFs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const relativePath =
        relativeDirectory.length === 0 ? entry.name : `${relativeDirectory}/${entry.name}`;
      const absolutePath = nodePath.join(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(`Unexpected symlink in test package: ${relativePath}`);
      if (entry.isDirectory()) walk(absolutePath, relativePath);
      else if (entry.isFile()) files.push({ relativePath, absolutePath });
      else throw new Error(`Unexpected filesystem entry in test package: ${relativePath}`);
    }
  };
  walk(root, "");

  const hash = crypto.createHash("sha256");
  const frame = (bytes: Uint8Array): void => {
    const length = Buffer.alloc(8);
    length.writeBigUInt64BE(BigInt(bytes.byteLength));
    hash.update(length);
    hash.update(bytes);
  };
  frame(Buffer.from("agentxm-materialized-tree"));
  frame(Buffer.from("1"));
  for (const file of files) {
    frame(Buffer.from(file.relativePath, "utf8"));
    frame(nodeFs.readFileSync(file.absolutePath));
  }
  return Schema.decodeUnknownSync(TreeIntegritySchema)(`sha256-tree-v1:${hash.digest("hex")}`);
};
