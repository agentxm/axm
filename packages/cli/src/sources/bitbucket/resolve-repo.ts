import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ParseError } from "../errors.js";
import type { BitbucketSource } from "../types.js";

const headRequest = (url: string, input: string) =>
  Effect.tryPromise({
    try: () => fetch(url, { method: "HEAD" }),
    catch: (error) =>
      new ParseError({
        message: `Failed to check Bitbucket: ${error instanceof Error ? error.message : String(error)}`,
        input,
      }),
  });

export const resolveRepo = (args: {
  readonly owner: string;
  readonly repo: string;
  readonly subPath: Option.Option<string>;
}): Effect.Effect<Option.Option<BitbucketSource>, ParseError> =>
  Effect.gen(function* () {
    const repoUrl = `https://bitbucket.org/${args.owner}/${args.repo}`;
    const repoResponse = yield* headRequest(repoUrl, `${args.owner}/${args.repo}`);
    if (!repoResponse.ok) return Option.none();

    if (Option.isSome(args.subPath)) {
      const subPathUrl = `${repoUrl}/src/HEAD/${args.subPath.value}`;
      const subPathResponse = yield* headRequest(
        subPathUrl,
        `${args.owner}/${args.repo}/${args.subPath.value}`,
      );
      if (!subPathResponse.ok) return Option.none();
    }

    return Option.some({
      source: "bitbucket",
      owner: args.owner,
      repo: args.repo,
      ref: Option.none(),
      subPath: args.subPath,
    } satisfies BitbucketSource);
  });
