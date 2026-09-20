import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";
import { CliReleaseCatalog, LatestReleaseCheck } from "../application/index.js";
import { makeCliReleaseCatalog } from "../adapters/releases/index.js";
import { makeLatestReleaseCheck } from "../adapters/latest-release-check/index.js";

/** Bind release selection to GitHub's latest and immutable releases. */
export const CliReleaseCatalogLive = Layer.effect(
  CliReleaseCatalog,
  Effect.map(HttpClient.HttpClient, makeCliReleaseCatalog),
);

export const LatestReleaseCheckLive = Layer.effect(
  LatestReleaseCheck,
  Effect.map(HttpClient.HttpClient, makeLatestReleaseCheck),
);
