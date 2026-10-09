const { test } = require('node:test');
const assert = require('node:assert/strict');
const calendar = import('../src/lib/calendar.ts');
const input = import('../src/lib/event-input.ts');
const event = { id: 'test-id', title: '最終面接', eventType: 'INTERVIEW', startAt: '2030-06-10T01:00:00.000Z', endAt: '2030-06-10T02:30:00.000Z', company: { id: 'test-company', name: 'テスト企業', status: 'FINAL' }, isDone: false };

test('Google link preserves company, multi-day dates, location and memo', async () => {
  const { googleCalendarUrl } = await calendar;
  const url = new URL(googleCalendarUrl({ ...event, endAt: '2030-06-12T08:00:00Z', location: '大阪 & オンライン', memo: '準備\n持ち物' }));
  assert.equal(url.origin, 'https://calendar.google.com');
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(url.searchParams.get('text'), 'テスト企業：最終面接');
  assert.equal(url.searchParams.get('dates'), '20300610T010000Z/20300612T080000Z');
  assert.equal(url.searchParams.get('location'), '大阪 & オンライン');
  assert.equal(url.searchParams.get('details'), '準備\n持ち物');
});
test('ICS uses UTC, stable UID and CRLF', async () => {
  const { calendarFile } = await calendar;
  const text = calendarFile(event, new Date('2030-01-01T00:00:00Z'));
  assert.match(text, /UID:test-id@job-research.local\r\n/);
  assert.match(text, /DTSTART:20300610T010000Z\r\nDTEND:20300610T023000Z/);
  assert.ok(text.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/(?<!\r)\n/.test(text));
});
test('ICS escapes text and does not allow property injection', async () => {
  const { calendarFile } = await calendar;
  const text = calendarFile({ ...event, title: 'A, B; C\\D\r\nBEGIN:VEVENT', memo: '\nATTENDEE:someone@example.com' });
  assert.equal(text.match(/BEGIN:VEVENT/g).length, 2); // one real property, one escaped text
  assert.ok(!text.includes('\r\nATTENDEE:'));
  assert.match(text, /A\\, B\\; C\\\\D\\nBEGIN:VEVENT/);
});
test('ICS folds long Japanese and emoji lines at 75 UTF-8 octets', async () => {
  const { calendarFile } = await calendar;
  const name = '面接🙂'.repeat(80);
  const text = calendarFile({ ...event, title: name });
  for (const line of text.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.ok(text.replace(/\r\n /g, '').includes(`SUMMARY:テスト企業：${name}`));
});
test('Missing end time defaults to one hour with explanation', async () => {
  const { calendarFile } = await calendar;
  const text = calendarFile({ ...event, endAt: null }).replace(/\r\n /g, '');
  assert.match(text, /DTEND:20300610T020000Z/);
  assert.match(text, /終了日時が未設定/);
});
test('Next event skips completed and past, keeps ongoing internships, does not mutate', async () => {
  const { nextEvent } = await calendar;
  const events = [{ ...event, id: 'later', startAt: '2030-06-11T00:00:00Z' }, { ...event, id: 'done', isDone: true }, { ...event, id: 'ongoing', endAt: '2030-06-13T00:00:00Z' }, { ...event, id: 'past' }];
  assert.equal(nextEvent(events, Date.parse('2030-06-10T12:00:00Z')).id, 'ongoing');
  assert.equal(events[0].id, 'later');
});
test('Local datetime preserves local time roundtrip', async () => {
  const { localDateTime } = await calendar;
  const local = localDateTime(event.startAt);
  assert.equal(new Date(local).getTime(), Date.parse(event.startAt));
});
test('Input accepts internships and rejects blank/invalid values', async () => {
  const { eventInput } = await input;
  assert.equal(eventInput({ ...event, eventType: 'INTERNSHIP' }).eventType, 'INTERNSHIP');
  for (const body of [null, [], {}, { ...event, title: '  ' }, { ...event, startAt: 'bad' }, { ...event, startAt: '2030-02-30T00:00:00Z' }, { ...event, startAt: '2030-06-10T24:00:00Z' }, { ...event, endAt: event.startAt }, { ...event, eventType: 'invalid' }, { ...event, isDone: 'false' }]) assert.throws(() => eventInput(body));
});
test('Partial updates validate merged dates and allow completion only', async () => {
  const { eventInput } = await input;
  const current = { startAt: new Date(event.startAt), endAt: new Date(event.endAt) };
  assert.deepEqual(eventInput({ isDone: true }, current), { isDone: true });
  assert.throws(() => eventInput({ startAt: '2030-06-11T00:00:00Z' }, current));
  assert.equal(eventInput({ endAt: null }, current).endAt, null);
});
