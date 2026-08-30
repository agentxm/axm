import { createHash } from "node:crypto";

import * as Schema from "effect/Schema";
import * as semver from "semver";

import { SuggestedActionSchema, type SuggestedAction } from "../suggested-action.js";
import {
  ExtensionNameSchema,
  ExtensionTypeSchema,
  ExtensionVisibilitySchema,
  type ExtensionName,
  type ExtensionType,
  type ExtensionVisibility,
} from "@agentxm/extension-model/unstable/extensions/common";
import { formatFqn } from "@agentxm/extension-model/unstable/extensions/fqn";
import { HandleSchema, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  VisibilityEvaluationSchema,
  VisibilityEvaluationUnavailableSchema,
  VisibilityIntentSchema,
} from "../publish/visibility.js";
import {
  VersionRangeSchema,
  VersionSchema,
  type Version,
  type VersionRange,
} from "@agentxm/extension-model/unstable/version-constraints";
import { DeprecationViewSchema, type DeprecationView } from "./schema.js";

export const PUBLICATION_SET_CONTRACT = "publication-set-v2" as const;
export const MAX_PUBLICATION_SET_CANDIDATES = 100;

export const Sha256HexSchema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)).annotate({
  identifier: "Sha256Hex",
});

export type Sha256Hex = typeof Sha256HexSchema.Type;

const PublicationTargetSchema = Schema.Struct({
  owner: HandleSchema,
  type: ExtensionTypeSchema,
  name: ExtensionNameSchema,
  version: VersionSchema,
}).annotate({ identifier: "PublicationTarget" });

export interface PublicationTarget {
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly version: Version;
}

const PackDependencyDescriptorSchema = Schema.Struct({
  owner: HandleSchema,
  type: Schema.Literals(["hook", "knowledge", "mcp-server", "rule", "skill", "subagent"] as const),
  name: ExtensionNameSchema,
  range: VersionRangeSchema,
}).annotate({ identifier: "PackDependencyDescriptor" });

export interface PackDependencyDescriptor {
  readonly owner: Handle;
  readonly type: Exclude<ExtensionType, "pack">;
  readonly name: ExtensionName;
  readonly range: VersionRange;
}

export const PublicationVisibilityInputSchema = Schema.Struct({
  intent: Schema.NullOr(VisibilityIntentSchema),
  request: Schema.NullOr(ExtensionVisibilitySchema),
}).annotate({ identifier: "PublicationVisibilityInput" });

export type PublicationVisibilityInput = typeof PublicationVisibilityInputSchema.Type;

const PublicationDescriptorSchema = Schema.Struct({
  target: PublicationTargetSchema,
  participation: Schema.Literals(["publish", "verified-existing"] as const),
  archiveSha256Hex: Schema.optional(Sha256HexSchema),
  visibility: PublicationVisibilityInputSchema,
  pack: Schema.optional(
    Schema.Struct({
      dependencies: Schema.Array(PackDependencyDescriptorSchema),
    }),
  ),
}).annotate({ identifier: "PublicationDescriptor" });

export interface PublicationDescriptor {
  readonly target: PublicationTarget;
  readonly participation: "publish" | "verified-existing";
  readonly archiveSha256Hex?: Sha256Hex | undefined;
  readonly visibility: PublicationVisibilityInput;
  readonly pack?:
    | {
        readonly dependencies: ReadonlyArray<PackDependencyDescriptor>;
      }
    | undefined;
}

export const PreviewPublicationSetRequestSchema = Schema.Struct({
  contract: Schema.Literal(PUBLICATION_SET_CONTRACT),
  candidates: Schema.Array(PublicationDescriptorSchema),
}).annotate({ identifier: "PreviewPublicationSetRequest" });

export interface PreviewPublicationSetRequest {
  readonly contract: typeof PUBLICATION_SET_CONTRACT;
  readonly candidates: ReadonlyArray<PublicationDescriptor>;
}

