import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { fc as FastCheck, it as fastCheckIt } from "@fast-check/vitest";

import {
  parseRegistryEndpoint,
  RegistryEndpointFromString,
  sameRegistryEndpoint,
  type RegistryEndpointProblem,
} from "./registry-endpoint.js";

import { defineSpecification } from "@agentxm/specification-metadata";

export const specification = defineSpecification({
  requirement: "extension-identity/registry-endpoints-have-one-meaning",
  title: "A Registry location names one Registry however it is spelled",
  statement:
    "A Registry location shall be accepted only as an http(s) origin or a file URL without credentials, query, or fragment, and two accepted locations shall name the same Registry exactly when their scheme, normalized host, and effective port (or canonical file directory) agree, while any other location shall be rejected without echoing its secret-bearing parts.",
  class: "functional",
  role: "interface",
  goals: ["trustworthy-distribution", "actionable-diagnostics"],
  methods: ["property", "example"],
  derivedFrom: ["cli/settings-select-default-registry", "cli/credentials-stay-with-their-registry"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const decode = (input: string) => {
  const result = parseRegistryEndpoint(input);
  if (Result.isFailure(result)) throw new Error(result.failure.message);
  return result.success;
};

const problemOf = (input: string): RegistryEndpointProblem | undefined => {
  const result = parseRegistryEndpoint(input);
  return Result.isFailure(result) ? result.failure.problem : undefined;
};

const hostArbitrary = FastCheck.stringMatching(/^[a-z][a-z0-9-]{0,10}\.[a-z]{2,5}$/);

describe("Registry endpoints", () => {
  it("serializes an http(s) Registry as its origin", () => {
    expect(decode("https://Registry.Example.COM/").href).toBe("https://registry.example.com");
    expect(decode("https://registry.example.com:443").href).toBe("https://registry.example.com");
    expect(decode("http://localhost:8787/").href).toBe("http://localhost:8787");
    expect(decode("https://registry.example.com").transport).toBe("http");
  });

  it("distinguishes scheme, host, and port", () => {
    const base = decode("https://registry.example.com");
    expect(sameRegistryEndpoint(base, decode("http://registry.example.com"))).toBe(false);
    expect(sameRegistryEndpoint(base, decode("https://other.example.com"))).toBe(false);
    expect(sameRegistryEndpoint(base, decode("https://registry.example.com:8443"))).toBe(false);
    expect(sameRegistryEndpoint(base, decode("https://REGISTRY.example.com/"))).toBe(true);
  });

  it("treats a file directory's trailing separators as insignificant and keeps its root", () => {
    expect(decode("file:///srv/registry/").href).toBe("file:///srv/registry");
    expect(decode("file:///srv/registry//").href).toBe("file:///srv/registry");
    expect(decode("file:///srv/Registry").href).toBe("file:///srv/Registry");
    expect(decode("file:///srv/my%20registry/").href).toBe("file:///srv/my%20registry");
    expect(decode("file:///").href).toBe("file:///");
    expect(decode("file:///C:/").href).toBe("file:///C:/");
    expect(decode("file:///C:").href).toBe("file:///C:/");
    expect(sameRegistryEndpoint(decode("file:///C:"), decode("file:///C://"))).toBe(true);
    expect(decode("file:///srv/registry").transport).toBe("file");
  });

  it("rejects locations that are not a supported Registry endpoint", () => {
    expect(problemOf("registry.example.com")).toBe("not-a-url");
    expect(problemOf("/srv/registry")).toBe("not-a-url");
    expect(problemOf("C:/reg")).toBe("unsupported-scheme");
    expect(problemOf("ftp://registry.example.com")).toBe("unsupported-scheme");
    expect(problemOf("https://user:secret@registry.example.com")).toBe("credentials");
    expect(problemOf("https://registry.example.com/?token=secret")).toBe("query");
    expect(problemOf("https://registry.example.com/?")).toBe("query");
    expect(problemOf("https://registry.example.com/#secret")).toBe("fragment");
    expect(problemOf("file:///srv/registry?x=1")).toBe("query");
    expect(problemOf("https://registry.example.com/axm")).toBe("path");
    expect(problemOf("https://registry.example.com/axm/")).toBe("path");
  });

  it("never echoes credentials, a query, or a fragment in a rejection", () => {
    for (const input of [
      "https://user:hunter2@registry.example.com",
      "https://registry.example.com/?token=hunter2",
      "https://registry.example.com/#hunter2",
      "https://user:hunter2@registry.example.com/axm?token=hunter2",
      "https://user:hunter2@registry.example.com:abc",
      "//user:hunter2@registry.example.com",
      "user:hunter2@registry.example.com",
    ]) {
      const result = parseRegistryEndpoint(input);
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure.message).not.toContain("hunter2");
        expect(result.failure.safeInput).not.toContain("hunter2");
      }
      const decoded = Schema.decodeUnknownResult(RegistryEndpointFromString)(input);
      expect(String(Result.isFailure(decoded) ? decoded.failure : "")).not.toContain("hunter2");
    }
  });

  fastCheckIt.prop([
    FastCheck.constantFrom("http", "https", "HTTPS"),
    hostArbitrary,
    FastCheck.option(FastCheck.integer({ min: 1, max: 65535 }), { nil: undefined }),
    FastCheck.boolean(),
  ])("canonicalization is idempotent", (scheme, host, port, trailingSlash) => {
    const input = `${scheme}://${host}${port === undefined ? "" : `:${port}`}${trailingSlash ? "/" : ""}`;
    const once = decode(input);
    const twice = decode(once.href);
    expect(twice).toEqual(once);
    expect(Schema.encodeSync(RegistryEndpointFromString)(once)).toBe(once.href);
  });

  fastCheckIt.prop([
    FastCheck.array(FastCheck.stringMatching(/^[A-Za-z0-9 ._-]{1,8}$/), {
      minLength: 1,
      maxLength: 4,
    }),
    FastCheck.integer({ min: 0, max: 3 }),
  ])("file endpoints ignore trailing separators and nothing else", (segments, slashes) => {
    const url = new URL("file:///");
    url.pathname = `/${segments.join("/")}`;
    const canonical = decode(url.href);
    expect(decode(`${url.href}${"/".repeat(slashes)}`)).toEqual(canonical);
    expect(decode(canonical.href)).toEqual(canonical);
  });
});
