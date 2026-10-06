import * as Config from "effect/Config";
import type * as ConfigProvider from "effect/ConfigProvider";
import * as Redacted from "effect/Redacted";
import { publicationHttpError } from "./release-publication.js";

export const loadHomebrewPublicationToken = (provider: ConfigProvider.ConfigProvider) =>
  Config.Redacted("HOMEBREW_TAP_TOKEN").parse(provider);

/** Thin fetch boundary shared by publication preflight and formula readback. */
export const readHomebrewFormula = async (
  token: Redacted.Redacted<string>,
  signal?: AbortSignal,
  fetchImplementation: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<string> => {
  const requestSignal =
    signal === undefined
      ? AbortSignal.timeout(30_000)
      : AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
  const response = await fetchImplementation(
    "https://api.github.com/repos/agentxm/homebrew-tap/contents/Formula/axm.rb?ref=main",
    {
      headers: {
        Accept: "application/vnd.github.raw+json",
        Authorization: `Bearer ${Redacted.value(token)}`,
        "Cache-Control": "no-cache",
        "X-GitHub-Api-Version": "2026-03-10",
      },
      cache: "no-store",
      redirect: "error",
      signal: requestSignal,
    },
  );
  if (response.status !== 200)
    throw publicationHttpError("Homebrew formula query failed", response);
  return response.text();
};