export const PackDependencyFindingSchema = Schema.Struct({
  kind: Schema.Literal("advisory"),
  ruleId: Schema.Literals([
    "pack/dependency-version-resolvable",
    "pack/dependency-deprecated",
  ] as const),
  severity: Schema.Literals(["error", "warning"] as const),
  reason: Schema.Literals([
    "selected-new-private",
    "selected-existing-private",
    "target-unavailable",
    "lifecycle-unavailable",
    "no-installable-version",
    "range-unsatisfied",
    "deprecated",
  ] as const),
  dependency: PackDependencyDescriptorSchema,
  effectiveVisibility: Schema.optional(Schema.Literals(["public", "private"] as const)),
  lifecycle: Schema.optional(Schema.Literals(["active", "unavailable"] as const)),
  deprecation: Schema.optional(DeprecationViewSchema),
  location: Schema.Struct({ file: Schema.Literal("pack.json") }),
  path: Schema.Literal("./pack.json"),
  message: Schema.String,
  suggestions: Schema.Array(SuggestedActionSchema),
}).annotate({ identifier: "PackDependencyFinding" });

export type PackDependencyFinding = typeof PackDependencyFindingSchema.Type;

const ResolvedPublicationCandidateSchema = Schema.Struct({
  kind: Schema.Literal("resolved"),
  target: PublicationTargetSchema,
  participation: Schema.Literals(["publish", "verified-existing"] as const),
  descriptorDigest: Sha256HexSchema,
  visibility: VisibilityEvaluationSchema,
  condition: Schema.optional(Schema.String),
});

const UnavailablePublicationCandidateSchema = Schema.Struct({
  kind: Schema.Literal("unavailable"),
  target: PublicationTargetSchema,
  participation: Schema.Literals(["publish", "verified-existing"] as const),
  descriptorDigest: Sha256HexSchema,
  code: Schema.Literal("publish/target-unavailable"),
  visibility: VisibilityEvaluationUnavailableSchema,
});

const PublicationPackResultSchema = Schema.Struct({
  target: PublicationTargetSchema,
  status: Schema.Literals(["admitted", "blocked"] as const),
  findings: Schema.Array(PackDependencyFindingSchema),
  resolutions: Schema.Array(
    Schema.Struct({
      dependency: PackDependencyDescriptorSchema,
      effectiveVersion: VersionSchema,
    }).annotate({ identifier: "PackDependencyResolution" }),
  ),
});

export const PreviewPublicationSetResponseSchema = Schema.Struct({
  contract: Schema.Literal(PUBLICATION_SET_CONTRACT),
  publicationSetDigest: Sha256HexSchema,
  status: Schema.Literals(["admitted", "blocked"] as const),
  candidates: Schema.Array(
    Schema.Union([ResolvedPublicationCandidateSchema, UnavailablePublicationCandidateSchema]),
  ),
  packs: Schema.Array(PublicationPackResultSchema),
}).annotate({ identifier: "PreviewPublicationSetResponse" });

export type PreviewPublicationSetResponse = typeof PreviewPublicationSetResponseSchema.Type;
export type PublicationCandidateResult = PreviewPublicationSetResponse["candidates"][number];
export type PublicationPackResult = PreviewPublicationSetResponse["packs"][number];

export interface PublicationDependencyVersionSnapshot {
  readonly version: string;
  readonly status: string;
  readonly yanked: boolean;
  readonly purged: boolean;
}

export interface PublicationDependencySnapshot {
  readonly dependency: PackDependencyDescriptor;
  readonly exists: boolean;
  readonly visibility: string | null;
  readonly lifecycleState: string | null;
  readonly deprecation: DeprecationView | null;
  readonly versions: ReadonlyArray<PublicationDependencyVersionSnapshot>;
}

export type ProspectivePublicationCandidate =
  | {
      readonly descriptor: PublicationDescriptor;
      readonly kind: "resolved";
      readonly visibility: typeof VisibilityEvaluationSchema.Type;
    }
  | {
      readonly descriptor: PublicationDescriptor;
      readonly kind: "unavailable";
      readonly visibility: typeof VisibilityEvaluationUnavailableSchema.Type;
    };

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const comparePublicationTargets = (
  left: PublicationTarget,
  right: PublicationTarget,
): number =>
  compareText(left.owner, right.owner) ||
  compareText(left.type, right.type) ||
  compareText(left.name, right.name) ||
  compareText(left.version, right.version);

const compareDependencies = (
  left: PackDependencyDescriptor,
  right: PackDependencyDescriptor,
): number =>
  compareText(left.owner, right.owner) ||
  compareText(left.type, right.type) ||
  compareText(left.name, right.name) ||
  compareText(left.range, right.range);

