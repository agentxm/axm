/**
 * Knowledge subject: the canonical subject over `settings.knowledge`,
 * `axm.lock` `knowledge` and the canonical-extensions scanner
 * (`type === "knowledge"`), which enumerates project-authored
 * `knowledge/<name>/src`, project-acquired
 * `agent_extensions/<family>/<owner>/knowledge/<name>`, and user-scope packages.
 *
 * Knowledge installs also write two derived artifacts: the
 * `.axm/knowledge/index.md` catalog and the discovery region inside the agent
 * instructions file. Both live outside canonical package roots, so the
 * canonical scanner never sees them and they cannot become occurrences.
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

export type ActualKnowledgeBundle = ActualExtension<"knowledge">;
export type InstalledKnowledgeBundle = InstalledExtension<"knowledge", ActualKnowledgeBundle>;
export type KnowledgeExtensionsApi = CanonicalSubjectApi<"knowledge", ActualKnowledgeBundle>;

export const makeKnowledgeExtensionsApi = ({
  scope,
  loaders,
  scanners,
}: CanonicalSubjectDeps): Effect.Effect<KnowledgeExtensionsApi> =>
  makeCanonicalSubjectApi("knowledge", {
    scope,
    loaders,
    actual: canonicalActuals("knowledge", scope, scanners.canonical),
  });
