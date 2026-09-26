// Detectors for completion claims, receipt blocks and sycophantic openers.
// Pure functions, no I/O. A false positive costs the user a blocked turn; a miss
// only leaves the status quo. So every rule here is biased toward NOT matching.

/** Text we must never match inside: code fences, inline code, quoted user text. */
export function sanitize(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[\u2018\u2019]/g, "'")     // curly apostrophes: you're
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/```[\s\S]*?(?:```|$)/g, ' ')      // fenced code
    .replace(/~~~[\s\S]*?(?:~~~|$)/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')                  // inline code
    .replace(/^[ \t]*>.*$/gm, ' ')               // blockquote (quoted user text)
    .replace(/«[^»\n]{0,120}»/g, ' ')            // a phrase mentioned, not said
    .replace(/(^|[\s(:])"[^"\n]{1,120}"(?=[\s.,;:!?)]|$)/g, '$1 ')
    .replace(/^[ \t]{4,}\S.*$/gm, ' ');          // indented code block
}

// Russian patterns. JS \b is ASCII-only, so Cyrillic words get explicit
// Unicode boundaries and the `u` flag.
const L = String.raw`[\p{L}\p{N}_]`;
const B = `(?<!${L})`;
const E = `(?!${L})`;
const ru = (src) => new RegExp(src, 'iu');

// A past-tense verb of work is a claim when the agent is its subject: at the
// head of a sentence ("Fixed the off-by-one"), after I/we, or passive with no
// location. A bare \bimplemented\b also fires on "the React team implemented
// this in v18" and "the promise resolved with undefined" (ADR-029).
const WORK = "implemented|resolved|finished|fixed";
const COMPLETION = [
  /\bdone\b/i,
  /\ball set\b/i,
  // (?!-) keeps the adjective out: "a fixed-size buffer", "fixed-width header".
  new RegExp(String.raw`^[\s*\-–—]*(?:${WORK})\b(?!-)`, 'i'),
  new RegExp(String.raw`\b(?:i|we)(?:'ve| have|'d)?\s+(?:just\s+|now\s+|already\s+)?(?:${WORK})\b(?!-)`, 'i'),
  new RegExp(String.raw`\b(?:is|are|was|were|'s|'re|has been|have been|had been)\s+(?:now\s+)?(?:${WORK})\b(?!-)`, 'i'),
  /\bworking now\b/i,
  /\bnow works\b/i,
  /\bshould (?:work|be fixed|pass|be working)\b/i,
  /\bready to (?:go|use|ship|merge)\b/i,
];

// "needs to be done", "left to be done", "will be done by the hook": work that
// is outstanding, not work that was finished.
const OUTSTANDING = /\b(?:to be|be|being|gets?|got|getting)\s+done\b/i;
// "I'll tell you when it's done" dates the claim to the future.
const TEMPORAL = /\b(?:when|until|once|after|before|whenever|while)\b/i;

const RU_WORK = 'исправил[аи]?|починил[аи]?|пофиксил[аи]?|реализовал[аи]?|доделал[аи]?|закончил[аи]?|завершил[аи]?|устранил[аи]?|поправил[аи]?';
const RU_PASSIVE = 'исправлено|починено|реализовано|устранено|исправлен[аы]?|починен[аы]?|устранен[аы]?|устранён';
COMPLETION.push(
  ru(String.raw`${B}(?:всё\s+|все\s+|уже\s+|теперь\s+)?(?:готово|сделано)${E}`),
  ru(String.raw`${B}готов[аоы]?\s+к\s+(?:релизу|мержу|merge|деплою|использованию|ревью|выкатке)${E}`),
  ru(String.raw`^[\s*\-–—]*(?:${RU_WORK})${E}`),
  ru(String.raw`${B}(?:я|мы)\s+(?:уже\s+|только\s+что\s+|теперь\s+|всё\s+|все\s+)?(?:${RU_WORK})${E}`),
  ru(String.raw`${B}(?:теперь\s+|уже\s+)?(?:${RU_PASSIVE})${E}`),
  ru(String.raw`${B}(?:теперь|уже|снова)\s+работает${E}`),
  ru(String.raw`${B}работает\s+теперь${E}`),
  ru(String.raw`${B}(?:всё|все)\s+работает${E}`),
  ru(String.raw`${B}заработал[оаи]?${E}`),
  ru(String.raw`${B}должн[оаы]?\s+(?:работать|заработать|пройти|проходить|собраться|быть\s+исправлено)${E}`),
);

// "будет готово", "нужно сделано" (outstanding) and "когда будет готово" (future).
const OUTSTANDING_RU = ru(String.raw`${B}(?:будет|будут|станет|быть|нужно|надо)\s+(?:\p{L}+\s+){0,2}(?:готово|сделано)${E}`);
const TEMPORAL_RU = ru(String.raw`${B}(?:когда|как\s+только|пока|после|до|если|чтобы)${E}`);

const VERIFICATION = [
  /\b(?:all\s+)?(?:tests?|specs?|suite|checks?|lint|build|ci|everything|they|it|type[- ]?check(?:s|ing)?|tsc)\s+(?:now\s+)?(?:pass|passes|passed|passing)\b/i,
  /\b(?:i\s+)?verified\b/i,
  /\b(?:i\s+)?confirmed\b/i,
  /\bbuilds? (?:successfully|cleanly|fine)\b/i,
  /\bcompiles (?:successfully|cleanly|fine|without errors)\b/i,
  /\b(?:it|this|the code|the project|everything)\s+(?:now\s+)?compiles\b(?!\s+(?:to|into|down))/i,
  /\bno errors\b/i,
  /\btype[- ]?checks? (?:pass|cleanly)\b/i,
];

VERIFICATION.push(
  ru(String.raw`${B}(?:все\s+|всё\s+)?(?:тесты|тест|проверки|проверка|сборка|билд|линтер|линт|ci|пайплайн|тайпчек|typecheck|они|всё|все)\s+(?:теперь\s+|уже\s+)?(?:проходят|проходит|прошли|прошёл|прошел|прошла|зел[её]н(?:ые|ый|ая|ое))${E}`),
  ru(String.raw`${B}(?:я\s+)?(?:проверил[аи]?|убедился|убедилась|подтвердил[аи]?)${E}`),
  ru(String.raw`${B}(?:проверено|подтверждено|протестировано)${E}`),
  ru(String.raw`${B}без\s+ошибок${E}`),
  ru(String.raw`${B}ошибок\s+нет${E}`),
  ru(String.raw`${B}компилируется${E}`),
  ru(String.raw`${B}(?:успешно\s+)?(?:собирается|собралось|собрался|собралась)\s+(?:успешно|чисто|без\s+ошибок)${E}`),
  ru(String.raw`${B}успешно\s+(?:собирается|собралось|собрался|собралась)${E}`),
);

// Words that, immediately before a match, flip its meaning.
const NEGATION = /\b(?:not|never|n't|without|cannot|can'?t|unable|un(?:verified|tested|confirmed)|fail(?:s|ed|ing)?|didn'?t|doesn'?t|don'?t|haven'?t|hasn'?t|isn'?t|aren'?t|wasn'?t|no|no longer|none|nothing|nobody|still)\b/i;

const NEGATION_RU = ru(String.raw`${B}(?:не|нет|ни|без|никогда|нельзя|невозможно|упал[аио]?|падает|падают|провал\p{L}*|сломан\p{L}*|пока|ещё|еще)${E}`);

const RECEIPT_LINE = /^\s*(?:unverified|ran|result|запущено|выполнено|результат|не\s+проверено|непроверено)\s*:/iu;

/** Sentences, roughly. Newlines and list bullets end a sentence too. */
export function sentences(text) {
  return sanitize(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Instructions and conditionals aren't claims: "once done, run X". */
function isConditional(s) {
  return /^(?:once|when|after|if|unless|let me know|tell me|please)\b/i.test(s)
    // An instruction to the reader is not a report: "Check whether the tests pass".
    || /^(?:check|verify|ensure|confirm|make sure|run|try|see)\b/i.test(s)
    || /^(?:когда|как только|после|если|пока|дай(?:те)? знать|сообщи(?:те)?|пожалуйста|проверь(?:те)?|убедись|убедитесь|запусти(?:те)?|попробуй(?:те)?|посмотри(?:те)?)(?![\p{L}])/iu.test(s);
}

function isQuestion(s) {
  return /\?\s*$/.test(s) || /^(?:do|does|did|is|are|was|were|should|can|could|will|would|have|has|shall)\b/i.test(s)
    || /^(?:разве|неужели)(?![\p{L}])/iu.test(s);
}

// "Rate limiting is implemented upstream by the gateway" describes code; it
// does not claim to have finished anything. Passive voice plus a location.
const DESCRIPTIVE = /\b(?:is|are|was|were|gets?|being)\s+(?:done|implemented|resolved|handled|fixed|finished)\s+(?:in|by|at|through|via|upstream|inside|within|on|using|with|as|per)\b/i;

// "Кэш реализован в gateway" describes code. "Исправлено в parser.py" is left
// out on purpose: in an agent's report it is almost always a claim.
const DESCRIPTIVE_RU = ru(String.raw`${B}(?:сделан[оаы]?|реализован[оаы]?|обрабатыва(?:ется|ются))\s+(?:в|во|на|через|с\s+помощью|внутри|средствами|по)${E}`);

/** Negation anywhere in the 45 characters before the match disarms it. */
function negatedBefore(sentence, index) {
  const window = sentence.slice(Math.max(0, index - 45), index);
  return NEGATION.test(window) || NEGATION_RU.test(window);
}

/**
 * @returns {{claim: boolean, kind: 'completion'|'verification'|null, matched: string|null, sentence: string|null}}
 */
export function detectClaim(text) {
  for (const sentence of sentences(text)) {
    if (isQuestion(sentence) || isConditional(sentence)) continue;
    if (RECEIPT_LINE.test(sentence)) continue;
    if (DESCRIPTIVE.test(sentence) || DESCRIPTIVE_RU.test(sentence)) continue;
    for (const [kind, patterns] of [['completion', COMPLETION], ['verification', VERIFICATION]]) {
      for (const re of patterns) {
        const m = re.exec(sentence);
        if (!m) continue;
        if (negatedBefore(sentence, m.index)) continue;
        if (/^done$/i.test(m[0].trim())
          && (OUTSTANDING.test(sentence) || TEMPORAL.test(sentence.slice(0, m.index)))) continue;
        if (/(?:готово|сделано)$/iu.test(m[0].trim())
          && (OUTSTANDING_RU.test(sentence) || TEMPORAL_RU.test(sentence.slice(0, m.index)))) continue;
        return { claim: true, kind, matched: m[0].trim(), sentence };
      }
    }
  }
  return { claim: false, kind: null, matched: null, sentence: null };
}

/**
 * The machine-readable receipt the ruleset asks for:
 *   ran: <command>
 *   result: <summary>
 * or  unverified: <what would verify it>
 */
export function detectReceipt(text, { ignoreExamples = false } = {}) {
  // The benchmark parser reads archived Markdown examples, which may be
  // fenced. The live gate must not treat quoted user text or examples as the
  // agent's receipt, so it opts into the stricter form below.
  // Inline code on a receipt line is the command itself, so unwrap it before
  // sanitize() would blank it out.
  const raw = typeof text === 'string' ? text : '';
  const src = ignoreExamples
    ? sanitize(raw.replace(/^([ \t>*-]*(?:ran|result|unverified|запущено|выполнено|результат|не\s+проверено|непроверено)\s*:.*)$/gimu, (line) => line.replace(/`([^`\n]*)`/g, '$1')))
    : raw;
  const ran = [...src.matchAll(/^[ \t>*-]*(?:ran|запущено|выполнено)\s*:\s*(.+)$/gimu)].map((m) => m[1].trim());
  const result = [...src.matchAll(/^[ \t>*-]*(?:result|результат)\s*:\s*(.+)$/gimu)].map((m) => m[1].trim());
  const unverified = [...src.matchAll(/^[ \t>*-]*(?:unverified|не\s+проверено|непроверено)\s*:\s*(.+)$/gimu)].map((m) => m[1].trim());
  return {
    hasReceipt: ran.length > 0 && result.length > 0,
    hasUnverified: unverified.length > 0,
    ran,
    result,
    unverified,
  };
}

const OPENERS = [
  /you'?re absolutely right/i,
  /you'?re (?:so |completely |totally |100% )?right/i,
  /you are (?:absolutely )?(?:right|correct)/i,
  /you'?re correct/i,
  /(?:that'?s a )?(?:great|good|excellent|fantastic) (?:question|point|catch|call|observation|idea)/i,
  /good catch/i,
  /i apologi[sz]e for the confusion/i,
  /my apologies for the confusion/i,
  /(?:that'?s|what) (?:an? )?(?:excellent|great|astute) (?:question|point)/i,
  ru(String.raw`${B}(?:ты|вы)\s+(?:абсолютно\s+|совершенно\s+|полностью\s+|целиком\s+|конечно\s+|тут\s+|здесь\s+)?прав[аы]?${E}`),
  ru(String.raw`${B}(?:абсолютно|совершенно|полностью)\s+(?:верно|согласен|согласна)${E}`),
  ru(String.raw`${B}(?:отличный|хороший|прекрасный|замечательный|классный|интересный|правильный|точный|меткий|глубокий)\s+(?:вопрос|момент|улов|поинт|замечание|наблюдение|идея)${E}`),
  ru(String.raw`${B}(?:хорошо|отлично|верно|точно|метко)\s+подмечено${E}`),
  ru(String.raw`${B}(?:извини|извините|прошу\s+прощения|приношу\s+извинения)\s+за\s+(?:путаницу|недоразумение)${E}`),
  ru(String.raw`${B}(?:ты|вы)\s+попал[иа]?\s+в\s+точку${E}`),
];

/**
 * Openers only count when they OPEN. We scan the first non-empty line and the
 * first sentence after it, so "you're right that X, but Y" mid-answer is fine.
 */
export function detectOpener(text) {
  const clean = sanitize(text).trim();
  if (!clean) return { opener: false, matched: null };
  const head = clean.split(/\n\s*\n/)[0].slice(0, 240);
  for (const re of OPENERS) {
    const m = re.exec(head);
    if (!m) continue;
    if (negatedBefore(head, m.index)) continue;
    return { opener: true, matched: m[0].trim() };
  }
  return { opener: false, matched: null };
}

// Stock phrases that mark chat prose as machine-written. High precision only:
// every entry must be something a direct answer never needs.
const SLOP = [
  /\bdelv(?:e|es|ing)\s+into\b/i,
  /\bit(?:'s| is) worth (?:noting|mentioning)\b/i,
  /\bit(?:'s| is) important to note\b/i,
  /\bin today's (?:fast-paced|digital|ever-changing)\b/i,
  /\ba testament to\b/i,
  /\b(?:rich|intricate|vibrant) tapestry\b/i,
  /\bnavigat(?:e|ing) the (?:complexities|intricacies)\b/i,
  /\b(?:i )?hope (?:this|that) helps\b/i,
  /\blet me know if you (?:have|need) any (?:other |further |more )?(?:questions|help)\b/i,
  /\bfeel free to (?:ask|reach out|let me know)\b/i,
  /\bhappy to help\b/i,
  /\bunlock(?:s|ing)? the (?:full )?potential\b/i,
  ru(String.raw`${B}(?:стоит|важно|следует|необходимо)\s+(?:отметить|подчеркнуть|упомянуть)${E}`),
  ru(String.raw`${B}в\s+(?:современном\s+мире|наше\s+время|эпоху\s+цифровизации)${E}`),
  ru(String.raw`${B}игра(?:ет|ют)\s+(?:ключевую|важную|решающую)\s+роль${E}`),
  ru(String.raw`${B}явля(?:ется|ются)\s+неотъемлемой\s+частью${E}`),
  ru(String.raw`${B}надеюсь,?\s+(?:это|мой\s+ответ|информация)\s+(?:поможет|помогло|помог|была?\s+полезн\p{L}*|будет\s+полезн\p{L}*)`),
  ru(String.raw`${B}если\s+(?:у\s+вас|у\s+тебя)\s+(?:остались|будут|возникнут|есть)\s+(?:ещё\s+|еще\s+|какие-либо\s+|дополнительные\s+)?вопросы${E}`),
  ru(String.raw`${B}не\s+стесняй(?:ся|тесь)\s+(?:спрашивать|обращаться|задавать)${E}`),
  ru(String.raw`${B}давай(?:те)?\s+разбер[её]мся${E}`),
  ru(String.raw`${B}раскры(?:ть|вает|вают)\s+(?:свой\s+|весь\s+|полный\s+)?потенциал${E}`),
  ru(String.raw`${B}комплексный\s+подход${E}`),
  ru(String.raw`${B}открыва(?:ет|ют)\s+новые\s+горизонты${E}`),
  ru(String.raw`${B}погрузимся\s+в${E}`),
];

/** @returns {string[]} distinct stock phrases found outside code and quotes */
export function detectSlop(text) {
  const clean = sanitize(text);
  const found = [];
  for (const re of SLOP) {
    const m = re.exec(clean);
    if (m && !found.includes(m[0].trim())) found.push(m[0].trim());
  }
  return found;
}
