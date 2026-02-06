import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { parseProviderShorthand } from "../parse-provider-shorthand.js";
import type { GitHubSource } from "../types.js";

export const printShorthand = (source: GitHubSource) => `github:${source.owner}/${source.repo}`;

export const shorthandPrefix = "github" as const;

export const parseShorthand = (input: string) =>
  Effect.gen(function* () {
    const body = input.slice("github:".length);
    const parts = yield* parseProviderShorthand(body, input);
    return {
      source: "github",
      owner: parts.owner,
      repo: parts.repo,
      ref: Option.fromNullable(parts.ref),
      subPath: Option.fromNullable(parts.subPath),
    } satisfies GitHubSource;
  });
