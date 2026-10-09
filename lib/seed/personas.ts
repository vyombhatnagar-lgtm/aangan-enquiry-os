import type { Persona } from "../engine/simulate";

/**
 * DEMO DATA — 40 anonymised, invented enquiries that cover the variation the brief asks for.
 * These are NOT Aangan's real case transcripts. Each persona is a fact sheet: the simulated caller answers
 * whatever the agent asks, and the real engine produces the transcript, qualification and handoff.
 * Outcomes (contacted / consultation / won / lost / value) are recorded as a human would — the AI never sets them.
 */
export interface SeedOutcome {
  contactedAfterMin?: number;
  consult?: "SCHEDULED" | "COMPLETED" | "NO_SHOW";
  won?: number; // project value in ₹
  lost?: string;
}
export interface SeedEnquiry {
  at: string; // IST "YYYY-MM-DD HH:mm"
  p: Persona;
  failed?: "FAILED" | "ABANDONED";
  outcome?: SeedOutcome;
  ack?: boolean;
  override?: { to: "QUALIFIED" | "NOT_QUALIFIED" | "NEEDS_HUMAN_REVIEW"; reason: string; user: string };
}

let n = 0;
const ph = () => `+91 90000 ${String(10000 + ++n * 137).slice(-5)}`;
const P = (key: string, open: string, answers: Persona["answers"], extras?: Persona["extras"], closing?: string): Persona => ({ key, phone: ph(), open, answers, extras, closing });

