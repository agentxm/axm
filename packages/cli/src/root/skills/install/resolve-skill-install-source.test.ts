import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach } from "vitest";
import type { SourceHostConfig } from "@axm.sh/core/unstable/settings";
import { parseInputPattern, type InputParseResult } from "@axm.sh/core/unstable/sources";
import { Workspace, type WorkspaceContextService } from "@axm.sh/core/unstable/workspace";
import { makeBaseWorkspaceMock } from "../../../test-stubs.js";
import { resolveSkillInstallSource, resolveSkillUrl } from "./resolve-skill-install-source.js";

const makeWorkspace = (sources: ReadonlyArray<SourceHostConfig>): WorkspaceContextService =>
  makeBaseWorkspaceMock("/tmp/test-workspace/.axm", {
    getConfiguredSources: () => Effect.succeed(sources),
    getConfiguredSourceByName: (name: string) =>
      Effect.succeed(Option.fromUndefinedOr(sources.find((s) => s.name === name))),
    getRegistrySourceHosts: () =>
      Effect.succeed(
        sources.filter(
          (s): s is Extract<SourceHostConfig, { type: "registry" }> => s.type === "registry",
        ),
      ),
    getConfiguredProfile: () => Effect.succeed("@test"),
  });

const createSkillIndex = (registryRoot: string, profile: string, name: string) => {
  const skillDir = path.join(registryRoot, "extensions", profile, "skills", name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "index.json"),
    JSON.stringify({
      name,
      profile,
      type: "skill",
      versions: [
        {
          version: "1.0.0",
          published: "2025-01-01T00:00:00Z",
          agents: [],
          integrity: "sha512-AAAA==",
        },
      ],
    }),
  );
};

const makeRegistryCollectionResponse = () =>
  JSON.stringify({
    extensions: [
      {
        profile: "@acme",
        type: "skill",
        name: "my-skill",
        description: null,
        repository: null,
        license: null,
        authors: [],
        dependencies: {},
        version: "1.0.0",
        integrity: "sha512-AAAA==",
      },
    ],
    total: 1,
  });

const remoteHttpLayer = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.sync(() => {
      const url = new URL(request.url);

      if (url.hostname === "localhost") {
        return HttpClientResponse.fromWeb(
          request,
          new Response("registry unavailable", { status: 500 }),
        );
      }

      if (request.method === "HEAD") {
        return HttpClientResponse.fromWeb(request, new Response(null, { status: 200 }));
      }

      if (request.method === "GET" && url.pathname.startsWith("/v1/extensions/@")) {
        return HttpClientResponse.fromWeb(
          request,
          new Response(makeRegistryCollectionResponse(), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }

      return HttpClientResponse.fromWeb(request, new Response("not found", { status: 404 }));
    }),
  ),
);

const provideTestLayers = (sources: ReadonlyArray<SourceHostConfig>) =>
  Layer.mergeAll(NodeServices.layer, Workspace.layer(makeWorkspace(sources)), remoteHttpLayer);

const parseInputOrThrow = (input: string): InputParseResult => {
  const parsed = parseInputPattern(input);
  if (Option.isNone(parsed)) {
    throw new Error(`Expected parseable input: ${input}`);
  }
  return parsed.value;
};

const expectUrlSource = (source: { readonly type: string }): { readonly url: URL } => {
  const url = "url" in source ? source.url : undefined;
  if (!(url instanceof URL)) {
    throw new Error(`Expected hosted source with URL, received ${source.type}`);
  }

  return { url };
};

