// Append-only hash chain, computed in one SQL statement so concurrent writers can't fork it.
const HASH_SQL = (prev) => `encode(sha256(convert_to(${prev} || '|' || $2::text || '|' || coalesce($3,'') || '|' ||
  coalesce($5::bigint::text,'') || '|' || $6::jsonb::text || '|' || $7, 'utf8')), 'hex')`;

export async function audit(db, { brandId, reviewId = null, actor, action, detail = {}, ts = new Date().toISOString() }) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await db.query(
        `WITH p AS (SELECT coalesce((SELECT hash FROM audit_log WHERE brand_id=$1 ORDER BY id DESC LIMIT 1), 'genesis') AS prev)
         INSERT INTO audit_log (brand_id, review_id, actor_id, actor_role, action, detail, ts, prev_hash, hash)
         SELECT $1, $5::bigint, $3, $4, $2, $6::jsonb, $7, p.prev, ${HASH_SQL('p.prev')} FROM p`,
        [brandId, action, actor?.sub ?? null, actor?.role ?? null, reviewId, JSON.stringify(detail), ts]);
      return;
    } catch (e) {
      if (!/unique|duplicate/i.test(e.message) || attempt === 4) throw e; // chain fork -> retry
    }
  }
}

// Recomputes every hash and returns the first broken row. One query does the whole check inside the database (each row's
// hash is recomputed from the stored hash of the row before it), because asking the database one question per row took
// over two minutes for 750 entries on a hosted database.
export async function verifyChain(db, brandId) {
  const [{ n }] = await db.query('SELECT count(*)::int AS n FROM audit_log WHERE brand_id=$1', [brandId]);
  const [bad] = await db.query(
    `WITH chain AS (
       SELECT id, action, actor_id, review_id, detail, ts, prev_hash, hash,
              coalesce(lag(hash) OVER (ORDER BY id), 'genesis') AS expected_prev
         FROM audit_log WHERE brand_id=$1)
     SELECT id FROM chain
      WHERE prev_hash <> expected_prev
         OR hash <> encode(sha256(convert_to(expected_prev || '|' || action || '|' || coalesce(actor_id,'') || '|' ||
              coalesce(review_id::text,'') || '|' || detail::text || '|' || ts, 'utf8')), 'hex')
      ORDER BY id LIMIT 1`, [brandId]);
  return bad ? { ok: false, brokenAt: bad.id, checked: n } : { ok: true, checked: n };
}
