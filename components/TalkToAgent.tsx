"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";
import { Phone, Pill } from "./ui";

type Result = { status: "ringing" | "done" | "failed"; leadId?: string; decision?: string; name?: string; summary?: string; error?: string };
type Line = { who: "agent" | "you"; text: string };

/** Live in-browser conversation with the real Vaani agent. Nothing here is scripted or simulated. */
export function TalkToAgent({ ready }: { ready: boolean }) {
  const [phase, setPhase] = useState<"idle" | "connecting" | "live" | "processing" | "done" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [agentTalking, setAgentTalking] = useState(false);
  const [secs, setSecs] = useState(0);
  const [res, setRes] = useState<Result | null>(null);
  const room = useRef<Room | null>(null);
  const roomName = useRef<string | null>(null);
  const audioBox = useRef<HTMLDivElement>(null);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "processing" || !roomName.current) return;
    const t0 = Date.now();
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/calls/outbound?id=${encodeURIComponent(roomName.current!)}`, { cache: "no-store" });
        const j = (await r.json()) as Result;
        if (j.status === "done" || j.status === "failed") { setRes(j); setPhase("done"); clearInterval(t); }
      } catch { /* keep polling */ }
      if (Date.now() - t0 > 5 * 60_000) { clearInterval(t); setPhase("done"); }
    }, 3000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => () => { room.current?.disconnect(); ws.current?.close(); }, []);

  const start = async () => {
    setErr(null); setLines([]); setRes(null); setSecs(0); setPhase("connecting");
    try {
      const r = await fetch("/api/calls/web", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Couldn't connect");
      roomName.current = j.roomName;
      const rm = new Room({ adaptiveStream: true });
      room.current = rm;
      rm.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) { const el = track.attach(); el.autoplay = true; audioBox.current?.appendChild(el); }
      });
      rm.on(RoomEvent.ActiveSpeakersChanged, (sp) => setAgentTalking(sp.some((p) => p.identity !== rm.localParticipant.identity)));
      rm.on(RoomEvent.Disconnected, () => { setPhase((p) => (p === "live" ? "processing" : p)); });
      await rm.connect(j.url, j.token);
      await rm.localParticipant.setMicrophoneEnabled(true);
      setPhase("live");
      if (j.captionsUrl) listenCaptions(j.captionsUrl);
    } catch (e) {
      room.current?.disconnect();
      const m = (e as Error).message;
      setErr(/permission|NotAllowed/i.test(m) ? "Microphone access was blocked. Allow the mic for this site and try again." : m);
      setPhase("error");
    }
  };

  // Best effort: Vaani streams live captions over a websocket. If it doesn't connect, the transcript still appears after the call.
  const listenCaptions = (url: string) => {
    try {
      const s = new WebSocket(url);
      ws.current = s;
      s.onmessage = (m) => {
        try {
          const d = JSON.parse(String(m.data));
          const text: string | undefined = d.text ?? d.transcript ?? d.message ?? d.data?.text;
          const role = String(d.speaker ?? d.role ?? d.participant ?? d.data?.speaker ?? "").toLowerCase();
          if (!text || d.is_final === false || d.final === false) return;
          const who: Line["who"] = /agent|assistant|bot|ai/.test(role) ? "agent" : "you";
          setLines((l) => [...l, { who, text }].slice(-40));
        } catch { /* non-JSON frame */ }
      };
    } catch { /* ignore */ }
  };

  const hangUp = () => { ws.current?.close(); room.current?.disconnect(); setPhase("processing"); };
  const mm = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <section className="card card-pad talk">
      <div ref={audioBox} style={{ display: "none" }} />
      <div className="talk-head">
        <div>
          <h2 style={{ margin: 0 }}>Speak in your browser</h2>
          <p className="small muted" style={{ margin: "4px 0 0" }}>A live conversation with Aangan&apos;s phone agent through your microphone. Speak as a customer would; when you end, the enquiry, decision and insights come from what you actually said.</p>
        </div>
        {ready && (phase === "live"
          ? <button className="btn danger" onClick={hangUp}>End conversation</button>
          : <button className="btn terra" disabled={phase === "connecting" || phase === "processing"} onClick={start}><Phone size={15} /> {phase === "connecting" ? "Connecting…" : phase === "done" ? "Talk again" : "Start talking"}</button>)}
      </div>

      {!ready && <div className="callout" style={{ marginTop: 14 }}>The agent isn&apos;t connected to this dashboard yet. Add <b>VAANI_API_KEY</b> in Vercel → Settings → Environment Variables and redeploy.</div>}
      {err && <div className="callout err" style={{ marginTop: 14 }}>{err}</div>}

      {(phase === "live" || phase === "connecting") && (
        <div className="talk-live">
          <div className={`talk-orb ${agentTalking ? "speaking" : ""}`}><Phone size={28} /></div>
          <div>
            <div className="row" style={{ gap: 8 }}><span className="live-dot" /><b>{phase === "connecting" ? "Connecting to the agent…" : agentTalking ? "Agent is speaking" : "Listening — go ahead"}</b><span className="mono small muted">{mm}</span></div>
            <p className="tiny muted" style={{ margin: "4px 0 0" }}>Try: &ldquo;Hi, I need interiors for my 3 BHK in Baner&rdquo;, ask what it costs, change your budget, ask for a final quote.</p>
          </div>
        </div>
      )}

      {lines.length > 0 && (
        <div className="transcript" style={{ marginTop: 14, maxHeight: 280, overflow: "auto" }}>
          {lines.map((l, i) => <div key={i} className={`turn ${l.who === "agent" ? "agent" : "caller"}`}><div className="who">{l.who === "agent" ? "Aangan" : "You"}</div><div className="bubble">{l.text}</div></div>)}
        </div>
      )}

      {phase === "processing" && <div className="callout info" style={{ marginTop: 14 }}><span className="live-dot" style={{ marginRight: 8 }} />Conversation ended. Waiting for the transcript — usually under a minute…</div>}

      {phase === "done" && (
        res?.leadId ? (
          <div className="talk-result">
            <div className="row" style={{ gap: 8 }}><b>{res.name ?? "Enquiry created"}</b>{res.decision && <Pill s={res.decision} />}</div>
            {res.summary && <p className="small ink2" style={{ margin: "6px 0 10px" }}>{res.summary}</p>}
            <div className="row"><Link className="btn sm primary" href={`/leads/${res.leadId}`}>Open the enquiry →</Link><Link className="btn sm" href="/intelligence">Insights</Link></div>
          </div>
        ) : <div className="callout" style={{ marginTop: 14 }}>{res?.status === "failed" ? `The conversation didn't complete${res.error ? `: ${res.error}` : ""}.` : "The transcript hasn't arrived yet. It will appear under Enquiries as soon as the agent sends it."}</div>
      )}
    </section>
  );
}
