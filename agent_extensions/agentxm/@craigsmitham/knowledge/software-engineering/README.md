# Software engineering knowledge

Portable engineering craft for reviewing codebases and shaping repository
execution surfaces. It is intended for engineers and agents who need a
bounded, evidence-backed review of a repository or a coherent invocation
contract for its build, test, and automation work.

Use the codebase-review collection for ten outcome-centered software-product
quality lists: Suitability, Correctness, Reliability, Security, Safety,
Efficiency, Usability, Compatibility, Evolvability, and Intelligibility. Eight
typed cross-cutting records preserve context, specification, structure,
lifecycle integrity, risk, assurance, feedback, and evidence without turning
methods or supporting artifacts into extra pillars. Test-suite quality has a
separate supporting assessment, and optional review aids hold repository,
scenario, verification, runtime, and model-assisted inspection guidance.

Use the repository task-interface guide to make repository work discoverable,
safe to invoke, and trustworthy to interpret through canonical resolved task
contracts, explicit execution boundaries, self-sufficient tasks, deliberate
dependency and cache semantics, and bounded entrypoints.
This bundle is not a software-change method, requirements or architecture
lifecycle, work-item guidance, documentation craft, or a language or framework
reference.

The review framework is a source-reviewed and synthetic-design-reviewed
candidate, not a field-validated control. It supports coverage and traceability
but does not certify the reviewed product.

Earlier versions of this bundle (through 1.1.0) held design-change and
work-item guidance. Version 2.0.0 re-established the package around repository
execution surfaces; version 2.1.0 added the bounded codebase-review collection;
version 2.2.0 refactors that collection around product-quality outcomes without
reclaiming the retired change-method or work-item scope; version 2.3.0 reframes
command execution as a coherent repository task interface for developers,
agents, and automation.

Install the pack with:

```bash
axm packs install @craigsmitham/packs/software-engineering
```

Or install the standalone knowledge bundle directly:

```bash
axm install @craigsmitham/knowledge/software-engineering
```

Then browse its discovery index or search installed concepts, for example:

```bash
axm knowledge concepts search '"repository task interface"'
axm knowledge concepts search '"codebase review"'
```

This knowledge package is licensed under the Creative Commons
Attribution-ShareAlike 4.0 International license (`CC-BY-SA-4.0`). The
reciprocal license applies to the package content; it does not automatically
apply to unrelated output created while using the package.
