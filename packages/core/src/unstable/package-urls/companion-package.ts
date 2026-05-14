import * as Schema from "effect/Schema";
import { parsePurlIdentity } from "./internal.js";
import { PackageIdentityPurlSchema } from "./package-identity-purl.js";
import { splitVersAtScheme, VersRangeSchema } from "./vers-range.js";

const CompanionPackageShapeSchema = Schema.Struct({
  purl: PackageIdentityPurlSchema,
  versionRange: Schema.optional(VersRangeSchema),
}).annotate({
  identifier: "CompanionPackageShape",
  title: "Companion Package",
  description: "A companion package purl identity with an optional VERS compatibility range.",
});

type CompanionPackageShape = Schema.Schema.Type<typeof CompanionPackageShapeSchema>;

const validateCompanionPackage = (value: CompanionPackageShape): string | undefined => {
  if (value.versionRange === undefined) {
    return undefined;
  }

  const parsed = parsePurlIdentity(value.purl);
  if (typeof parsed === "string") {
    return parsed;
  }

  let versionRangeScheme: string;
  if (typeof value.versionRange === "string") {
    const split = splitVersAtScheme(value.versionRange);
    if (typeof split === "string") {
      return split;
    }
    versionRangeScheme = split.scheme;
  } else {
    versionRangeScheme = value.versionRange.scheme;
  }

  return parsed.type === versionRangeScheme
    ? undefined
    : `Companion package purl ecosystem '${parsed.type}' must match VERS scheme '${versionRangeScheme}'.`;
};

export const CompanionPackageSchema = CompanionPackageShapeSchema.pipe(
  Schema.check(Schema.makeFilter(validateCompanionPackage)),
  Schema.annotate({
    identifier: "CompanionPackage",
    title: "Companion Package",
    description:
      "A companion package declaration. The purl is an identity-only Package URL; versionRange is an optional VERS expression whose scheme must match the purl ecosystem.",
  }),
);

export type CompanionPackage = Schema.Schema.Type<typeof CompanionPackageSchema>;
