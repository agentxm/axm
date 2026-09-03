---
__default__: minor
---

# Shared executable-specification contract

## New public surface

- `@agentxm/extension-model/unstable/specifications` publishes the shared
  executable-specification contract: the six-lens `class` vocabulary
  (`functional`, `quality`, `constraint`, `external-conformance`,
  `human-factors`, `process`), the role, boundary, selection, method, and
  quality-characteristic vocabularies, the `SpecificationMetadata` shape with
  `statement`, `status`, `boundaryRationale`, `derivedFrom`, `supersedes`,
  `assumptions`, `openQuestions`, and `limitations`, the shared product-goal
  registry (`sharedProductGoals`), Schema-backed decoders, and the pure
  `checkSpecificationCorpus` conformance check that every AgentXM
  specification corpus runs.

## Breaking changes

- The AXM specification corpus is rebound to the shared contract. The former
  `installability`, `compatibility`, `performance`, and `security` classes are
  now `quality` with a `characteristic`; `usability` is `human-factors`; and
  `architecture` is `constraint`. `pnpm test:spec --class` selects by the new
  lens and `--characteristic` selects a quality characteristic;
  `pnpm test:compatibility` and `pnpm test:performance` select by
  characteristic.
- `specifications/support/contract.ts` is removed; specifications import
  `defineSpecification` and its companions from
  `@agentxm/extension-model/unstable/specifications`. The local product-goal
  registry keeps only AXM-specific goals and references shared goals by
  identity.
