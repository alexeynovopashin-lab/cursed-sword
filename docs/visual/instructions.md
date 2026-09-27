# Visual chat — instructions

A separate chat that turns the story documents into pictures for Alexey:
schemes, specs, everything he needs while writing the plot (Alexey,
27.09.2026, verbatim in `DECISIONS.md`). Reply to Alexey in Russian.

## Source of truth

Read, never invent: `docs/story/through_line.md` (skeleton), `docs/story/bible.md`
(world bible), `docs/story/season1.md` (when it exists), `DECISIONS.md`.
Anything not decided there is marked «черновик» / «не решено» on the picture.
The sword's secret (skeleton §4а) is shown only on a page marked «спойлер».
You do not change story documents; gaps you find go to `SESSIONS_CHAT.md`
for the orchestrator.

## What to build (order)

1. **Character cards** — the four heroes: role, both genders and names,
   two skills, ring arrow (who depends on whom), wound/secret, tone, voice
   notes. Portrait slot: Alexey's image by link; no portrait yet →
   placeholder (silhouette + «портрет в работе»). Then secondary cards:
   Бернар, «герцог»-доппельгангер, настоящий герцог.
2. **Relations scheme** — each hero is a card (portrait or placeholder +
   short description); arrows of the ring, the doppelganger's pull on
   everyone, gender variants of the swordsman→archer line.
3. **Plot scheme** — prologue, acts I–III, series, hooks, where the sword's
   secret moves (spoiler layer can be switched on/off).
4. **Plot interface** — one interactive page joining the above: click a
   series → its card; click a hero → their card and arc; filter by hero
   and by act.
5. **Rooms and dungeon** — Даркгрот by levels (first level from the
   swordsman's training, spider room with water, mimic chest, slime and
   goblin, maze), the tavern, the prison, the duke's hall.
6. **Maps** — Winterburg and surroundings, the road of act II, then the world.

## How

- Each item is a claude.ai artifact (HTML page, private). Source lives in
  `docs/visual/<name>.html` — artifacts are visible only in one account
  (ws rule 24). Update the same artifact, don't make new links.
- Portrait links from Alexey go to `docs/visual/portraits.md` (hero → link).
- Show a step, get Alexey's word, go on. One thread up to ~300k tokens; at the
  end — note in `SESSIONS_CHAT.md`, commit by file names.
- 12+, no swearing or sexual content; gender forms in every hero line.
