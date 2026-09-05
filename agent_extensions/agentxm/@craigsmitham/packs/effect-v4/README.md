# Effect v4

This pack installs two members:

- `@craigsmitham/rules/use-effect-v4` — directs agents working with Effect to
  use Effect v4 APIs and conventions rather than carrying v3 patterns forward.
- `@craigsmitham/knowledge/effect-v4` — a standalone OKF 0.2 bundle of
  twenty-four concise checklists for design, implementation, maintenance, and
  review.

The checklists were last authored against **Effect 4.0.0-rc.112**. See the
[bundle
index](https://github.com/craigsmitham/agent-extensions/blob/main/knowledge/effect-v4/src/index.md)
for the complete topic list and the major-version policy.

The former `@craigsmitham/skills/craft-effect-v4` routing skill is not part of
this pack. Consult a topic checklist directly when it is useful.

## Checklist maintenance

Before revising a checklist, inspect current Effect v4 source and tests plus
representative v4 applications or libraries that exercise the topic. Current
reference codebases include:

- [Effect](https://github.com/Effect-TS/effect)
- [opencode](https://github.com/anomalyco/opencode)
- [LiveStore](https://github.com/livestorejs/livestore)
- [Alchemy](https://github.com/alchemy-run/alchemy)
- [effect-local](https://github.com/lucas-barake/effect-local)
- [dfx](https://github.com/tim-smart/dfx)
- [effect-http-recorder](https://github.com/anomalyco/effect-http-recorder)

Keep each topic to five through ten independently judgeable items. Link to API
detail and extended guidance rather than turning a checklist back into a guide.
