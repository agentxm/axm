import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";

import { makeAppError, type AppError } from "../../../app-error/index.js";
import type { BitbucketSourceParams } from "@agentxm/extension-model/unstable/sources/types";

const headRequest = (url: string, _input: string) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    return yield* client.execute(HttpClientRequest.head(url)).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "validation",
          detail: `Failed to check Bitbucket: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        }),
      ),
    );
  });

export const resolveRepo = (args: {
  readonly owner: string;
  readonly repo: string;
  readonly subPath: Option.Option<string>;
}): Effect.Effect<Option.Option<BitbucketSourceParams>, AppError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const repoUrl = `https://bitbucket.org/${args.owner}/${args.repo}`;
    const repoResponse = yield* headRequest(repoUrl, `${args.owner}/${args.repo}`);
    if (repoResponse.status !== 200) return Option.none();

    if (Option.isSome(args.subPath)) {
      const subPathUrl = `${repoUrl}/src/HEAD/${args.subPath.value}`;
      const subPathResponse = yield* headRequest(
        subPathUrl,
        `${args.owner}/${args.repo}/${args.subPath.value}`,
      );
      if (subPathResponse.status !== 200) return Option.none();
    }

    return Option.some({
      type: "bitbucket",
      owner: args.owner,
      repo: args.repo,
      ref: Option.none(),
      subPath: args.subPath,
    } satisfies BitbucketSourceParams);
  });
