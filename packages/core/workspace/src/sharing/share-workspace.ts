/** Read-only repository sharing output for one authored AXM workspace. */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import YAML from "yaml";

import {
  ExtensionTypeSchema,
  extensionTypes,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { WorkspaceLocation } from "../desired-state/index.js";
import {
  discoverExtensionPackages,
  findGitRoot,
  getExactTag,
  getRemoteUrl,
  listRemoteRefs,
} from "../resolution/sources/index.js";
import {
  credentialFreeLocatorRecoveryValue,
  publicRecoveryValue,
  recoveryOption,
  recoveryPositional,
  renderConfirmationRecoveryCommand,
} from "../transitions/planning/index.js";

export class ShareFailed extends Schema.TaggedError<ShareFailed>()("ShareFailed", {
  category: Schema.Literal("validation"),
  detail: Schema.String,
}) {}

export const SharedExtensionSchema = Schema.Struct({
  type: ExtensionTypeSchema,
  name: Schema.String,
});

export const packageMetadataEcosystems = [
  "bazel",
  "cargo",
  "cocoapods",
  "composer",
  "conan",
  "conda",
  "cpan",
  "cran",
  "docker",
  "gem",
  "golang",
  "hackage",
  "hex",
  "huggingface",
  "jsr",
  "julia",
  "luarocks",
  "maven",
  "mojo",
  "npm",
  "nuget",
  "opam",
  "pub",
  "pypi",
  "swift",
  "zig",
] as const;

export const PackageMetadataEcosystemSchema = Schema.Literals(packageMetadataEcosystems);
export type PackageMetadataEcosystem = typeof PackageMetadataEcosystemSchema.Type;

export const SharedPackageMetadataSchema = Schema.Struct({
  ecosystem: PackageMetadataEcosystemSchema,
  location: Schema.String,
  tag: Schema.String,
  content: Schema.String,
});

export const ShareWorkspaceDocumentSchema = Schema.Struct({
  command: Schema.Literal("share"),
  origin: Schema.String,
  locator: Schema.String,
  availability: Schema.Union([Schema.Literal("available"), Schema.Literal("unavailable")]),
  extensions: Schema.Array(SharedExtensionSchema),
  installCommand: Schema.String,
  packageMetadata: Schema.optional(SharedPackageMetadataSchema),
});

export type SharedExtension = typeof SharedExtensionSchema.Type;
export type ShareWorkspaceDocument = typeof ShareWorkspaceDocumentSchema.Type;

interface RecommendationEntry {
  readonly ref: string;
  readonly source: {
    readonly type: "git";
    readonly url: string;
    readonly path?: string;
    readonly revision: string;
  };
}

const sidecarLocations: Partial<Record<PackageMetadataEcosystem, string>> = {
  bazel: "agent-extensions.json in the package runfiles",
  cocoapods: "agent-extensions.json at the pod root",
  conda: "share/agent-extensions/<package>/agent-extensions.json",
  golang: "agent-extensions.json at the module root",
  hex: "agent-extensions.json at the package root",
  luarocks: "agent-extensions.json at the rock root",
  maven: "src/main/resources/META-INF/agent-extensions.json",
  mojo: "agent-extensions.json at the package root",
  nuget: "agent-extensions.json at the package root",
  pypi: "agent-extensions.json package data via the [agentExtensions] entry-point group",
  swift: "agent-extensions.json at the package root",
  zig: "agent-extensions.json at the package root",
};

const tomlString = (value: string): string => JSON.stringify(value);

const tomlEntry = (entry: RecommendationEntry): string => {
  const source = [
    'type = "git"',
    `url = ${tomlString(entry.source.url)}`,
    ...(entry.source.path === undefined ? [] : [`path = ${tomlString(entry.source.path)}`]),
    `revision = ${tomlString(entry.source.revision)}`,
  ].join(", ");
  return `{ ref = ${tomlString(entry.ref)}, source = { ${source} } }`;
};

const renderPackageMetadata = (
  ecosystem: PackageMetadataEcosystem,
  entries: ReadonlyArray<RecommendationEntry>,
  tag: string,
): {
  readonly ecosystem: PackageMetadataEcosystem;
  readonly location: string;
  readonly tag: string;
  readonly content: string;
} => {
  const sidecarLocation = sidecarLocations[ecosystem];
  if (sidecarLocation !== undefined) {
    return {
      ecosystem,
      location: sidecarLocation,
      tag,
      content: `${JSON.stringify({ agentExtensions: entries }, undefined, 2)}\n`,
    };
  }

  const compactEntries = JSON.stringify(entries);
  switch (ecosystem) {
    case "npm":
    case "jsr":
      return {
        ecosystem,
        location: ecosystem === "npm" ? "package.json" : "deno.json",
        tag,
        content: `${JSON.stringify({ agentExtensions: entries }, undefined, 2)}\n`,
      };
    case "composer":
      return {
        ecosystem,
        location: "composer.json extra.agentExtensions",
        tag,
        content: `${JSON.stringify({ extra: { agentExtensions: entries } }, undefined, 2)}\n`,
      };
    case "cargo":
      return {
        ecosystem,
        location: "Cargo.toml package.metadata.agentExtensions",
        tag,
        content: `[package.metadata]\nagentExtensions = [${entries.map(tomlEntry).join(", ")}]\n`,
      };
    case "julia":
      return {
        ecosystem,
        location: "Project.toml agentExtensions",
        tag,
        content: `agentExtensions = [${entries.map(tomlEntry).join(", ")}]\n`,
      };
    case "conan":
    case "pub":
    case "huggingface":
      return {
        ecosystem,
        location:
          ecosystem === "conan"
            ? "conandata.yml"
            : ecosystem === "pub"
              ? "pubspec.yaml"
              : "model-card YAML frontmatter",
        tag,
        content: YAML.stringify({ agentExtensions: entries }),
      };
    case "cpan":
      return {
        ecosystem,
        location: "META.json x_agent_extensions",
        tag,
        content: `${JSON.stringify({ x_agent_extensions: entries }, undefined, 2)}\n`,
      };
    case "cran":
      return {
        ecosystem,
        location: "DESCRIPTION Config/agentExtensions",
        tag,
        content: `Config/agentExtensions: ${compactEntries}\n`,
      };
    case "gem":
      return {
        ecosystem,
        location: 'gemspec spec.metadata["agent_extensions"]',
        tag,
        content: `spec.metadata["agent_extensions"] = ${JSON.stringify(compactEntries)}\n`,
      };
    case "hackage":
    case "opam":
      return {
        ecosystem,
        location:
          ecosystem === "hackage" ? ".cabal x-agent-extensions" : ".opam x-agent-extensions",
        tag,
        content: `x-agent-extensions: ${compactEntries}\n`,
      };
    case "docker":
      return {
        ecosystem,
        location: "Docker image label org.agentextensions.recommendations",
        tag,
        content: `LABEL org.agentextensions.recommendations=${JSON.stringify(compactEntries)}\n`,
      };
    default:
      throw new Error(`Missing package metadata renderer for ${ecosystem}`);
  }
};

const selectorFlag: Readonly<Record<InstallableExtensionType, string>> = {
  skill: "--skill",
  "mcp-server": "--mcp",
  subagent: "--subagent",
  rule: "--rule",
  hook: "--hook",
  knowledge: "--knowledge",
  pack: "--pack",
};

const sourceLocator = (
  origin: string,
  repositoryRoot: string,
  workspaceRoot: string,
  path: Path.Path,
): string => {
  const relative = path.relative(repositoryRoot, workspaceRoot);
  if (relative.length === 0) return origin;
  const posixRelative = path.sep === "/" ? relative : relative.split(path.sep).join("/");
  return `${origin.replace(/\/+$/u, "")}//${posixRelative}`;
};

export const ShareWorkspace = {
  query: Effect.fn("ShareWorkspace.query")(function* (options?: {
    readonly ecosystem?: PackageMetadataEcosystem;
  }) {
    const location = yield* WorkspaceLocation;
    const path = yield* Path.Path;
    const repositoryRoot = yield* findGitRoot(location.baseDir).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.fail(
              new ShareFailed({
                category: "validation",
                detail: "Cannot share this workspace because it is not inside a Git repository.",
              }),
            ),
          onSome: Effect.succeed,
        }),
      ),
    );
    const origin = yield* getRemoteUrl(repositoryRoot, "origin").pipe(
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.fail(
              new ShareFailed({
                category: "validation",
                detail:
                  "Cannot share this workspace because its Git repository has no origin remote.",
              }),
            ),
          onSome: Effect.succeed,
        }),
      ),
    );

    const discovered = yield* discoverExtensionPackages(location.baseDir, {
      names: [],
      owner: Option.none(),
      type: "*",
    });
    const extensions = discovered.map((candidate): SharedExtension => {
      const type = candidate.kind === "manifest" ? candidate.identity.type : "skill";
      const name = candidate.kind === "manifest" ? candidate.identity.name : candidate.name;
      return { type, name };
    });
    extensions.sort((left, right) => {
      const typeOrder = extensionTypes.indexOf(left.type) - extensionTypes.indexOf(right.type);
      return typeOrder === 0 ? left.name.localeCompare(right.name) : typeOrder;
    });
    if (extensions.length === 0) {
      return yield* new ShareFailed({
        category: "validation",
        detail: "This workspace has no distributable authored extensions to share.",
      });
    }

    const locator = sourceLocator(origin, repositoryRoot, location.baseDir, path);
    const installCommand = renderConfirmationRecoveryCommand(
      {
        command: ["install"],
        arguments: [
          ...extensions.map((extension) =>
            recoveryOption(selectorFlag[extension.type], publicRecoveryValue(extension.name)),
          ),
          recoveryPositional(credentialFreeLocatorRecoveryValue(locator)),
        ],
      },
      { approval: "none" },
    );
    if (installCommand === undefined) {
      return yield* new ShareFailed({
        category: "validation",
        detail:
          "Cannot print a share command because the origin URL contains protected credential material.",
      });
    }
    const availability = yield* listRemoteRefs(origin).pipe(
      Effect.as("available" as const),
      Effect.catch(() => Effect.succeed("unavailable" as const)),
    );
    let packageMetadata: ShareWorkspaceDocument["packageMetadata"];
    if (options?.ecosystem !== undefined) {
      const tag = yield* getExactTag(repositoryRoot).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () =>
              Effect.fail(
                new ShareFailed({
                  category: "validation",
                  detail: "Package metadata requires the checkout to have exactly one tag at HEAD.",
                }),
              ),
            onSome: Effect.succeed,
          }),
        ),
      );
      const relative = path.relative(repositoryRoot, location.baseDir);
      const recommendationEntries = discovered.flatMap(
        (candidate): ReadonlyArray<RecommendationEntry> => {
          if (candidate.kind !== "manifest") return [];
          return [
            {
              ref: `${candidate.identity.owner}/${toExtensionTypePlural(candidate.identity.type)}/${candidate.identity.name}`,
              source: {
                type: "git",
                url: origin,
                ...(relative.length === 0
                  ? {}
                  : { path: path.sep === "/" ? relative : relative.split(path.sep).join("/") }),
                revision: tag,
              },
            },
          ];
        },
      );
      if (recommendationEntries.length !== discovered.length) {
        return yield* new ShareFailed({
          category: "validation",
          detail:
            "Package metadata requires a qualified manifest identity for every shared extension.",
        });
      }
      packageMetadata = renderPackageMetadata(options.ecosystem, recommendationEntries, tag);
    }
    return {
      command: "share",
      origin,
      locator,
      availability,
      extensions,
      installCommand,
      ...(packageMetadata === undefined ? {} : { packageMetadata }),
    } satisfies ShareWorkspaceDocument;
  }),
};
