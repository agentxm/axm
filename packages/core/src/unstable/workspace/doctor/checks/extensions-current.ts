/**
 * Doctor check: extensions-current
 *
 * Compares installed extension versions against registry availability and emits
 * info-severity findings for non-current extensions.
 *
 * Depends on `extensions-installed` — if that check fails, this one is skipped
 * by the runner's dependency cascade.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { extensionTypeSentenceLabels } from "../../../extensions/index.js";
import type { RegistryClient } from "../../../registry/client.js";
import type { ExtensionCurrencyEntry } from "../../version-currency/index.js";
import { collectAllCurrencyEntries } from "../../version-currency/index.js";
import { defineCheck, type DiagnosticDef } from "../check-def.js";
import { CHECK_IDS, type Finding } from "../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExtensionsCurrentContext {
  readonly entries: ReadonlyArray<ExtensionCurrencyEntry>;
}

// ---------------------------------------------------------------------------
// Finding builders
// ---------------------------------------------------------------------------

const makeFinding = (args: {
  readonly suffix: string;
  readonly severity: "info";
  readonly message: string;
  readonly subject: { readonly kind: "extension"; readonly ref: string };
  readonly details?: string;
  readonly action: {
    readonly label: string;
    readonly description: string;
    readonly command: string;
  };
}): Finding => ({
  id: `${CHECK_IDS.extensionsCurrent}.${args.suffix}`,
  severity: args.severity,
  message: args.message,
  subject: args.subject,
  ...(args.details === undefined ? {} : { details: args.details }),
  action: args.action,
});

const updateAction = (ref: string) => ({
  label: "Update",
  description: `Update ${ref} to the latest available version`,
  command: `axm update ${ref}`,
});

const buildCurrencyFindings = (
  entries: ReadonlyArray<ExtensionCurrencyEntry>,
): ReadonlyArray<Finding> =>
  entries.flatMap((entry) => {
    const { currency } = entry;

    if (currency.status === "current") return [];

    const subject = { kind: "extension" as const, ref: entry.ref };

    if (currency.status === "major-update-available") {
      return [
        makeFinding({
          suffix: "major-update-available",
          severity: "info",
          message: `A major update is available for the ${extensionTypeSentenceLabels[entry.type]} "${entry.ref}".`,
          subject,
          details: `Installed ${entry.installedVersion}, latest ${currency.latestAvailable}`,
          action: updateAction(entry.ref),
        }),
      ];
    }

    // update-available
    const latestStr = Option.match(currency.latestMatching, {
      onNone: () => currency.latestAvailable,
      onSome: (ver) => ver,
    });

    return [
      makeFinding({
        suffix: "update-available",
        severity: "info",
        message: `An update is available for the ${extensionTypeSentenceLabels[entry.type]} "${entry.ref}".`,
        subject,
        details: `Installed ${entry.installedVersion}, latest matching ${latestStr}`,
        action: updateAction(entry.ref),
      }),
    ];
  });

// ---------------------------------------------------------------------------
// Diagnostic
// ---------------------------------------------------------------------------

const extensionsCurrentDiagnostic: DiagnosticDef<ExtensionsCurrentContext, never> = {
  id: "extensions-current.currency",
  run: (ctx) => Effect.succeed(buildCurrencyFindings(ctx.entries)),
};

// ---------------------------------------------------------------------------
// Check factory
// ---------------------------------------------------------------------------

/**
 * Create the extensions-current check.
 *
 * Accepts a `RegistryClient` so callers (diagnose, tests) can inject the client
 * appropriate for their context.
 */
export const makeExtensionsCurrentCheck = (client: RegistryClient) =>
  defineCheck({
    id: CHECK_IDS.extensionsCurrent,
    title: "Extensions are current",
    description:
      "Checks whether installed extension versions are the latest available from the registry.",
    dependsOn: [CHECK_IDS.extensionsInstalled],
    prepareContext: Effect.gen(function* () {
      const entries = yield* collectAllCurrencyEntries(client).pipe(
        Effect.orElseSucceed((): ReadonlyArray<ExtensionCurrencyEntry> => []),
      );
      return { entries } satisfies ExtensionsCurrentContext;
    }),
    diagnostics: [extensionsCurrentDiagnostic],
  });
