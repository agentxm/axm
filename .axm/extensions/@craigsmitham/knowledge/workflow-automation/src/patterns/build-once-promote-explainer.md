---
type: Explanation
title: Build once and promote
description: Why delivery workflows should produce one identifiable artifact and advance that same artifact through validation and target environments.
tags: [workflow, pattern, artifact, build, promotion, provenance]
status: draft
sources:
  - id: twelve-factor
    resource: https://12factor.net/build-release-run
    title: The Twelve-Factor App — Build, release, run
  - id: fowler-deployment-pipeline
    resource: https://martinfowler.com/bliki/DeploymentPipeline.html
    title: Martin Fowler — Deployment Pipeline
  - id: dora-continuous-delivery
    resource: https://dora.dev/capabilities/continuous-delivery/
    title: DORA continuous delivery capability
generated:
  by: openai/gpt-5
  at: 2026-08-08T16:15:49Z
---

# Build once and promote

**Build once and promote** produces one identifiable artifact, validates it,
and advances that same artifact through later lifecycle stages and target
environments. Later work selects, verifies, configures, and deploys the
artifact; it does not recreate nominally equivalent output from source.

The Twelve-Factor App distinguishes build, release, and run: build creates an
executable bundle, release combines the build with target configuration, and
run executes that release.[^twelve-factor] Deployment-pipeline descriptions
similarly place compilation early so later stages examine and advance the
resulting binaries.[^fowler-deployment-pipeline]

[^twelve-factor]: The Twelve-Factor App — Build, release, run

[^fowler-deployment-pipeline]: Martin Fowler — Deployment Pipeline

## Context and intent

Use this pattern when later decisions depend on the claim that the thing being
deployed or published is the thing previously inspected. It applies to binary
packages, container images, static assets, infrastructure plans, signed
configuration bundles, machine-learning models, and other immutable or
content-addressable outputs.

The pattern needs:

- a stable artifact identity, such as version plus digest
- durable storage from which later work retrieves the artifact
- provenance connecting source revision, build run, inputs, and producer
- verification when the artifact crosses a trust or lifecycle boundary
- target configuration kept distinct from rebuilding the artifact

## Structure in the workflow model

The build task produces a data object. Validation tasks consume that object and
produce evidence. Quality gates decide whether the object may progress.
Promotion tasks move or reclassify it, while deployment tasks combine it with
target-specific configuration and affect an environment.

Artifact identity is the thread joining these work-unit runs. A pipeline graph
without that identity can display one run while silently handling several
different builds.

## Why rebuilding is not promotion

Two builds from the same source revision need not be identical. Dependencies,
toolchains, clocks, external services, environment variables, generated input,
and mutable base images can differ. Rebuilding for production therefore asks a
new artifact to inherit evidence produced for another.

Reproducible builds reduce that risk and remain valuable, but reproducibility
does not remove the need to identify which output was validated and deployed.

## Configuration and release

Target-specific behavior belongs in an explicit release or deployment
boundary. Configuration can vary by environment while the application artifact
remains constant. If target values must be compiled into output, that output is
a distinct artifact and needs its own identity and evidence rather than being
described as promotion of the earlier build.

## Quality consequences

| Concern       | Consequence                                                                    |
| ------------- | ------------------------------------------------------------------------------ |
| Effectiveness | Evidence and deployment refer to the same material                             |
| Performance   | Expensive build work is not repeated for every environment                     |
| Efficiency    | Storage and transfer replace repeated computation; retention must be managed   |
| Dependability | Provenance, signature, and digest checks can detect substitution or corruption |
| Experience    | Users can answer what was built, tested, approved, deployed, and rolled back   |

DORA treats canonical builds and packages as outputs of continuous integration
that are ultimately deployed and released.[^dora-continuous-delivery]

[^dora-continuous-delivery]: DORA continuous delivery capability

## Promotion and rollback

Promotion should change lifecycle status or availability without mutating
artifact content. Rollback selects a previously known artifact and target
configuration; it should not require reconstructing an old build from source
under today's environment.

Database and infrastructure effects may not roll back by selecting an earlier
artifact alone. The pattern preserves software identity but does not erase the
need for compatible migration and recovery design.

## Common failure forms

- rebuilding separately for test, staging, and production
- identifying artifacts only with mutable tags such as `latest`
- copying output without retaining its source revision and build provenance
- validating one artifact while deploying another selected indirectly
- modifying an artifact after approval
- treating environment configuration as if it were part of an unchanged build
- retaining artifacts without a discoverable lifecycle or cleanup policy

## Related

- [Pipeline](pipeline-explainer.md)
- [Quality gate](quality-gate-explainer.md)
- [Continuous integration](../practices/continuous-integration-explainer.md)
- [Continuous delivery](../practices/continuous-delivery-explainer.md)
