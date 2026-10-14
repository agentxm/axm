/**
 * Registry endpoints: the one meaning of "which Registry" a location names.
 *
 * A Registry is served either at an HTTP(S) origin or from a directory named
 * by a `file:` URL. Every configured location, `--registry` URL, and endpoint
 * read back from durable state is decoded here, so equal Registries compare
 * equal however they were spelled and an unsupported location is refused
 * before any request, credential, or filesystem work is attempted.
 *
 * This module is pure: it parses and serializes with the WHATWG URL API and
 * never reads settings, credentials, or the disk. Converting a `file:` URL to
 * a native path belongs to the host adapter.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";
import * as SchemaTransformation from "effect/SchemaTransformation";

const RegistryEndpointValueSchema = Schema.Struct({
  transport: Schema.Literals(["http", "file"]),
  href: Schema.String,
}).pipe(Schema.brand("RegistryEndpoint"));

/**
 * A validated Registry endpoint. `href` is the canonical serialization: the
 * origin of an HTTP(S) Registry, or the canonical `file:` URL of a directory
 * Registry. Only {@link RegistryEndpointFromString} and
 * {@link parseRegistryEndpoint} construct one.
 */
export type RegistryEndpoint = typeof RegistryEndpointValueSchema.Type;

/** An endpoint reached over HTTP(S); its `href` is the Registry origin. */
export type HttpRegistryEndpoint = RegistryEndpoint & { readonly transport: "http" };

/** Why a location is not a Registry endpoint. */
export type RegistryEndpointProblem =
  "not-a-url" | "unsupported-scheme" | "credentials" | "query" | "fragment" | "path";

/** A refused location, described without any secret-bearing part of it. */
interface RegistryEndpointRejection {
  readonly problem: RegistryEndpointProblem;
  /**
   * The location with userinfo, query, and fragment removed, or a placeholder
   * when its userinfo cannot be told apart from the rest of it.
   */
  readonly safeInput: string;
  readonly message: string;
}

const brand = Schema.decodeUnknownSync(RegistryEndpointValueSchema);

const UNSHOWABLE_LOCATION = "[REDACTED]";

/**
 * The location as it may be shown: a URL with an authority loses its userinfo,
 * query, and fragment. Anything else is shown only up to a query or fragment
 * marker, and not at all when it carries an `@`: without an authority there
 * is no reliable way to say where its userinfo would end.
 */
