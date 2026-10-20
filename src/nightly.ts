/** Runs the town's night shortly after 00:05 UTC, then on any later check that finds it hasn't run. Opt in with NIGHTLY_IN_PROCESS=1. */
export function startNightly() {
  if (process.env.NIGHTLY_IN_PROCESS !== "1") return;
  const tick = async () => {
    const now = new Date();
    if (now.getUTCHours() === 0 && now.getUTCMinutes() < 5) return;
    try {
      const { runNight } = await import("./lib/night");
      const r = await runNight();
      if (r.ran) console.log("night ran", r);
    } catch (e) { console.error("night failed", e); }
  };
  setTimeout(tick, 30_000);
  setInterval(tick, 10 * 60_000);
}
