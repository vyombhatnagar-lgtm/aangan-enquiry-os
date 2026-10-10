# Aangan Studio — Enquiry OS

An AI-assisted inbound **phone** enquiry qualification system for Aangan Studio, an interior design studio in Pune. **Vaani AI** answers the phone; a Next.js app (on Vercel, with **Neon** Postgres and Vercel AI Gateway) makes the decisions, hands off on **Telegram** with a **Calendly** booking link, and runs the dashboard.

The system is judged by **enquiry → project conversion and revenue**, not by how many calls the AI answered. The dashboard's first question is *"Is this system generating more business?"* and it answers *"can't tell yet"* whenever the evidence doesn't support a yes.

> **Prototype · demo data.** `knowledge/*.md`, the 40 sample enquiries and the baseline are invented. They are not Aangan's real services, rates, criteria or call transcripts.

## What it does

1. Answers an inbound call (simulator, your browser mic, or a telephony webhook).
2. Talks to the caller and asks only for the information that is still missing, never the same question twice.
3. Extracts: name, project, property, location, area, budget, timeline, requirements.
4. Answers permitted questions from `services.md`, and never claims a service that isn't listed there.
5. Gives **indicative** pricing ranges from `pricing.md`, always with the "varies by site" caveat. It never quotes a final price.
6. Qualifies **only** against the rules in `qualified.md`: QUALIFIED / NOT_QUALIFIED / NEEDS_HUMAN_REVIEW.
7. Sends qualified leads to a designer on Telegram, with a prefilled **Calendly** link to book the free consultation. Calendly webhooks then update the lead's consultation stage. The full record stays in Postgres.
8. Tracks the funnel, costs, outcomes, ROI, failures, overrides and a full audit trail.

## Pages

| Route | What |
|---|---|
| `/` | Overview: the verdict, revenue, conversion, pipeline, response and outcomes |
| `/leads`, `/leads/:id` | Enquiries; full record with outcome actions, decision change, transcript, activity |
| `/failures` | Needs attention: review queue, missed handoffs, warnings |
| `/intelligence` | Insights: who to call first, objections, follow-ups |
| `/calls` | Every call and its transcript |
| `/analytics` | Performance: before vs now, ROI, baseline editor, remove demo data |
| `/costs` | Cost breakdown and per-call costs |
| `/simulate` | Test call: sample callers, or play the caller yourself (saved as demo) |

The agent prompt, rules and architecture are deliberately not shown in the web UI. Use `npm run vaani:setup` to print the Vaani configuration.

## Architecture

```
PHONE / SIMULATOR / BROWSER MIC
        ↓
CALL INGESTION ............ /api/simulate · /api/calls/live · /api/calls/inbound
        ↓
CONVERSATION ENGINE ....... lib/engine/conversation.ts  (slot policy, FAQ, service questions)
        ↓
INFORMATION EXTRACTION .... lib/engine/extract.ts (rules) + lib/engine/llm.ts (AI Gateway fills gaps)
        ↓
KNOWLEDGE RETRIEVAL ....... lib/knowledge.ts  ← knowledge/services.md · pricing.md · qualified.md
        ↓
QUALIFICATION ENGINE ...... lib/engine/qualify.ts  (R1–R5 from qualified.md only)
        ↓
PRICING ENGINE ............ lib/engine/pricing.ts  (ranges + disclaimer + unapproved-₹ guard)
        ↓
DECISION ENGINE ........... confidence < threshold / contradiction / missing / high-value fail → human
        ↓
 ┌──────────────┬────────────────┬───────────────┐
 QUALIFIED      HUMAN REVIEW      NOT QUALIFIED
 ↓              ↓                 ↓
 TELEGRAM       REVIEW TASK       POLITE RESPONSE
 ↓
 DESIGNER → CONSULTATION → PROJECT (recorded by a person: lib/actions.ts)
        ↓
 ANALYTICS ................ lib/metrics.ts
```

Each knowledge file holds the human-readable rules **and** a machine-readable JSON block. The engine evaluates that block, so what Nikhil reads and what the code runs come from one file, versioned in Git.

## Components map

- **Trigger:** incoming phone call
- **Input:** caller conversation and caller number/time
- **Context:** services.md, pricing.md, qualified.md, conversation history, lead history
- **Processing:** transcription, extraction, missing-information detection, qualification, pricing retrieval, confidence assessment, summarisation
- **AI:** conversational agent, extraction (gap-filling), qualification explained against the rules, summarisation
- **Human:** ambiguous cases, final design and pricing, project acceptance, high-value calls, every outcome, overrides
- **Output:** customer response, indicative pricing, qualification result, designer handoff, dashboard, cost and ROI

## Deploy (Vercel + Neon)

1. Push this repo to GitHub, then in Vercel: **Add New → Project → import** (framework: Next.js).
2. **Storage → Create → Neon** and connect it to the project. That sets `DATABASE_URL`. On first load the app creates the schema and seeds the demo data.
3. **AI Gateway:** works automatically on Vercel through OIDC. Without it the agent still runs on the rules engine. Optional: `AGENT_MODEL`, `EXTRACT_MODEL`.
4. **Telegram (optional):** create a bot with @BotFather and set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. For the ✅/📞 buttons, also set `TELEGRAM_WEBHOOK_SECRET` and call  
   `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<app>/api/telegram/webhook/<SECRET>`