export const normalizePublicationDescriptor = (
  descriptor: PublicationDescriptor,
): PublicationDescriptor => ({
  target: descriptor.target,
  participation: descriptor.participation,
  visibility: descriptor.visibility,
  ...(descriptor.archiveSha256Hex === undefined
    ? {}
    : { archiveSha256Hex: descriptor.archiveSha256Hex }),
  ...(descriptor.pack === undefined
    ? {}
    : {
        pack: {
          dependencies: [...descriptor.pack.dependencies].sort(compareDependencies),
        },
      }),
});

export const normalizePublicationSet = (
  descriptors: ReadonlyArray<PublicationDescriptor>,
): ReadonlyArray<PublicationDescriptor> =>
  descriptors
    .map(normalizePublicationDescriptor)
    .sort((left, right) => comparePublicationTargets(left.target, right.target));

const canonicalBytes = (value: unknown): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(value));

const sha256Hex = (bytes: Uint8Array): Sha256Hex =>
  Schema.decodeUnknownSync(Sha256HexSchema)(createHash("sha256").update(bytes).digest("hex"));

export const publicationDescriptorDigest = (descriptor: PublicationDescriptor): Sha256Hex =>
  sha256Hex(
    canonicalBytes({
      contract: PUBLICATION_SET_CONTRACT,
      descriptor: normalizePublicationDescriptor(descriptor),
    }),
  );

export const publicationSetDigest = (
  descriptors: ReadonlyArray<PublicationDescriptor>,
): Sha256Hex =>
  sha256Hex(
    canonicalBytes({
      contract: PUBLICATION_SET_CONTRACT,
      candidates: normalizePublicationSet(descriptors),
    }),
  );

export const archiveSha256Hex = (archive: Uint8Array): Sha256Hex => sha256Hex(archive);

export const publicationTargetKey = (target: PublicationTarget): string =>
  JSON.stringify([target.owner, target.type, target.name, target.version]);

const publicationIdentityKey = (target: PublicationTarget): string =>
  `${target.owner}\u0000${target.type}\u0000${target.name}`;

export const validatePublicationDescriptors = (
  descriptors: ReadonlyArray<PublicationDescriptor>,
): ReadonlyArray<PublicationDescriptor> => {
  if (descriptors.length > MAX_PUBLICATION_SET_CANDIDATES) {
    throw new RangeError(
      `Publication sets accept at most ${MAX_PUBLICATION_SET_CANDIDATES} candidates.`,
    );
  }
  Schema.decodeUnknownSync(PreviewPublicationSetRequestSchema)({
    contract: PUBLICATION_SET_CONTRACT,
    candidates: descriptors,
  });
  const identities = new Set<string>();
  for (const descriptor of descriptors) {
    const key = publicationIdentityKey(descriptor.target);
    if (identities.has(key)) {
      throw new TypeError(`Duplicate publication target ${key}.`);
    }
    identities.add(key);
    if ((descriptor.participation === "publish") !== (descriptor.archiveSha256Hex !== undefined)) {
      throw new TypeError("archiveSha256Hex is required exactly for publish candidates.");
    }
    if ((descriptor.target.type === "pack") !== (descriptor.pack !== undefined)) {
      throw new TypeError("Pack declarations are required exactly for pack candidates.");
    }
  }
  return normalizePublicationSet(descriptors);
};

const findingBase = (
  finding: Omit<PackDependencyFinding, "kind" | "location" | "path">,
): PackDependencyFinding => ({
  kind: "advisory",
  location: { file: "pack.json" },
  path: "./pack.json",
  ...finding,
});

const dependencyError = (input: {
  readonly snapshot: PublicationDependencySnapshot;
  readonly reason: PackDependencyFinding["reason"];
  readonly explanation: string;
  readonly suggestions: ReadonlyArray<SuggestedAction>;
  readonly discloseState?: boolean;
}): PackDependencyFinding => {
  const fqn = formatFqn(input.snapshot.dependency);
  return findingBase({
    ruleId: "pack/dependency-version-resolvable",
    severity: "error",
    reason: input.reason,
    dependency: input.snapshot.dependency,
    ...(input.discloseState !== true
      ? {}
      : {
          ...(input.snapshot.visibility === "public" || input.snapshot.visibility === "private"
            ? { effectiveVisibility: input.snapshot.visibility }
            : {}),
          ...(input.snapshot.lifecycleState === null
            ? {}
            : { lifecycle: input.snapshot.lifecycleState === "active" ? "active" : "unavailable" }),
        }),
    message: `Dependency ${fqn} requests range "${input.snapshot.dependency.range}", but ${input.explanation}.`,
    suggestions: input.suggestions,
  });
};

