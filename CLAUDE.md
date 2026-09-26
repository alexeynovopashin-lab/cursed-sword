# cursed_sword — rules for agents

Workspace rules (`ws:CLAUDE.md`) apply; this file adds the project's own.
**Reply to Alexey in Russian**, in product terms. Agent files in English,
documents for Alexey (DECISIONS, ROADMAP, story) in Russian.

## What this is

«Проклятый меч» (working title): a cooperative voice fantasy adventure for
Yandex Alice, 1–4 players on one speaker, told as a series (episodes, arcs,
seasons) in the spirit of «Легенда о Вокс Макине» — D&D underneath, a story on
top. Born 2026-09-26 from speaker tests of `alice_soulledger` (see
`DECISIONS.md`, first entry). Not a card/hidden-goal game.

## Start of a session

1. `git log --oneline -20`, then the chat `ws:30_agents/cursed_sword.md`
   (`grep -n` your signature and «всем», plus `tail -80`).
2. `README.md` → Status, then headings of `ROADMAP.md` and `DECISIONS.md`;
   read only the section you need.

## Documents

| File | What | How to edit |
|---|---|---|
| `DECISIONS.md` | What Alexey decided, in his words, and why | Append only; record literally, don't extend (ws rule 26) |
| `ROADMAP.md` | Phases, what is done, what is next, open questions | Keep status current |
| `docs/story/` | Through-line plot, arcs, episodes, characters | Drafts until Alexey approves; mark «черновик» |
| `docs/ideas/` | Raw ideas and discussions, not decisions | Append; never promote to DECISIONS without Alexey |
| `docs/mechanics/` | Game systems (combat, abilities, artifacts, maze, party) | Created in phase 2 |

## Rules

- **The prose is Alexey's.** Agents write drafts, marked as such; Alexey edits.
- **Numbers under the hood.** Alexey: «Я не думаю что нам нужна система клеток и
  статов, но игра может их учитывать "под капотом"». Players hear states and
  story, not HP or coordinates.
- **Platform facts** (measured in `alice_soulledger`, 2026-09-24): reply ≤ 1024
  chars (text and tts); each Alice state object ≤ 1 KB — a season will need its
  own storage (per `ws:INDEX.md` region mapping: YDB serverless, a decision for
  Alexey); one speaker cannot tell voices apart. The speaker timer: Alexey
  «учтено и работает» — don't re-check.
- **Structure before code.** Phases 1–2 (story, mechanics) are documents; no
  engine code until the roadmap says so. New infra (Yandex folder, function,
  Dialogs skill, storage, GitHub remote) — ask Alexey first.
- Reuse from `alice_soulledger` (engine, Alice protocol, tests) is a phase-3
  decision; don't copy code before it.