5. **Calendly (consultation booking):** set `CALENDLY_EVENT_URL` to the free-consultation event link. Every qualified lead then gets a prefilled link (name, phone, `utm_campaign=<lead id>`) in the Telegram handoff and on the lead page. To sync bookings automatically (needs Calendly Standard or above), create a webhook subscription with a Calendly personal access token:
   ```
   curl -X POST https://api.calendly.com/webhook_subscriptions \
     -H "Authorization: Bearer <CALENDLY_TOKEN>" -H "Content-Type: application/json" \
     -d '{"url":"https://<app>/api/calendly/webhook","events":["invitee.created","invitee.canceled","invitee_no_show.created","invitee_no_show.deleted"],"organization":"<org uri>","scope":"organization","signing_key":"<random secret>"}'
   ```
   Then set the same secret as `CALENDLY_WEBHOOK_SIGNING_KEY`. Bookings move the lead to *Consultation*; cancellations and no-shows move it back and show up on `/failures`. A booking that can't be matched to a lead (no utm, unknown phone) raises a warning instead of being dropped.
6. `TELEPHONY_WEBHOOK_SECRET` is required in production for `/api/calls/inbound` (requests are refused without it).

Local development: `cp .env.example .env.local`, set `DATABASE_URL`, run `npm i && npm run dev`. Run `npm run test:engine` to put the three core scenarios through the engine.

## Vaani AI (the live phone line)

Vaani holds the call; this app decides. Run `DATABASE_URL=<neon url> APP_URL=https://<app> npm run vaani:setup` to print everything to paste into Vaani, generated from `knowledge/*.md`: the greeting, the agent instructions, the data-collection points and the webhook URL.

1. Set `VAANI_WEBHOOK_SECRET` (any long random string) in Vercel.
2. In Vaani: **Settings → Webhooks** → `https://<app>/api/vaani/webhook/<VAANI_WEBHOOK_SECRET>`. Vaani doesn't document request signing, so the secret sits in the URL.
3. On `call_postprocessing` the app parses the transcript and re-extracts every field with its own rules. Vaani's collected data only fills gaps. The app then qualifies against `qualified.md`, flags any rupee figure the agent said that isn't in `pricing.md` (a **pricing guardrail breach** on `/failures`), and sends the handoff or creates a review task. A caller who hangs up before speaking becomes a call-back task. Retries are deduplicated by Vaani `call_id`.

## Other telephony providers

This prototype has no Indian phone number of its own. To take real calls, a provider with an Indian DID (Exotel, Plivo, Twilio India over SIP, or Vapi with a SIP-trunked +91 number) can either:

- post the finished transcript to `/api/calls/inbound` (`{ phone, startedAt, transcript: [{ role, text, secondsFromStart }] }`), or
- stream each caller turn to `/api/calls/live` (`start` → `turn` → `end`) and speak the returned replies.

Pune callers will mix Hindi, Marathi and English. Choose STT/TTS that handles code-switching before going live.

## Call my phone (test calls without a number)

Test call → **Call my phone** makes the Vaani agent ring your mobile (Vaani's own default number — no number purchase needed). Talk as the customer; when you hang up, Vaani posts the transcript to the webhook and the enquiry appears with its decision. Test calls are saved as demo enquiries.

Needs `VAANI_API_KEY` (Vaani → Developers → API Keys) in Vercel. Optional: `VAANI_AGENT_ID` (defaults to the Aangan agent), `OUTBOUND_DAILY_LIMIT` (default 20).

## Go-live checklist

1. **`DASHBOARD_PASSWORD`** — set it. Without it anyone with the URL sees customer names and phone numbers. Browser asks for a password (any username). Webhooks stay reachable.
2. **Phone number** — buy/attach a +91 number in Vaani and point the webhook at the URL from `npm run vaani:setup`. Until then no real calls arrive.
3. **AI Gateway** — add a card in Vercel → AI Gateway. Without it, extraction, summaries and call notes fall back to rules (works, less accurate).
4. **Telegram** — `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`, then `setWebhook` (step 4 above).
5. **Calendly** — `CALENDLY_EVENT_URL`; for auto-sync, `CALENDLY_WEBHOOK_SIGNING_KEY` + webhook subscription (paid plan).
6. **Real "before" numbers** — enter last quarter on Performance → Your numbers from before.
7. **Remove demo data** — Performance → *Remove demo data*. Real enquiries are never deleted by this or by reset; once real enquiries exist, all numbers are computed from real data only.
8. **`ALLOW_RESET=0`** — after going live, disables the reset endpoint entirely.
9. **Repo visibility** — the repo contains the agent prompt and pricing. Make it private.
10. **Rate card** — replace the sample rates in `lib/costs.ts` with invoiced figures.

## Honest limits

- **ROI is not causal yet.** The baseline is a demo assumption and the comparison is before/after. `/analytics#experiment` explains how to run an alternate-day randomised test and how big the sample needs to be.
- Revenue arrives weeks after a call. Judge conversion on the matured cohort (enquiries at least 21 days old), not on last week.
- The rate card in `lib/costs.ts` is a placeholder. Replace it with invoiced rates.
- WhatsApp and web forms are deliberately not built. They would be extra adapters feeding the same pipeline.
