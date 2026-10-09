# Aangan Studio — Indicative Pricing (INTERNAL)

> **DEMO DATA.** Mock figures for the prototype, not Aangan's real rates. Replace before going live.

**All figures are indicative only and vary by site.** They are not a quotation. The final price is confirmed only after a site visit and the detailed quotation, and only by the design team.

## Rules for the voice agent

1. Only quote ranges from this file. Never invent a figure.
2. Always give a **range**, never a single number.
3. If the carpet area is unknown, give the per-sq-ft range only. Do not estimate a total.
4. Every pricing answer must include: *"Final pricing varies by site and project requirements; the design team confirms it after understanding the project."*
5. If the caller asks for a final quote, an exact figure, a discount or a guarantee — say that only the design team can do that, and log a **pricing escalation**.
6. If the scope does not match any row below, do not guess. Log a pricing escalation.

## Full home interiors (turnkey, per sq ft of carpet area)

| Tier | Range | What it usually means |
|---|---|---|
| Essential | ₹1,400 – ₹1,900 | Laminate finishes, standard hardware, modular kitchen + wardrobes, basic false ceiling |
| Signature | ₹2,000 – ₹2,800 | Veneer/acrylic mix, soft-close hardware, feature walls, lighting design |
| Bespoke | ₹3,000 – ₹4,500 | Custom joinery, imported finishes, full lighting and automation design |

Excludes appliances, loose furniture and civil work.

## Small office interiors (per sq ft)

| Tier | Range |
|---|---|
| Standard | ₹1,600 – ₹2,200 |
| Premium | ₹2,300 – ₹3,200 |

## Standalone packages

| Item | Range |
|---|---|
| Modular kitchen (standalone) | ₹3,50,000 – ₹6,50,000 |
| Wardrobes | ₹1,800 – ₹2,600 per sq ft of shutter area |
| Renovation (per sq ft, non-structural) | ₹1,200 – ₹2,400 |
| Design-only consultation | ₹150 – ₹250 per sq ft |

## Machine-readable index

```json
{
  "disclaimer": "Final pricing varies by site and project requirements, so the design team would confirm it after understanding the project in more detail.",
  "perSqft": [
    { "id": "home_essential", "scope": "full_home", "tier": "Essential", "min": 1400, "max": 1900 },
    { "id": "home_signature", "scope": "full_home", "tier": "Signature", "min": 2000, "max": 2800 },
    { "id": "home_bespoke", "scope": "full_home", "tier": "Bespoke", "min": 3000, "max": 4500 },
    { "id": "office_standard", "scope": "office", "tier": "Standard", "min": 1600, "max": 2200 },
    { "id": "office_premium", "scope": "office", "tier": "Premium", "min": 2300, "max": 3200 },
    { "id": "renovation", "scope": "renovation", "tier": "Renovation", "min": 1200, "max": 2400 },
    { "id": "design_only", "scope": "design_only", "tier": "Design-only", "min": 150, "max": 250 }
  ],
  "packages": [
    { "id": "kitchen_standalone", "scope": "kitchen_wardrobe", "label": "Modular kitchen (standalone)", "min": 350000, "max": 650000 }
  ],
  "defaultTierForBroadRange": { "full_home": ["home_essential", "home_signature"], "office": ["office_standard", "office_premium"] },
  "roundTotalsTo": 50000
}
```
