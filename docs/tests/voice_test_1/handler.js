// Voice test skill for "Проклятый меч" — throwaway harness, not the engine.
// Yandex Cloud Functions, runtime nodejs22, entry point "handler.handler".
// Say a test name (see MENU); every reply also logs timings and the raw request to Cloud Logging.
// Fill IDS below after uploading your own sounds (Dialogs console → Resources → Sounds).
const IDS = { own: null /* 'dialogs-upload/<skill_id>/<audio_id>.opus' */, image: null /* image_id for the card test */ };

const START = Date.now();
let calls = 0; // module-level: survives on a warm instance, resets on cold start

const S = (n) => `<speaker audio="${n}">`;
const EFFECTS = ['behind_the_wall', 'hamster', 'megaphone', 'pitch_down', 'psychodelic', 'pulse', 'train_announce'];

// name → { keys (stems to match in tokens), run(ctx) → {text, tts?, buttons?, card?} }
const TESTS = {
  pauzy: { keys: ['пауз'], run: () => ({
    text: 'Тест пауз. Раз. Два. Три.',
    tts: 'Тест пауз. Раз sil <[500]> два sil <[1000]> три sil <[2000]> конец. Я замерла на полсекунды, секунду и две.' }) },
  udareniya: { keys: ['ударен'], run: () => ({
    text: 'Имена. Сначала без ударений, потом с ударениями.',
    tts: 'Без ударений: Габриэль, Эллион, Луциан, Нобби, Даркгрот, Винтербург, Бернар, Лизард. sil <[1200]> С ударениями: Габри+эль, Элли+он, Луци+ан, Н+обби, Д+аркгрот, В+интербург, Берн+ар, Л+изард.' }) },
  zvuki: { keys: ['звук'], run: () => ({
    text: 'Тест звуков: дверь, меч, сова — в начале, в середине и в конце.',
    tts: `${S('alice-sounds-things-door-2.opus')} Дверь в начале. sil <[600]> Меч ${S('alice-sounds-things-sword-3.opus')} в середине фразы. sil <[600]> Сова в конце. ${S('alice-sounds-animals-owl-1.opus')}` }) },
  nalozhenie: { keys: ['наложен', 'поверх', 'фон'], run: () => ({
    text: 'Тест наложения: звук ставится посреди длинной речи.',
    tts: `Слушай внимательно. ${S('alice-music-harp-1.opus')} Эта фраза длинная, и я говорю её дальше и дальше, чтобы понять, звучит ли арфа поверх голоса или она останавливает речь и играет отдельно, а потом голос продолжается, как будто ничего не случилось.` }) },
  muzyka: { keys: ['музык'], run: () => ({
    text: 'Тест музыки из библиотеки: арфа, гитара, скрипка, волынка, горн, барабаны, гонг, медленный бит.',
    tts: ['harp-1', 'guitar-c-1', 'violin-c-1', 'bagpipes-1', 'horn-2', 'drums-1', 'gong-1', 'drum-loop-2']
      .map((n) => `Раз sil <[300]> ${S(`alice-music-${n}.opus`)}`).join(' sil <[500]> ') }) },
  effekty: { keys: ['эффект'], run: () => ({
    text: `Тест эффектов голоса: ${EFFECTS.join(', ')}.`,
    tts: EFFECTS.map((e) => `<speaker effect="${e}"> ${e.replace(/_/g, ' ')}. Так звучит меч. <speaker effect="-"> sil <[700]>`).join(' ') }) },
  shepot: { keys: ['шёпот', 'шепот', 'шепч'], run: () => ({
    text: 'Тест шёпота. Меч шепчет: ниже.',
    tts: 'Обычный голос. sil <[800]> Меч шепчет: ниже. sil <[800]> Шёпотом. Тише. Совсем тихо.' }) },
  svoi: { keys: ['свой', 'загруж'], run: () => (IDS.own
    ? { text: 'Тест своего звука.', tts: `До. ${S(IDS.own)} После.` }
    : { text: 'Свой звук не задан: загрузи файл и впиши id в IDS.own.' }) },
  dlinnyj: { keys: ['длинн'], run: () => {
    const t = 'Факел трещит, и тень на стене длиннее человека. '.repeat(20).slice(0, 1000);
    return { text: t, tts: t, __note: `len=${t.length}` };
  } },
  echo: { keys: ['эхо', 'распозн'], run: (c) => ({
    text: 'Режим эха. Говори любые фразы, я повторю, что расслышала. Скажи «хватит», чтобы выйти.', __mode: 'echo' }) },
  zaderzhka: { keys: ['задерж', 'жди', 'ожид'], run: (c) => {
    const n = c.numbers[0] || 3; return { text: `Жду ${n} секунд.`, __sleep: Math.min(n, 8) * 1000 };
  } },
  holod: { keys: ['холод', 'старт'], run: () => ({
    text: `Экземпляр живёт ${((Date.now() - START) / 1000).toFixed(1)} с, ответов на нём: ${calls}. ${calls <= 1 ? 'Похоже на холодный старт.' : 'Тёплый экземпляр.'}` }) },
  pamyat: { keys: ['памят', 'запомн'], run: (c) => {
    const said = c.rest;
    return { text: said ? `Запомнила: ${said}.` : 'Скажи: «запомни» и слово.', __remember: said || null };
  } },
  kto: { keys: ['вспомн', 'помнишь'], run: (c) => ({
    text: `В сессии: ${c.sess.mem || 'пусто'}. В памяти устройства: ${c.app.mem || 'пусто'}. Запусков навыка: ${c.app.runs || 0}.` }) },
  knopki: { keys: ['кнопк'], run: () => ({
    text: 'Тест кнопок. Выбери: дверь или сундук.', tts: 'Тест кнопок. Выбери: дверь или сундук.',
    buttons: [{ title: 'Дверь', hide: true }, { title: 'Сундук', hide: true }, { title: 'Меню', hide: false }] }) },
  kartochka: { keys: ['карточ', 'картин'], run: () => (IDS.image
    ? { text: 'Тест карточки.', card: { type: 'BigImage', image_id: IDS.image, title: 'Даркгрот', description: 'Ворота подземелья' } }
    : { text: 'Картинка не задана: загрузи её и впиши image_id в IDS.image.' }) },
  moderaciya: { keys: ['модер', 'опасн'], run: () => ({
    text: 'Тест модерации: повторяй фразы из таблицы, я покажу пометку «опасный контекст».', __mode: 'echo' }) },
  igroki: { keys: ['игрок', 'голос'], run: (c) => ({
    text: `Тест игроков. Пусть каждый по очереди скажет фразу. Мой идентификатор устройства: ${String(c.req.session && c.req.session.application && c.req.session.application.application_id || '').slice(0, 6)}. Скажи «хватит», чтобы выйти.`, __mode: 'echo' }) },
};

