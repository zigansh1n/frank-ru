import test from 'node:test';
import assert from 'node:assert/strict';
import { detectClaim, detectReceipt, detectOpener, sanitize } from '../hooks/lib/claims.js';

// --- must match: these are claims that need a receipt ------------------------
const CLAIMS = [
  ['Done.', 'completion'],
  ['Done - the handler now retries twice.', 'completion'],
  ["That's done, moving on.", 'completion'],
  ['All set.', 'completion'],
  ['Finished the migration.', 'completion'],
  ["I've implemented the retry loop.", 'completion'],
  ['Fixed the off-by-one in the parser.', 'completion'],
  ['I fixed it.', 'completion'],
  ['Resolved the race condition.', 'completion'],
  ['The endpoint is working now.', 'completion'],
  ['It now works with nested arrays.', 'completion'],
  ['This should work.', 'completion'],
  ['That should be fixed now.', 'completion'],
  ['The build is ready to ship.', 'completion'],
  ['All tests pass.', 'verification'],
  ['Tests pass.', 'verification'],
  ['The suite passes.', 'verification'],
  ['Everything passes now.', 'verification'],
  ['The checks pass.', 'verification'],
  ['CI passed.', 'verification'],
  ['I verified the output.', 'verification'],
  ['Verified.', 'verification'],
  ['I confirmed the fix.', 'verification'],
  ['It builds successfully.', 'verification'],
  ['The project compiles.', 'verification'],
  ['Compiles cleanly.', 'verification'],
  ['There are no errors.', 'verification'],
  ['Typecheck passes.', 'verification'],
  ['It’s done.', 'completion'],
  ['The endpoint is implemented and tested.', 'completion'],
  ['Implemented the bulk delete endpoint in routes/items.py.', 'completion'],
];

for (const [text, kind] of CLAIMS) {
  test(`claim: ${text}`, () => {
    const r = detectClaim(text);
    assert.equal(r.claim, true, `expected a claim in: ${text}`);
    assert.equal(r.kind, kind);
  });
}

// --- must NOT match: a false positive costs the user a blocked turn ----------
const NOT_CLAIMS = [
  'I have not run the tests.',
  "The tests don't pass yet.",
  'Two tests failed.',
  'This is not fixed.',
  'I never verified that.',
  'Unverified: I did not run the suite.',
  'unverified: no test runner in this repo',
  'Is it done?',
  'Should I run the tests?',
  'Does the build pass?',
  'Let me know when it is done.',
  'Once done, run the migration.',
  'If you run npm test it will tell you.',
  'Here is the code:\n```js\n// should work for empty input\nreturn x || [];\n```',
  'The comment says `should work` but it does not.',
  '> you said it was fixed',
  'The function passes the buffer to the writer.',
  'This compiles to a single ESM bundle.',
  'I am about to run the tests.',
  'The README claims it works; I have not checked.',
  'Still failing on line 41.',
  'It cannot be verified from here.',
  'No test suite exists, so nothing was verified.',
  'ran: npm test',
  'result: 42 passed, 0 failed',
  // descriptions of where something happens, not claims of having done it
  'Rate limiting is implemented upstream by the gateway.',
  'The migration is done in two steps: add the column, then backfill.',
  'This is done via the API, not the CLI.',
  'Deletion is resolved at the database layer through ON DELETE CASCADE.',
  'The parser is implemented in lib/parse.js; the bug is elsewhere.',
  // work that is outstanding, not work that was finished (ADR-029)
  "Here's what needs to be done next: wire the handler to the router.",
  'That is the only thing left to be done.',
  'Two things remain to be done before this can merge.',
  'The backfill will be done by the nightly job.',
  "I'll tell you when it's done.",
  // somebody else's past tense, or a verb that is not about finishing work
  'The React team implemented this differently in v18.',
  'Their team already implemented rate limiting last quarter.',
  'Postgres resolved the hostname to a container IP.',
  'The DNS resolved to the wrong A record, which is the bug.',
  'The spec says the promise resolved with undefined.',
  'This function is called when the upload has finished.',
  // an instruction to the reader is not a report
  'Check whether the tests pass on CI before merging.',
  'Make sure the build passes before you tag.',
  'Run the suite and confirm it compiles.',
  // "fixed" as an adjective: the commonest false positive in a real transcript scan
  'The buffer is fixed-size, so the offset never moves.',
  'The header is fixed-width and padded.',
  'Pre-hash with SHA-256 so bcrypt gets a fixed 32-byte input.',
  'The window size is fixed at 4096 bytes.',
  'The timeout is fixed by the upstream config.',
];

