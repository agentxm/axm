/**
 * Hook subject: the canonical subject over `settings.hooks`, `axm.lock`
 * `hooks` and the canonical-extensions scanner (`type === "hook"`), which
 * enumerates project-authored `hooks/<name>/src`, project-acquired
 * `agent_extensions/<family>/<owner>/hooks/<name>`, and user-scope packages.
 *
 * The hook installer also writes managed hook groups inside native agent
 * settings files. Those are renderings of an installed hook, not separate
 * materializations, so they are deliberately NOT occurrences and never
 * produce an unmanaged row.
 */

import type * as Effect from "effect/Effect";
import {
  canonicalActuals,
  makeCanonicalSubjectApi,
  type ActualExtension,
  type CanonicalSubjectApi,
  type CanonicalSubjectDeps,
  type InstalledExtension,
} from "./canonical-subject.js";

export type ActualHook = ActualExtension<"hook">;
export type InstalledHook = InstalledExtension<"hook", ActualHook>;
export type HookExtensionsApi = CanonicalSubjectApi<"hook", ActualHook>;

export const makeHookExtensionsApi = ({
  scope,
  loaders,
  scanners,
}: CanonicalSubjectDeps): Effect.Effect<HookExtensionsApi> =>
  makeCanonicalSubjectApi("hook", {
    scope,
    loaders,
    actual: canonicalActuals("hook", scope, scanners.canonical),
  });