const evaluateDependencySnapshot = (
  snapshot: PublicationDependencySnapshot,
  packVisibility: ExtensionVisibility,
): ReadonlyArray<PackDependencyFinding> => {
  const fqn = formatFqn(snapshot.dependency);
  if (!snapshot.exists) {
    return [
      dependencyError({
        snapshot,
        reason: "target-unavailable",
        explanation: "that extension does not exist in the registry",
        suggestions: [
          {
            description: `Publish ${fqn} or correct the dependency identity`,
            cmd: `axm publish ${fqn}`,
          },
        ],
      }),
    ];
  }
  if (packVisibility === "public" && snapshot.visibility !== "public") {
    return [
      dependencyError({
        snapshot,
        reason: "target-unavailable",
        explanation: "that extension is not public",
        suggestions: [{ description: `Make ${fqn} public or depend on a public extension` }],
      }),
    ];
  }
  if (snapshot.lifecycleState !== "active") {
    return [
      dependencyError({
        snapshot,
        reason: "lifecycle-unavailable",
        explanation: "that extension is not active",
        discloseState: true,
        suggestions: [{ description: `Restore ${fqn} to active state or remove it from the pack` }],
      }),
    ];
  }
  const installable = snapshot.versions.filter(
    (version) => version.status === "available" && !version.yanked && !version.purged,
  );
  if (installable.length === 0) {
    return [
      dependencyError({
        snapshot,
        reason: "no-installable-version",
        explanation: "it has no installable versions",
        discloseState: true,
        suggestions: [
          {
            description: `Publish an installable version of ${fqn} or remove it from the pack`,
            cmd: `axm publish ${fqn}`,
          },
        ],
      }),
    ];
  }
  if (
    !installable.some((candidate) => semver.satisfies(candidate.version, snapshot.dependency.range))
  ) {
    return [
      dependencyError({
        snapshot,
        reason: "range-unsatisfied",
        explanation: "no installable version satisfies the requested range",
        discloseState: true,
        suggestions: [
          {
            description: `Publish a version of ${fqn} satisfying "${snapshot.dependency.range}" or correct the requested range`,
            cmd: `axm publish ${fqn}`,
          },
        ],
      }),
    ];
  }
  return snapshot.deprecation !== null
    ? [
        findingBase({
          ruleId: "pack/dependency-deprecated",
          severity: "warning",
          reason: "deprecated",
          dependency: snapshot.dependency,
          effectiveVisibility: snapshot.visibility === "private" ? "private" : "public",
          lifecycle: "active",
          deprecation: snapshot.deprecation,
          message: `Dependency ${fqn} requests range "${snapshot.dependency.range}" and resolves to a deprecated extension.`,
          suggestions: [
            { description: `Prefer a supported replacement for ${fqn} when one is available` },
          ],
        }),
      ]
    : [];
};

const dependencyIdentityKey = (dependency: PackDependencyDescriptor): string =>
  `${dependency.owner}\u0000${dependency.type}\u0000${dependency.name}`;

