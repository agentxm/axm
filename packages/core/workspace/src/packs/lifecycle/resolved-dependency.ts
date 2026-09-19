/**
 * Pack lock-entry validation over the resolved dependency map: the map's
 * shape belongs to `@agentxm/workspace/resolution`; refusing an inexact
 * version before a lock entry is written is the pack manager's obligation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { PackDefinitionInvalid } from "../../materialization/index.js";
import type { ResolvedPackDependencyMap } from "../../resolution/index.js";
import { VersionSchema } from "@agentxm/extension-model/unstable/version-constraints";

export const validateExactPackDependencyVersions = (
  field: string,
  resolved: ResolvedPackDependencyMap,
) =>
  Effect.forEach(
    Object.entries(resolved),
    ([fqn, value]) =>
      value.source === "registry" || value.source === "workspace"
        ? Schema.decodeUnknownEffect(VersionSchema)(value.version).pipe(
            Effect.mapError(
              (cause) =>
                new PackDefinitionInvalid({
                  detail: `Pack dependency ${field}.${fqn}.version must be an exact semver value`,
                  cause,
                }),
            ),
          )
        : Effect.void,
    { concurrency: "unbounded", discard: true },
  );
