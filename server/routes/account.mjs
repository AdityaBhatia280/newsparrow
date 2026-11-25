// Account: export everything, sign out everywhere, and delete the account with all of its data.
import { z } from "zod";
import { clearCookies } from "../auth/session.mjs";
import { parseWith, respond } from "../http.mjs";

async function exportData(ctx) {
  const uid = ctx.user.id;
  const q = (sql) => ctx.db.query(sql, [uid]);
  const [user] = await ctx.db.query("select email, display_name, created_at, terms_accepted_at from app_users where id = $1", [uid]);
  const [profile, activities, saved, tasks, shortlist, submissions, threads, messages, rewards] = await Promise.all([
    q("select * from profiles where user_id = $1"),
    q("select * from activities where user_id = $1 order by kind, position"),
    q(`select s.*, s.personal_due::text as personal_due, o.title as opportunity_title, o.official_url from saved_items s
         left join opportunities o on o.id = s.opportunity_id where s.user_id = $1`),
    q("select *, due::text as due from tasks where user_id = $1"),
    q("select s.*, c.name as college_name from college_shortlist s join colleges c on c.id = s.college_id where s.user_id = $1"),
    q("select * from submissions where user_id = $1"),
    q("select * from advisor_threads where user_id = $1"),
    q("select thread_id, role, content, tier, created_at from advisor_messages where user_id = $1 order by created_at"),
    q("select kind, points, reason, created_at from reward_transactions where user_id = $1"),
  ]);
  const strip = (rows) => rows.map(({ user_id, ...rest }) => rest);
  const body = JSON.stringify(
    {
      exportedAt: ctx.services.now().toISOString(),
      account: user,
      profile: strip(profile)[0] ?? null,
      activities: strip(activities),
      saved: strip(saved),
      tasks: strip(tasks),
      collegeShortlist: strip(shortlist),
      submissions: strip(submissions),
      advisorThreads: strip(threads),
      advisorMessages: messages,
      rewards,
    },
    null,
    2,
  );
  return respond(200, body, {
    raw: true,
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="sparrow-data.json"' },
  });
}

async function signOutEverywhere(ctx) {
  await ctx.db.query("update app_users set session_version = session_version + 1 where id = $1", [ctx.user.id]);
  ctx.cookies.push(...clearCookies(ctx.secure));
  return { signedOut: true };
}

async function deleteAccount(ctx) {
  parseWith(z.object({ confirm: z.literal("DELETE") }), await ctx.body(256), 'Type DELETE to confirm.');
  const uid = ctx.user.id;
  await ctx.db.query("delete from app_users where id = $1", [uid]);
  ctx.cookies.push(...clearCookies(ctx.secure));
  return { deleted: true };
}

export default [
  { method: "GET", path: "/api/export", access: "user", handler: exportData },
  { method: "POST", path: "/api/account/sign-out-everywhere", access: "user", handler: signOutEverywhere },
  { method: "DELETE", path: "/api/account", access: "user", handler: deleteAccount },
];
