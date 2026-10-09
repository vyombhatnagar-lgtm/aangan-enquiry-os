# What's worth designer time — Nikhil's criteria

> **DEMO DATA.** Mock criteria written for the prototype. Nikhil should rewrite this file in his own words. The engine evaluates **only** the rules in the machine-readable block below and invents none of its own.

The point of this list is to protect designer time for enquiries that can become projects. It is not a list of who we're polite to — we're polite to everyone.

## The rules

1. **We must actually offer the service** (see services.md). If everything they asked for is on the "we do not provide" list, it's not for us. If it's a mix, send it to me.
2. **Pune area.** Pune city, PCMC and the usual suburbs. Outside Pune we only go if the budget is ₹20 lakh or more. Otherwise, not now.
3. **Size.** Homes: full home or at least 600 sq ft of work. Offices: at least 800 sq ft. A standalone kitchen is fine if the budget is at least ₹3.5 lakh.
4. **Budget should roughly fit the job.** If their budget is less than 70% of the bottom of our Essential range for that area, it isn't going to work. Full homes under ₹6 lakh don't work for us at all.
5. **Timing.** They should want to start within 6 months (or have possession within 6 months). Further out than that — polite, take details, not designer time today.

## When to send it to me instead

- Anything the rules above don't cover. Don't guess.
- They didn't tell us area, budget or timeline, or were vague about it.
- What they said doesn't add up (a 2BHK at 3,000 sq ft, budget changed mid-call, etc.).
- **Big ones:** budget ₹30 lakh+ or 2,500 sq ft+. If those look like a "no", I want to see them before anyone says no.

## Machine-readable rules

```json
{
  "requiredFields": ["projectScope", "location", "approximateArea", "budget", "timeline"],
  "confidenceThreshold": 0.7,
  "rules": [
    { "id": "R1", "name": "Service fit", "type": "service_fit", "onAllExcluded": "NOT_QUALIFIED", "onMixed": "NEEDS_HUMAN_REVIEW" },
    { "id": "R2", "name": "Pune area", "type": "location", "serviceArea": ["pune", "pcmc", "pimpri", "chinchwad", "baner", "balewadi", "aundh", "pashan", "bavdhan", "kothrud", "karve nagar", "warje", "wakad", "hinjewadi", "hinjawadi", "ravet", "punawale", "tathawade", "pimple saudagar", "pimple nilakh", "kharadi", "viman nagar", "wagholi", "hadapsar", "magarpatta", "amanora", "mundhwa", "koregaon park", "kalyani nagar", "camp", "shivajinagar", "deccan", "model colony", "sus", "mahalunge", "undri", "nibm", "kondhwa", "wanowrie", "katraj", "dhanori", "lohegaon", "vishrantwadi", "yerawada", "boat club", "erandwane", "prabhat road", "sinhagad road", "bibwewadi", "salunke vihar", "kalewadi", "akurdi", "nigdi", "moshi", "chakan", "talegaon"], "outsideMinBudget": 2000000, "onFail": "NOT_QUALIFIED" },
    { "id": "R3", "name": "Minimum size", "type": "min_size", "homeMinSqft": 600, "officeMinSqft": 800, "kitchenStandaloneMinBudget": 350000, "onFail": "NOT_QUALIFIED" },
    { "id": "R4", "name": "Budget fit", "type": "budget_fit", "minRatioOfEssentialLow": 0.7, "fullHomeAbsoluteMin": 600000, "onFail": "NOT_QUALIFIED" },
    { "id": "R5", "name": "Timing", "type": "timeline", "maxMonths": 6, "onFail": "NOT_QUALIFIED" }
  ],
  "highValue": { "minBudget": 3000000, "minSqft": 2500, "neverAutoReject": true },
  "contradictions": { "sqftPerBhk": { "1": [300, 900], "2": [550, 1500], "3": [850, 2300], "4": [1300, 3500], "5": [1800, 5000] } }
}
```
