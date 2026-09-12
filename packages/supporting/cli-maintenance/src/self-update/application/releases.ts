import type { StableChannelDocumentV1 } from "@agentxm/extension-model/unstable/release-channel";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { VersionRelation } from "../domain/index.js";
import type { UpgradeFailed } from "./errors.js";

export interface ResolvedRelease {
  readonly tagName: string;
  readonly binaryAssetUrl: string | null;
  readonly checksumAssetUrl: string | null;
}

/** Release-authority facts, independent of the installed version. */
export interface SelectedRelease {
  readonly targetVersion: string;
  readonly release: ResolvedRelease;
  readonly channel: StableChannelDocumentV1 | null;
  readonly validatedAt: string;
  readonly etag: string | null;
}

/** The application's comparison of an observed installation with its target. */
export interface VersionResolutionResult extends SelectedRelease {
  readonly localVersion: string | null;
  readonly versionRelation: VersionRelation;
}

export interface CliReleaseCatalogService {
  readonly stable: (binaryName: string) => Effect.Effect<SelectedRelease, UpgradeFailed>;
  /** The application supplies a normalized stable semantic version. */
  readonly exact: (
    version: string,
    binaryName: string,
  ) => Effect.Effect<SelectedRelease, UpgradeFailed>;
}

export class CliReleaseCatalog extends Context.Service<
  CliReleaseCatalog,
  CliReleaseCatalogService
>()("@agentxm/cli-maintenance/self-update/CliReleaseCatalog") {}
