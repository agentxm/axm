import * as DateTime from "effect/DateTime";

import {
  extensionTypeToPlural,
  parseExtensionFqnParts,
} from "@agentxm/extension-model/unstable/extensions";
import type { DeprecationView } from "@agentxm/extension-model/unstable/extensions/deprecation";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import type { ViewDocument } from "@agentxm/workspace/inspection";

import type { Doc, Field, Span, Text } from "../../screen/index.js";
import { extensionTypeText } from "../inventory-view.js";

/** Versions the page names before it gives the total instead. */
const LISTED_VERSIONS = 5;

/** Stands in for a fact the Registry did not report. */
const NOT_REPORTED = "—";

const dim = (value: string): Span => ({ text: value, tone: "dim" });

/**
 * The identity line's aside: what kind of extension this is, who can see it,
 * and whether it is still active. A deprecated extension says so in warning
 * tone, because it is the one fact that changes what a reader should do.
 */
const identityAside = (data: ViewDocument): ReadonlyArray<Span> => [
  ...spansOf(extensionTypeText(data.type)),
  dim(`, ${data.visibility}, `),
  data.deprecation === null ? dim("active") : { text: "deprecated", tone: "warn" },
];

const spansOf = (value: Text): ReadonlyArray<Span> =>
  typeof value === "string" ? [{ text: value }] : value;

const deprecatedOn = (deprecation: DeprecationView): string =>
  `Deprecated on ${DateTime.format(deprecation.deprecatedAt, {
    locale: "en-GB",
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;

const replacementText = (deprecation: DeprecationView): Text | undefined => {
  const replacement = deprecation.replacement;
  if (replacement === undefined) return undefined;
  if (replacement.status === "available") return replacement.fqn;
  return [
    ...(replacement.fqn === undefined ? [] : [{ text: `${replacement.fqn} ` }]),
    dim(replacement.fqn === undefined ? "unavailable or not visible" : "(unavailable)"),
  ];
};

const versionsText = (data: ViewDocument): Text => {
  const versions = data.versions.map((entry) => entry.version);
  if (versions.length === 0) return NOT_REPORTED;
  return versions.length <= LISTED_VERSIONS
    ? versions.join(", ")
    : [
        { text: `${versions.slice(0, LISTED_VERSIONS).join(", ")} ` },
        dim(`(${String(versions.length)} total)`),
      ];
};

/**
 * The one command worth copying: the install of this extension, or — once it
 * is deprecated for an available replacement — the install of that
 * replacement, on the route its own type registers.
 */
const nextAction = (data: ViewDocument): SuggestedAction => {
  const replacement = data.deprecation?.replacement;
  const parts =
    replacement?.status === "available" ? parseExtensionFqnParts(replacement.fqn) : undefined;
  return replacement?.status === "available" && parts !== undefined
    ? {
        description: "Install the replacement",
        cmd: `axm ${extensionTypeToPlural[parts.type]} install ${replacement.fqn}`,
      }
    : { description: "Install this extension", cmd: data.install };
};

/**
 * `axm view` as a detail page: the identity line with its aside, the
 * description, a deprecation notice when there is one, the facts as fields,
 * and the one command worth copying.
 */
export const viewPageDoc = (data: ViewDocument): Doc => {
  const deprecation = data.deprecation;
  const replacement = deprecation === null ? undefined : replacementText(deprecation);
  const fields: ReadonlyArray<Field> = [
    { label: "Owner", value: data.owner },
    { label: "Latest", value: data.latest?.version ?? NOT_REPORTED },
    { label: "Versions", value: versionsText(data) },
    ...(replacement === undefined ? [] : [{ label: "Replacement", value: replacement }]),
  ];
  return [
    {
      _tag: "headline",
      tone: "neutral",
      text: [{ text: data.handle, bold: true }],
      aside: identityAside(data),
    },
    ...(data.description === undefined || data.description.length === 0
      ? []
      : [{ _tag: "paragraph", text: data.description } as const]),
    { _tag: "blank" },
    ...(deprecation === null
      ? []
      : [
          {
            _tag: "callout",
            tone: "warn",
            title: deprecatedOn(deprecation),
            ...(deprecation.message === undefined
              ? {}
              : { children: [{ _tag: "paragraph", text: deprecation.message } as const] }),
          } as const,
          { _tag: "blank" } as const,
        ]),
    { _tag: "fields", fields },
    { _tag: "blank" },
    { _tag: "next", actions: [nextAction(data)] },
  ];
};
