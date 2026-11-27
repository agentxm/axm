import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import type * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Redacted from "effect/Redacted";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import type * as ChildProcess from "effect/process/ChildProcess";
import { foreignGitEnvironment } from "./release-foreign-git.js";
import { formulaVersion } from "./release-formula.js";
import { runReleaseCommand } from "./release-process.js";
import {
  guardPublicationVersion,
  publicationHttpError,
  releaseBoundaryError,
} from "./release-publication.js";

export const HOMEBREW_TAP_REMOTE = "https://github.com/agentxm/homebrew-tap.git";
const FORMULA_PATH = "Formula/axm.rb";

export const loadHomebrewPublicationToken = (provider: ConfigProvider.ConfigProvider) =>
  Config.Redacted("HOMEBREW_TAP_TOKEN").parse(provider);

export const readHomebrewFormula = (token: Redacted.Redacted<string>) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.get(
        "https://api.github.com/repos/agentxm/homebrew-tap/contents/Formula/axm.rb?ref=main",
      ).pipe(
        HttpClientRequest.bearerToken(token),
        HttpClientRequest.setHeaders({
          Accept: "application/vnd.github.raw+json",
          "Cache-Control": "no-cache",
          "X-GitHub-Api-Version": "2026-03-10",
        }),
      ),
    );
    if (response.status !== 200) {
      const now = yield* Clock.currentTimeMillis;
      return yield* Effect.fail(
        publicationHttpError("Homebrew formula query failed", response, now),
      );
    }
    return yield* response.text;
  }).pipe(Effect.timeout(30_000));

/** Foreign tap Git state plus a command-scoped push credential that never reaches Git config. */
export const homebrewTapPushEnvironment = (token: Redacted.Redacted<string>) => ({
  ...foreignGitEnvironment(),
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
  GIT_CONFIG_VALUE_0: Redacted.make(
    `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${Redacted.value(token)}`).toString("base64")}`,
  ),
});

/**
 * Commit a formula prepared against `basis` to a fresh tap clone and push it
 * once. A tap that moved after preparation, or a rejected push, fails without a
 * retry or force so concurrent remote state is never replaced.
 */
export const submitHomebrewFormula = Effect.fnUntraced(function* (input: {
  readonly tap: string;
  readonly version: string;
  readonly basis: string;
  readonly content: string;
  readonly env: ChildProcess.CommandOptions["env"];
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const formulaPath = path.join(input.tap, FORMULA_PATH);
  const cloned = yield* fs.readFileString(formulaPath);
  yield* Effect.try({
    try: () => {
      guardPublicationVersion(input.version, formulaVersion(cloned), "Homebrew");
      if (cloned !== input.basis)
        throw new Error("Homebrew tap changed concurrently; rerun publication preflight.");
    },
    catch: releaseBoundaryError,
  });
  yield* fs.writeFileString(formulaPath, input.content);
  const git = (args: readonly string[]) =>
    runReleaseCommand("git", args, { cwd: input.tap, env: input.env });
  yield* git(["add", FORMULA_PATH]);
  yield* git([
    "-c",
    "user.name=github-actions[bot]",
    "-c",
    "user.email=41898282+github-actions[bot]@users.noreply.github.com",
    "commit",
    "-m",
    `axm ${input.version}`,
  ]);
  yield* git(["push", "origin", "HEAD:main"]);
});
