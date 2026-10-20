/**
 * On a long-running server (Railway, Docker) there is no Vercel Cron, so the town plays out
 * its own night: shortly after 00:05 UTC, then on any later check that finds it hasn't run.
 * Turned on with NIGHTLY_IN_PROCESS=1; on Vercel the cron in vercel.json does this instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NIGHTLY_IN_PROCESS !== "1") return;
  const { runNight } = await import("./lib/night");
  const tick = async () => {
    const now = new Date();
    if (now.getUTCHours() === 0 && now.getUTCMinutes() < 5) return;
    try { const r = await runNight(); if (r.ran) console.log("night ran", r); } catch (e) { console.error("night failed", e); }
  };
  setTimeout(tick, 30_000);
  setInterval(tick, 10 * 60_000);
}
