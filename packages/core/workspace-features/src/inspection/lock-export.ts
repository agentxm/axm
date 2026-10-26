import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import * as Enums from "@cyclonedx/cyclonedx-library/Enums";
import * as Models from "@cyclonedx/cyclonedx-library/Models";
import * as Serialize from "@cyclonedx/cyclonedx-library/Serialize";
import * as Spec from "@cyclonedx/cyclonedx-library/Spec";
import { PackageURL } from "packageurl-js";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  LockfileSchema,
  readLockfileAtPath,
  WorkspaceLocation,
  type Lockfile,
} from "@agentxm/workspace-kernel/workspace-state";
import { WorkspaceInspectionFailed } from "./errors.js";

type StoredLock = typeof LockfileSchema.Encoded;
type Package = NonNullable<StoredLock["package"]>[number];

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const property = (name: string, value: string) => new Models.Property(`axm:${name}`, value);
const absolutePath = (value: string) => /^(?:\/|\\|[A-Za-z]:)/u.test(value);
const safeUrl = (value: string, localRegistry = false) => {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol === "file:" && !localRegistry)
  ) {
    throw new Error(
      "Source URLs containing credentials, query parameters, fragments, or local paths cannot be exported.",
    );
  }
  return url.href;
};

const selections = (lock: StoredLock) => [
  ...(["skills", "subagents", "rules", "hooks", "knowledge", "packs"] as const).flatMap((kind) =>
    Object.values(lock[kind] ?? {}).map((binding) => ({ kind, binding })),
  ),
  ...(lock.mcp ?? []).map((binding) => ({ kind: "mcps", binding })),
];

const validateSource = (pkg: Package) => {
  const source = pkg.source;
  if ("registry" in source) safeUrl(source.registry, true);
  if ("git" in source) safeUrl(source.git);
  if ("http" in source) safeUrl(source.http);
  if ("artifact" in pkg) {
    if ("url" in pkg.artifact) safeUrl(pkg.artifact.url);
    else for (const file of pkg.artifact.files) safeUrl(file.url);
  }
};

const within = (path: string, root: string) =>
  root === "." || path === root || path.startsWith(`${root}/`);

/** Join only recorded selections under the Pack's recorded source view. */
const memberSourceMatches = (pack: Package, member: Package, registry?: string) => {
  const left = pack.source;
  const right = member.source;
  if (registry !== undefined) return "registry" in right && right.registry === registry;
  if ("registry" in left) return "registry" in right && left.registry === right.registry;
  if ("git" in left) {
    return (
      "git" in right &&
      left.git === right.git &&
      "commit" in pack &&
      "commit" in member &&
      pack.commit === member.commit &&
      within(right.path, pack["source-root"] ?? ".")
    );
  }
  return (
    !("http" in left) &&
    "path" in right &&
    !("git" in right) &&
    !("http" in right) &&
    "source-root" in pack &&
    pack["source-root"] !== undefined &&
    within(right.path, pack["source-root"])
  );
};

/** The library does not yet model composition completeness; extend its normalizer only. */
class AcceptedResolutionSerializer extends Serialize.JsonSerializer {
  protected override _normalize(
    bom: Models.Bom,
    options?: Parameters<Serialize.JsonSerializer["serialize"]>[1],
  ) {
    return {
      ...super._normalize(bom, options),
      compositions: [
        {
          aggregate: "incomplete",
          dependencies: [...bom.components]
            .flatMap(({ bomRef }) => (bomRef.value === undefined ? [] : [bomRef.value]))
            .sort(compare),
        },
      ],
    };
  }
}

