# Foundations

Shared concepts and approaches that inform decisions across the product-development
lifecycle. Start here for conceptual context, or follow links from a lifecycle
section when you need to understand the ideas behind a practice.

The [Product engineering overview](../overview.md) explains placement and the
relationship between shared explanations and lifecycle guidance.

## Choose a starting point

| Your question | Explore |
| --- | --- |
| Why does an offering matter, and where should we invest? | [Customer progress](#understand-customer-progress-behavior-and-models), [strategic choice](#understand-value-and-strategic-choice), and [business assumptions](#understand-assumptions-and-renewal) |
| How do we explore experiences and make behavior coherent? | [Candidate experiences](#explore-candidate-experiences), [goals and models](#understand-customer-progress-behavior-and-models), and [architectural responsibility](#understand-architectural-responsibility) |
| What can we commit to, and does the evidence still support it? | [Shaping and project commitment](#understand-shaping-and-project-commitment) |
| Which measures inform decisions and service promises? | [Measures and service commitments](#understand-measures-and-service-commitments) |
| What should we sustain, change, or stop? | [Assumptions and renewal](#understand-assumptions-and-renewal) and [the maintenance perspective](../maintenance/) |
| What should trigger a maintenance intervention? | [Maintenance triggers](#understand-maintenance-triggers) |

For suggested sequences and practical continuations, use
[Reading product engineering](../reading-product-engineering.md). You can enter
through any concept; Foundations is not required reading before lifecycle work.

The [Northbank Equipment case](../northbank-equipment.md) supplies shared
business and engineering context. Each explainer uses its relevant episode;
alternative scopes and numerical exhibits remain explicit.

## Compare the strategy perspectives

- [Strategy perspectives and their relationships](strategy-perspectives.md) — How value-based strategy, Playing to Win, Wardley mapping, Cagan's product strategy, and Drucker's business assumptions and renewal disciplines inform different strategic questions, where they overlap, and why their answers remain distinct.

## Understand value and strategic choice

- [Value-based strategy: Oberholzer-Gee's approach to creating and sharing value](value-based-strategy.md) — How Felix Oberholzer-Gee's value-based strategy connects customer, employee, and supplier value through the value stick, value drivers, and competitive choices, distinguishing value creation from capture.
- [Playing to Win: Lafley and Martin's approach to strategy](playing-to-win.md) — How Lafley and Martin's Playing to Win connects five strategic choices into a coherent approach to advantage, and how possibilities, assumptions, tests, and learning support commitment and revision.
- [Marty Cagan's product strategy](cagan-product-strategy.md) — How Marty Cagan connects product vision and business objectives to team problems through focus, insights, actions, and active management, with discovery and delivery feeding learning back into strategy.
- [Wardley mapping](wardley-mapping/) — Needs, dependencies, evolution, and strategic action, including key terms, climatic patterns, doctrine, and situational-awareness reflection.

## Understand assumptions and renewal

- [Drucker's theory of the business](drucker-theory-of-the-business.md) — How Peter Drucker's theory of the business connects assumptions about environment, mission, and core competencies, why successful organizations can outgrow those assumptions, and how continuing examination supports strategic renewal.

- [Drucker's four disciplines of organizational renewal](drucker-organizational-renewal.md) — How organized abandonment, continuous improvement, exploiting success, and systematic innovation work together to sustain present performance and create tomorrow, with piloting to test proposed changes.

## Understand customer progress, behavior, and models

- [Jobs to Be Done](jobs-to-be-done.md) — How Jobs to Be Done connects customer progress, functional objectives, switching, and unmet needs; how to frame jobs, distinguish interpretations, and connect research evidence to product decisions.
- [Use cases: goals, behavior, and incremental delivery](use-cases.md) — How Cockburn's approach to use cases connects actor goals, system boundaries, success and failure scenarios, organizational alignment, and incremental delivery through user stories and story maps.
- [Domain-driven design](domain-driven-design.md) — How domain-driven design connects domain knowledge, models, and software through shared language, subdomain classification, bounded contexts, tactical patterns, and continuing model refinement.

## Explore candidate experiences

- [Bill Buxton's approach to design: sketching, alternatives, and experience](buxton-design.md) — How Bill Buxton connects experience, sketching, alternative concepts, and prototype evaluation, with an interpretation for choosing and revising product commitments.

## Understand architectural responsibility

- [Fred Brooks on the architect's role: conceptual integrity and responsibility to the user](brooks-architect-role.md) — How Fred Brooks connects conceptual integrity, the user's mental model, design authority, and implementation feedback, with an interpretation for collaborative product engineering and explicit model boundaries.

## Understand shaping and project commitment

- [Glen Alleman's performance-based project management: capabilities, credible plans, and evidence of progress](alleman-performance-based-project-management.md) — How Glen Alleman's five project-management principles connect needed capabilities, plans, resources, risk, and demonstrated progress, with an interpretation for forecasting and revising product commitments.

- [Shape Up: Ryan Singer's approach to shaping, betting, and building](shape-up.md) — How Ryan Singer's Shape Up connects appetite, shaped solution concepts, bounded bets, and team ownership to finishing meaningful work, with explicit distinctions between investment, scope, completion, and outcome evidence.

## Understand measures and service commitments

- [Key performance indicators: measures, targets, and decisions](key-performance-indicators.md) — How KPIs connect selected measures to objectives and decisions, how definitions and context shape their meaning, and how they relate to outcome evidence, Alleman's measures, and service levels.

- [SLIs, SLOs, and SLAs: service measures, objectives, and agreements](service-level-indicators-objectives-and-agreements.md) — How service-level indicators, objectives, and agreements connect user experience to measured reliability, how measurement boundaries and error budgets shape decisions, and how service levels relate to product outcomes.

## Understand maintenance triggers

- [Maintenance strategies and their relationships](maintenance-strategies.md) — How failure consequences, deterioration mechanisms, evidence, lead time, and intervention cost shape a mix of run-to-failure, scheduled preventive, condition-based, and predictive maintenance for evolving software products.
- [Run-to-failure maintenance: deliberate acceptance and reactive repair](run-to-failure-maintenance.md) — How run-to-failure maintenance makes functional failure the intervention trigger, when accepting that failure is defensible, and how recovery design and changing consequences affect the choice.
- [Preventive maintenance: intervention by time and use](preventive-maintenance.md) — How scheduled preventive maintenance uses elapsed time or accumulated use to trigger intervention, what makes an interval defensible, and how unnecessary work and intervention risk limit its value.
- [Condition-based and predictive maintenance: observation, forecasts, and intervention](condition-based-and-predictive-maintenance.md) — How condition-based and predictive maintenance connect observed deterioration and forecasts to intervention, why warning time and diagnostic meaning matter, and where software signals and models can mislead.

## Explore the lifecycle

- [Where to play](../strategy/) — Participation, advantage, and value-capture choices informed by the landscape.
- [What to solve](../problem/) — Problem framing, value and demand, and outcomes and evidence.
- [What to build](../solution/) — Solution choices and requirements that express the commitment.
- [How to build it](../engineering/) — Technical construction and verification, including specifications and codebase review.
- [How to ship it](../delivery/) — Work-item guidance for coordinating change; flow and release guidance remain unwritten.
- [How to run it](../operations/) — Production responsibilities and boundaries; operational guides remain unwritten.
- [How to maintain it](../maintenance/) — Care, existing-product understanding, and intervention judgment.
