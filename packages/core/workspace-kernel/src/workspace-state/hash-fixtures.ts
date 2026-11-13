import { createHash } from "node:crypto";
import { SourceHashSchema } from "@agentxm/extension-model/unstable/sources/source-hash";
import { ProjectionDigestSchema } from "./desired/lockfile/projections.js";

/** Independent bytes for pure fixture setup; never runs the instrumented hash owner. */
export const sourceHashFixture = (bytes: string) =>
  SourceHashSchema.make(createHash("sha256").update(bytes).digest("hex"));

/** A recorded projection row constructed independently from the production owner. */
export const projectionDigestFixture = (bytes: string) =>
  ProjectionDigestSchema.make(`sha256:${sourceHashFixture(bytes)}`);

/**
 * Construct accepted Pack fixture bytes in pure native setup. Only the five
 * manifest identity fields and the two supported member forms participate.
 * This independent encoder is fixture construction, not a hash-algorithm oracle.
 */
export const packIdentityFixture = (manifest: {
  readonly owner: string;
  readonly type: "pack";
  readonly name: string;
  readonly version: string;
  readonly dependencies: Readonly<
    Record<
      string,
      | string
      | {
          readonly source: { readonly type: "registry"; readonly url: { readonly href: string } };
          readonly versionRange: string;
        }
    >
  >;
}) =>
  sourceHashFixture(
    JSON.stringify({
      dependencies: Object.fromEntries(
        Object.entries(manifest.dependencies)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([name, constraint]) => {
            return [
              name,
              typeof constraint === "string"
                ? constraint
                : {
                    source: {
                      type: constraint.source.type,
                      url: new URL(constraint.source.url.href).href,
                    },
                    versionRange: constraint.versionRange,
                  },
            ];
          }),
      ),
      name: manifest.name,
      owner: manifest.owner,
      type: manifest.type,
      version: manifest.version,
    }),
  );
