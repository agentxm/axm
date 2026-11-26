# modularize

Modularize a codebase or a specified part around cohesive responsibilities that can evolve independently.

The concise [skill](src/SKILL.md) describes the desired outcome and leaves
methods to the caller and model. Boundaries follow responsibilities and
reasons for change; improvement may involve bringing related knowledge
together or separating independently changing policies.

## Usage

Invoke this skill directly during maintenance with a scope. Automatic model
invocation is disabled through the supported native settings.

An opportunity question requests findings and recommendations without edits:

```text
What opportunities do we have to $modularize the billing area of our app?
```

A direct change request asks for implementation and verification:

```text
$modularize src/billing/ around independently changing responsibilities
$modularize the importer so format changes remain local
$modularize pricing so domain policy is independent of infrastructure adapters
```

## Dependency boundaries

Dependencies and boundary contracts should let responsibilities evolve
independently. Domain policy remains independent of delivery and infrastructure
details; reusable capabilities remain independent of their consumers' specialized
policies. Integrations own translation and composition between those boundaries.

DDD's core, supporting, and generic classifications describe strategic roles;
they do not prescribe an import hierarchy. A supporting domain can have its own
business rules. An adapter can depend on a core domain's contract while the
generic capability it connects remains independent of that domain's model.

For example, pricing can own a tax-quote contract that an integration adapter
implements using a generic tax client. Pricing does not import the adapter,
and the tax client does not import pricing. Appropriate translation preserves
each model's meaning; sharing types is useful when their meaning and ownership
are actually shared.

The skill defines these outcomes without prescribing a particular architecture,
directory layout, or an interface for every implementation.

## Completion evidence

Identify representative changes that currently spread across responsibilities
and explain how the result makes them more local. Dependency reasoning, concrete
change scenarios, and relevant checks provide evidence; more interfaces or
smaller files alone do not. Account for migration and ownership costs while
preserving required behavior and keeping intentional behavior changes distinct.

Complete affected integrations and guidance. Temporary boundaries need removal
when their obligations end, or named remaining consumers and exit conditions.
A proportionate architectural check or clear ownership may help preserve the
result. Existing boundaries can remain when no worthwhile intervention is justified.

## Sources and inspiration

Original synthesis of [Robert C. Martin's Single Responsibility
Principle](https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html)
and [Hunt and Thomas's account of duplicated
knowledge](https://media.pragprog.com/titles/tpp20/dry.pdf). These inform the
balance between cohesion, independent change, and shared knowledge.

Dependency-boundary guidance also draws on:

- [Eric Evans's DDD Reference](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf),
  especially Generic Subdomains, Segregated Core, Shared Kernel, and Anticorruption
  Layer, for separating models and making integration ownership explicit.
- [DDD Crew's Core Domain Charts](https://github.com/ddd-crew/core-domain-charts),
  for distinguishing strategic classification from technical structure.
- [Robert C. Martin's Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
  and [A Little Architecture](https://blog.cleancoder.com/uncle-bob/2016/01/04/ALittleArchitecture.html),
  for dependency direction and contracts owned by the policy they protect.
- [Alistair Cockburn's Ports and Adapters](https://alistair.cockburn.us/hexagonal-architecture),
  for application independence from external technologies.

## License

MIT. Linked sources retain their respective rights; no source text or code
is vendored in this package.