describe("resolveSkillInstallSource", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it.effect("selects the first registry that contains the requested profile", () => {
    const registryA = fs.mkdtempSync(path.join(os.tmpdir(), "registry-a-"));
    const registryB = fs.mkdtempSync(path.join(os.tmpdir(), "registry-b-"));
    tmpDirs.push(registryA, registryB);

    createSkillIndex(registryB, "@acme", "my-skill");

    const sources: ReadonlyArray<SourceHostConfig> = [
      { name: "first", type: "registry", location: new URL(`file://${registryA}`) },
      { name: "second", type: "registry", location: new URL(`file://${registryB}`) },
    ];

    return Effect.gen(function* () {
      const resolved = yield* resolveSkillInstallSource(
        parseInputOrThrow("@acme/skills/my-skill"),
      ).pipe(Effect.provide(provideTestLayers(sources)));
      expect(resolved.type).toBe("registry");
      expect("location" in resolved).toBe(true);
      if ("location" in resolved) {
        expect(resolved.location.href).toBe(new URL(`file://${registryB}`).href);
      }
    });
  });

  it.effect(
    "skips unsupported registries and resolves a namespaced skill from a later registry",
    () => {
      const registryB = fs.mkdtempSync(path.join(os.tmpdir(), "registry-b-"));
      tmpDirs.push(registryB);

      createSkillIndex(registryB, "@acme", "my-skill");

      const sources: ReadonlyArray<SourceHostConfig> = [
        { name: "remote", type: "registry", location: new URL("http://localhost:4300") },
        { name: "local", type: "registry", location: new URL(`file://${registryB}`) },
      ];

      return Effect.gen(function* () {
        const resolved = yield* resolveSkillInstallSource(
          parseInputOrThrow("@acme/skills/my-skill"),
        ).pipe(Effect.provide(provideTestLayers(sources)));
        expect(resolved.type).toBe("registry");
        expect("location" in resolved).toBe(true);
        if ("location" in resolved) {
          expect(resolved.location.href).toBe(new URL(`file://${registryB}`).href);
        }
      });
    },
  );

  it.effect("reports registry probe outcomes while resolving namespaced skill", () => {
    const registryB = fs.mkdtempSync(path.join(os.tmpdir(), "registry-b-"));
    tmpDirs.push(registryB);

    createSkillIndex(registryB, "@acme", "my-skill");

    const sources: ReadonlyArray<SourceHostConfig> = [
      { name: "remote", type: "registry", location: new URL("http://localhost:4300") },
      { name: "local", type: "registry", location: new URL(`file://${registryB}`) },
    ];

    return Effect.gen(function* () {
      const probes: Array<{
        readonly location: string;
        readonly outcome: "matched" | "not-found" | "error";
      }> = [];

      const resolved = yield* resolveSkillInstallSource(
        parseInputOrThrow("@acme/skills/my-skill"),
        {
          onRegistryProbe: (probe) => {
            probes.push({ location: probe.location, outcome: probe.outcome });
          },
        },
      ).pipe(Effect.provide(provideTestLayers(sources)));

      expect(resolved.type).toBe("registry");
      expect(probes).toHaveLength(2);
      expect(probes[0]).toMatchObject({
        location: "http://localhost:4300/",
        outcome: "error",
      });
      expect(probes[1]).toMatchObject({
        location: new URL(`file://${registryB}`).href,
        outcome: "matched",
      });
    });
  });

  it.effect("supports profile-only input and resolves against a matching registry", () => {
    const registryA = fs.mkdtempSync(path.join(os.tmpdir(), "registry-a-"));
    const registryB = fs.mkdtempSync(path.join(os.tmpdir(), "registry-b-"));
    tmpDirs.push(registryA, registryB);

    createSkillIndex(registryB, "@acme", "my-skill");

    const sources: ReadonlyArray<SourceHostConfig> = [
      { name: "first", type: "registry", location: new URL(`file://${registryA}`) },
      { name: "second", type: "registry", location: new URL(`file://${registryB}`) },
    ];

    return Effect.gen(function* () {
      const resolved = yield* resolveSkillInstallSource(parseInputOrThrow("@acme")).pipe(
        Effect.provide(provideTestLayers(sources)),
      );
      expect(resolved.type).toBe("registry");
      expect("location" in resolved).toBe(true);
      if ("location" in resolved) {
        expect(resolved.location.href).toBe(new URL(`file://${registryB}`).href);
      }
    });
  });

  it.effect("resolves bare skill name using configured default profile", () => {
    const registryA = fs.mkdtempSync(path.join(os.tmpdir(), "registry-a-"));
    const registryB = fs.mkdtempSync(path.join(os.tmpdir(), "registry-b-"));
    tmpDirs.push(registryA, registryB);

    createSkillIndex(registryB, "@test", "some-name");

    const sources: ReadonlyArray<SourceHostConfig> = [
      { name: "first", type: "registry", location: new URL(`file://${registryA}`) },
      { name: "second", type: "registry", location: new URL(`file://${registryB}`) },
    ];

    return Effect.gen(function* () {
      const resolved = yield* resolveSkillInstallSource(parseInputOrThrow("some-name")).pipe(
        Effect.provide(
          Layer.mergeAll(
            NodeServices.layer,
            Workspace.layer({
              ...makeWorkspace(sources),
              getDefaultProfile: () => Effect.succeed(Option.some("@test")),
            }),
          ),
        ),
      );
      expect(resolved.type).toBe("registry");
      expect("location" in resolved).toBe(true);
      if ("location" in resolved) {
        expect(resolved.location.href).toBe(new URL(`file://${registryB}`).href);
      }
    });
  });

  it.effect("fails when no configured registry contains the requested namespaced skill", () => {
    const registryA = fs.mkdtempSync(path.join(os.tmpdir(), "registry-a-"));
    const registryB = fs.mkdtempSync(path.join(os.tmpdir(), "registry-b-"));
    tmpDirs.push(registryA, registryB);

    const sources: ReadonlyArray<SourceHostConfig> = [
      { name: "first", type: "registry", location: new URL(`file://${registryA}`) },
      { name: "second", type: "registry", location: new URL(`file://${registryB}`) },
    ];

    return Effect.gen(function* () {
      const error = yield* resolveSkillInstallSource(
        parseInputOrThrow("@acme/skills/my-skill"),
      ).pipe(Effect.flip, Effect.provide(provideTestLayers(sources)));
      expect(error._tag).toBe("AppError");
      expect(error.code).toBe("REGISTRY_SKILL_NOT_FOUND");
      expect(error.what).toContain("@acme/my-skill");
      expect(error.details.join(" ")).toContain("Checked registries:");
    });
  });
});

