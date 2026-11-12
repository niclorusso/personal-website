# Rubric: what kind of rule an item asks for

Each item is a motion, postulate, interpellation or question filed in the Swiss Federal Assembly that asks, or leans towards, rules or safeguards on AI and algorithmic systems. Its text is in German or French. Decide which kind of rule the **author** mainly asks for or points to.

## Field

**rule**: exactly one of

- `transparency`: disclosure. Labelling of AI-generated content, duty to say that a system is used, public registers, explaining how an algorithm or a recommendation system works.
- `ban_limit`: forbidding or suspending a use. Bans, moratoria, strict limits on a technology or practice (facial recognition, autonomous weapons, profiling, certain apps).
- `liability_penalties`: who answers for harm. Civil or product liability, criminal offences, sanctions, platform liability for content.
- `rights_of_people`: rights for the people affected. Protection against discrimination, consent and remuneration for authors, data protection, right to human review or to object, participation of employees, right to training.
- `provider_duties`: obligations on those who build or run the systems, other than disclosure. Risk assessments, audits, safety standards, age checks, design requirements, duties of care for platforms.
- `oversight_body`: an institution. Supervisory authority, audit or control centre, ethics commission, advisory body, monitoring.
- `general_framework`: an overall legal framework. A general AI law, taking over the EU AI Act or the Council of Europe convention, a national strategy with rules, international standards or treaties.
- `review`: the item asks whether rules are needed, whether the law has gaps, or which measures are planned, without pointing to one kind of rule.

## Rules

- Choose the main request. If an item lists several kinds of rule with equal weight, use `general_framework` when together they amount to an overall regime, otherwise the one named first.
- An interpellation that only asks questions gets the kind of rule its questions point to; use `review` only when no kind stands out.
- If the item turns out not to ask for any rule or safeguard, still choose the closest value and say so in `doubt`.

## Output

A JSON array, one object per item, in the same order as the input:

```json
{"id": 20214508, "rule": "transparency", "doubt": ""}
```

`doubt` is a short phrase when you hesitated between two values (name them), otherwise an empty string.
