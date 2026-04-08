import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import { AppError } from "./app-error/index.js";
import type { CodingAgent } from "./agents/coding-agent.js";
import type { AgentId } from "./agents/types.js";
import {
  decodeExtensionNameSync,
  ExtensionDependencyConstraintMapSchema,
  FullyQualifiedNameSchema,
  FullyQualifiedRefSchema,
  RenderedFilePathSchema,
  type ExtensionDependencyConstraintMap,
  type ExtensionName,
  type FullyQualifiedName,
  type FullyQualifiedRef,
  type RenderedFilePath,
} from "./extensions/index.js";
import { decodeHandleSync, type Handle } from "./extensions/handle.js";
import {
  decodeExactSemverVersionSync,
  decodeVersionConstraintSync,
  type ExactSemverVersion,
  type VersionConstraint,
} from "./version-constraints/version-constraints.js";
import { PackageTypeSchema } from "./packaging/package-type.js";
import { PackageUrlSchema, type PackageUrlParts } from "./packaging/package-url.js";
import type { PackageType } from "./packaging/index.js";

export const expectDefined = <T>(
  value: T | null | undefined,
  message = "Expected value to be defined",
): T => {
  if (value == null) {
    throw new Error(message);
  }

  return value;
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
  if (!(error instanceof AppError)) {
    throw new Error("Expected AppError");
  }
  return error;
};

export const handle = (value: string): Handle => decodeHandleSync(value);

export const extensionName = (value: string): ExtensionName => decodeExtensionNameSync(value);

export const exactVersion = (value: string): ExactSemverVersion =>
  decodeExactSemverVersionSync(value);

export const versionConstraint = (value: string): VersionConstraint =>
  decodeVersionConstraintSync(value);

export const fullyQualifiedName = (value: string): FullyQualifiedName =>
  Schema.decodeUnknownSync(FullyQualifiedNameSchema)(value);

export const fullyQualifiedRef = (value: string): FullyQualifiedRef =>
  Schema.decodeUnknownSync(FullyQualifiedRefSchema)(value);

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
  resolveEffectiveCommandsDir: ({ workspaceRoot }) =>
    Effect.succeed({
      _tag: "supported",
      dir: `${workspaceRoot}/.${id}/commands`,
      warnings: [],
    }),
  addCommand: ({ workspaceRoot, commandName }) =>
    Effect.succeed({
      _tag: "success",
      renderedFilePath: `${workspaceRoot}/.${id}/commands/${commandName}.md`,
      warnings: [],
    }),
  removeCommand: ({ workspaceRoot, commandName }) =>
    Effect.succeed({
      _tag: "success",
      renderedFilePath: `${workspaceRoot}/.${id}/commands/${commandName}.md`,
      warnings: [],
    }),
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
