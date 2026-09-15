import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { SourceSyntaxInvalid } from "../../errors.js";
import {
  AzureReposSourceParamsSchema,
  type AzureReposSourceParams,
} from "@agentxm/extension-model/unstable/sources/types";

const decode = Schema.decodeUnknownResult(AzureReposSourceParamsSchema);

export const parseShorthand = (input: string) => {
  const colon = input.indexOf(":");
  const body = colon < 0 ? input : input.slice(colon + 1);
  const refIndex = body.lastIndexOf("@");
  const coordinate = refIndex > 0 ? body.slice(0, refIndex) : body;
  const ref = refIndex > 0 ? body.slice(refIndex + 1) : undefined;
  const subPathIndex = coordinate.indexOf("//");
  const repositoryCoordinate = subPathIndex < 0 ? coordinate : coordinate.slice(0, subPathIndex);
  const subPath = subPathIndex < 0 ? undefined : coordinate.slice(subPathIndex + 2);
  const [organization, project, repo, ...extra] = repositoryCoordinate.split("/");

  if (
    organization === undefined ||
    project === undefined ||
    repo === undefined ||
    extra.length > 0 ||
    organization.length === 0 ||
    project.length === 0 ||
    repo.length === 0 ||
    subPath === "" ||
    ref === ""
  ) {
    return Effect.fail(
      new SourceSyntaxInvalid({
        detail: `Invalid Azure Repos shorthand "${input}": expected organization/project/repo[//subpath][@ref]`,
      }),
    );
  }

  const decoded = decode({
    type: "azurerepos",
    organization,
    project,
    repo,
    ...(subPath === undefined ? {} : { subPath }),
    ...(ref === undefined ? {} : { ref }),
  });
  return Result.isSuccess(decoded)
    ? Effect.succeed(decoded.success satisfies AzureReposSourceParams)
    : Effect.fail(
        new SourceSyntaxInvalid({
          detail: `Invalid Azure Repos shorthand "${input}"`,
          cause: decoded.failure,
        }),
      );
};
