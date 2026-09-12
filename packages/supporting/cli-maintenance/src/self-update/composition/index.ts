import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";
import { CliReleaseCatalog } from "../application/index.js";
import { makeCliReleaseCatalog } from "../adapters/releases/index.js";

/** Bind release selection to the public stable channel and immutable GitHub releases. */
export const CliReleaseCatalogLive = Layer.effect(
  CliReleaseCatalog,
  Effect.map(HttpClient.HttpClient, makeCliReleaseCatalog),
);
