# Chogtown

**A live reality show starring all 1,969 Chog Genesis NFTs.**

Chogtown is a floating toy town that never stops. Chogs walk the paths, gossip, roast each other and hold grudges, and every viewer sees the same Chogs in the same places, saying the same things, at the same moment. The town runs on the server around the clock, so nobody has to be online for the drama to happen. Holders step in and play their own Chog; everyone else watches.

- **Live:** https://chogtown.up.railway.app
- Entry for [Chogathon 2026](https://chogathon.chog.xyz)

## What you can do

- **Watch.** Tap any Chog to read its story: who it loves, who it can't stand, what it did last night. The Grand Gazette reports the drama.
- **Play your own Chog (holders only).** Sign in with the wallet that holds it and it walks onto the island wearing a 👑. Tap anywhere to walk, or tap another Chog to play a card: 🔥 Roast, 🤫 Spread a rumour, 💘 Flirt, 🤝 Make up or 🥊 Challenge. The two Chogs act the scene out in speech bubbles, in character, while the town watches.
- **Feuds escalate.** Every pair of Chogs has a feud meter: Cordial → Side-eye → Beef → Public feud → Main Event. Rivals who bump into each other heat it up on their own.
- **The Main Event.** Push a feud far enough and the bell rings. Every Chog in town walks to the Royal Amphitheatre and the two fight it out in the Rumble, a ring-out brawler where each Chog's moves come from its traits. Everyone watches the same fight at the same moment, and can pick a side or bet chips. One rings every 6 minutes for the hottest feud even if nobody books it.
- **Set an agenda.** Holders give their Chog a plan for the day (Chase the crown, Pick fights, Make friends or Lay low). It follows it while they're offline, and "While you were away" shows what it did.
- **The Lucky Lilypad.** The town casino, with play chips only: Chog Slots and the Main Event book (a pool, so the odds move as people bet).
- **Every day:** quests with a streak, a Chog of the Day, a fresh Gazette, day and night on UTC time, the Palace of Legends leaderboards, Shout, the Face Booth and the Boutique.

## Why the Chog NFT is essential

Take the NFT out and there's no cast, no players and no story.

- **The NFT is the character.** All 1,969 residents are Chog Genesis tokens. Eyes and Mouth set a Chog's archetype (Critic, Hype Beast, Dreamer, Schemer, Sweetheart, Drama Queen, Brawler, Know-it-all), which sets how it talks and who it clashes with. Its Rumble moves come from its traits: Eyes are its attack, Mouth its special, Head its dash. Every card shows "Made by its traits". (`src/lib/personality.ts`)
- **Traits are powers.** Laser eyes Zap. A crown claims the town's crown. A frog calls Frog Dad to end a feud. Skulls Haunt at night. Candles Pump or Dump the Main Event pool. Clowns Prank. Legendaries get them all. (`src/lib/powers.ts`)
- **Only holders play.** Ownership is checked with `ownerOf` on Monad. Everyone else watches.
- **The chain moves the story.** The server watches Chog Genesis `Transfer` logs on Monad. When a Chog sells, the town reacts live: it walks out to its new home, viewers get a toast, the Gazette reports it, and its card shows the new holder and how many times it has changed hands.
- **History belongs to the token.** Feuds, records, crowns, tips and diaries are stored per token, so buying a Chog means buying its friends and grudges.
- **Rarity is fame.** Legendaries and Epics stand taller and wear a gold or violet frame, a Legendary announces itself when it walks out, and rarer Chogs are drawn for more Main Events.

## $CHOG

Everything reads the chain; the only transaction is a tip you send from your own wallet.

- **Bigger daily chips:** +200 a day from 1,000 $CHOG, +500 from 25,000 and +1,500 from 250,000.
- **Tip a Chog** 100, 1k or 10k $CHOG from its card. It goes straight to whoever holds that Chog. The server finds the $CHOG `Transfer` in the transaction before counting it, the Chog thanks you live on the island, and the tip makes the Gazette.
- Chog holders also get the 250 and 500 high-roller bets, and can Challenge a rival from Side-eye.

Contracts on Monad (chain 143): Chog Genesis `0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763`, $CHOG `0x350035555E10d9AfAF1566AaebfCeD5BA6C27777` (18 decimals).

## How it works

- **One town, server-side.** `src/live/island.ts` runs the island: the life sim (`src/live/sim.js`), scenes, feuds, powers, agendas, the chain watcher, the crown, bets and tips. Snapshots stream to every browser over Server-Sent Events (`/api/live/stream`), and each browser moves the Chogs smoothly between them (`src/live/render.js`).
- **Synced Main Events.** The Rumble engine (`src/arena/rumble.js`) is fully seeded. The server plays the fight headless first to know the result, then every browser replays the same seed in fixed 60 fps ticks from the shared start time. Join late and it fast-forwards.
- **Scenes.** Claude writes each scene from both Chogs' archetypes, their feud stage and history, with a scripted fallback.
- **Chain watcher.** Every 30 s the server reads Chog Genesis `Transfer` logs in 100-block ranges and replays them into the town.
- **Sign-in** is a free signed message, then `ownerOf` on Monad, re-checked hourly.
- **Art:** the toy town and toy Chog mascot are Higgsfield renders made for this project (credits logged in `DESIGN.md`). All 1,969 Chogs' traits and art are bundled from the Chog Genesis metadata.

## Running it

```bash
npm install
cp .env.example .env.local   # fill in what you have
npm run dev
```

Everything works without keys: Chogs talk from a script and data lives in memory. Add:

- `ANTHROPIC_API_KEY` for written scenes and chats (`claude-haiku-5-5` by default; `CHOG_MODEL` to change). `XAI_API_KEY` or `GROQ_API_KEY` work as alternatives.
- `DATABASE_URL` (any Postgres; the table is created on first use) to persist the town.
- `SESSION_SECRET` (required in production).
- `MONAD_RPC_URL` for `ownerOf` and balances, and `MONAD_LOGS_RPC_URL` for the Transfer watcher (default `https://rpc3.monad.xyz`).
- `JUDGE_CODE` to enable a judge pass at `/api/judge?code=…`, which lets a browser play any Chog like a holder.
- `CRON_SECRET` protects ringing the bell by hand.
- Demo and testing only: `AUTO_MAIN_MS` changes how often a Main Event rings automatically, and `DEMO_REPLAY=1` lets `/api/live/act` replay a given Transfer.

Deployed on Railway with the included `Dockerfile` and `railway.json`.

## Stack

Next.js 14 (App Router, TypeScript) · React · Server-Sent Events · HTML5 canvas · Postgres · viem on Monad · Claude API · MediaPipe Face Landmarker
