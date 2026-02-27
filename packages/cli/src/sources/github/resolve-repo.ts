// TODO: (#52) Uses raw fetch instead of @effect/platform HttpClient. Should be wrapped
// with HttpClient and unit-tested with mock HTTP layer. Out of scope for code review sweep.
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { makeCliError, type CliError } from "../../cli-error/index.js";
import type { GitHubSourceParams } from "../types.js";

const headRequest = (url: string, input: string) =>
  Effect.tryPromise({
    try: () => fetch(url, { method: "HEAD" }),
    catch: (error) =>
      makeCliError({
        code: "SOURCE_PARSE_FAILED",
        what: `Failed to check GitHub: ${error instanceof Error ? error.message : String(error)}`,
        details: [input],
      }),
  });

export const resolveRepo = (args: {
  readonly owner: string;
  readonly repo: string;
  readonly subPath: Option.Option<string>;
}): Effect.Effect<Option.Option<GitHubSourceParams>, CliError> =>
  Effect.gen(function* () {
    const repoUrl = `https://github.com/${args.owner}/${args.repo}`;
    const repoResponse = yield* headRequest(repoUrl, `${args.owner}/${args.repo}`);
    if (!repoResponse.ok) return Option.none();

    if (Option.isSome(args.subPath)) {
      const subPathUrl = `${repoUrl}/tree/HEAD/${args.subPath.value}`;
      const subPathResponse = yield* headRequest(
        subPathUrl,
        `${args.owner}/${args.repo}/${args.subPath.value}`,
      );
      if (!subPathResponse.ok) return Option.none();
    }

    return Option.some({
      type: "github",
      owner: args.owner,
      repo: args.repo,
      ref: Option.none(),
      subPath: args.subPath,
    } satisfies GitHubSourceParams);
  });
