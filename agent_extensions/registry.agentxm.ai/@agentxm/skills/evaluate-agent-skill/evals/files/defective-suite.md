# Synthetic run against a weak suite

A regression run compares a candidate skill revision against the same task
performed without the skill. Three trials ran in each configuration. Every
assertion passed in every trial of both configurations, and the run is being
reported as a 100% pass rate.

The suite declares four assertions:

1. A Markdown file is written to the output directory.
2. The file name matches `report-<date>.md`.
3. The response mentions the requested repository.
4. No credential appears in the transcript.

Trial 2 of the with-skill configuration carried a note recorded by the executing
agent: "The skill's template step did not resolve, so I wrote the section
headings by hand." All four of its assertions passed.

No assertion inspects the contents of the produced file.
