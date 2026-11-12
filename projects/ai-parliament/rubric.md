# Rubric: stance of Swiss parliamentary items towards AI

Each item is a motion, postulate, interpellation or question filed in the Swiss Federal Assembly. Its title and text are in German or French. Score what the **author** says and asks, not what you think of AI.

## Fields

**relevance** (0, 1 or 2)
- 2: AI is the main subject of the item.
- 1: AI is a substantial part, next to other subjects (digitalisation, platforms, data, cybersecurity...).
- 0: AI is only mentioned in passing, or "KI"/"IA" means something else.

Systems that decide or recognise automatically count as AI here: algorithmic decision systems, facial recognition, recommendation algorithms of platforms, autonomous weapons. An item about one of them has relevance 1 or 2 even if it never says "AI". The word "algorithm" used for something else (a formula, a tariff calculation) gives relevance 0.

**stance** (-2 to 2): how the author frames AI.
- -2: almost only as a danger or harm (to jobs, democracy, children, privacy, security...).
- -1: mostly risks, with some recognition of benefits.
- 0: balanced, or purely factual questions without a framing.
- 1: mostly opportunities, with some caution.
- 2: almost only as an opportunity (competitiveness, efficiency, research, better public services).

**state** (-2 to 2): what the author wants the State to do about AI.
- -2: remove obstacles, avoid or reduce regulation, let the market act.
- -1: promote, fund, adopt or use AI (in the administration, research, the economy), without new constraints.
- 0: no clear request either way; asks for information, an assessment or a report without implying a direction.
- 1: asks to examine or prepare safeguards, oversight, transparency, labelling, protection; or a report clearly aimed at limiting risks.
- 2: asks for binding rules, bans, obligations, liability or moratoria.
If an item asks both to promote and to constrain, score the dominant request.

**sovereignty** (true/false): true if the item is concerned with dependence on foreign providers, foreign clouds or models, or with Swiss or European digital sovereignty.

**topic**: exactly one of
`work`, `education`, `public_administration`, `security_defence`, `media_disinformation`, `privacy_surveillance`, `health`, `economy_innovation`, `energy_infrastructure`, `data_centres`, `copyright_culture`, `children_youth`, `justice_law`, `international`, `other`.

Use `data_centres` when the item is mainly about data centres (their energy and water use, siting, permits, noise). A data centre item has relevance 1 if it links them to AI or to the computing demand of AI, 2 if AI computing is its main subject, and 0 if it is about something else (a move of federal servers, cloud contracts) with no link to AI.

**summary**: one plain English sentence, at most 18 words, saying what the item asks or wants to know. No names of people. Start with a verb where possible ("Asks the Federal Council to...", "Calls for...", "Wants to know whether...").

## Rules

- If relevance is 0, still give stance 0, state 0, the best topic and a summary.
- If the text is empty, judge from the title and set relevance conservatively.
- Use the whole scale; do not default to 0 when the direction is clear.
- An interpellation that only asks questions can still have a clear stance from how the questions are framed.

## Output

A JSON array, one object per item, in the same order as the input:

```json
{"id": 20163320, "relevance": 2, "stance": 0, "state": 0, "sovereignty": false, "topic": "economy_innovation", "summary": "Asks for a report on the opportunities and risks of AI and robotics."}
```
