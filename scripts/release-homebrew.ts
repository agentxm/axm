import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import type * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import type * as Redacted from "effect/Redacted";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import { publicationHttpError } from "./release-publication.js";

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
