import { Graph, alg } from "@dagrejs/graphlib";
import { createRequire } from "node:module";
import { join } from "node:path";
import { capabilityFileRules } from "./boundaries.mjs";

// Use the package's supported CommonJS entry, as the ESLint plugin does. Its
// ESM build currently attempts a dynamic require when constructing a matcher.
const { Elements } = createRequire(import.meta.url)("@boundaries/elements");

/**
 * dependency-cruiser owns source extraction; JS Boundaries owns capability
 * classification; Graphlib owns cycle detection. Native folder metrics retain
 * target role folders and cannot detect every cycle between capabilities.
 */
export function capabilityCycles(modules, rootPath, elements, declaredRoles = []) {
  const matcher = new Elements({ rootPath }).getMatcher({
    elements,
    elementsSingleMatch: true,
    files: capabilityFileRules(elements, declaredRoles),
    filesSingleMatch: true,
  });
  const graph = new Graph({ directed: true });
  const ownerByFile = new Map();
  for (const module of modules) {
    if (module.coreModule || module.couldNotResolve || module.matchesDoNotFollow) continue;
    const owner = matcher.describeElement(join(rootPath, module.source));
    if (owner.isUnknown || owner.path === null) {
      throw new Error(`Unclassified source in capability graph: ${module.source}`);
    }
    const file = matcher.describeFile(join(rootPath, module.source));
    if (file.isUnknown) {
      throw new Error(`Unclassified architectural role in capability graph: ${module.source}`);
    }
    // Adapter and composition imports express dependency inversion and wiring,
    // not dependencies between domain/application capabilities. File-cycle
    // analysis still includes them; the capability graph includes policy only.
    if (
      !file.categories.some((category) =>
        ["domain", "domain-api", "application", "application-api"].includes(category),
      )
    )
      continue;
    ownerByFile.set(module.source, owner.path);
    graph.setNode(owner.path);
  }
  for (const module of modules) {
    const from = ownerByFile.get(module.source);
    if (from === undefined) continue;
    for (const dependency of module.dependencies) {
      const to = ownerByFile.get(dependency.resolved);
      if (to !== undefined && to !== from) graph.setEdge(from, to);
    }
  }
  return alg.findCycles(graph).map((members) => members.sort());
}
