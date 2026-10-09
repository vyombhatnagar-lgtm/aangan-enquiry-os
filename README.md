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
| `/` | Executive view: the verdict, revenue ledger, conversion, funnel, leading vs lagging, health, cost |
| `/simulate` | **Simulate incoming call**: six scripted scenarios, or *be the caller* by voice or typing |
| `/leads`, `/leads/:id` | Enquiries with filters; full lead record with outcome actions, override, Telegram copy, transcript, audit |
| `/calls` | Every call and its transcript |
| `/analytics` | Funnel, conversion, revenue, baseline vs current, ROI (gross vs incremental), experiment, baseline editor |
| `/costs` | Cost breakdown, rate card, per-call costs |
| `/agent` | Vaani voice-agent setup: greeting, prompt, data points, webhook |
| `/knowledge` | The three knowledge sources and what the engine evaluates |
| `/failures` | Warnings, failure counts, human-review queue, missed handoffs, event feed |
| `/system` | Journey before/after, architecture, components map, guardrails, demo reset |

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
6. Optional: `TELEPHONY_WEBHOOK_SECRET` (checked on `/api/calls/inbound`) and `ALLOW_RESET=0` to disable demo reset.

Local development: `cp .env.example .env.local`, set `DATABASE_URL`, run `npm i && npm run dev`. Run `npm run test:engine` to put the three core scenarios through the engine.

## Vaani AI (the live phone line)

Vaani holds the call; this app decides. Open `/agent` for everything to paste into Vaani, all generated from `knowledge/*.md`: the greeting, the agent instructions, the data-collection points and the webhook URL.

1. Set `VAANI_WEBHOOK_SECRET` (any long random string) in Vercel.
2. In Vaani: **Settings → Webhooks** → `https://<app>/api/vaani/webhook/<VAANI_WEBHOOK_SECRET>`. Vaani doesn't document request signing, so the secret sits in the URL.
3. On `call_postprocessing` the app parses the transcript and re-extracts every field with its own rules. Vaani's collected data only fills gaps. The app then qualifies against `qualified.md`, flags any rupee figure the agent said that isn't in `pricing.md` (a **pricing guardrail breach** on `/failures`), and sends the handoff or creates a review task. A caller who hangs up before speaking becomes a call-back task. Retries are deduplicated by Vaani `call_id`.

## Other telephony providers

This prototype has no Indian phone number of its own. To take real calls, a provider with an Indian DID (Exotel, Plivo, Twilio India over SIP, or Vapi with a SIP-trunked +91 number) can either:

- post the finished transcript to `/api/calls/inbound` (`{ phone, startedAt, transcript: [{ role, text, secondsFromStart }] }`), or
- stream each caller turn to `/api/calls/live` (`start` → `turn` → `end`) and speak the returned replies.

Pune callers will mix Hindi, Marathi and English. Choose STT/TTS that handles code-switching before going live.

## Honest limits

- **ROI is not causal yet.** The baseline is a demo assumption and the comparison is before/after. `/analytics#experiment` explains how to run an alternate-day randomised test and how big the sample needs to be.
- Revenue arrives weeks after a call. Judge conversion on the matured cohort (enquiries at least 21 days old), not on last week.
- The rate card in `lib/costs.ts` is a placeholder. Replace it with invoiced rates.
- WhatsApp and web forms are deliberately not built. They would be extra adapters feeding the same pipeline.
