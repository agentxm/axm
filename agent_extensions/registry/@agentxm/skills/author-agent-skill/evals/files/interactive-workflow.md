# Synthetic interactive workflow observation

Across five architecture-decision workshops, an agent first confirms the
decision scope, inspects repository evidence, reports when the evidence review
is complete, presents one inferred constraint for correction, and asks the
authorized maintainer to approve or revise the decision record before it is
written. Some hosts provide a structured single-select control and a plan
review surface; headless hosts provide only ordinary assistant output.

Observed failures include exposing worker and payload mechanics as progress,
placing rationale only inside truncated option labels, asking for approval and
then writing without waiting, and adding a second confirmation after the
harness has already gated the write. The desired skill must preserve the same
interaction intent and stable option references across both host shapes.
