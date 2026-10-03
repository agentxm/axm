import * as Hash from "effect/Hash";
import type {
  McpRegistryPackage,
  McpRegistryRemoteTransport,
  McpServerManifest,
} from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import type { McpDistribution } from "./connection.js";

const defaultRunners: Readonly<Record<string, string>> = {
  npm: "npx",
  pypi: "uvx",
  oci: "docker",
  nuget: "dnx",
};
const defaultRegistries: Readonly<Record<string, string>> = {
  npm: "https://registry.npmjs.org",
  pypi: "https://pypi.org",
  oci: "https://docker.io",
  nuget: "https://api.nuget.org/v3/index.json",
};

const registryAuthority = (value: string | undefined, registryType: string): string | undefined => {
  const raw = value ?? defaultRegistries[registryType];
  if (raw === undefined) return undefined;
  try {
    const url = new URL(raw);
    return url.toString().replace(/\/$/u, "");
  } catch {
    return raw;
  }
};

export const normalizeMcpDistribution = (selector: McpDistribution): McpDistribution => {
  if (selector.kind === "remote")
    return { kind: "remote", transport: selector.transport, url: selector.url };
  const authority = registryAuthority(selector.registryBaseUrl, selector.registryType);
  const runtime = selector.runtimeHint ?? defaultRunners[selector.registryType];
  return {
    kind: "package",
    registryType: selector.registryType,
    ...(authority === undefined ? {} : { registryBaseUrl: authority }),
    identifier: selector.identifier,
    transport: selector.transport,
    ...(runtime === undefined ? {} : { runtimeHint: runtime }),
    ...(selector.url === undefined ? {} : { url: selector.url }),
  };
};

/** A convenience ID only; accepted settings persist the complete selector. */
export const mcpDistributionId = (selector: McpDistribution): string =>
  (Hash.string(JSON.stringify(normalizeMcpDistribution(selector))) >>> 0)
    .toString(16)
    .padStart(8, "0");

export type McpDistributionCandidate =
  | {
      readonly selector: McpDistribution;
      readonly id: string;
      readonly kind: "package";
      readonly package: McpRegistryPackage;
    }
  | {
      readonly selector: McpDistribution;
      readonly id: string;
      readonly kind: "remote";
      readonly remote: McpRegistryRemoteTransport;
    };

export const mcpDistributionCandidates = (
  manifest: McpServerManifest,
): ReadonlyArray<McpDistributionCandidate> => [
  ...(manifest.server.packages ?? []).map((pkg): McpDistributionCandidate => {
    const selector = normalizeMcpDistribution({
      kind: "package",
      registryType: pkg.registryType,
      identifier: pkg.identifier,
      transport: pkg.transport.type,
      ...(pkg.registryBaseUrl === undefined ? {} : { registryBaseUrl: pkg.registryBaseUrl }),
      ...(pkg.runtimeHint === undefined ? {} : { runtimeHint: pkg.runtimeHint }),
      ...(pkg.transport.type === "stdio" ? {} : { url: pkg.transport.url }),
    });
    return { kind: "package", selector, id: mcpDistributionId(selector), package: pkg };
  }),
  ...(manifest.server.remotes ?? []).map((remote): McpDistributionCandidate => {
    const selector = normalizeMcpDistribution({
      kind: "remote",
      transport: remote.type,
      url: remote.url,
    });
    return { kind: "remote", selector, id: mcpDistributionId(selector), remote };
  }),
];

/** Values-free candidate presentation: launcher or endpoint origin, never credentials or URL parameters. */
export const mcpDistributionDestination = (candidate: McpDistributionCandidate): string => {
  if (candidate.kind === "package")
    return defaultRunners[candidate.package.registryType] ?? "unsupported launcher";
  try {
    const endpoint = new URL(candidate.remote.url);
    return `${endpoint.protocol}//${endpoint.host} (path and query withheld)`;
  } catch {
    return "endpoint template (values withheld)";
  }
};

export type McpDistributionSelection =
  | { readonly _tag: "selected"; readonly candidate: McpDistributionCandidate }
  | {
      readonly _tag: "blocked";
      readonly code: "missing-selection" | "ambiguous-selection" | "missing-distribution";
      readonly reason: string;
      readonly candidates: ReadonlyArray<McpDistributionCandidate>;
    };

/** Only authorizing install may auto-select. Sync and update must match a persisted choice. */
export const selectMcpDistribution = (args: {
  readonly manifest: McpServerManifest;
  readonly selector?: McpDistribution | undefined;
  readonly id?: string | undefined;
  readonly allowUnambiguous?: boolean;
}): McpDistributionSelection => {
  const candidates = mcpDistributionCandidates(args.manifest);
  const selector =
    args.selector === undefined
      ? undefined
      : JSON.stringify(normalizeMcpDistribution(args.selector));
  const matches = candidates.filter(
    (candidate) =>
      (selector === undefined || JSON.stringify(candidate.selector) === selector) &&
      (args.id === undefined || candidate.id === args.id),
  );
  if (selector === undefined && args.id === undefined && !args.allowUnambiguous)
    return {
      _tag: "blocked",
      code: "missing-selection",
      reason: "Install must persist a distribution before sync can project this connection",
      candidates,
    };
  const candidate = matches[0];
  if (matches.length === 1 && candidate !== undefined) return { _tag: "selected", candidate };
  return {
    _tag: "blocked",
    code: matches.length === 0 ? "missing-distribution" : "ambiguous-selection",
    reason:
      (matches.length === 0
        ? "Selected distribution no longer matches the manifest"
        : "Select exactly one unambiguous distribution before installation") +
      (candidates.length === 0
        ? "; manifest has no distributions"
        : `; candidates: ${candidates.map((item) => `${item.id} (${item.kind}, ${item.selector.transport}, ${mcpDistributionDestination(item)}${item.kind === "package" && mcpRunner(item.package)._tag === "unsupported" ? ", unsupported" : ""})`).join(", ")}. Use --distribution ID`),
    candidates,
  };
};

