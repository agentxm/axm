/**
 * Projection from a Registry index and a selected version to the manifest
 * and scope results that registry clients and providers return.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";
import { toAuthor, type Author } from "@agentxm/extension-model/unstable/extensions";
import { resolveVersionEntry } from "@agentxm/extension-model/unstable/version-constraints/version-selection";
import {
  packagesToPackageUrlParts,
  type ExtensionIndex,
  type VersionEntry,
} from "@agentxm/registry-protocol/unstable/registry/schema";
import type { GetExtensionsByOwnerResponse, RegistryExtensionManifest } from "./client.js";
import { extensionLifecycleWarnings } from "./utils.js";

/** Project an index and an already-selected version entry to a manifest. */
export const registryManifestForVersion = (
  index: ExtensionIndex,
  version: VersionEntry,
): RegistryExtensionManifest => {
  const lifecycleWarnings = extensionLifecycleWarnings(index, version);
  return {
    owner: index.owner,
    type: index.type,
    name: index.name,
    publisherBindingId: index.publisherBindingId,
    ...(index.visibility === undefined ? {} : { visibility: index.visibility }),
    description: Option.fromUndefinedOr(index.description),
    repository: Option.fromUndefinedOr(index.repository),
    bugs: Option.fromUndefinedOr(index.bugs),
    license: Option.fromUndefinedOr(index.license),
    authors: Option.match(Option.fromUndefinedOr(index.authors), {
      onNone: (): ReadonlyArray<Author> => [],
      onSome: (authors) => authors.map((author) => toAuthor(author)),
    }),
    dependencies: version.dependencies ?? {},
    version: version.version,
    integrity: version.integrity,
    packages: packagesToPackageUrlParts(version.packages),
    ...(index.archival === null ? {} : { archival: index.archival }),
    ...(index.deprecation === null ? {} : { deprecation: index.deprecation }),
    ...(lifecycleWarnings.length === 0 ? {} : { lifecycleWarnings }),
  };
};

/** Project an index to the manifest of the version the range selects, if any. */
export const registryManifestFromIndex = (
  index: ExtensionIndex,
  versionRange: Option.Option<string>,
): Option.Option<RegistryExtensionManifest> =>
  Option.map(resolveVersionEntry(index.versions, versionRange), (version) =>
    registryManifestForVersion(index, version),
  );

/** An index with the manifest projected from it. */
export interface IndexedManifest {
  readonly index: ExtensionIndex;
  readonly manifest: RegistryExtensionManifest;
}

/** Page scope results; the total counts every result before the page is taken. */
export const pageScopeResults = (
  indexed: ReadonlyArray<IndexedManifest>,
  offset: number,
  limit: Option.Option<number>,
): GetExtensionsByOwnerResponse => {
  const total = indexed.length;
  const sliced = indexed.slice(offset);
  const page = Option.match(limit, {
    onNone: () => sliced,
    onSome: (l) => sliced.slice(0, l),
  });
  return {
    extensions: page.map(({ manifest }) => manifest),
    indexes: page.map(({ index }) => index),
    total,
  };
};
