"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Lead, RuleResult, Turn } from "@/lib/types";
import { Phone } from "./ui";
import { plain } from "@/lib/format";

type Scenario = { key: string; title: string; expect: string; blurb: string };
type Snap = Record<string, unknown>;
type Qual = { decision: string; reason: string; confidence: number; rules: RuleResult[]; missing: string[]; reviewReasons: string[]; recommendedAction: string };
type Result = { lead: Lead; call: { transcript: Turn[]; cost: { total: number; telephony: number; transcription: number; tts: number; llm: number; other: number; minutes: number } }; qualification: Qual };

const SLOTS: [string, string][] = [["name", "Name"], ["project", "Project"], ["location", "Location"], ["area", "Area"], ["timeline", "Timeline"], ["budget", "Budget"]];

// minimal typing for the Web Speech API
type SR = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: { 0: { transcript: string }; isFinal: boolean }[] & { length: number } }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null; start: () => void; stop: () => void };

export function Simulator({ scenarios, threshold }: { scenarios: Scenario[]; threshold: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<"script" | "voice">("script");
  const [sel, setSel] = useState(scenarios[0].key);
  const [afterHours, setAfterHours] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [phase, setPhase] = useState<"idle" | "ringing" | "talking" | "done">("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [snap, setSnap] = useState<Snap>({});
  const [flash, setFlash] = useState<string[]>([]);
  const [, setKb] = useState<string[]>([]);
  const [typing, setTyping] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [progress, setProgress] = useState(0);
  const [costTotal, setCostTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(0);
  const body = useRef<HTMLDivElement>(null);
  const cancel = useRef(false);
  const speedRef = useRef(2);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  // voice-mode state
  const [callId, setCallId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [draft, setDraft] = useState("");
  const [voiceOk, setVoiceOk] = useState(true);
  const [speak, setSpeak] = useState(true);
  const recRef = useRef<SR | null>(null);

  useEffect(() => { body.current?.scrollTo({ top: body.current.scrollHeight }); }, [turns, typing]);
  useEffect(() => {
    if (phase !== "talking") return;
    const t = setInterval(() => setClock((c) => c + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setVoiceOk(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => { cancel.current = true; window.speechSynthesis?.cancel(); recRef.current?.stop(); };
  }, []);

  const applySnap = (s?: Snap) => {
    if (!s) return;
    setSnap((prev) => {
      const changed = Object.keys(s).filter((k) => JSON.stringify(s[k]) !== JSON.stringify(prev[k]) && s[k] != null && s[k] !== "");
      if (changed.length) { setFlash(changed); setTimeout(() => setFlash([]), 1200); }
      return s;
    });
  };
  const reset = () => { cancel.current = true; window.speechSynthesis?.cancel(); setTurns([]); setSnap({}); setKb([]); setResult(null); setProgress(0); setCostTotal(0); setError(null); setClock(0); setCallId(null); setPhase("idle"); };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function runScript() {
    reset(); await sleep(30); cancel.current = false;
    setPhase("ringing");
    const req = fetch("/api/simulate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario: sel, afterHours }) }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j as Result; });
    await sleep(1600 / speedRef.current);
    let res: Result;
    try { res = await req; } catch (e) { setError((e as Error).message); setPhase("idle"); return; }
    setPhase("talking"); setCostTotal(res.call.cost.total);
    const tr = res.call.transcript;
    for (let i = 0; i < tr.length; i++) {
      if (cancel.current) return;
      const t = tr[i];
      if (t.speaker === "agent") { setTyping(true); await sleep(Math.min(1400, 350 + t.text.length * 6) / speedRef.current); setTyping(false); }
      else await sleep(Math.min(1600, 400 + t.text.length * 12) / speedRef.current);
      setTurns((x) => [...x, t]);
      applySnap(t.meta?.extracted as Snap | undefined);
      if (t.meta?.kb?.length) setKb((k) => [...new Set([...k, ...t.meta!.kb!])]);
      setProgress((i + 1) / tr.length);
    }
    await sleep(500 / speedRef.current);
    setResult(res); setPhase("done"); router.refresh();
  }

  // ———— voice / typed live call ————
  function say(text: string) {
    return new Promise<void>((resolve) => {
      if (!speak || !window.speechSynthesis) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      const v = window.speechSynthesis.getVoices().find((x) => /en[-_]IN/i.test(x.lang)) ?? window.speechSynthesis.getVoices().find((x) => /^en/i.test(x.lang));
      if (v) u.voice = v;
      u.lang = v?.lang ?? "en-IN"; u.rate = 1.03;
      u.onend = () => resolve(); u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
  }
  function listen() {
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!C) return;
    const rec = new C();
    rec.lang = "en-IN"; rec.interimResults = true; rec.continuous = false;
    let final = "";
    rec.onresult = (e) => {
      let txt = "";
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      setDraft(txt);
      if (e.results[e.results.length - 1].isFinal) final = txt;
    };
    rec.onend = () => { setListening(false); if (final.trim()) send(final.trim()); };
    rec.onerror = (e) => { setListening(false); if (e.error !== "no-speech") setError(`Microphone: ${e.error}`); };
    recRef.current = rec; setListening(true); rec.start();
  }
  async function startLive() {
    reset(); await sleep(30); cancel.current = false;
    setPhase("ringing"); await sleep(900);
    const r = await fetch("/api/calls/live", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start", mode: "browser" }) });
    const j = await r.json();
    if (!r.ok) { setError(j.error); setPhase("idle"); return; }
    setCallId(j.callId); setPhase("talking");
    setTurns([{ speaker: "agent", text: j.reply, at: 0 }]);
    await say(j.reply);
    if (voiceOk && mode === "voice") listen();
  }
  async function send(text: string) {
    if (!callId && !text) return;
    setDraft("");
    setTurns((x) => [...x, { speaker: "caller", text, at: clock }]);
    setTyping(true);
    const id = callId ?? (await currentCallId());
    const r = await fetch("/api/calls/live", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "turn", callId: id, text }) });
    const j = await r.json();
    setTyping(false);
    if (!r.ok) { setError(j.error); return; }
    setTurns((x) => [...x, { speaker: "agent", text: j.reply, at: clock }]);
    applySnap(j.snapshot);
    if (j.done) { await finishLive(j); await say(j.reply); return; }
    await say(j.reply);
    if (voiceOk && mode === "voice") listen();
  }
  const callIdRef = useRef<string | null>(null);
  useEffect(() => { callIdRef.current = callId; }, [callId]);
  async function currentCallId() { return callIdRef.current; }
  async function finishLive(j: { lead: Lead; qualification: Qual }) {
    const res = await fetch(`/api/leads/${j.lead.id}/peek`).then((r) => r.ok ? r.json() : null).catch(() => null);
    setResult({ lead: res?.lead ?? j.lead, qualification: j.qualification, call: res?.call ?? { transcript: [], cost: { total: j.lead.aiCost, telephony: 0, transcription: 0, tts: 0, llm: 0, other: 0, minutes: 0 } } });
    setPhase("done"); setProgress(1); router.refresh();
  }
  async function hangUp() {
    recRef.current?.stop(); window.speechSynthesis?.cancel();
    const id = callIdRef.current;
    if (!id) return reset();
    const r = await fetch("/api/calls/live", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "end", callId: id }) });
    const j = await r.json();
    if (!r.ok) { setError(j.error); return; }
    setTurns((x) => [...x, { speaker: "system", text: "You ended the call", at: clock }]);
    await finishLive(j);
  }

  const q = result?.qualification;
  const lead = result?.lead;
  const costShown = mode === "script" ? costTotal * progress : result ? result.call.cost.total : 0;
  const isLive = mode === "voice";
  const mins = Math.floor(clock / 60), secs = String(clock % 60).padStart(2, "0");

  return (
    <div className="sim">
      {/* —— left: choose —— */}
      <div className="scen-col">
        <div className="seg" style={{ marginBottom: 12 }}>
          <button className={mode === "script" ? "on" : ""} onClick={() => { reset(); setMode("script"); }}>Sample caller</button>
          <button className={mode === "voice" ? "on" : ""} onClick={() => { reset(); setMode("voice"); }}>Be the caller</button>
        </div>
        {mode === "script" ? (
          <>
            <div className="scen">
              {scenarios.map((s) => (
                <button key={s.key} className={sel === s.key ? "on" : ""} onClick={() => setSel(s.key)} disabled={phase === "ringing" || phase === "talking"}>
                  <b>{s.title}</b><small>{s.blurb}</small>
                </button>
              ))}
            </div>
            <label className="row small" style={{ marginTop: 12, gap: 8 }}><input type="checkbox" checked={afterHours} onChange={(e) => setAfterHours(e.target.checked)} /> Place the call after hours (≈10:40 PM IST)</label>
            <div className="row" style={{ marginTop: 10 }}>
              <span className="tiny muted">Playback</span>
              <div className="seg">{[1, 2, 4, 20].map((s) => <button key={s} className={speed === s ? "on" : ""} onClick={() => setSpeed(s)}>{s === 20 ? "instant" : `${s}×`}</button>)}</div>
            </div>
          </>
        ) : (
          <div className="card card-pad small">
            <h3 style={{ marginBottom: 8 }}>You are the customer</h3>
            <p className="ink2" style={{ margin: "0 0 10px" }}>Start the call, then speak (Chrome, mic permission) or type. Try: <i>&ldquo;Hi, I need interiors for my 2 BHK in Aundh&rdquo;</i>, ask what it costs, or ask for a final quote.</p>
            {!voiceOk && <div className="callout" style={{ marginBottom: 10 }}>This browser has no speech recognition — type your replies instead.</div>}
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={speak} onChange={(e) => setSpeak(e.target.checked)} /> Read replies aloud</label>
          </div>
        )}
      </div>

      {/* —— centre: the call —— */}
      <div className="phone">
        <div className="phone-top">
          <div>
            <div className="who">{(snap.name as string) || (phase === "idle" ? "Aangan Studio line" : "Unknown caller")}</div>
            <div className="meta">{phase === "idle" ? "+91 20 · demo line" : phase === "ringing" ? "incoming…" : phase === "done" ? `call ended · ${lead?.id ?? ""}` : <>on call · {mins}:{secs} <span className="wave" style={{ color: "var(--green)", marginLeft: 6 }}><i /><i /><i /><i /><i /></span></>}</div>
          </div>
          {phase === "idle" || phase === "done" ? (
            <button className="btn terra" onClick={isLive ? startLive : runScript}><Phone size={15} /> {phase === "done" ? "New call" : isLive ? "Start call" : "Start call"}</button>
          ) : isLive ? <button className="btn danger" onClick={hangUp}>Hang up</button> : <button className="btn" onClick={() => { speedRef.current = 80; }}>Skip to end</button>}
        </div>
        {phase === "idle" || phase === "ringing" ? (
          <div className="phone-idle">
            <div>
              <div className={`ringer ${phase === "ringing" ? "ringing" : ""}`}><Phone size={38} /></div>
              <div className="num" style={{ fontSize: 24, color: "var(--ink)" }}>{phase === "ringing" ? "Ringing…" : "Ready"}</div>
              <p className="small" style={{ maxWidth: "36ch", margin: "8px auto 0" }}>{phase === "ringing" ? "Answering…" : "Pick a caller on the left and start the call."}</p>
              {error && <div className="callout err" style={{ marginTop: 14, textAlign: "left" }}>{error}</div>}
            </div>
          </div>
        ) : (
          <div className="phone-body" ref={body}>
            <div className="transcript">
              {turns.map((t, i) => (
                <div key={i} className={`turn ${t.speaker} fade-in`}>
                  <div className="who">{t.speaker === "agent" ? "Aangan" : t.speaker === "caller" ? "Caller" : "Note"}<small>{Math.floor(t.at / 60)}:{String(Math.floor(t.at % 60)).padStart(2, "0")}</small></div>
                  <div>
                    <div className="bubble">{t.text}</div>
                  </div>
                </div>
              ))}
              {typing && <div className="turn agent"><div className="who">Aangan</div><div className="bubble" style={{ width: 64 }}><span className="typing"><i /><i /><i /></span></div></div>}
            </div>
            {isLive && phase === "talking" && (
              <form className="row" style={{ marginTop: 16, flexWrap: "nowrap" }} onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { recRef.current?.stop(); send(draft.trim()); } }}>
                <input style={{ flex: 1 }} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={listening ? "Listening… speak now" : "Type what the caller says"} />
                {voiceOk && <button type="button" className={`btn ${listening ? "sage" : ""}`} onClick={() => (listening ? recRef.current?.stop() : listen())}>{listening ? "● Listening" : "🎙 Speak"}</button>}
                <button className="btn primary" type="submit">Send</button>
              </form>
            )}
            {error && <div className="callout err" style={{ marginTop: 14 }}>{error}</div>}
            {phase === "done" && q && lead && <Outcome q={q} lead={lead} threshold={threshold} />}
          </div>
        )}
      </div>

      {/* —— right: what the agent knows —— */}
      <div className="mind">
        <div className="card card-pad">
          <div className="panel-title"><div className="eyebrow">Captured so far</div></div>
          <dl className="slots" style={{ margin: 0 }}>
            {SLOTS.map(([k, label]) => {
              const v = snap[k];
              const unclear = (snap.unclear as string[] | undefined)?.includes(k);
              return (
                <div key={k} className={`slot ${flash.includes(k) ? "flash" : ""}`}>
                  <dt>{label}</dt>
                  <dd className={v ? "" : "empty"}>{v ? (k === "area" ? `${Number(v).toLocaleString("en-IN")} sq ft` : String(v)) : unclear ? <span style={{ color: "var(--amber)" }}>asked — unclear</span> : "—"}</dd>
                </div>
              );
            })}
            <div className={`slot ${flash.includes("requirements") ? "flash" : ""}`}><dt>Needs</dt><dd className={(snap.requirements as string[] | undefined)?.length ? "" : "empty"}>{(snap.requirements as string[] | undefined)?.join(", ") || "—"}</dd></div>
          </dl>
          {(snap.contradictions as string[] | undefined)?.length ? <div className="callout" style={{ marginTop: 10, fontSize: 12.5 }}>⚠ {(snap.contradictions as string[]).join("; ")}</div> : null}
          {Number(snap.corrections) > 0 && <div className="tiny" style={{ color: "var(--amber)", marginTop: 8 }}>Caller corrected themselves {String(snap.corrections)}×</div>}
        </div>

        <div className="card card-pad">
          <div className="panel-title"><div className="eyebrow">Price range given</div></div>
          {snap.pricing ? <div className="small">{String(snap.pricing)}</div> : <div className="small muted">Not discussed yet.</div>}
        </div>

        <div className="card card-pad">
          <div className="cost-meter"><span className="eyebrow">Cost of this call</span><b className="num">₹{costShown.toFixed(2)}</b></div>
          {result && phase === "done" && <div className="tiny muted mono" style={{ marginTop: 8, lineHeight: 1.7 }}>phone ₹{result.call.cost.telephony.toFixed(2)} · voice ₹{(result.call.cost.transcription + result.call.cost.tts).toFixed(2)} · processing ₹{(result.call.cost.llm + result.call.cost.other).toFixed(2)}</div>}
        </div>
      </div>
    </div>
  );
}

function Outcome({ q, lead }: { q: Qual; lead: Lead; threshold: number }) {
  return (
    <div className="fade-in" style={{ marginTop: 22, borderTop: "1px solid var(--rule)", paddingTop: 10 }}>
      <div className="stampbox"><div className={`stamp ${q.decision}`}>{q.decision.replace(/_/g, " ")}<small>confidence {Math.round(q.confidence * 100)}%</small></div></div>
      <p className="small ink2" style={{ textAlign: "center", maxWidth: "56ch", margin: "10px auto 16px" }}>{plain(q.reason)}</p>
      <div className="rules" style={{ marginBottom: 16 }}>
        {q.rules.map((r) => <div key={r.id} className={`rule ${r.result}`}><span className="res">{r.result}</span><span>{r.name}: {plain(r.detail)}</span></div>)}
      </div>
      {lead.designerHandoffStatus !== "NOT_SENT" && lead.handoffMessage ? (
        <div className="grid g2" style={{ alignItems: "start" }}>
          <div className="tg">
            <div className="tg-head"><div className="tg-av">A</div><div><div style={{ fontWeight: 600 }}>Aangan Enquiries</div><div style={{ fontSize: 11, color: "#7f91a4" }}>bot · to {lead.designerAssigned}</div></div></div>
            <div className="tg-msg">{lead.handoffMessage}</div>
            <div className="tg-btns"><span>✅ Acknowledge</span><span>📞 Contacted</span></div>
            <div className="tg-meta"><span>{lead.handoffChannel === "telegram" ? "delivered via Telegram" : "Telegram not connected — saved here only"}</span><span>✓✓</span></div>
          </div>
          <div className="small">
            <h3>Handed to {lead.designerAssigned}</h3>
            <p className="ink2">{lead.recommendedAction}</p>
                        <Link className="btn primary" href={`/leads/${lead.id}`}>Open lead · record outcome →</Link>
          </div>
        </div>
      ) : q.decision === "NEEDS_HUMAN_REVIEW" ? (
        <div className="callout">
          <b>Review task created</b> for {lead.designerAssigned}.
          <ul style={{ margin: "6px 0", paddingLeft: 18 }}>{q.reviewReasons.slice(0, 4).map((r, i) => <li key={i}>{plain(r)}</li>)}</ul>
          {q.missing.length > 0 && <div>Missing: {q.missing.join(", ")}</div>}
          <div style={{ marginTop: 6 }}><b>Next:</b> {q.recommendedAction}</div>
          <div className="row" style={{ marginTop: 10 }}><Link className="btn sm primary" href={`/leads/${lead.id}`}>Open lead · override →</Link><Link className="btn sm" href="/failures">Review queue</Link></div>
        </div>
      ) : (
        <div className="callout info">
          <b>Not passed to a designer.</b> The enquiry is saved. {q.recommendedAction}
          <div className="row" style={{ marginTop: 10 }}><Link className="btn sm" href={`/leads/${lead.id}`}>Open lead · override if wrong →</Link></div>
        </div>
      )}
    </div>
  );
}
