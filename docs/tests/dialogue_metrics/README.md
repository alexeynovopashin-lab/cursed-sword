# Метрики диалогов (анализ диалогов)

Только читают `docs/visual/beta/*` и `docs/story/*`; пишут во временную папку
`/tmp/cc/`. Порядок: `mkdir -p /tmp/cc && cd docs/visual/beta && python3
../../tests/dialogue_metrics/extract.py` → `narr.py` (рассказчик), `metrics.py`
(реплики; корпус — `corpus.py`, размечен вручную, адреса `game.js:строка` /
`season1.md:строка`), `node play.js` (прогон беты по длине ответов),
`scene.py` (сцена «до / А / Б», читает `dialogue_scene_tavern.md`).
Пути в `play.js` и `corpus.py` абсолютные для этого компьютера. Вывод — числа
в `docs/story/dialogue_diagnosis.md`.