describe("resolveSkillInstallSource — local path", () => {
  it.effect("resolves relative path to LocalSource", () => {
    return Effect.gen(function* () {
      const resolved = yield* resolveSkillInstallSource(parseInputOrThrow("./my-skill")).pipe(
        Effect.provide(provideTestLayers([])),
      );
      expect(resolved.type).toBe("local");
      expect("path" in resolved && resolved.path).toBe("./my-skill");
    });
  });

  it.effect("resolves absolute path to LocalSource", () => {
    return Effect.gen(function* () {
      const resolved = yield* resolveSkillInstallSource(
        parseInputOrThrow("/absolute/path/to/skill"),
      ).pipe(Effect.provide(provideTestLayers([])));
      expect(resolved.type).toBe("local");
      expect("path" in resolved && resolved.path).toBe("/absolute/path/to/skill");
    });
  });

  it.effect("resolves parent-relative path to LocalSource", () => {
    return Effect.gen(function* () {
      const resolved = yield* resolveSkillInstallSource(parseInputOrThrow("../parent-skill")).pipe(
        Effect.provide(provideTestLayers([])),
      );
      expect(resolved.type).toBe("local");
      expect("path" in resolved && resolved.path).toBe("../parent-skill");
    });
  });

  it.effect("resolves home-relative path to LocalSource", () => {
    return Effect.gen(function* () {
      const resolved = yield* resolveSkillInstallSource(parseInputOrThrow("~/home-skill")).pipe(
        Effect.provide(provideTestLayers([])),
      );
      expect(resolved.type).toBe("local");
      expect("path" in resolved && resolved.path).toBe("~/home-skill");
    });
  });
});

