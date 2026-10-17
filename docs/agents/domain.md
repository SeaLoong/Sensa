# Domain Docs

## Before codebase exploration

Use the single-context layout:

- Read `GLOSSARY.md` at the repository root.
- Read decisions in `docs/adr/` relevant to the area being explored.

If these files or directories do not exist, proceed silently. The `/domain-modeling` skill creates them when terms or decisions are resolved; do not create placeholders or suggest creating them upfront.

## File structure

- `GLOSSARY.md`: shared domain vocabulary.
- `docs/adr/NNNN-short-title.md`: architecture decision records.

## Use the glossary's vocabulary

Use the glossary's terms in issue titles, refactor proposals, hypotheses, and test names. Avoid synonyms the glossary explicitly rejects.

If a needed concept is absent, reconsider whether it belongs in the domain or note the gap for `/domain-modeling`.

## Flag ADR conflicts

If a proposal contradicts an existing ADR, identify the ADR and explain why the decision should be reopened.