const MENU = 'Я тестовый навык. Скажи: паузы, ударения, звуки, наложение, музыка, эффекты, шёпот, длинный, эхо, задержка три, холодный, запомни слово, вспомни, кнопки, картинка, модерация, игроки. Скажи «выход», чтобы закончить.';

const NUM = { один: 1, два: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8 };

function pick(tokens) {
  for (const [name, t] of Object.entries(TESTS)) {
    if (tokens.some((tok) => t.keys.some((k) => tok.startsWith(k)))) return name;
  }
  return null;
}

exports.handler = async (event) => {
  const t0 = Date.now();
  const req = event && typeof event.body === 'string' ? JSON.parse(event.body) : event;
  calls += 1;
  const r = req.request || {};
  const nlu = r.nlu || {};
  const tokens = (nlu.tokens || (r.command || '').split(' ')).map((x) => String(x).toLowerCase());
  const sess = (req.state && req.state.session) || {};
  const app = (req.state && req.state.application) || {};
  const ent = (nlu.entities || []).filter((e) => e.type === 'YANDEX.NUMBER').map((e) => e.value);
  const numbers = ent.length ? ent : tokens.map((x) => NUM[x]).filter(Boolean);
  const meta = { calls, warmSec: ((Date.now() - START) / 1000).toFixed(1), newSession: !!(req.session && req.session.new) };

  let out; let mode = sess.mode || null; let mem = sess.mem || null; let appMem = app.mem;
  const wantsExit = tokens.some((x) => ['выход', 'хватит', 'закончить'].includes(x));

  if (req.session && req.session.new && !r.command) {
    out = { text: MENU };
    app.runs = (app.runs || 0) + 1;
  } else if (mode === 'echo' && !wantsExit) {
    const dc = r.markup && r.markup.dangerous_context ? 'ДА' : 'нет';
    const ents = (nlu.entities || []).map((e) => e.type).join(',') || '—';
    out = { text: `Услышала: «${r.original_utterance}». Слов: ${tokens.length}. Опасный контекст: ${dc}. Сущности: ${ents}.` };
  } else if (wantsExit && mode !== 'echo') {
    out = { text: 'Пока.', end: true };
  } else {
    if (wantsExit) mode = null;
    const name = pick(tokens);
    if (!name) out = { text: wantsExit ? 'Вышла из режима. ' + MENU : `Не поняла: «${r.original_utterance || ''}». ${MENU}` };
    else {
      const rest = tokens.slice(1).join(' ');
      out = TESTS[name].run({ req, tokens, numbers, sess, app, rest });
      if (out.__mode) mode = out.__mode;
      if (out.__remember) { mem = out.__remember; appMem = out.__remember; }
      if (out.__sleep) await new Promise((res) => setTimeout(res, out.__sleep));
    }
  }

  const resp = { text: String(out.text).slice(0, 1024) };
  if (out.tts) resp.tts = out.tts;
  if (out.buttons) resp.buttons = out.buttons;
  if (out.card) resp.card = out.card;
  resp.end_session = !!out.end;

  const ms = Date.now() - t0;
  console.log(JSON.stringify({ meta, ms, tokens, note: out.__note, dangerous: r.markup && r.markup.dangerous_context, request: req }));
  return {
    version: '1.0',
    session_state: { mode, mem },
    application_state: { mem: appMem, runs: app.runs || 0 },
    response: resp,
  };
};