describe("resolveSkillRegistrySourceByName", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  const provideLayersWithProfile = (
    sources: ReadonlyArray<SourceHostConfig>,
    profile: Option.Option<string>,
  ) =>
    Layer.mergeAll(
      NodeServices.layer,
      Workspace.layer({
        ...makeWorkspace(sources),
        getDefaultProfile: () => Effect.succeed(profile),
      }),
    );

  it.effect("bare name found in first registry returns registry source", () => {
    const registryA = fs.mkdtempSync(path.join(os.tmpdir(), "registry-a-"));
    tmpDirs.push(registryA);

    createSkillIndex(registryA, "@myns", "cool-skill");

    const sources: ReadonlyArray<SourceHostConfig> = [
      { name: "first", type: "registry", location: new URL(`file://${registryA}`) },
    ];

    return Effect.gen(function* () {
      const resolved = yield* resolveSkillInstallSource(parseInputOrThrow("cool-skill")).pipe(
        Effect.provide(provideLayersWithProfile(sources, Option.some("@myns"))),
      );
      expect(resolved.type).toBe("registry");
      expect("location" in resolved).toBe(true);
      if ("location" in resolved) {
        expect(resolved.location.href).toBe(new URL(`file://${registryA}`).href);
      }
    });
  });

  it.effect("bare name found in later registry returns the correct registry source", () => {
    const registryA = fs.mkdtempSync(path.join(os.tmpdir(), "registry-a-"));
    const registryB = fs.mkdtempSync(path.join(os.tmpdir(), "registry-b-"));
    tmpDirs.push(registryA, registryB);

    createSkillIndex(registryB, "@myns", "cool-skill");

    const sources: ReadonlyArray<SourceHostConfig> = [
      { name: "first", type: "registry", location: new URL(`file://${registryA}`) },
      { name: "second", type: "registry", location: new URL(`file://${registryB}`) },
    ];

    return Effect.gen(function* () {
      const resolved = yield* resolveSkillInstallSource(parseInputOrThrow("cool-skill")).pipe(
        Effect.provide(provideLayersWithProfile(sources, Option.some("@myns"))),
      );
      expect(resolved.type).toBe("registry");
      expect("location" in resolved).toBe(true);
      if ("location" in resolved) {
        expect(resolved.location.href).toBe(new URL(`file://${registryB}`).href);
      }
    });
  });

  it.effect(
    "bare name not found in any registry fails with REGISTRY_SKILL_NOT_FOUND including checked list",
    () => {
      const registryA = fs.mkdtempSync(path.join(os.tmpdir(), "registry-a-"));
      const registryB = fs.mkdtempSync(path.join(os.tmpdir(), "registry-b-"));
      tmpDirs.push(registryA, registryB);

      const sources: ReadonlyArray<SourceHostConfig> = [
        { name: "first", type: "registry", location: new URL(`file://${registryA}`) },
        { name: "second", type: "registry", location: new URL(`file://${registryB}`) },
      ];

      return Effect.gen(function* () {
        const error = yield* resolveSkillInstallSource(parseInputOrThrow("missing-skill")).pipe(
          Effect.flip,
          Effect.provide(provideLayersWithProfile(sources, Option.some("@myns"))),
        );
        expect(error._tag).toBe("AppError");
        expect(error.code).toBe("REGISTRY_SKILL_NOT_FOUND");
        expect(error.what).toContain("@myns/missing-skill");
        expect(error.what).toContain("not found");
        const detailsText = error.details.join(" ");
        expect(detailsText).toContain(`file://${registryA}`);
        expect(detailsText).toContain(`file://${registryB}`);
      });
    },
  );

  it.effect(
    "no default profile available fails with REGISTRY_SKILL_NOT_FOUND with no default profile detail",
    () => {
      const sources: ReadonlyArray<SourceHostConfig> = [
        { name: "first", type: "registry", location: new URL("file:///tmp/reg") },
      ];

      return Effect.gen(function* () {
        const error = yield* resolveSkillInstallSource(parseInputOrThrow("some-skill")).pipe(
          Effect.flip,
          Effect.provide(provideLayersWithProfile(sources, Option.none())),
        );
        expect(error._tag).toBe("AppError");
        expect(error.code).toBe("REGISTRY_SKILL_NOT_FOUND");
        expect(error.what).toContain("no default profile");
        const detailsText = error.details.join(" ");
        expect(detailsText).toContain("No default profile configured");
      });
    },
  );

  it.effect(
    "no registry source hosts fails with REGISTRY_SKILL_NOT_FOUND with no registry sources detail",
    () => {
      return Effect.gen(function* () {
        const error = yield* resolveSkillInstallSource(parseInputOrThrow("some-skill")).pipe(
          Effect.flip,
          Effect.provide(provideLayersWithProfile([], Option.some("@myns"))),
        );
        expect(error._tag).toBe("AppError");
        expect(error.code).toBe("REGISTRY_SKILL_NOT_FOUND");
        expect(error.what).toContain("no registry sources");
        const detailsText = error.details.join(" ");
        expect(detailsText).toContain("No registry sources configured");
      });
    },
  );
});

