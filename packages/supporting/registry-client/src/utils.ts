/**
 * Registry utility functions extracted from sources/providers/registry.ts.
 *
 * Shared helpers for registry operations: lifecycle warnings, type
 * pluralization, and path building. Version selection lives in the
 * Registry protocol; release-age policy in extension-resolution.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  toExtensionTypePlural,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import type {
  ExtensionIndex,
  VersionEntry,
} from "@agentxm/registry-protocol/unstable/registry/schema";

// -----------------------------------------------------------------------------
// Lifecycle warnings
// -----------------------------------------------------------------------------

export const extensionLifecycleWarnings = (
  index: ExtensionIndex,
  version: VersionEntry,
): ReadonlyArray<string> => {
  const warnings: string[] = [];
  const extensionRef = `${index.owner}/${toExtensionTypePlural(index.type)}/${index.name}`;
  if (index.archival !== null) {
    warnings.push(
      index.archival.message === undefined
        ? `${extensionRef} is archived; historical releases remain available`
        : `${extensionRef} is archived: ${index.archival.message}`,
    );
  }
  if (version.yankedAt !== undefined) {
    const context = [version.yankCategory, version.yankMessage].filter(
      (value): value is string => value !== undefined,
    );
    warnings.push(
      context.length === 0
        ? `${extensionRef}@${version.version} is yanked`
        : `${extensionRef}@${version.version} is yanked: ${context.join(": ")}`,
    );
  }
  return warnings;
};

// -----------------------------------------------------------------------------
// Extension Directory
// -----------------------------------------------------------------------------

/** Build the path to an extension's directory within a registry. */
export const extensionDir = (
  registryRoot: string,
  owner: Handle,
  type: ExtensionType,
  name: string,
  join: (...parts: readonly string[]) => string,
): string => join(registryRoot, "extensions", owner, toExtensionTypePlural(type), name);
