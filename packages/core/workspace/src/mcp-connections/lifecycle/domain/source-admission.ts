import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ExtensionName, Handle } from "@agentxm/extension-model/unstable/extensions";
import { intersectVersionConstraints } from "@agentxm/extension-model/unstable/version-constraints";

export type McpSourceConstraintOrigin =
  | {
      readonly kind: "connection";
      readonly name: string | undefined;
      readonly constraint: string | undefined;
    }
  | {
      readonly kind: "pack";
      readonly name: string;
      readonly constraint: string;
    };

export interface McpConnectionSourceState {
  /** A missing connection is available; an inline connection has no source identity. */
  readonly localConnection: { readonly sourceIdentity: string | null } | undefined;
  readonly origins: ReadonlyArray<McpSourceConstraintOrigin>;
}

export class McpConnectionConflict extends Data.TaggedError("McpConnectionConflict")<{
  readonly reason: string;
}> {}

/** One local name must retain its source, and every remaining origin must accept the version. */
export const selectMcpSourceConstraint = (
  input: {
    readonly owner: Handle;
    readonly serverName: ExtensionName;
    readonly localName: ExtensionName;
    readonly sourceIdentity: string;
    readonly versionRange: Option.Option<string>;
  },
  state: McpConnectionSourceState,
): Effect.Effect<Option.Option<string>, McpConnectionConflict> =>
  Effect.gen(function* () {
    if (
      state.localConnection !== undefined &&
      state.localConnection.sourceIdentity !== input.sourceIdentity
    ) {
      return yield* new McpConnectionConflict({
        reason: `Local MCP name "${input.localName}" is already owned by a different source`,
      });
    }

    const retainedConstraints = state.origins.flatMap((origin) => {
      if (origin.constraint === undefined) return [];
      if (origin.kind === "connection" && origin.name === input.localName) return [];
      return [origin.constraint];
    });
    const requestedConstraints = Option.match(input.versionRange, {
      onNone: () => retainedConstraints,
      onSome: (range) => [...retainedConstraints, range],
    });
    const combinedConstraint = intersectVersionConstraints(requestedConstraints);
    if (requestedConstraints.length > 0 && combinedConstraint === undefined) {
      const contributors = state.origins
        .filter((origin) => origin.constraint !== undefined)
        .map((origin) => `${origin.name ?? "settings"}:${origin.constraint}`);
      return yield* new McpConnectionConflict({
        reason: `MCP source constraints do not intersect for ${input.owner}/mcps/${input.serverName}: ${[
          ...contributors,
          `${input.localName}:${Option.getOrElse(input.versionRange, () => "*")}`,
        ].join(", ")}`,
      });
    }

    return combinedConstraint === undefined ? Option.none() : Option.some(combinedConstraint);
  });