describe("resolveSkillUrl", () => {
  it.effect("resolves GitHub HTTPS URL to GitHubSource", () => {
    const sources: ReadonlyArray<SourceHostConfig> = [
      { name: "github", type: "github", url: new URL("https://github.com") },
      { name: "gitlab", type: "gitlab", url: new URL("https://gitlab.com") },
    ];

    return Effect.gen(function* () {
      const resolved = yield* resolveSkillUrl(
        new URL("https://github.com/vercel-labs/agent-skills"),
        "https://github.com/vercel-labs/agent-skills",
      ).pipe(Effect.provide(provideTestLayers(sources)));

      expect(resolved.type).toBe("github");
      expect("owner" in resolved && resolved.owner).toBe("vercel-labs");
      expect("repo" in resolved && resolved.repo).toBe("agent-skills");
      expect(expectUrlSource(resolved).url.href).toBe("https://github.com/");
    });
  });

  it.effect("resolves GitLab HTTPS URL to GitLabSource", () => {
    const sources: ReadonlyArray<SourceHostConfig> = [
      { name: "github", type: "github", url: new URL("https://github.com") },
      { name: "gitlab", type: "gitlab", url: new URL("https://gitlab.com") },
    ];

    return Effect.gen(function* () {
      const resolved = yield* resolveSkillUrl(
        new URL("https://gitlab.com/team/skills"),
        "https://gitlab.com/team/skills",
      ).pipe(Effect.provide(provideTestLayers(sources)));

      expect(resolved.type).toBe("gitlab");
      expect("owner" in resolved && resolved.owner).toBe("team");
      expect("repo" in resolved && resolved.repo).toBe("skills");
      expect(expectUrlSource(resolved).url.href).toBe("https://gitlab.com/");
    });
  });

  it.effect("resolves custom GitHub Enterprise URL via configured source", () => {
    const sources: ReadonlyArray<SourceHostConfig> = [
      { name: "github", type: "github", url: new URL("https://github.com") },
      { name: "gitlab", type: "gitlab", url: new URL("https://gitlab.com") },
      { name: "ghe", type: "github", url: new URL("https://ghe.corp.com") },
    ];

    return Effect.gen(function* () {
      const resolved = yield* resolveSkillUrl(
        new URL("https://ghe.corp.com/team/repo"),
        "https://ghe.corp.com/team/repo",
      ).pipe(Effect.provide(provideTestLayers(sources)));

      expect(resolved.type).toBe("github");
      expect("owner" in resolved && resolved.owner).toBe("team");
      expect("repo" in resolved && resolved.repo).toBe("repo");
      expect(expectUrlSource(resolved).url.href).toBe("https://ghe.corp.com/");
    });
  });

  it.effect("fails with AppError when no source matches the URL hostname", () => {
    const sources: ReadonlyArray<SourceHostConfig> = [
      { name: "github", type: "github", url: new URL("https://github.com") },
      { name: "gitlab", type: "gitlab", url: new URL("https://gitlab.com") },
    ];

    return Effect.gen(function* () {
      const error = yield* resolveSkillUrl(
        new URL("https://unknown-host.com/owner/repo"),
        "https://unknown-host.com/owner/repo",
      ).pipe(Effect.flip, Effect.provide(provideTestLayers(sources)));

      expect(error._tag).toBe("AppError");
      expect(error.code).toBe("SOURCE_PARSE_FAILED");
    });
  });
});
