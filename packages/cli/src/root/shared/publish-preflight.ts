import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import type {
  ExtensionName,
  ExtensionType,
  Handle,
} from "@agentxm/client-core/unstable/extensions";
import type { Version } from "@agentxm/client-core/unstable/version-constraints";

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
        description: "Re-run with --on-existing skip to skip already-published versions.",
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
          "Re-run with --allow-older only if publishing an older unpublished version is intentional.",
      },
    ],
  });

export interface PublishIdentity {
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly version: Version;
}
