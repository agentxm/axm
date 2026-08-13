import * as semver from "semver";
import type { ExtensionType } from "./common.js";

export type SourceAuthorityRelationship =
  { readonly kind: "root" } | { readonly kind: "member"; readonly root: string };

export type WorkspaceAuthorityStatus =
  | "usable"
  | "missing"
  | "missing-trust"
  | "constraint-mismatch"
  | "wrong-origin"
  | "corrupt"
  | "incomplete"
  | "locally-modified"
  | "not-applicable";

export interface SourceAuthorityTarget {
  readonly type: ExtensionType;
  readonly name: string;
  readonly identity: string;
}

export interface SourceAuthorityInput {
  readonly target: SourceAuthorityTarget;
  readonly relationship: SourceAuthorityRelationship;
  readonly requested: {
    readonly identity: string;
    readonly workspace: boolean;
  };
  readonly configured?: {
    readonly identity: string;
    readonly workspace: boolean;
    readonly version?: string;
    readonly status?: WorkspaceAuthorityStatus;
  };
  readonly requiredVersionRange?: string;
  readonly allowWorkspaceReplacement?: boolean;
}

export type SourceAuthorityBlockedCause =
  | "workspace-source-replacement"
  | "workspace-identity-mismatch"
  | "workspace-version-incompatible"
  | "workspace-unusable";

export interface SourceAuthorityBlockedFact {
  readonly id: string;
  readonly target: SourceAuthorityTarget;
  readonly relationship: SourceAuthorityRelationship;
  readonly requestedSource: string;
  readonly configuredSource: string;
  readonly cause: SourceAuthorityBlockedCause;
  readonly detail: string;
  readonly workspaceVersion?: string;
  readonly requiredVersionRange?: string;
  readonly recovery: ReadonlyArray<{ readonly description: string }>;
}

export type SourceAuthorityDecision =
  | { readonly kind: "allow-requested" }
  | {
      readonly kind: "workspace-satisfied";
      readonly target: SourceAuthorityTarget;
      readonly relationship: Extract<SourceAuthorityRelationship, { readonly kind: "member" }>;
      readonly configuredSource: string;
      readonly workspaceVersion?: string;
    }
  | { readonly kind: "blocked"; readonly fact: SourceAuthorityBlockedFact };

const blocked = (
  input: SourceAuthorityInput,
  configured: NonNullable<SourceAuthorityInput["configured"]>,
  cause: SourceAuthorityBlockedCause,
  detail: string,
  recovery: ReadonlyArray<{ readonly description: string }>,
): SourceAuthorityDecision => ({
  kind: "blocked",
  fact: {
    id: `workspace-authority:${input.relationship.kind}:${input.target.identity}:${cause}`,
    target: input.target,
    relationship: input.relationship,
    requestedSource: input.requested.identity,
    configuredSource: configured.identity,
    cause,
    detail,
    ...(configured.version === undefined ? {} : { workspaceVersion: configured.version }),
    ...(input.requiredVersionRange === undefined
      ? {}
      : { requiredVersionRange: input.requiredVersionRange }),
    recovery,
  },
});

export const evaluateSourceAuthority = (input: SourceAuthorityInput): SourceAuthorityDecision => {
  const configured = input.configured;
  if (
    configured === undefined ||
    !configured.workspace ||
    input.requested.workspace ||
    input.allowWorkspaceReplacement === true
  ) {
    return { kind: "allow-requested" };
  }

  if (input.relationship.kind === "root") {
    return blocked(
      input,
      configured,
      "workspace-source-replacement",
      `Cannot install over workspace-sourced ${input.target.type} "${input.target.name}" with ${input.requested.identity}`,
      [
        {
          description:
            "Preserve the workspace source, or explicitly transition its authority before installing a different source.",
        },
      ],
    );
  }

  const configuredIdentity = configured.identity.startsWith("workspace:")
    ? configured.identity.slice("workspace:".length)
    : configured.identity;
  if (configuredIdentity !== input.target.identity) {
    return blocked(
      input,
      configured,
      "workspace-identity-mismatch",
      `Workspace dependency ${configuredIdentity} does not match required ${input.target.identity}`,
      [
        {
          description:
            "Rename or remove the conflicting workspace dependency, or explicitly transition its authority.",
        },
      ],
    );
  }

  if (
    configured.status !== undefined &&
    configured.status !== "usable" &&
    configured.status !== "constraint-mismatch"
  ) {
    return blocked(
      input,
      configured,
      "workspace-unusable",
      `Workspace dependency ${input.target.identity} is ${configured.status}`,
      [
        {
          description: `Repair or explicitly remove the ${configured.status} workspace dependency before installing the pack.`,
        },
      ],
    );
  }

  if (
    input.requiredVersionRange !== undefined &&
    (configured.version === undefined ||
      !semver.satisfies(configured.version, input.requiredVersionRange))
  ) {
    return blocked(
      input,
      configured,
      "workspace-version-incompatible",
      `Workspace dependency ${input.target.identity}@${configured.version ?? "unknown"} does not satisfy ${input.requiredVersionRange}`,
      [
        {
          description: `Update the workspace dependency to satisfy ${input.requiredVersionRange}, or explicitly transition its authority.`,
        },
      ],
    );
  }

  return {
    kind: "workspace-satisfied",
    target: input.target,
    relationship: input.relationship,
    configuredSource: configured.identity,
    ...(configured.version === undefined ? {} : { workspaceVersion: configured.version }),
  };
};