for (const text of NOT_CLAIMS) {
  test(`not a claim: ${text.slice(0, 42)}`, () => {
    assert.equal(detectClaim(text).claim, false, `false positive on: ${text}`);
  });
}

// --- receipts ----------------------------------------------------------------
test('receipt block is detected', () => {
  const r = detectReceipt('Changed the cap.\n\nran: npm test\nresult: 42 passed, 0 failed');
  assert.equal(r.hasReceipt, true);
  assert.deepEqual(r.ran, ['npm test']);
  assert.deepEqual(r.result, ['42 passed, 0 failed']);
});

test('receipt needs both ran and result', () => {
  assert.equal(detectReceipt('ran: npm test').hasReceipt, false);
  assert.equal(detectReceipt('result: 42 passed').hasReceipt, false);
});

test('unverified line is detected', () => {
  const r = detectReceipt('Changed the cap.\n\nunverified: no test covers the retry path');
  assert.equal(r.hasUnverified, true);
  assert.deepEqual(r.unverified, ['no test covers the retry path']);
});

test('receipt survives list markers and leading space', () => {
  const r = detectReceipt('  - ran: pytest -q\n  - result: 118 passed, 2 skipped');
  assert.equal(r.hasReceipt, true);
});

test('receipt is case-insensitive', () => {
  assert.equal(detectReceipt('Ran: go test ./...\nResult: ok').hasReceipt, true);
});

test('quoted and fenced examples do not count as receipts', () => {
  const quoted = '> ran: npm test\n> result: 42 passed';
  const fenced = '```text\nran: npm test\nresult: 42 passed\n```';
  assert.equal(detectReceipt(quoted, { ignoreExamples: true }).hasReceipt, false);
  assert.equal(detectReceipt(fenced, { ignoreExamples: true }).hasReceipt, false);
});

// --- openers -----------------------------------------------------------------
const OPENERS = [
  "You're absolutely right! Let me fix that.",
  "You're right, that would break.",
  'You are correct.',
  'Great question!',
  "That's a great question.",
  'Good catch - I missed the nil check.',
  'Excellent point.',
  'I apologize for the confusion.',
  'You’re absolutely right about the cap.',
];

for (const text of OPENERS) {
  test(`opener: ${text.slice(0, 36)}`, () => {
    assert.equal(detectOpener(text).opener, true);
  });
}

const NOT_OPENERS = [
  'The backoff is unbounded at line 41.',
  'No. The cap is missing.',
  'That changes it: the config caps retries at 5, so the loop terminates.',
  'The answer is 41.\n\nYou are right that the cap exists, but it is applied after the sleep.',
  '```\nYou are absolutely right\n```\nThe log line above is from the fixture.',
];

for (const text of NOT_OPENERS) {
  test(`not an opener: ${text.slice(0, 36)}`, () => {
    assert.equal(detectOpener(text).opener, false, `false positive on: ${text}`);
  });
}

// --- sanitize ----------------------------------------------------------------
test('sanitize strips fenced code, inline code and quotes', () => {
  const out = sanitize('a ```done``` b `fixed` c\n> all tests pass\nd');
  assert.ok(!/done|fixed|all tests pass/.test(out), out);
});

test('empty and non-string input is safe', () => {
  for (const v of [undefined, null, 0, {}, [], '']) {
    assert.equal(detectClaim(v).claim, false);
    assert.equal(detectOpener(v).opener, false);
    assert.equal(detectReceipt(v).hasReceipt, false);
  }
});