export const SEED: SeedEnquiry[] = [
  // ——— qualified, matured: outcomes known ———
  { at: "2026-08-24 11:12", p: P("s01", "Hello, we need interiors for our new 2 BHK in Wakad.", { name: "Sneha K.", area: "About 980 square feet.", timeline: "Possession is done, we want to start next month.", budget: "Around 12 to 14 lakh." }),
    outcome: { contactedAfterMin: 38, consult: "COMPLETED", won: 1240000 }, ack: true },
  { at: "2026-08-25 21:40", p: P("s02", "Hi, sorry for calling late. I'm looking for full home interiors for a 3 BHK in Kharadi.", { name: "Aditya M.", area: "1,420 sq ft carpet.", timeline: "We get possession in November.", budget: "Somewhere between 20 and 25 lakh." }, [{ after: "area", text: "What would that roughly cost with you?" }]),
    outcome: { contactedAfterMin: 760, consult: "COMPLETED", won: 2310000 }, ack: true },
  { at: "2026-08-26 14:05", p: P("s03", "Hi, this is Meghna. We want to redo our office in Baner.", { area: "Around 1,800 square feet.", timeline: "Within 2 months ideally.", budget: "30 to 35 lakh." }, [{ after: "timeline", text: "Do you also handle the lighting design?" }]),
    outcome: { contactedAfterMin: 22, consult: "COMPLETED", lost: "Chose a cheaper contractor" }, ack: true },
  { at: "2026-08-27 08:15", p: P("s04", "Good morning. We bought a 2 BHK in Hinjewadi and want the full interiors done.", { name: "Ravi T.", area: "Roughly 900 square feet.", timeline: "In 3 months.", budget: "11 lakh max." }),
    outcome: { contactedAfterMin: 140, consult: "NO_SHOW" }, ack: true },
  { at: "2026-08-29 16:30", p: P("s05", "Hi, I'm calling about interiors for a 3 BHK in Aundh.", { name: "Farah S.", area: "About 1,250 square feet.", timeline: "Immediately, we already have possession.", budget: "18 to 22 lakh." }, [{ after: "budget", text: "Is the first consultation free?" }]),
    outcome: { contactedAfterMin: 15, consult: "COMPLETED", won: 1975000 }, ack: true },
  { at: "2026-09-01 19:45", p: P("s06", "Hello, we need a full home interior for a 2 BHK flat in Pimple Saudagar.", { name: "Kunal P.", area: "1,050 sq ft.", timeline: "Next month.", budget: "13 lakh." }),
    outcome: { contactedAfterMin: 840, consult: "COMPLETED", lost: "Postponed — family reasons" }, ack: true },
  { at: "2026-09-02 12:20", p: P("s07", "Hi, I own a villa in Bavdhan and want complete interiors.", { name: "Anjali R.", area: "Around 2,400 square feet.", timeline: "After Diwali.", budget: "About 38 to 45 lakh." }, [{ after: "area", text: "How much does a villa like that usually come to?" }]),
    outcome: { contactedAfterMin: 9, consult: "COMPLETED", won: 4120000 }, ack: true },
  { at: "2026-09-04 10:40", p: P("s08", "Hello, I need a modular kitchen for my flat in Kothrud. Just the kitchen.", { name: "Vikram J.", timeline: "In about 6 weeks.", budget: "Around 4.5 lakh." }, [{ after: "timeline", text: "What do modular kitchens usually cost?" }]),
    outcome: { contactedAfterMin: 31, consult: "COMPLETED", won: 480000 }, ack: true },
  { at: "2026-09-06 22:55", p: P("s09", "Hi, I know it's late. We want interiors for our 3 BHK in Viman Nagar.", { name: "Pooja N.", area: "1,500 square feet.", timeline: "By December.", budget: "22 lakh." }),
    outcome: { contactedAfterMin: 690, consult: "SCHEDULED" }, ack: true },
  { at: "2026-09-09 15:10", p: P("s10", "Hello, our clinic in Kalyani Nagar needs a full interior redesign.", { name: "Dr. Shah", area: "About 1,100 square feet.", timeline: "Next month.", budget: "20 to 24 lakh." }),
    outcome: { contactedAfterMin: 26, consult: "COMPLETED", lost: "Landlord did not approve changes" }, ack: true },
  { at: "2026-09-12 11:35", p: P("s11", "Hi, we're moving into a 2 BHK in Balewadi and need everything done — kitchen, wardrobes, false ceiling.", { name: "Ishaan G.", area: "Around 1,000 square feet.", timeline: "Two months.", budget: "14 to 16 lakh." }),
    outcome: { contactedAfterMin: 18, consult: "COMPLETED", won: 1520000 }, ack: true },
  { at: "2026-09-15 20:20", p: P("s12", "Hello, I want full interiors for my 4 BHK penthouse in Koregaon Park.", { name: "Rhea D.", area: "About 2,800 square feet.", timeline: "Within 3 months.", budget: "60 lakh, could go higher." }),
    outcome: { contactedAfterMin: 620, consult: "COMPLETED" }, ack: true },
  // ——— qualified, recent: outcomes pending ———
  { at: "2026-09-22 13:00", p: P("s13", "Hi, I'm Tanvi. Looking for home interiors for a 2 BHK in Hadapsar.", { area: "950 sq ft.", timeline: "Next month.", budget: "12 lakh." }), outcome: { contactedAfterMin: 47, consult: "SCHEDULED" }, ack: true },
  { at: "2026-09-25 18:50", p: P("s14", "Hello, we want to do the interiors of our office in Shivajinagar.", { name: "Sameer A.", area: "Around 1,200 square feet.", timeline: "In a month.", budget: "25 lakh." }), outcome: { contactedAfterMin: 35 }, ack: true },
  { at: "2026-09-29 07:30", p: P("s15", "Hi, sorry it's early. We need full interiors for a 3 BHK in Magarpatta.", { name: "Neha B.", area: "1,300 square feet.", timeline: "Possession next month.", budget: "18 to 20 lakh." }, [{ after: "budget", text: "Can you give me a final quote on the phone?" }]), outcome: { contactedAfterMin: 190 }, ack: true },
  { at: "2026-10-03 21:15", p: P("s16", "Hello, I want full home interiors for a 2 BHK in Baner.", { name: "Arjun V.", area: "About 1,000 square feet.", timeline: "Within two months.", budget: "15 lakh." }), ack: true },
  { at: "2026-10-06 12:45", p: P("s17", "Hi, this is Lata. We need our 3 BHK in Kothrud done fully.", { area: "1,350 square feet.", timeline: "Immediately.", budget: "20 lakh." }) },

  // ——— not qualified ———
  { at: "2026-08-28 13:25", p: P("s18", "Hi, I want my flat painted. Just a painting job.", { name: "Mahesh", location: "Kothrud." }, undefined, "Oh, okay. Thanks anyway.") },
  { at: "2026-08-31 23:10", p: P("s19", "Hello, we're opening a restaurant in Camp and need the interiors done.", {}, undefined, "Alright, thank you.") },
  { at: "2026-09-03 17:00", p: P("s20", "Hi, do you design gardens? I want landscape design for my terrace garden.", {}, undefined, "No problem, thanks.") },
  { at: "2026-09-05 11:50", p: P("s21", "Hello, I'm planning interiors for a 2 BHK in Wakad.", { name: "Sunil", area: "850 square feet.", timeline: "Maybe in a year, the building is under construction.", budget: "10 lakh." })},
  { at: "2026-09-08 20:35", p: P("s22", "Hi, I need full interiors for a 1 BHK in Wagholi.", { name: "Priyanka", area: "450 sq ft.", timeline: "Next month.", budget: "3 lakh." }, [{ after: "budget", text: "How much will it cost?" }]) },
  { at: "2026-09-10 14:15", p: P("s23", "Hello, I have a 3 BHK in Nashik and want full interiors.", { name: "Deepak", area: "1,400 square feet.", timeline: "In 2 months.", budget: "12 lakh." }) },
  { at: "2026-09-13 19:30", p: P("s24", "Hi, I want to buy a sofa — just a sofa for my living room.", {}, undefined, "Okay, thanks.") },
  { at: "2026-09-17 10:05", p: P("s25", "Hello, we need the full interiors for our 2 BHK in Undri.", { name: "Kavya", area: "1,000 square feet.", timeline: "Next month.", budget: "7 lakh." }) },
  { at: "2026-09-20 22:40", p: P("s26", "Hi, I want waterproofing done for my flat, there's a lot of seepage.", {}, undefined, "Okay. Bye.") },
  { at: "2026-09-26 16:55", p: P("s27", "Hello, I need a small office done in Kharadi.", { name: "Rahul", area: "500 square feet.", timeline: "Next month.", budget: "8 lakh." }) },
  { at: "2026-10-01 12:10", p: P("s28", "Hi, we have a 2 BHK in Ravet, we're thinking about interiors.", { name: "Swati", area: "800 sq ft.", timeline: "Next year, around August.", budget: "9 lakh." }) },
  { at: "2026-10-05 09:20", p: P("s29", "Hello, I need an architect to design and build a house on my plot in Sus.", {}, undefined, "Ah okay, thank you.") },

  // ——— needs human review ———
  { at: "2026-09-07 21:05", p: P("s30", "Hi, I'm looking for interiors.", { project: "A flat, maybe the full thing.", name: "Nitin", location: "Near Pune somewhere, I'll confirm.", area: "Not sure.", timeline: "Depends.", budget: "No idea, you tell me." }),
    override: { to: "NOT_QUALIFIED", reason: "Called back twice, no answer. Not designer time.", user: "Front desk (Asha)" } },
  { at: "2026-09-11 18:25", p: P("s31", "Hello, I want full interiors for a 2 BHK in Baner.", { name: "Kiran", area: "Around 2,600 square feet.", timeline: "Next month.", budget: "Maybe 12 lakh. Actually no, more like 25 lakh." }),
    override: { to: "QUALIFIED", reason: "Called back: it's a 2 BHK + terrace duplex, ~2,400 sq ft, budget 25 L confirmed.", user: "Nikhil" }, outcome: { contactedAfterMin: 180, consult: "COMPLETED", won: 2620000 } },
  { at: "2026-09-14 13:40", p: P("s32", "Hi, I'm calling about interiors for my home and also I need some vastu consultation done.", { name: "Geeta", project: "Full home, 3 BHK. And the vastu check.", location: "Pashan.", area: "1,400 square feet.", timeline: "In 3 months.", budget: "20 lakh." }) },
  { at: "2026-09-18 20:10", p: P("s33", "Hello, I want to speak to a designer directly. It's a big project.", { project: "Full interiors of a bungalow.", name: "Mr. Oberoi", location: "Lonavala.", area: "About 4,500 square feet.", timeline: "Within 4 months.", budget: "Flexible, depends on the design." }),
    outcome: { contactedAfterMin: 55, consult: "SCHEDULED" } },
  { at: "2026-09-23 11:00", p: P("s34", "Hi, I need full interiors for a 3 BHK in Mumbai.", { name: "Alok", area: "1,200 square feet.", timeline: "Next month.", budget: "Not decided yet." }) },
  { at: "2026-09-27 22:30", p: P("s35", "Hello, I want to renovate my 2 BHK in Kothrud.", { name: "Varsha", area: "I think 1,000 square feet.", timeline: "Not sure, maybe after my daughter's exams.", budget: "Around 10 lakh." }) },
  { at: "2026-10-02 15:45", p: P("s36", "Hi, my firm is taking a 6,000 square foot office in Hinjewadi and we need the interiors.", { name: "Shalini", timeline: "In 2 months.", budget: "1.5 crore." }) },
  { at: "2026-10-04 10:30", p: P("s37", "Hi, I want my 3 BHK in Kharadi done but I'm not sure about the budget.", { name: "Manoj", area: "1,450 square feet.", timeline: "Next month.", budget: "Whatever it takes, but I don't want to overspend." }, [{ after: "area", text: "Can you just tell me the exact price for this?" }]) },
  { at: "2026-10-07 20:50", p: P("s38", "Hello, interiors for a 2 BHK in Pune.", { name: "Ayesha", location: "In Pune, near the airport.", area: "900 square feet.", timeline: "Next month.", budget: "11 lakh." }, [{ after: "timeline", text: "Do you do Airbnb rental furnishing?" }]) },

  // ——— failed / abandoned calls ———
  { at: "2026-09-19 19:58", p: P("s39", "", {}), failed: "FAILED" },
  { at: "2026-10-04 23:40", p: P("s40", "", {}), failed: "ABANDONED" },
];

