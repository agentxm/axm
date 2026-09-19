import * as Schema from "effect/Schema";

import {
  extensionTypeFromPlural,
  extensionSourceFamilies,
  extensionTypesInstallableFrom,
  extensionTypeToPlural,
} from "./common.js";

export const installableExtensionTypes = extensionSourceFamilies
  .flatMap((family) => extensionTypesInstallableFrom(family))
  .filter((type, index, types) => types.indexOf(type) === index);

export type InstallableExtensionType = (typeof installableExtensionTypes)[number];

const installableExtensionTypeSet = new Set<string>(installableExtensionTypes);

export const isInstallableExtensionType = (
  value: string | undefined,
): value is InstallableExtensionType =>
  value !== undefined && installableExtensionTypeSet.has(value);

export const installableExtensionTypePluralSegments = installableExtensionTypes.map(
  (type) => extensionTypeToPlural[type],
);

export type InstallableExtensionTypePlural =
  (typeof installableExtensionTypePluralSegments)[number];

const installableExtensionTypePluralSet = new Set<string>(installableExtensionTypePluralSegments);

export const isInstallableExtensionTypePlural = (
  value: string | undefined,
): value is InstallableExtensionTypePlural =>
  value !== undefined && installableExtensionTypePluralSet.has(value);

const installableExtensionTypeFromPlural: Record<
  InstallableExtensionTypePlural,
  InstallableExtensionType
> = extensionTypeFromPlural;

const installableExtensionTypeToPlural: Record<
  InstallableExtensionType,
  InstallableExtensionTypePlural
> = extensionTypeToPlural;

export const toInstallableExtensionType = (
  segment: InstallableExtensionTypePlural,
): InstallableExtensionType => installableExtensionTypeFromPlural[segment];

export const toInstallableExtensionTypePlural = (
  type: InstallableExtensionType,
): InstallableExtensionTypePlural => installableExtensionTypeToPlural[type];

export const InstallableExtensionTypeSchema = Schema.Literals(installableExtensionTypes).annotate({
  identifier: "InstallableExtensionType",
  title: "Installable Extension Type",
  description: "Extension types supported by install-oriented CLI and registry flows.",
});

export const InstallableExtensionTypePluralSchema = Schema.Literals(
  installableExtensionTypePluralSegments,
).annotate({
  identifier: "InstallableExtensionTypePlural",
  title: "Installable Extension Type (Plural)",
  description:
    "Plural extension type segments supported by install-oriented CLI and registry flows.",
});