export const exportAcceptedResolutions = Effect.fn("ExportAcceptedResolutions.serialize")(
  function* (lockfile: Lockfile) {
    const lock = yield* Schema.encodeEffect(LockfileSchema)(lockfile);
    return yield* Effect.try({
      try: () => {
        const bom = new Models.Bom();
        bom.metadata.properties.add(property("subject", "accepted-external-resolutions"));
        bom.metadata.properties.add(
          property(
            "coverage",
            "Incomplete: excludes authored, bundled and inline content, host runtimes, nested executable dependencies and remote service implementations. Recorded identities and hashes do not establish authenticity, activation or safety. Unrecorded licenses are unknown.",
          ),
        );
        const bindings = selections(lock);
        const packages = new Map((lock.package ?? []).map((pkg) => [pkg.id, pkg]));
        // Local authorities remain distinct within the document without publishing workstation paths.
        const localLocations = [
          ...new Set(
            [...packages.values()].flatMap((pkg) => [
              ...("registry" in pkg.source && pkg.source.registry.startsWith("file:")
                ? [pkg.source.registry]
                : []),
              ...("path" in pkg.source && absolutePath(pkg.source.path) ? [pkg.source.path] : []),
              ...("source-root" in pkg &&
              pkg["source-root"] !== undefined &&
              absolutePath(pkg["source-root"])
                ? [pkg["source-root"]]
                : []),
              ...("dependencies" in pkg
                ? (pkg.dependencies ?? []).flatMap((dependency) =>
                    "registry" in dependency && dependency.registry?.startsWith("file:") === true
                      ? [dependency.registry]
                      : [],
                  )
                : []),
            ]),
          ),
        ].sort(compare);
        const displayLocation = (value: string) => {
          const index = localLocations.indexOf(value);
          return index < 0 ? value : `axm:local-source:${index + 1}`;
        };
        const safePackageIdentity = (pkg: Package) =>
          JSON.stringify(pkg, (key, value: unknown) =>
            key === "id"
              ? undefined
              : typeof value === "string" && ["registry", "path", "source-root"].includes(key)
                ? displayLocation(value)
                : value,
          );
        const components = new Map<string, Models.Component>();
        for (const pkg of packages.values()) {
          validateSource(pkg);
          const selected = bindings
            .filter(({ binding }) => binding.package === pkg.id)
            .sort((a, b) => compare(a.binding.name, b.binding.name) || compare(a.kind, b.kind));
          const first = selected[0];
          if (first === undefined) throw new Error("Retained package has no selected component.");
          const component = new Models.Component(Enums.ComponentType.Library, first.binding.name, {
            bomRef: `axm:sha256:${createHash("sha256").update(safePackageIdentity(pkg)).digest("hex")}`,
            version: "version" in pkg ? pkg.version : "commit" in pkg ? pkg.commit : pkg.tree,
          });
          component.properties.add(property("tree-integrity", pkg.tree));
          for (const { kind, binding } of selected) {
            if (
              binding.component !== undefined &&
              [
                binding.component.root,
                binding.component.path,
                binding.component.manifest ?? "",
              ].some(absolutePath)
            ) {
              throw new Error("Absolute selected-component paths cannot be exported.");
            }
            component.properties.add(
              property(
                "selection",
                JSON.stringify({
                  kind,
                  name: binding.name,
                  ...(binding.component === undefined ? {} : { component: binding.component }),
                }),
              ),
            );
          }
          const source = pkg.source;
          const displayedSource = JSON.stringify(source, (_key, value: unknown) =>
            typeof value === "string" ? displayLocation(value) : value,
          );
          component.properties.add(property("source", displayedSource));
          if (
            displayedSource !== JSON.stringify(source) ||
            ("source-root" in pkg &&
              pkg["source-root"] !== undefined &&
              displayLocation(pkg["source-root"]) !== pkg["source-root"])
          )
            component.properties.add(
              property(
                "source-location-redacted",
                "Absolute local locations are represented by document-local identifiers; these identifiers do not establish identity across documents.",
              ),
            );
          if ("source-root" in pkg && pkg["source-root"] !== undefined)
            component.properties.add(property("source-root", displayLocation(pkg["source-root"])));
          if ("archive" in pkg && "registry" in source) {
            component.hashes.set(
              Enums.HashAlgorithm["SHA-512"],
              Buffer.from(pkg.archive.slice(7), "base64").toString("hex"),
            );
            component.properties.add(property("registry-publisher-binding", pkg.publisher));
            const parts = first.binding.name.split("/");
            if (!source.registry.startsWith("file:"))
              component.purl = new PackageURL(
                "generic",
                parts.slice(0, -1).join("/"),
                parts.at(-1) ?? first.binding.name,
                pkg.version,
                { repository_url: source.registry },
              ).toString();
          }
          if ("git-tree" in pkg) component.properties.add(property("git-tree", pkg["git-tree"]));
          if ("artifact" in pkg) {
            component.properties.add(property("http-snapshot", JSON.stringify(pkg.artifact)));
            if ("digest" in pkg.artifact)
              component.hashes.set(Enums.HashAlgorithm["SHA-256"], pkg.artifact.digest.slice(7));
          }
          components.set(pkg.id, component);
          bom.components.add(component);
        }
        for (const pack of packages.values()) {
          if (!("dependencies" in pack)) continue;
          const component = components.get(pack.id);
          if (component === undefined) continue;
          for (const dependency of pack.dependencies ?? []) {
            const registry = "registry" in dependency ? dependency.registry : undefined;
            if (registry !== undefined) safeUrl(registry, true);
            const matches = new Set(
              bindings
                .filter(({ binding }) => {
                  const member = packages.get(binding.package);
                  return (
                    binding.name === dependency.name &&
                    member !== undefined &&
                    memberSourceMatches(pack, member, registry)
                  );
                })
                .map(({ binding }) => binding.package),
            );
            const memberId = matches.size === 1 ? [...matches][0] : undefined;
            const member = memberId === undefined ? undefined : components.get(memberId);
            if (member === undefined)
              component.properties.add(
                property(
                  "unresolved-dependency",
                  JSON.stringify(dependency, (_key, value: unknown) =>
                    typeof value === "string" ? displayLocation(value) : value,
                  ),
                ),
              );
            else if (member !== component) component.dependencies.add(member.bomRef);
          }
        }
        return (
          new AcceptedResolutionSerializer(
            new Serialize.JSON.Normalize.Factory(Spec.Spec1dot6),
          ).serialize(bom, { sortLists: true, space: 2 }) + "\n"
        );
      },
      catch: (cause) =>
        new WorkspaceInspectionFailed({
          category: "validation",
          detail: "Accepted resolutions cannot be safely exported as CycloneDX.",
          cause,
        }),
    });
  },
);

/** Capture one strict lockfile without loading manifests, settings or installed content. */
export const ExportLock = {
  query: Effect.fn("ExportLock.query")(function* () {
    const location = yield* WorkspaceLocation;
    const lock = yield* readLockfileAtPath(location.lockPath);
    if (lock === undefined)
      return yield* new WorkspaceInspectionFailed({
        category: "validation",
        detail:
          "No axm.lock exists in this scope. Accept external resolutions before exporting them.",
      });
    return yield* exportAcceptedResolutions(lock);
  }),
};
