"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "./client";

type Q = { key: string; title: string; need: number; have: number; done: boolean };
type D = { quests: Q[]; bonus: boolean; streak: number; reward: number; allBonus: number };

/** The header's daily quests pill: three goals a day, paid in chips, with a streak. */
export default function Quests({ entered, playing, toast }: { entered: boolean; playing: boolean; toast(t: string): void }) {
  const [d, setD] = useState<D | null>(null);
  const [open, setOpen] = useState(false);
  const prev = useRef<Record<string, boolean>>({});
  useEffect(() => {
    if (!entered) return;
    let dead = false;
    const load = () => api<D>("/api/quests").then((x) => {
      if (dead) return;
      // celebrate quests that finished since the last look
      for (const q of x.quests) if (q.done && prev.current[q.key] === false) toast(`✅ Quest done: ${q.title}. +${x.reward} chips`);
      prev.current = Object.fromEntries(x.quests.map((q) => [q.key, q.done]));
      setD(x);
    }).catch(() => {});
    load(); const i = setInterval(load, 12_000);
    return () => { dead = true; clearInterval(i); };
  }, [entered, playing, toast]);
  if (!entered || !d) return null;
  const done = d.quests.filter((q) => q.done).length;
  return (
    <div className="quests-wrap">
      <button className={`pill glass btnlike quests-pill${done === d.quests.length ? " all" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        📋 {done}/{d.quests.length}{d.streak > 0 && <span className="streak">🔥{d.streak}</span>}
      </button>
      {open && (
        <div className="quests-pop" role="dialog" aria-label="Today's quests">
          <div className="eyebrow">Today's quests</div>
          {d.quests.map((q) => (
            <div key={q.key} className={`quest${q.done ? " done" : ""}`}>
              <span className="tick">{q.done ? "✓" : ""}</span>
              <span className="t">{q.title}</span>
              <span className="n">{q.done ? `+${d.reward}` : `${q.have}/${q.need}`}</span>
            </div>
          ))}
          <p className="note">{d.bonus ? `All done: +${d.allBonus} bonus chips. Come back tomorrow to keep your streak.` : `Finish all three for +${d.allBonus} bonus chips${d.streak ? ` and a ${d.streak + 1}-day streak` : " and start a streak"}.`}</p>
        </div>
      )}
    </div>
  );
}
