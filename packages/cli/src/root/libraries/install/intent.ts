import type * as Option from "effect/Option";

import type { ExtensionRef } from "@agentxm/client-core/unstable/extensions";
import type { LibraryRefParts } from "@agentxm/client-core/unstable/libraries";
import type { RegistryLibraryDetail } from "@agentxm/client-core/unstable/registry";
import type { RegistrySource } from "@agentxm/client-core/unstable/sources";
import type { ReleaseAgePolicy } from "@agentxm/client-core/unstable/registry";

interface InstallLibraryCommandIntentBase {
  readonly library: RegistryLibraryDetail;
  readonly ref: LibraryRefParts;
  readonly source: RegistrySource;
  readonly sourceName: string;
  readonly sourceText: string;
  readonly membersToInstall: ReadonlyArray<ExtensionRef>;
  readonly skippedMemberMessages: ReadonlyArray<string>;
  readonly diagnosticLines?: ReadonlyArray<string>;
}

export interface LiveInstallLibraryCommandIntent extends InstallLibraryCommandIntentBase {
  readonly mode: "live";
  readonly releaseAgePolicy: Option.Option<ReleaseAgePolicy>;
  readonly minimumReleaseAge: Option.Option<string>;
}

export interface FrozenInstallLibraryCommandIntent extends Omit<
  InstallLibraryCommandIntentBase,
  "library"
> {
  readonly mode: "frozen";
}

export type InstallLibraryCommandIntent =
  LiveInstallLibraryCommandIntent | FrozenInstallLibraryCommandIntent;
