import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import { AppError } from "./app-error/index.js";
import { isKnownFailure, toAppError } from "./app-error/conversions.js";
import type { CodingAgent } from "./extension-workspace/coding-agent.js";
import type { AgentId } from "@agentxm/extension-model/unstable/agents/types";
import {
  decodeExtensionNameSync,
  ExtensionDependencyConstraintMapSchema,
  ExtensionFqnSchema,
  ExtensionSpecSchema,
  type ExtensionDependencyConstraintMap,
  type ExtensionName,
  type ExtensionFqn,
  type ExtensionSpec,
} from "@agentxm/extension-model/unstable/extensions";
import { RenderedFilePathSchema, type RenderedFilePath } from "./workspace/rendered-files.js";
import { TreeIntegritySchema, type TreeIntegrity } from "./workspace/materialized-tree.js";
import { decodeHandleSync, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  decodeVersionSync,
  decodeVersionRangeSync,
  type Version,
  type VersionRange,
} from "@agentxm/extension-model/unstable/version-constraints";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import {
  PackageUrlSchema,
  type PackageUrlParts,
} from "@agentxm/extension-model/unstable/packaging/package-url";
import type { PackageType } from "@agentxm/extension-model/unstable/packaging";
import {
  PackageExtensionDeclarationSchema,
  type PackageExtensionDeclaration,
} from "./packaging/axm-package-meta.js";

export const expectDefined = <T>(
  value: T | null | undefined,
  message = "Expected value to be defined",
): T => {
  if (value == null) {
    throw new Error(message);
  }

  return value;
};

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

export const at = <T>(values: ReadonlyArray<T>, index: number, message?: string): T =>
  expectDefined(values[index], message ?? `Expected value at index ${index}`);

export const expectSome = <T>(value: Option.Option<T>, message = "Expected Option.some"): T =>
  Option.match(value, {
    onNone: () => {
      throw new Error(message);
    },
    onSome: (item) => item,
  });

export const expectRecord = (
  value: unknown,
  message = "Expected object record",
): Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(message);
  }

  return Object.fromEntries(Object.entries(value));
};

export const property = (value: unknown, key: string, message?: string): unknown =>
  expectDefined(
    expectRecord(value, message ?? `Expected object containing ${key}`)[key],
    message ?? `Expected property ${key}`,
  );

export const recordEntry = <T>(
  value: Readonly<Record<string, T>> | Partial<Record<string, T>> | undefined,
  key: string,
  message?: string,
): T => expectDefined(value?.[key], message ?? `Expected record entry for ${key}`);

export const firstCall = <T>(
  calls: ReadonlyArray<ReadonlyArray<T>>,
  message = "Expected mock to be called",
): ReadonlyArray<T> => at(calls, 0, message);

export const stringProperty = (value: unknown, key: string, message?: string): string => {
  const field = property(value, key, message);

  if (typeof field !== "string") {
    throw new Error(message ?? `Expected string property ${key}`);
  }

  return field;
};

export const getAppError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }
  // Typed workspace failures assert through their boundary rendering; the
  // byte-for-byte contract for each tag is pinned by the conversion tests.
  if (isKnownFailure(error)) {
    return toAppError(error);
  }
  throw new Error("Expected AppError");
};

export const handle = (value: string): Handle => decodeHandleSync(value);

export const extensionName = (value: string): ExtensionName => decodeExtensionNameSync(value);

export const exactVersion = (value: string): Version => decodeVersionSync(value);

export const versionRange = (value: string): VersionRange => decodeVersionRangeSync(value);

export const fullyQualifiedName = (value: string): ExtensionFqn =>
  Schema.decodeUnknownSync(ExtensionFqnSchema)(value);

export const fullyQualifiedRef = (value: string): ExtensionSpec =>
  Schema.decodeUnknownSync(ExtensionSpecSchema)(value);

export const packageExtensionDeclaration = (
  value: typeof PackageExtensionDeclarationSchema.Encoded,
): PackageExtensionDeclaration =>
  Schema.decodeUnknownSync(PackageExtensionDeclarationSchema)(value);

export const dependencyConstraints = (
  value: Record<string, string>,
): ExtensionDependencyConstraintMap =>
  Schema.decodeUnknownSync(ExtensionDependencyConstraintMapSchema)(value);

export const packageType = (value: string): PackageType =>
  Schema.decodeUnknownSync(PackageTypeSchema)(value);

export const packageUrl = (value: string): PackageUrlParts =>
  Schema.decodeUnknownSync(PackageUrlSchema)(value);

export const renderedFilePath = (value: string): RenderedFilePath =>
  Schema.decodeUnknownSync(RenderedFilePathSchema)(value);

export const makeCodingAgentStub = (
  id: AgentId,
  overrides?: Partial<CodingAgent>,
): CodingAgent => ({
  id,
  resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
    Effect.succeed({ _tag: "supported", dir: `${workspaceRoot}/.${id}/skills` }),
  addMcpServer: () => Effect.succeed({ _tag: "unsupported", reason: "stub" }),
  removeMcpServer: () => Effect.succeed({ _tag: "unsupported", reason: "stub" }),
  resolveEffectiveSubagentsDir: ({ workspaceRoot }) =>
    Effect.succeed({
      _tag: "supported",
      dir: `${workspaceRoot}/.${id}/agents`,
      warnings: [],
    }),
  addSubagent: ({ workspaceRoot, input }) =>
    Effect.succeed({
      _tag: "success",
      renderedFilePaths: [`${workspaceRoot}/.${id}/agents/${input.name}.md`],
      warnings: [],
    }),
  removeSubagent: () =>
    Effect.succeed({
      _tag: "success",
      renderedFilePaths: [],
      warnings: [],
    }),
  ...overrides,
});
import * as crypto from "node:crypto";
import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
