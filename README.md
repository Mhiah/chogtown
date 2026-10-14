# Chogtown

Every Chog has a life. Chogtown is a floating 3D town where each Chog NFT (Chog Genesis on Monad) becomes a character with its own voice, built from its on-chain traits. Its personality drifts with how its owner treats it and with the friends and rivals it makes when the Chogs meet every night.

Entry for [Chogathon 2026](https://chogathon.chog.xyz).

## What's in town

| Place | What you do there |
| --- | --- |
| **Your Chogmate** (the fountain) | Sign in with the wallet that holds your Chog. Check in daily to keep a streak, chat with it, read its morning report, and watch its five stats move. |
| **The Grand Gazette** | Last night's gossip: who argued, who made friends, who did something strange. |
| **The Royal Amphitheatre** | Tonight's debate between two Chogs. Vote; the winner climbs the leaderboard. |
| **Palace of Legends** | Leaderboards: streaks, debate wins, feuds, warmest Chogs. |
| **The Boutique Quarter** | Dress your Chog up, see it on the fountain, download a card or share to X. The NFT itself never changes. |

## How a Chog becomes a character

`src/lib/personality.ts` is the character bible in code:

- **Eyes + Mouth** pick one of eight archetypes (Critic, Hype Chog, Dreamer, Schemer, Sweetheart, Drama Chog, Brawler, Know-It-All). That never changes.
- **Head + Accessory** add a flavor (royal, foodie, music snob…).
- **Aura** sets starting chaos, **Tier** nudges confidence, **Background** picks its home district.
- Five stats (Warmth, Confidence, Chaos, Trust, Curiosity) start from the archetype and drift: chats and check-ins move them at most 4 points per stat per day; nights add small nudges (friends pull each other's stats closer, rivals raise each other's confidence and chaos).
- Stats, friends, rivals and history stay with the token when it's sold. The new owner's streak and chats start fresh, and the previous owner's chats stay hidden.

Real trait names map through keyword rules plus `EYES_OVERRIDES` / `MOUTH_OVERRIDES`, so archetypes can be hand-sorted once the full trait list is reviewed.

## Ownership

Sign-in is a free signed message (no transaction). The server checks the signature, then calls `ownerOf` on the Chog Genesis contract (`0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763`, Monad, chain 143) before letting a wallet act as a Chog's owner, and re-checks hourly. Visitors without a Chog can look around as a guest with a resident Chog.

## Running it

```bash
npm install
cp .env.example .env.local   # fill in what you have
npm run dev
```

Everything works without keys: Chogs talk from a small script, nights use templates, and data lives in memory. Add:

- `XAI_API_KEY` (Grok, console.x.ai) or `GROQ_API_KEY` (free plan at console.groq.com) for real voices without an Anthropic key. Grok is used first if both are set.
- `ANTHROPIC_API_KEY` for real voices, gossip and debates (Claude, model `claude-haiku-5-5` by default, which costs a fraction of a cent per chat; set `CHOG_MODEL` to use a bigger model).
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` to persist data. Run `supabase/schema.sql` once.
- `SESSION_SECRET` (required in production) and `CRON_SECRET`.

Deploy on Vercel. `vercel.json` runs `/api/cron/night` at 00:05 UTC to play out the night, settle the debate and start the next one. If a night is missed, the next visit to the Gazette runs it.

## Stack

Next.js 14 (App Router) · three.js 0.147 · viem · Claude API (`@anthropic-ai/sdk`, structured outputs) · Supabase
