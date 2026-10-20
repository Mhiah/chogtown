"use client";

import { useEffect, useState } from "react";

/** Three quick cards the first time someone enters the town. Reopens from the ? in the header. */
const STEPS = [
  { img: "/toy/wave.webp", title: "This town is live", text: "Every Chog here is a real Chog Genesis NFT. They walk, gossip and pick fights on their own, and everyone watching sees the same town at the same time." },
  { img: "/toy/selfie.webp", title: "Play any Chog", text: "Tap a Chog to play as it. Walk it anywhere, then Roast, spread a Rumour, Flirt or Make up. Holders sign in to play their own Chog with a 👑 and extra perks." },
  { img: "/toy/fight.webp", title: "Feuds end in the Main Event", text: "Push a feud far enough and the bell rings. The whole town walks to the Amphitheatre to watch the same fight. Bet your chips on it at the Lucky Lilypad." },
];
const KEY = "chogtown:onboarded";

export default function Onboarding({ entered, open, onClose }: { entered: boolean; open: boolean; onClose(): void }) {
  const [i, setI] = useState(0);
  const [first, setFirst] = useState(false);
  useEffect(() => {
    if (!entered) return;
    let seen = true;
    try { seen = localStorage.getItem(KEY) === "1"; } catch {}
    // wait for the intro to fade before the first card
    if (!seen) { const t = setTimeout(() => setFirst(true), 900); return () => clearTimeout(t); }
  }, [entered]);
  const show = open || first;
  useEffect(() => { if (show) setI(0); }, [show]);
  if (!show) return null;
  const done = () => { try { localStorage.setItem(KEY, "1"); } catch {} setFirst(false); onClose(); };
  const s = STEPS[i];
  return (
    <div className="onb" role="dialog" aria-label="How Chogtown works">
      <div className="onb-card" key={i}>
        <img src={s.img} alt="" />
        <div className="onb-step">{i + 1} / {STEPS.length}</div>
        <h3>{s.title}</h3>
        <p>{s.text}</p>
        <div className="onb-dots">{STEPS.map((_, j) => <i key={j} className={j === i ? "on" : ""} />)}</div>
        <div className="onb-btns">
          <button className="btn ghost small" onClick={done}>Skip</button>
          <button className="btn" onClick={() => (i < STEPS.length - 1 ? setI(i + 1) : done())}>{i < STEPS.length - 1 ? "Next" : "Let's go"}</button>
        </div>
      </div>
    </div>
  );
}