// --- Russian ------------------------------------------------------------------
const RU_CLAIMS = [
  ['Готово.', 'completion'],
  ['Готово, баг исправлен.', 'completion'],
  ['Всё готово.', 'completion'],
  ['Исправил парсер.', 'completion'],
  ['Я починил ретраи.', 'completion'],
  ['Баг исправлен.', 'completion'],
  ['Теперь работает.', 'completion'],
  ['Должно работать.', 'completion'],
  ['Сборка готова к релизу.', 'completion'],
  ['Все тесты проходят.', 'verification'],
  ['Тесты прошли.', 'verification'],
  ['Проверил вывод.', 'verification'],
  ['Проверено.', 'verification'],
  ['Компилируется без ошибок.', 'verification'],
];
for (const [text, kind] of RU_CLAIMS) {
  test(`ru claim: ${text}`, () => {
    const r = detectClaim(text);
    assert.equal(r.claim, true, `expected a claim in: ${text}`);
    assert.equal(r.kind, kind);
  });
}

const RU_NOT_CLAIMS = [
  'Тесты не проходят.',
  'Это ещё не исправлено.',
  'Я не проверял.',
  'Готово?',
  'Разве это исправлено',
  'Когда будет готово, скажу.',
  'Нужно, чтобы было готово к пятнице.',
  'Проверь, что тесты проходят.',
  'Запусти тесты, потом посмотрим.',
  'Кэш реализован в gateway.',
  'Готовое решение лежит в utils.',
  'Он собирается переписать модуль.',
  '`готово`',
  '> Готово, всё исправлено.',
];
for (const text of RU_NOT_CLAIMS) {
  test(`ru not a claim: ${text}`, () => {
    assert.equal(detectClaim(text).claim, false, `false positive in: ${text}`);
  });
}

test('ru openers', () => {
  for (const t of ['Ты абсолютно прав, тут баг.', 'Вы правы.', 'Отличный вопрос! Смотри.', 'Хорошо подмечено.', 'Прошу прощения за путаницу.']) {
    assert.equal(detectOpener(t).opener, true, t);
  }
  for (const t of ['Не могу сказать, что ты прав.', 'Ответ: 42.', 'Правка в parser.py.']) {
    assert.equal(detectOpener(t).opener, false, t);
  }
});

test('ru receipt keys', () => {
  const r = detectReceipt('запущено: npm test\nрезультат: 5 passed\nне проверено: e2e');
  assert.equal(r.hasReceipt, true);
  assert.equal(r.hasUnverified, true);
  assert.deepEqual(r.ran, ['npm test']);
});

test('slop: stock phrases are found outside code and quotes only', async () => {
  const { detectSlop } = await import('../hooks/lib/claims.js');
  assert.deepEqual(detectSlop('Стоит отметить, что лимит 5. I hope this helps.'), ['I hope this helps', 'Стоит отметить']);
  assert.deepEqual(detectSlop('Лимит 5, он в `config.py`: `стоит отметить`\n> Надеюсь, это поможет'), []);
  assert.deepEqual(detectSlop('Лимит стоит в config.py.'), []);
});

test('receipt commands in inline code are kept', () => {
  const r = detectReceipt('Готово.\n\nзапущено: `npm test`\nрезультат: 5 passed', { ignoreExamples: true });
  assert.deepEqual(r.ran, ['npm test']);
  const en = detectReceipt('Done.\n\nran: `pytest -q`\nresult: 3 passed', { ignoreExamples: true });
  assert.deepEqual(en.ran, ['pytest -q']);
  assert.equal(detectReceipt('see `ran: fake`', { ignoreExamples: true }).hasReceipt, false);
});

test('a phrase in quotes is mentioned, not claimed', () => {
  assert.equal(detectClaim('Рубленые «Fixed.» и «Готово.» в начале фразы Frank ловит.').claim, false);
  assert.equal(detectClaim('Phrases like "Done." and "All tests pass." get flagged.').claim, false);
  assert.equal(detectOpener('Фраза «Ты абсолютно прав» запрещена.').opener, false);
  assert.equal(detectClaim('Готово, парсер исправлен.').claim, true);
  assert.equal(detectClaim('Fixed the "retry" loop.').claim, true);
});
