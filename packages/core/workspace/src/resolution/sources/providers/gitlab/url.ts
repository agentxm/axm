import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { SourceSyntaxInvalid } from "../../errors.js";
import {
  GitLabSourceParamsSchema,
  type GitLabSourceParams,
} from "@agentxm/extension-model/unstable/sources/types";
import { refFromUrlHash } from "../../url-fragment.js";

export const CANONICAL_HOSTNAME = "gitlab.com";

const decodeGitLabSourceParams = Schema.decodeUnknownResult(GitLabSourceParamsSchema);

export const parseUrl = (url: URL, hostname: string = CANONICAL_HOSTNAME) => {
  if (url.hostname !== hostname) {
    return Effect.fail(
      new SourceSyntaxInvalid({
        detail: "Invalid GitLab URL format",
      }),
    );
  }
  const treeMarker = "/-/tree/";
  const treeIndex = url.pathname.indexOf(treeMarker);
  const repositoryPath = (treeIndex < 0 ? url.pathname : url.pathname.slice(0, treeIndex))
    .split("/")
    .filter((segment) => segment.length > 0);
  const rawRepo = repositoryPath.at(-1);
  const ownerSegments = repositoryPath.slice(0, -1);
  if (rawRepo === undefined || ownerSegments.length === 0) {
    return Effect.fail(
      new SourceSyntaxInvalid({
        detail: "Invalid GitLab URL format",
      }),
    );
  }
  const treePath =
    treeIndex < 0 ? [] : url.pathname.slice(treeIndex + treeMarker.length).split("/");
  const treeRef = treePath.at(0);
  const subPath = treePath.slice(1).join("/");
  const fragmentRef = Option.getOrUndefined(refFromUrlHash(url));
  const decoded = decodeGitLabSourceParams({
    type: "gitlab",
    owner: ownerSegments.join("/"),
    repo: rawRepo.endsWith(".git") ? rawRepo.slice(0, -4) : rawRepo,
    ...(treeRef === undefined
      ? fragmentRef === undefined
        ? {}
        : { ref: fragmentRef }
      : { ref: treeRef }),
    ...(subPath.length === 0 ? {} : { subPath }),
  });
  return Result.isSuccess(decoded)
    ? Effect.succeed(decoded.success satisfies GitLabSourceParams)
    : Effect.fail(
        new SourceSyntaxInvalid({
          detail: "Invalid GitLab URL format",
        }),
      );
};