/** The three demo scenarios required by the brief, plus extra variety for the simulator. */
export const SCENARIOS: Record<string, { title: string; expect: string; blurb: string; persona: () => Persona }> = {
  qualified: {
    title: "Scenario A — Qualified", expect: "QUALIFIED → Telegram handoff",
    blurb: "3 BHK in Baner, possession done, 1,350 sq ft, ₹22–28 L. Asks for a rough price mid-call.",
    persona: () => P("A", "Hi, we've just got possession of a 3 BHK in Baner and want to do the full interiors.", { name: "It's Priya Deshmukh.", location: "Baner, near Balewadi High Street.", area: "Around 1,350 square feet carpet.", timeline: "We have possession, so ideally next month.", budget: "We're thinking 22 to 28 lakh." }, [{ after: "area", text: "Roughly how much would something like that cost?" }]),
  },
  notQualified: {
    title: "Scenario B — Not qualified", expect: "NOT_QUALIFIED → polite close, no handoff",
    blurb: "Opening a café in Koregaon Park — hospitality is on the 'we do not provide' list.",
    persona: () => P("B", "Hello, I'm opening a café in Koregaon Park and need the whole interior and kitchen done.", {}, undefined, "Oh okay, no problem. Thanks."),
  },
  ambiguous: {
    title: "Scenario C — Ambiguous", expect: "NEEDS_HUMAN_REVIEW → review task",
    blurb: "'2 BHK' at 2,100 sq ft, unsure of timeline, budget changes mid-call from 10 L to 18 L.",
    persona: () => P("C", "Hi, I wanted to know about interiors for my 2 BHK flat. Maybe the full thing, maybe just the kitchen.", { name: "Rohan.", location: "Wakad.", area: "It's about 2,100 square feet I think.", timeline: "Not sure, depends on the loan.", budget: "Maybe 10 lakh. Actually no, more like 18 lakh." }),
  },
  office: {
    title: "Office fit-out", expect: "QUALIFIED",
    blurb: "1,600 sq ft office in Baner, start in 6 weeks, ₹35 L.",
    persona: () => P("D", "Hi, this is Karan from a small design agency. We've leased an office in Baner and need the interiors.", { area: "About 1,600 square feet.", timeline: "In 6 weeks.", budget: "Around 35 lakh." }, [{ after: "area", text: "Do you handle false ceiling and lighting too?" }]),
  },
  quote: {
    title: "Pushes for a final quote", expect: "Pricing escalation logged",
    blurb: "Wants an exact, guaranteed price on the phone. Agent gives an indicative range and escalates.",
    persona: () => P("E", "Hello, 2 BHK in Kothrud, full interiors. I just want the final price, can you tell me?", { name: "Sanjay.", area: "1,000 square feet.", timeline: "Next month.", budget: "15 lakh." }, [{ after: "area", text: "Give me the exact price, I need a guaranteed figure." }]),
  },
  late: {
    title: "Too early (timing)", expect: "NOT_QUALIFIED (timing)",
    blurb: "Under-construction flat, possession in about a year.",
    persona: () => P("F", "Hi, I've booked a 3 BHK in Wakad, it's under construction.", { name: "Meera.", area: "1,250 square feet.", timeline: "Possession is in about a year.", budget: "18 lakh." }),
  },
};
