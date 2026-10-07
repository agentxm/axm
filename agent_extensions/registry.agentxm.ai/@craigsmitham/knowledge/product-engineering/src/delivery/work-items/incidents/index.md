# Operational Incident Records

Live-record guidance and a portable fallback template for current or imminent
operational impact that requires coordinated response.

An Operational Incident Record is one of the three portable work-item roles
defined in the [Software work-item taxonomy](../software-work-item-taxonomy.md).
Everything here is record craft. It says what the record must show about
severity, control, objectives, chronology, and closure so the response stays
recoverable after it ends. It does not say how to set a severity, run command,
escalate, or conduct a post-incident review.

- [Recording Operational Incidents](recording-operational-incidents.md) - Use
  when current or imminent service impact needs an attributable living record of
  impact, control, chronology, handoff, and bounded exit conditions.
- [Operational Incident Record template](operational-incident-template.md) -
  Provides a current-state-first, tracker-neutral body fallback for operational
  impact and response coordination.

## Who owns what

Thresholds, severities, escalation, response roles, communications, and closure
authority have two owners, and the two are not in competition.

| Owner | What it owns |
| --- | --- |
| The consuming organization's incident policy | The local values: the threshold that opens a record, the severity scale, the named roles, the escalation paths, and who may close |
| [How to run it](../../../operations/) | The portable craft behind those values: how severity is reasoned about, how command and communication are run, what ends a response, and what a post-incident review does with the result. That section holds the scope claim; none of the craft is written yet |

This subtree owns neither. It supplies the record contract: what the record must
show about impact, severity, control, objectives, chronology, closure, and
follow-up. A guide here may say that severity and its evidence basis must appear
in the record and stay current. It may not say how a responder should arrive at
a severity, run command, or decide to escalate.
