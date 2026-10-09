import { runScripted, type Persona } from "../lib/engine/simulate";
const P: Persona[] = [
  { key: "A", phone: "+91 98220 11223", open: "Hi, we've just got possession of a 3 BHK in Baner and want to do the full interiors.",
    answers: { name: "It's Priya Deshmukh.", location: "Baner, near Balewadi High Street.", area: "Around 1,350 square feet carpet.", timeline: "We have possession, so ideally next month.", budget: "We're thinking 22 to 28 lakh." },
    extras: [{ after: "area", text: "Roughly how much would something like that cost?" }] },
  { key: "B", phone: "+91 90110 44556", open: "Hello, I'm opening a café in Koregaon Park and need the whole interior and kitchen done.", answers: {}, closing: "Oh okay, no problem. Thanks." },
  { key: "C", phone: "+91 77090 88990", open: "Hi, I wanted to know about interiors for my 2 BHK flat. Maybe the full thing, maybe just the kitchen.",
    answers: { project: "It's a 2 BHK, maybe the full thing, maybe just the kitchen.", name: "Rohan.", location: "Wakad.", area: "It's about 2,100 square feet I think.", timeline: "Not sure, depends on the loan.", budget: "Maybe 10 lakh. Actually no, more like 18 lakh." } },
];
for (const p of P) {
  const at = new Date("2026-10-07T16:40:00Z"); // 22:10 IST
  const r = runScripted(p, at);
  console.log("=====", p.key);
  for (const t of r.transcript) console.log(`${t.speaker.padEnd(6)} ${t.text}`);
  const q = r.state.qualification!;
  console.log("DECISION", q.decision, q.confidence, "|", q.reason);
  console.log("RULES", q.rules.map(x => `${x.id}:${x.result}`).join(" "), "| missing", q.missing, "| review", q.reviewReasons);
  console.log("NEXT", q.recommendedAction);
  console.log("EVENTS", r.events.map(e => e.type).join(","));
}
