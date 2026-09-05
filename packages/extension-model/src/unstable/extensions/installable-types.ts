import * as Schema from "effect/Schema";

import {
  extensionTypeFromPlural,
  extensionTypePluralSegments,
  extensionTypes,
  extensionTypeToPlural,
  isExtensionType,
  isExtensionTypePlural,
} from "./common.js";

export const installableExtensionTypes = extensionTypes;

export type InstallableExtensionType = (typeof installableExtensionTypes)[number];

export const isInstallableExtensionType = (
  value: string | undefined,
): value is InstallableExtensionType => isExtensionType(value);

export const installableExtensionTypePluralSegments = extensionTypePluralSegments;

export type InstallableExtensionTypePlural =
  (typeof installableExtensionTypePluralSegments)[number];

export const isInstallableExtensionTypePlural = (
  value: string | undefined,
): value is InstallableExtensionTypePlural => isExtensionTypePlural(value);

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
