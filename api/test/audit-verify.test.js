import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './helpers.js';
import { seed } from '../src/seed.js';
import { seedHistory } from '../src/seed-history.js';
import { audit, verifyChain } from '../src/audit.js';

const actor = { sub: 'u_rajan', role: 'manager' };

test('an untouched chain verifies, an empty brand verifies with nothing checked', async () => {
  const db = await freshDb(); await seed(db);
  assert.deepEqual(await verifyChain(db, 'northwind'), { ok: true, checked: 0 });
  for (let i = 0; i < 5; i++) await audit(db, { brandId: 'northwind', actor, action: 'test.event', detail: { i, text: 'a "quoted" ü value' } });
  assert.deepEqual(await verifyChain(db, 'northwind'), { ok: true, checked: 5 });
  await db.close();
});

test('the chain of the seeded history (hundreds of rows) verifies, and quickly', async () => {
  const db = await freshDb(); await seed(db); await seedHistory(db);
  const t = Date.now();
  const r = await verifyChain(db, 'lumina');
  assert.equal(r.ok, true); assert.ok(r.checked > 200);
  assert.ok(Date.now() - t < 3000, `verification took ${Date.now() - t} ms`);
  await db.close();
});

// The table refuses edits, so the tests switch the guard off to simulate someone with database access tampering.
async function tamper(db, sql, params) {
  await db.exec('ALTER TABLE audit_log DISABLE TRIGGER audit_no_update');
  await db.query(sql, params);
  await db.exec('ALTER TABLE audit_log ENABLE TRIGGER audit_no_update');
}

test('a changed entry is found, and it is the first broken one', async () => {
  const db = await freshDb(); await seed(db);
  for (let i = 0; i < 6; i++) await audit(db, { brandId: 'northwind', actor, action: 'test.event', detail: { i } });
  const ids = (await db.query(`SELECT id FROM audit_log WHERE brand_id='northwind' ORDER BY id`)).map((r) => r.id);
  await tamper(db, `UPDATE audit_log SET detail='{"i": 99}'::jsonb WHERE id=$1`, [ids[3]]);
  const r = await verifyChain(db, 'northwind');
  assert.equal(r.ok, false); assert.equal(Number(r.brokenAt), Number(ids[3])); assert.equal(r.checked, 6);
  await db.close();
});

test('a changed action, actor or timestamp is found too, and a rewritten link is found at the next row', async () => {
  for (const [col, val] of [['action', "'test.other'"], ['actor_id', "'u_maya'"], ['ts', "'2020-01-01T00:00:00.000Z'"]]) {
    const db = await freshDb(); await seed(db);
    for (let i = 0; i < 4; i++) await audit(db, { brandId: 'northwind', actor, action: 'test.event', detail: { i } });
    const ids = (await db.query(`SELECT id FROM audit_log WHERE brand_id='northwind' ORDER BY id`)).map((r) => r.id);
    await tamper(db, `UPDATE audit_log SET ${col}=${val} WHERE id=$1`, [ids[1]]);
    const r = await verifyChain(db, 'northwind');
    assert.equal(r.ok, false, col); assert.equal(Number(r.brokenAt), Number(ids[1]), col);
    await db.close();
  }
  const db = await freshDb(); await seed(db);
  for (let i = 0; i < 4; i++) await audit(db, { brandId: 'northwind', actor, action: 'test.event', detail: { i } });
  const ids = (await db.query(`SELECT id FROM audit_log WHERE brand_id='northwind' ORDER BY id`)).map((r) => r.id);
  await tamper(db, `UPDATE audit_log SET prev_hash='forged' WHERE id=$1`, [ids[2]]);
  assert.equal(Number((await verifyChain(db, 'northwind')).brokenAt), Number(ids[2]));
  await db.close();
});

test('each brand has its own chain: tampering in one does not break the other', async () => {
  const db = await freshDb(); await seed(db);
  for (const b of ['lumina', 'northwind']) for (let i = 0; i < 3; i++) await audit(db, { brandId: b, actor, action: 'test.event', detail: { i } });
  const [first] = await db.query(`SELECT id FROM audit_log WHERE brand_id='northwind' ORDER BY id LIMIT 1`);
  await tamper(db, `UPDATE audit_log SET action='x' WHERE id=$1`, [first.id]);
  assert.equal((await verifyChain(db, 'northwind')).ok, false);
  assert.equal((await verifyChain(db, 'lumina')).ok, true);
  await db.close();
});
