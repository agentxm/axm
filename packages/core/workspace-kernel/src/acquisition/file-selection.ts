import ignore from "ignore";

/** Paths are source-root-relative POSIX paths, without a trailing slash. */
export interface SelectionPath {
  readonly path: string;
  readonly kind: "file" | "directory" | "symlink";
}

export type SelectionRuleOrigin =
  | { readonly kind: "gitignore"; readonly file: string; readonly line: number }
  | { readonly kind: "manifest"; readonly field: "include" | "exclude"; readonly index: number }
  | { readonly kind: "builtin"; readonly rule: "git-administration" | "required-manifest" };

export interface SelectionRule {
  readonly pattern: string;
  /** Directory relative to the discovery boundary, not the package root. */
  readonly baseDirectory: string;
  readonly origin: SelectionRuleOrigin;
}

export interface SelectionDecision {
  readonly included: boolean;
  readonly reason: "default" | "allowlist-miss" | "rule";
  readonly decidingRule?: SelectionRule;
  readonly matchedRules: ReadonlyArray<SelectionRule>;
}

export interface FileSelectionInput {
  readonly packageDirectory: string;
  readonly gitignore: ReadonlyArray<SelectionRule>;
  readonly include?: ReadonlyArray<string>;
  readonly exclude?: ReadonlyArray<string>;
  readonly manifest?: string;
}

export interface ResolvedFileSelection {
  readonly rules: ReadonlyArray<SelectionRule>;
  readonly evaluate: (entry: SelectionPath) => SelectionDecision;
}

const declaredRules = (
  field: "include" | "exclude",
  patterns: ReadonlyArray<string>,
  baseDirectory: string,
): ReadonlyArray<SelectionRule> =>
  patterns.map((pattern, index) => ({
    pattern,
    baseDirectory,
    origin: { kind: "manifest", field, index },
  }));

/** Adopt Git's pattern grammar; AXM owns precedence and the source coordinates. */
export const resolveFileSelection = (input: FileSelectionInput): ResolvedFileSelection => {
  const includes = declaredRules("include", input.include ?? [], input.packageDirectory);
  const excludes = declaredRules("exclude", input.exclude ?? [], input.packageDirectory);
  const baseline = input.include === undefined ? input.gitignore : includes;
  const rules = [...baseline, ...excludes];
  const compiled = rules.map((rule) => ({
    rule,
    negative: rule.pattern.startsWith("!"),
    matcher: ignore({ ignorecase: false }).add(
      rule.pattern.startsWith("!#")
        ? `\\${rule.pattern.slice(1)}`
        : rule.pattern.startsWith("!")
          ? rule.pattern.slice(1)
          : rule.pattern,
    ),
  }));

  const matches = (entry: SelectionPath, rule: (typeof compiled)[number]): boolean => {
    const prefix = rule.rule.baseDirectory === "" ? "" : `${rule.rule.baseDirectory}/`;
    if (!entry.path.startsWith(prefix)) return false;
    const relative = entry.path.slice(prefix.length);
    return (
      relative !== "" && rule.matcher.ignores(`${relative}${entry.kind === "directory" ? "/" : ""}`)
    );
  };

  const decide = (entry: SelectionPath, stage: "baseline" | "exclude"): SelectionDecision => {
    let included = stage === "exclude" || input.include === undefined;
    let decidingRule: SelectionRule | undefined;
    const matchedRules: Array<SelectionRule> = [];
    for (const rule of compiled) {
      const isExclusion =
        rule.rule.origin.kind === "manifest" && rule.rule.origin.field === "exclude";
      if ((stage === "exclude") !== isExclusion || !matches(entry, rule)) continue;
      matchedRules.push(rule.rule);
      included =
        stage === "baseline" && input.include !== undefined ? !rule.negative : rule.negative;
      decidingRule = rule.rule;
    }
    return {
      included,
      reason: decidingRule === undefined ? (included ? "default" : "allowlist-miss") : "rule",
      ...(decidingRule === undefined ? {} : { decidingRule }),
      matchedRules,
    };
  };

  const evaluate = (entry: SelectionPath): SelectionDecision => {
    if (entry.path.split("/").includes(".git")) {
      const rule: SelectionRule = {
        pattern: ".git",
        baseDirectory: "",
        origin: { kind: "builtin", rule: "git-administration" },
      };
      return { included: false, reason: "rule", decidingRule: rule, matchedRules: [rule] };
    }
    // Git cannot reinclude a child of an excluded directory. An include list is
    // an ordered allowlist, so its negative rules can narrow a selected tree.
    const boundaryEntry = {
      ...entry,
      path: input.packageDirectory === "" ? entry.path : `${input.packageDirectory}/${entry.path}`,
    };
    const parts = boundaryEntry.path.split("/");
    const ancestors = parts.slice(0, -1).map((_, index): SelectionPath => ({
      path: parts.slice(0, index + 1).join("/"),
      kind: "directory",
    }));
    const baselineDecision =
      input.include === undefined
        ? ([...ancestors, boundaryEntry]
            .map((candidate) => decide(candidate, "baseline"))
            .find((decision) => !decision.included) ?? decide(boundaryEntry, "baseline"))
        : decide(boundaryEntry, "baseline");
    const exclusionDecision =
      [...ancestors, boundaryEntry]
        .map((candidate) => decide(candidate, "exclude"))
        .find((decision) => !decision.included) ?? decide(boundaryEntry, "exclude");
    const decision = baselineDecision.included ? exclusionDecision : baselineDecision;
    const matchedRules = [...baselineDecision.matchedRules, ...exclusionDecision.matchedRules];
    if (entry.path === input.manifest && exclusionDecision.included) {
      const rule: SelectionRule = {
        pattern: input.manifest,
        baseDirectory: input.packageDirectory,
        origin: { kind: "builtin", rule: "required-manifest" },
      };
      return { included: true, reason: "rule", decidingRule: rule, matchedRules };
    }
    return { ...decision, matchedRules };
  };
  return { rules, evaluate };
};
