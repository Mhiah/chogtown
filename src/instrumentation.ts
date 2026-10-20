/**
 * On a long-running server (Railway, Docker) there is no Vercel Cron, so the town plays out
 * its own night (see src/nightly.ts). On Vercel the cron in vercel.json does this instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startNightly } = await import("./nightly");
    startNightly();
  }
}
