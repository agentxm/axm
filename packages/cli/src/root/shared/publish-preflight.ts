import { makeAppError, type AppError } from "@agentxm/extension-management/unstable/app-error";
import type {
  ExtensionName,
  ExtensionType,
  Handle,
} from "@agentxm/extension-model/unstable/extensions";
import type { Version } from "@agentxm/extension-model/unstable/version-constraints";

export const alreadyPublishedVersionConflict = (args: {
  readonly fqn: string;
  readonly version: Version;
}): AppError =>
  makeAppError({
    code: "conflict",
    detail: `Cannot publish: version ${args.version} is already published for ${args.fqn}. Published versions are immutable.`,
    suggestions: [
      {
        description: "Bump the manifest version.",
        cmd: `axm version ${args.fqn} patch`,
      },
      {
        description:
          "Re-run with --on-existing verify only when the local archive should be byte-equivalent to the published version.",
      },
    ],
  });

export const nonMonotonicVersionConflict = (args: {
  readonly fqn: string;
  readonly version: Version;
  readonly highestPublished: Version;
}): AppError =>
  makeAppError({
    code: "conflict",
    detail: `Cannot publish: version ${args.version} is lower than the highest published version ${args.highestPublished} for ${args.fqn}.`,
    suggestions: [
      {
        description: "Bump the manifest version.",
        cmd: `axm version ${args.fqn} patch`,
      },
      {
        description:
          "Re-run with --backfill only if publishing an older unpublished version is intentional.",
      },
    ],
  });

export interface PublishIdentity {
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly version: Version;
}
