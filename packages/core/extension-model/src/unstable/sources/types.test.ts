import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import {
  RefTypeSchema,
  SourceNamespaceSchema,
  SourceSubPathSchema,
  SourceTypeSchema,
  type ConfiguredSourceHost,
  type GitSource,
  type RegistrySourceHost,
  type SelfDescribingSourceHost,
  type Source,
  type SourceParams,
} from "./types.js";

describe("source types", () => {
  it("defines only the source families that survive input expansion", () => {
    const decode = Schema.decodeUnknownSync(SourceTypeSchema);
    expect(
      ["git", "registry", "local", "inline", "workspace"].map((value) => decode(value)),
    ).toEqual(["git", "registry", "local", "inline", "workspace"]);
    for (const provider of ["github", "gitlab", "bitbucket", "azurerepos"]) {
      expect(() => decode(provider)).toThrow();
    }
  });

  it("keeps ref families independent of provider syntax", () => {
    const decode = Schema.decodeUnknownSync(RefTypeSchema);
    expect(
      ["git-hosted", "registry", "local", "workspace"].map((value) => decode(value)),
    ).toHaveLength(4);
  });

  it("models Git as a self-describing URL, revision, and repository subpath", () => {
    const source: GitSource = {
      type: "git",
      url: new URL("https://git.example/acme/tools.git"),
      ref: Option.some("release"),
      subPath: Option.some("skills/review"),
    };
    const narrowed: Source = source;
    expect(narrowed.type).toBe("git");
    if (narrowed.type === "git") {
      expect(narrowed.url.href).toBe("https://git.example/acme/tools.git");
      expect(Option.getOrNull(narrowed.ref)).toBe("release");
      expect(Option.getOrNull(narrowed.subPath)).toBe("skills/review");
    }
  });

  it("keeps only registries in configured source hosts", () => {
    const host: ConfiguredSourceHost = {
      type: "registry",
      name: "company",
      location: new URL("https://registry.example"),
    } satisfies RegistrySourceHost;
    expect(host.type).toBe("registry");
  });

  it("identifies Git and local sources as self-describing", () => {
    const hosts: ReadonlyArray<SelfDescribingSourceHost> = [{ type: "git" }, { type: "local" }];
    expect(hosts.map((host) => host.type)).toEqual(["git", "local"]);
  });

  it("narrows every source-param family", () => {
    const params: ReadonlyArray<SourceParams> = [
      {
        type: "git",
        url: new URL("ssh://git@example.com/acme/tools.git"),
        ref: Option.none(),
        subPath: Option.none(),
      },
      { type: "local", path: "./skills/review" },
      { type: "registry", owner: Option.none() },
      {
        type: "inline",
        command: Option.some("server"),
        args: [],
        url: Option.none(),
        headers: {},
      },
    ];
    expect(params.map((param) => param.type)).toEqual(["git", "local", "registry", "inline"]);
  });

  it("accepts subgroup namespaces and safe subpaths", () => {
    expect(Schema.decodeUnknownSync(SourceNamespaceSchema)("group/subgroup")).toBe(
      "group/subgroup",
    );
    expect(Schema.decodeUnknownSync(SourceSubPathSchema)("skills/review")).toBe("skills/review");
  });

  it("rejects namespace and subpath traversal", () => {
    expect(() => Schema.decodeUnknownSync(SourceNamespaceSchema)("group/../repo")).toThrow();
    expect(() => Schema.decodeUnknownSync(SourceSubPathSchema)("skills/../secret")).toThrow();
  });
});
