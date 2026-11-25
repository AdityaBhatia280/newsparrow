// The publik module's per-person store, kept in Postgres. The pk_ key is encrypted at rest and never leaves the server.
import { decryptSecret, encryptSecret } from "../crypto.mjs";

export function createPublikStore(db) {
  return {
    async get(userId) {
      const rows = await db.query("select record from publik_users where user_id = $1", [userId]);
      if (!rows.length) return null;
      const record = rows[0].record;
      try {
        return { ...record, key: decryptSecret(record.key) };
      } catch {
        return null; // an unreadable record is treated as missing; the module provisions a fresh install
      }
    },
    async set(userId, user) {
      const record = { ...user, key: encryptSecret(user.key) };
      await db.query(
        `insert into publik_users (user_id, record, updated_at) values ($1, $2::jsonb, now())
         on conflict (user_id) do update set record = excluded.record, updated_at = now()`,
        [userId, JSON.stringify(record)],
      );
    },
    async delete(userId) {
      await db.query("delete from publik_users where user_id = $1", [userId]);
    },
  };
}

export async function ownKeyFor(db, userId) {
  const rows = await db.query("select key_enc from publik_own_keys where user_id = $1", [userId]);
  if (!rows.length) return null;
  try {
    return decryptSecret(rows[0].key_enc);
  } catch {
    return null;
  }
}
