# Ship

Performs one explicitly authorized merge, deployment, publication, rollout,
activation, or other final action on one exact reviewed revision. It preflights
readiness and authority, executes once, reads back persisted state, and reports
partial or failed effects without overstating what the host established. Its
portable result leads with exact subject, action, target, and observed outcome,
then separates effects, verification, recovery, and new observations.

Ship is a deliberate Gen Stack stage. Select `$ship` explicitly and name the
final action; ordinary merge, deployment, or publication requests do not
activate this workflow.

Invocation, review, or passing checks do not confer release authority. Install
this non-standalone skill through `@craigsmitham/packs/gen-stack`.

## License

MIT
