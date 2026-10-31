/**
 * Shared decode helpers for registry-client internal tests.
 */

import { pathToFileURL } from "node:url";

import * as Effect from "effect/Effect";
import * as ConfigProvider from "effect/ConfigProvider";
import type * as FileSystem from "effect/FileSystem";
import * as HttpClient from "effect/http/HttpClient";
import type * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
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
  AgentExtensionRecommendationSchema,
  type AgentExtensionRecommendation,
} from "@agentxm/extension-model/unstable/recommendations/agent-extensions";

import type { RegistryClient } from "./client.js";
import { makeRegistryClientFactory } from "./index.js";
import { passThroughRegistryAuthorization } from "./testing.js";

export const handle = (value: string): Handle => decodeHandleSync(value);

export const extensionName = (value: string): ExtensionName => decodeExtensionNameSync(value);

export const exactVersion = (value: string): Version => decodeVersionSync(value);

export const versionRange = (value: string): VersionRange => decodeVersionRangeSync(value);

export const packageType = (value: string): PackageType =>
  Schema.decodeUnknownSync(PackageTypeSchema)(value);

export const packageUrl = (value: string): PackageUrlParts =>
  Schema.decodeUnknownSync(PackageUrlSchema)(value);

export const agentExtensionRecommendation = (
  value: typeof AgentExtensionRecommendationSchema.Encoded,
): AgentExtensionRecommendation =>
  Schema.decodeUnknownSync(AgentExtensionRecommendationSchema)(value);

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

/**
 * A client for the file Registry at a native directory, opened through the
 * published factory over `fileSystem`. A file Registry sends no requests, so
 * the transport refuses every one.
 */
export const localRegistryClient = (
  root: string,
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
): RegistryClient =>
  Effect.runSync(
    makeRegistryClientFactory({
      httpClient: HttpClient.make(() => Effect.die("A file Registry sends no requests.")),
      fileSystem,
      path,
      authorization: passThroughRegistryAuthorization,
    }).pipe(
      Effect.flatMap((factory) =>
        factory.forEndpoint(decodeRegistryEndpointSync(pathToFileURL(root).href)),
      ),
    ),
  );

/** Build a remote client through its public factory with isolated cache configuration. */
export const remoteRegistryClient = (
  httpClient: HttpClient.HttpClient,
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  userHome: string,
) =>
  makeRegistryClientFactory({
    httpClient,
    fileSystem,
    path,
    authorization: passThroughRegistryAuthorization,
  }).pipe(
    Effect.flatMap((factory) =>
      factory.forEndpoint(decodeRegistryEndpointSync("https://registry.example.test"), {
        requestPolicy: {
          requestTimeout: "1 second",
          totalDeadline: "2 seconds",
          maxAttempts: 3,
          initialBackoff: "0 millis",
          maxBackoff: "0 millis",
        },
      }),
    ),
    Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ AXM_USER_HOME: userHome }))),
  );
