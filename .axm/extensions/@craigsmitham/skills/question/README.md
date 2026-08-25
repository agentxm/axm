# Question

Frames a subject as a compact Research Brief containing a small, prioritized
set of concern-aware questions with stable IDs and the evidence each answer
would require. It emphasizes consequential uncertainty and information value
across opportunities, claims, decisions, systems, policies, proposals, and
problems; it does not assume the subject contains a defect.

When the material you supply already contains an originating analysis, the
skill isolates automatically: it reduces the input to a hypothesis-neutral
brief and generates the questions from that brief alone in a fresh context, so
no suspected cause, finding, or preferred solution reaches the questions. You
do not have to ask for a blind check, and you always get questions back — the
independence status reports how they were produced.

## Use it when

- You need the highest-value questions to investigate before deciding.
- You want relevant concerns selected for the subject rather than a generic
  exhaustive checklist.
- You are checking your own analysis and need a frame that does not inherit it.

Do not use it to conduct the research, answer the questions, or write a survey
or interview guide.

## Install

```bash
axm skills install @craigsmitham/skills/question
```

It is also included in `@craigsmitham/packs/qrspi`.

## Example

```text
/question Frame research for the decision on whether to fund a pilot. Our
analysis so far: ...
```

The supplied analysis is stripped before the questions are framed.

## License

MIT
