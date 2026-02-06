import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ParseError } from "../errors.js";
import type { BitbucketSource } from "../types.js";

export const resolveRepo = (args: {
  readonly owner: string;
  readonly repo: string;
  readonly subPath?: string | undefined;
}): Effect.Effect<Option.Option<BitbucketSource>, ParseError> =>
  Effect.tryPromise({
    try: () => fetch(`https://bitbucket.org/${args.owner}/${args.repo}`, { method: "HEAD" }),
    catch: (error) =>
      new ParseError({
        message: `Failed to check Bitbucket: ${error instanceof Error ? error.message : String(error)}`,
        input: `${args.owner}/${args.repo}`,
      }),
  }).pipe(
    Effect.map((response) =>
      response.ok
        ? Option.some({
            source: "bitbucket",
            owner: args.owner,
            repo: args.repo,
            ref: Option.none(),
            subPath: Option.fromNullable(args.subPath),
          } satisfies BitbucketSource)
        : Option.none(),
    ),
  );