const safeRegistryLocation = (input: string): string => {
  if (!URL.canParse(input)) {
    return input.includes("@") ? UNSHOWABLE_LOCATION : input.replace(/[?#].*$/su, "");
  }
  const url = new URL(input);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  const hasAuthority = url.host !== "" || url.protocol === "file:";
  return hasAuthority || !url.href.includes("@") ? url.href : UNSHOWABLE_LOCATION;
};

const problemMessage = (problem: RegistryEndpointProblem, safeInput: string): string => {
  switch (problem) {
    case "not-a-url":
      return `Registry location "${safeInput}" is not an absolute http(s) or file URL.`;
    case "unsupported-scheme":
      return `Registry location "${safeInput}" uses an unsupported scheme; use an http(s) origin or a file URL.`;
    case "credentials":
      return `Registry location "${safeInput}" must not embed credentials.`;
    case "query":
      return `Registry location "${safeInput}" must not include a query.`;
    case "fragment":
      return `Registry location "${safeInput}" must not include a fragment.`;
    case "path":
      return `Registry location "${safeInput}" must be an http(s) origin without a path.`;
  }
};

const reject = (
  problem: RegistryEndpointProblem,
  input: string,
): Result.Result<RegistryEndpoint, RegistryEndpointRejection> => {
  const safeInput = safeRegistryLocation(input);
  return Result.fail({ problem, safeInput, message: problemMessage(problem, safeInput) });
};

// A drive root (`/C:/`) keeps its separator: without it the path names the
// drive's current directory rather than its root. A bare drive (`/C:`) is
// spelled as that root.
const DRIVE_ROOT = /^\/[A-Za-z]:\/$/u;
const BARE_DRIVE = /^\/[A-Za-z]:$/u;

const canonicalFileHref = (url: URL): string => {
  let pathname = BARE_DRIVE.test(url.pathname) ? `${url.pathname}/` : url.pathname;
  while (pathname.length > 1 && pathname.endsWith("/") && !DRIVE_ROOT.test(pathname)) {
    pathname = pathname.slice(0, -1);
  }
  const canonical = new URL(url.href);
  canonical.pathname = pathname;
  return canonical.href;
};

/**
 * Decode a location into its canonical Registry endpoint, or say why it is
 * not one. Canonicalization is idempotent: decoding an endpoint's `href`
 * yields the same endpoint.
 */
export const parseRegistryEndpoint = (
  input: string,
): Result.Result<RegistryEndpoint, RegistryEndpointRejection> => {
  if (!URL.canParse(input)) return reject("not-a-url", input);
  const url = new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "file:") {
    return reject("unsupported-scheme", input);
  }
  if (url.username !== "" || url.password !== "") return reject("credentials", input);
  // An empty `?` or `#` serializes away, but was still written: refuse it too.
  const withoutFragment = input.replace(/#.*$/su, "");
  if (url.search !== "" || withoutFragment.includes("?")) return reject("query", input);
  if (url.hash !== "" || input.includes("#")) return reject("fragment", input);
  if (url.protocol === "file:") {
    return Result.succeed(brand({ transport: "file", href: canonicalFileHref(url) }));
  }
  if (url.pathname !== "/") return reject("path", input);
  return Result.succeed(brand({ transport: "http", href: url.origin }));
};

/** The canonical endpoint a location names; throws on an invalid one. For literals and tests. */
export const decodeRegistryEndpointSync = (input: string): RegistryEndpoint => {
  const result = parseRegistryEndpoint(input);
  if (Result.isFailure(result)) throw new Error(result.failure.message);
  return result.success;
};

/** The canonical HTTP(S) endpoint a location names; throws otherwise. For literals and tests. */
export const decodeHttpRegistryEndpointSync = (input: string): HttpRegistryEndpoint => {
  const endpoint = decodeRegistryEndpointSync(input);
  if (!isHttpRegistryEndpoint(endpoint)) throw new Error(`${input} is not an http(s) Registry.`);
  return endpoint;
};

/**
 * A Registry location string decoded to its canonical endpoint; encoding
 * writes the canonical serialization back as a string.
 */
export const RegistryEndpointFromString = Schema.String.annotate({
  description:
    "Registry location: an http(s) origin or a file URL, without credentials, query, or fragment; a trailing slash is not significant.",
  examples: ["https://registry.agentxm.ai", "file:///srv/registry"],
}).pipe(
  Schema.decodeTo(
    Schema.toType(RegistryEndpointValueSchema),
    SchemaTransformation.transformEffect({
      // The issue carries only the safe message, never the input: a refused
      // location may embed credentials.
      decode: (input: string) => {
        const parsed = parseRegistryEndpoint(input);
        return Result.isSuccess(parsed)
          ? Effect.succeed(parsed.success)
          : Effect.fail(new SchemaIssue.InvalidValue({ message: parsed.failure.message }));
      },
      encode: (endpoint) => Effect.succeed(endpoint.href),
    }),
  ),
);

/** Whether two endpoints name the same Registry. */
export const sameRegistryEndpoint = (left: RegistryEndpoint, right: RegistryEndpoint): boolean =>
  left.transport === right.transport && left.href === right.href;

/** Narrow an endpoint to one reached over HTTP(S). */
export const isHttpRegistryEndpoint = (
  endpoint: RegistryEndpoint,
): endpoint is HttpRegistryEndpoint => endpoint.transport === "http";

/**
 * The URL of an API path beneath an endpoint. Every request to a Registry, and
 * every report of one, is built here so the two always describe the same URL.
 */
export const registryRequestUrl = (endpoint: RegistryEndpoint, apiPath: string): string =>
  `${endpoint.href.replace(/\/$/u, "")}${apiPath.startsWith("/") ? apiPath : `/${apiPath}`}`;