export const mcpRunner = (
  pkg: McpRegistryPackage,
):
  | {
      readonly _tag: "supported";
      readonly command: string;
      readonly beforeRuntime: ReadonlyArray<string>;
      readonly afterRuntime: ReadonlyArray<string>;
      readonly beforeArguments: ReadonlyArray<string>;
      readonly runtimeArtifactPinned: boolean;
    }
  | { readonly _tag: "unsupported"; readonly reason: string } => {
  const unsupported = (reason: string) => ({ _tag: "unsupported", reason }) as const;
  if (pkg.transport.type !== "stdio")
    return unsupported(
      "Package-launched remote transports require a host-owned process and endpoint lifecycle that is not implemented",
    );
  if (pkg.fileSha256 !== undefined)
    return unsupported("This runner cannot enforce the declared artifact integrity");
  const runner = defaultRunners[pkg.registryType];
  if (runner === undefined || (pkg.runtimeHint !== undefined && pkg.runtimeHint !== runner))
    return unsupported("Unsupported package registry and runtime pairing");
  if (/^[.-]|[\s\0]/u.test(pkg.identifier))
    return unsupported("Package identifier is not a qualified artifact name");
  if (pkg.version !== undefined && /[\s\0]/u.test(pkg.version))
    return unsupported("Package version contains unsupported characters");
  if (pkg.registryBaseUrl !== undefined) {
    try {
      const registry = new URL(pkg.registryBaseUrl);
      if (
        !["https:", "http:"].includes(registry.protocol) ||
        registry.username !== "" ||
        registry.password !== "" ||
        registry.search !== "" ||
        registry.hash !== ""
      )
        return unsupported(
          "Registry authority must be an HTTP URL without credentials, query or fragment",
        );
    } catch {
      return unsupported("Registry authority must be a valid URL");
    }
  }
  const authority = registryAuthority(pkg.registryBaseUrl, pkg.registryType);
  const nonDefault = authority !== defaultRegistries[pkg.registryType];
  const version = pkg.version;
  const exactPythonVersion =
    version !== undefined &&
    /^\d+(?:!\d+)?(?:\.\d+)*(?:(?:a|b|rc)\d+)?(?:\.post\d+)?(?:\.dev\d+)?(?:\+[a-z0-9]+(?:[._-][a-z0-9]+)*)?$/iu.test(
      version,
    );
  if (pkg.registryType === "pypi" && version !== undefined && !exactPythonVersion)
    return unsupported("This runner requires a qualified PyPI release version");
  const exact = version !== undefined && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(version);
  switch (pkg.registryType) {
    case "npm":
      return {
        _tag: "supported",
        command: runner,
        beforeRuntime: [
          "-y",
          ...(nonDefault && authority !== undefined ? [`--registry=${authority}`] : []),
        ],
        afterRuntime: [`${pkg.identifier}${version === undefined ? "" : `@${version}`}`],
        beforeArguments: [],
        runtimeArtifactPinned: exact,
      };
    case "pypi":
      return {
        _tag: "supported",
        command: runner,
        beforeRuntime: nonDefault && authority !== undefined ? ["--index-url", authority] : [],
        afterRuntime: [`${pkg.identifier}${version === undefined ? "" : `==${version}`}`],
        beforeArguments: [],
        runtimeArtifactPinned: exactPythonVersion,
      };
    case "nuget":
      return {
        _tag: "supported",
        command: runner,
        beforeRuntime: [
          "--yes",
          ...(nonDefault && authority !== undefined ? ["--source", authority] : []),
        ],
        afterRuntime: [`${pkg.identifier}${version === undefined ? "" : `@${version}`}`],
        beforeArguments: ["--"],
        runtimeArtifactPinned: exact,
      };
    case "oci": {
      if (nonDefault && authority !== undefined) {
        let host: string;
        try {
          host = new URL(authority).host;
        } catch {
          return unsupported("OCI registry authority must be a URL");
        }
        if (!pkg.identifier.startsWith(`${host}/`))
          return unsupported("OCI image identifier does not name the declared registry authority");
      }
      const locatorSeparator = pkg.identifier.indexOf(":", pkg.identifier.lastIndexOf("/") + 1);
      const hasLocator = locatorSeparator >= 0 && locatorSeparator < pkg.identifier.length - 1;
      if (hasLocator && version !== undefined && !pkg.identifier.endsWith(`:${version}`))
        return unsupported("OCI image locator conflicts with the declared version");
      const image =
        hasLocator || version === undefined ? pkg.identifier : `${pkg.identifier}:${version}`;
      return {
        _tag: "supported",
        command: runner,
        beforeRuntime: ["run", "-i", "--rm"],
        afterRuntime: [image],
        beforeArguments: [],
        runtimeArtifactPinned: /@sha256:[a-f0-9]{64}$/u.test(image),
      };
    }
    default:
      return unsupported("Unsupported package runner");
  }
};