export const evaluateProspectivePackDependencies = (input: {
  readonly packVisibility: ExtensionVisibility;
  readonly dependencies: ReadonlyArray<PackDependencyDescriptor>;
  readonly snapshots: ReadonlyArray<PublicationDependencySnapshot>;
  readonly candidates: ReadonlyArray<ProspectivePublicationCandidate>;
}): ReadonlyArray<PackDependencyFinding> => {
  const snapshots = new Map(
    input.snapshots.map((snapshot) => [dependencyIdentityKey(snapshot.dependency), snapshot]),
  );
  const candidates = new Map(
    input.candidates.map((candidate) => [
      publicationIdentityKey(candidate.descriptor.target),
      candidate,
    ]),
  );
  return input.dependencies
    .flatMap((dependency) => {
      const current =
        snapshots.get(dependencyIdentityKey(dependency)) ??
        ({
          dependency,
          exists: false,
          visibility: null,
          lifecycleState: null,
          deprecation: null,
          versions: [],
        } satisfies PublicationDependencySnapshot);
      const selected = candidates.get(dependencyIdentityKey(dependency));
      if (selected === undefined) return evaluateDependencySnapshot(current, input.packVisibility);
      if (selected.kind === "unavailable") {
        return [
          dependencyError({
            snapshot: current,
            reason: "target-unavailable",
            explanation: "that selected target is unavailable",
            suggestions: [
              {
                description: `Verify authority and availability for ${formatFqn(dependency)}, then preview the complete set again`,
              },
            ],
          }),
        ];
      }
      if (input.packVisibility === "public" && selected.visibility.resolved?.value === "private") {
        return [
          dependencyError({
            snapshot: { ...current, exists: true, visibility: "private" },
            reason: current.exists ? "selected-existing-private" : "selected-new-private",
            explanation: "the selected dependency will remain private",
            discloseState: true,
            suggestions: current.exists
              ? [
                  {
                    description: `Make ${formatFqn(dependency)} public explicitly, then preview the complete set again`,
                  },
                ]
              : [
                  {
                    description: `Publish ${formatFqn(dependency)} as public, then preview the complete set again`,
                    cmd: `axm publish ${formatFqn(dependency)} --visibility public`,
                  },
                ],
          }),
        ];
      }
      return evaluateDependencySnapshot(
        {
          ...current,
          exists: true,
          visibility: selected.visibility.resolved?.value ?? current.visibility,
          lifecycleState: current.exists ? current.lifecycleState : "active",
          versions:
            selected.descriptor.participation === "publish"
              ? [
                  ...current.versions,
                  {
                    version: selected.descriptor.target.version,
                    status: "available",
                    yanked: false,
                    purged: false,
                  },
                ]
              : current.versions,
        },
        input.packVisibility,
      );
    })
    .sort(
      (left, right) =>
        compareText(formatFqn(left.dependency), formatFqn(right.dependency)) ||
        compareText(left.dependency.range, right.dependency.range),
    );
};

export interface ProspectivePackDependencyState {
  readonly findings: ReadonlyArray<PackDependencyFinding>;
  readonly resolutions: PublicationPackResult["resolutions"];
}

/**
 * Evaluate dependency admission and expose the exact version an ordinary
 * Registry consumer would resolve from the same prospective snapshot.
 */
export const evaluateProspectivePackDependencyState = (input: {
  readonly packVisibility: ExtensionVisibility;
  readonly dependencies: ReadonlyArray<PackDependencyDescriptor>;
  readonly snapshots: ReadonlyArray<PublicationDependencySnapshot>;
  readonly candidates: ReadonlyArray<ProspectivePublicationCandidate>;
}): ProspectivePackDependencyState => {
  const findings = evaluateProspectivePackDependencies(input);
  const snapshots = new Map(
    input.snapshots.map((snapshot) => [dependencyIdentityKey(snapshot.dependency), snapshot]),
  );
  const candidates = new Map(
    input.candidates.map((candidate) => [
      publicationIdentityKey(candidate.descriptor.target),
      candidate,
    ]),
  );
  const resolutions = input.dependencies.flatMap((dependency) => {
    const current =
      snapshots.get(dependencyIdentityKey(dependency)) ??
      ({
        dependency,
        exists: false,
        visibility: null,
        lifecycleState: null,
        deprecation: null,
        versions: [],
      } satisfies PublicationDependencySnapshot);
    const selected = candidates.get(dependencyIdentityKey(dependency));
    if (
      selected?.kind === "unavailable" ||
      (input.packVisibility === "public" && selected?.visibility.resolved?.value === "private")
    ) {
      return [];
    }
    const prospective =
      selected === undefined
        ? current
        : {
            ...current,
            exists: true,
            visibility: selected.visibility.resolved?.value ?? current.visibility,
            lifecycleState: current.exists ? current.lifecycleState : "active",
            versions:
              selected.descriptor.participation === "publish"
                ? [
                    ...current.versions,
                    {
                      version: selected.descriptor.target.version,
                      status: "available",
                      yanked: false,
                      purged: false,
                    },
                  ]
                : current.versions,
          };
    if (
      !prospective.exists ||
      (input.packVisibility === "public" && prospective.visibility !== "public") ||
      prospective.lifecycleState !== "active"
    ) {
      return [];
    }
    const effectiveVersion = semver.maxSatisfying(
      prospective.versions
        .filter((version) => version.status === "available" && !version.yanked && !version.purged)
        .map((version) => version.version),
      dependency.range,
    );
    return effectiveVersion === null
      ? []
      : [
          {
            dependency,
            effectiveVersion: Schema.decodeUnknownSync(VersionSchema)(effectiveVersion),
          },
        ];
  });
  return {
    findings,
    resolutions: [...resolutions].sort((left, right) =>
      compareDependencies(left.dependency, right.dependency),
    ),
  };
};

