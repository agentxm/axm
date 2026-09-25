/**
 * Shared helpers for extension-materialization internal tests: decode
 * shortcuts, deterministic tree integrity, a coding-agent stub, a structural
 * failure serialization for manager tests against temporary workspaces.
 */

import * as crypto from "node:crypto";
import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { CodingAgent } from "../projection/agent-adapters/index.js";
import type { MaterializationTargetId } from "@agentxm/extension-model/unstable/agents/types";
import {
  decodeExtensionNameSync,
  ExtensionFqnSchema,
  type ExtensionFqn,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeHandleSync, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  decodeVersionRangeSync,
  decodeVersionSync,
  type Version,
  type VersionRange,
} from "@agentxm/extension-model/unstable/version-constraints";
import {
  PackageUrlSchema,
  type PackageUrlParts,
} from "@agentxm/extension-model/unstable/packaging/package-url";
import { StepFailure } from "../transitions/planning/index.js";
import { TreeIntegritySchema, type TreeIntegrity } from "../desired-state/index.js";

export const handle = (value: string): Handle => decodeHandleSync(value);

export const extensionName = (value: string): ExtensionName => decodeExtensionNameSync(value);

export const exactVersion = (value: string): Version => decodeVersionSync(value);

export const fullyQualifiedName = (value: string): ExtensionFqn =>
  Schema.decodeUnknownSync(ExtensionFqnSchema)(value);

export const packageUrl = (value: string): PackageUrlParts =>
  Schema.decodeUnknownSync(PackageUrlSchema)(value);

export const computeMaterializedTreeIntegritySync = (root: string): TreeIntegrity => {
  const files: globalThis.Array<{ readonly relativePath: string; readonly absolutePath: string }> =
    [];
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

export const versionRange = (value: string): VersionRange => decodeVersionRangeSync(value);

export const expectDefined = <T>(value: T | undefined, message = "Expected a defined value"): T => {
  if (value === undefined) throw new Error(message);
  return value;
};

export const at = <T>(values: ReadonlyArray<T>, index: number, message?: string): T =>
  expectDefined(values[index], message ?? `Expected value at index ${index}`);

export const expectRecord = (
  value: unknown,
  message = "Expected object record",
): Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(message);
  }

  return Object.fromEntries(Object.entries(value));
};

export const makeCodingAgentStub = (
  id: MaterializationTargetId,
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

/** Render a failure as the sentence the structural test adapter reports. */
export const describeTestFailure = (failure: unknown): string => {
  if (typeof failure === "object" && failure !== null) {
    for (const key of ["detail", "subject", "message"] as const) {
      if (key in failure) {
        const candidate = Reflect.get(failure, key);
        if (typeof candidate === "string" && candidate.length > 0) return candidate;
      }
    }
    if ("cause" in failure && failure.cause !== undefined && failure.cause !== failure) {
      return describeTestFailure(failure.cause);
    }
  }
  return String(failure);
};

/**
 * Structural stand-in for the application's failure adapter: the feature's
 * own failure maps 1:1; anything else keeps its detail sentence under an
 * `internal` category. Assertions in this package bind to this mapping, not
 * to the application boundary's wording.
 */
export const testFailureToStepFailure = (failure: unknown): StepFailure =>
  new StepFailure({
    category: "internal",
    detail: describeTestFailure(failure),
    cause: failure,
  });