export const validatePublicationSetResponse = (
  descriptors: ReadonlyArray<PublicationDescriptor>,
  response: PreviewPublicationSetResponse,
): PreviewPublicationSetResponse => {
  const normalized = validatePublicationDescriptors(descriptors);
  const expectedDigest = publicationSetDigest(normalized);
  if (response.publicationSetDigest !== expectedDigest) {
    throw new TypeError("The publication-set digest does not match the submitted descriptors.");
  }

  const expectedCandidates = new Map(
    normalized.map((descriptor) => [publicationTargetKey(descriptor.target), descriptor]),
  );
  if (response.candidates.length !== expectedCandidates.size) {
    throw new TypeError("The publication-set response does not account for every candidate.");
  }
  for (const candidate of response.candidates) {
    const key = publicationTargetKey(candidate.target);
    const descriptor = expectedCandidates.get(key);
    if (
      descriptor === undefined ||
      candidate.participation !== descriptor.participation ||
      candidate.descriptorDigest !== publicationDescriptorDigest(descriptor)
    ) {
      throw new TypeError("The publication-set response contains an incompatible candidate.");
    }
    const expectedFqn = formatFqn(candidate.target);
    if (candidate.visibility.target !== expectedFqn) {
      throw new TypeError("The publication-set response evaluates the wrong visibility target.");
    }
    if (candidate.kind === "resolved") {
      if (
        candidate.visibility.resolved === null ||
        JSON.stringify(candidate.visibility.intent) !==
          JSON.stringify(descriptor.visibility.intent) ||
        candidate.visibility.request !== descriptor.visibility.request
      ) {
        throw new TypeError("The publication-set response changed submitted visibility authority.");
      }
    }
    if (
      (response.status === "admitted" &&
        candidate.kind === "resolved" &&
        candidate.participation === "publish") !==
      (candidate.kind === "resolved" && candidate.condition !== undefined)
    ) {
      throw new TypeError("Publication conditions are valid only for admitted upload candidates.");
    }
  }

  const visibilityBlocked = response.candidates.some(
    (candidate) =>
      candidate.kind === "unavailable" ||
      candidate.visibility.findings.some((finding) => finding.severity === "error"),
  );
  const packBlocked = response.packs.some((pack) => pack.status === "blocked");
  if ((response.status === "blocked") !== (visibilityBlocked || packBlocked)) {
    throw new TypeError("The publication-set status does not match its candidate findings.");
  }

  const expectedPacks = normalized.filter(
    (descriptor) => descriptor.target.type === "pack" && descriptor.participation === "publish",
  );
  if (response.packs.length !== expectedPacks.length) {
    throw new TypeError(
      "The publication-set response does not account for every publishable pack.",
    );
  }
  const packKeys = new Set<string>();
  for (const pack of response.packs) {
    const key = publicationTargetKey(pack.target);
    const descriptor = expectedPacks.find(
      (candidate) => publicationTargetKey(candidate.target) === key,
    );
    if (packKeys.has(key) || descriptor === undefined) {
      throw new TypeError("The publication-set response contains an incompatible pack result.");
    }
    packKeys.add(key);
    if (pack.status === "blocked") {
      if (pack.resolutions.length > 0) {
        throw new TypeError("Blocked pack results cannot claim effective dependency resolutions.");
      }
      continue;
    }
    const expectedDependencies = descriptor.pack?.dependencies ?? [];
    if (pack.resolutions.length !== expectedDependencies.length) {
      throw new TypeError(
        "An admitted pack result does not account for every effective dependency resolution.",
      );
    }
    const resolutionKeys = new Set<string>();
    for (const resolution of pack.resolutions) {
      const dependencyKey = dependencyIdentityKey(resolution.dependency);
      const expected = expectedDependencies.find(
        (dependency) => dependencyIdentityKey(dependency) === dependencyKey,
      );
      if (
        resolutionKeys.has(dependencyKey) ||
        expected === undefined ||
        expected.range !== resolution.dependency.range ||
        !semver.satisfies(resolution.effectiveVersion, resolution.dependency.range)
      ) {
        throw new TypeError(
          "The publication-set response contains an incompatible effective dependency resolution.",
        );
      }
      resolutionKeys.add(dependencyKey);
    }
  }
  return response;
};
