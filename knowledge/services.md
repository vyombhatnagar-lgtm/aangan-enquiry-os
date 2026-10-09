# Aangan Studio — Services

> **DEMO DATA.** This file is a mock written for the prototype. Replace it with Aangan's real service list before going live. The voice agent may only claim services listed under "We provide".

## We provide

- **Full home interiors** — apartments, villas, row houses, bungalows. Design + execution (turnkey).
- **Small office interiors** — offices, studios and clinics up to 5,000 sq ft carpet area.
- **Modular kitchens and wardrobes** — as part of a home project, or as a standalone kitchen project.
- **Interior renovation** — non-structural redesign of existing homes and offices.
- **Design-only consultation** — drawings, 3D visuals and material specification; client executes with their own contractor.
- **False ceiling, lighting and electrical layout** — as part of an interior project.
- **Furniture, soft furnishing and décor styling** — as part of an interior project.
- **3D visualisation** — as part of an interior project.

## We do not provide

- Architecture, structural design or building construction
- Standalone civil work (demolition, plumbing re-routing, waterproofing only)
- Painting-only jobs
- Large commercial projects above 5,000 sq ft
- Restaurants, cafés, hotels and other hospitality fit-outs
- Retail showrooms and malls
- Landscape and garden design
- Single-item furniture purchase (we are not a furniture store)
- Standalone vastu consultation
- Property brokerage or rental furnishing

## Permitted answers (the agent may say these)

- **Studio location:** Baner, Pune (demo address). Visits by appointment.
- **Front desk hours:** 10 AM – 7 PM, Monday to Saturday. The phone line is answered at all hours by the assistant.
- **First consultation:** free, 45 minutes, at the studio or by video call.
- **Site visit:** ₹2,500, adjusted against design fees if the project goes ahead.
- **Process:** consultation → site visit and measurement → concept and 3D → detailed quotation → execution.
- **Typical execution time:** 10–16 weeks for a full home, depending on scope.

## Machine-readable index

The engine reads this block. Keep it in sync with the lists above. Entries marked `"propertyLevel": true` describe the *property itself* (a restaurant, a showroom): if one matches, every service requested for that property is out of scope, even a kitchen.

```json
{
  "provided": [
    { "id": "full_home", "label": "Full home interiors", "keywords": ["full home", "whole house", "complete interior", "entire flat", "full flat", "home interior", "house interior", "interiors for my", "interior for my", "turnkey", "villa", "bungalow", "row house", "new flat", "new apartment"] },
    { "id": "office", "label": "Small office interiors (≤5,000 sq ft)", "maxSqft": 5000, "keywords": ["office", "workspace", "studio space", "clinic", "co-working"] },
    { "id": "kitchen_wardrobe", "label": "Modular kitchens and wardrobes", "keywords": ["modular kitchen", "kitchen", "wardrobe", "cupboard"] },
    { "id": "renovation", "label": "Interior renovation", "keywords": ["renovat", "redo", "revamp", "makeover", "redesign", "remodel"] },
    { "id": "design_only", "label": "Design-only consultation", "keywords": ["design only", "only design", "just the design", "drawings only", "own contractor", "consultation only"] },
    { "id": "ceiling_lighting", "label": "False ceiling, lighting and electrical layout", "keywords": ["false ceiling", "lighting", "ceiling"] },
    { "id": "styling", "label": "Furniture, soft furnishing and décor styling", "keywords": ["styling", "decor", "décor", "soft furnishing", "curtains"] },
    { "id": "visualisation", "label": "3D visualisation", "keywords": ["3d", "render", "visualis", "visualiz"] }
  ],
  "excluded": [
    { "id": "architecture", "propertyLevel": true, "label": "Architecture, structural design or construction", "keywords": ["architect", "structural", "construct a", "build a house", "building construction", "build my house", "new construction"] },
    { "id": "civil_only", "label": "Standalone civil work", "keywords": ["waterproofing", "plumbing only", "demolition only", "seepage"] },
    { "id": "painting_only", "label": "Painting-only jobs", "keywords": ["painting only", "only painting", "just painting", "paint my", "repaint", "painting job"] },
    { "id": "large_commercial", "propertyLevel": true, "label": "Commercial projects above 5,000 sq ft", "keywords": ["mall", "factory", "warehouse", "tech park"] },
    { "id": "hospitality", "propertyLevel": true, "label": "Restaurants, cafés, hotels", "keywords": ["restaurant", "cafe", "café", "hotel", "bar ", "resort", "banquet"] },
    { "id": "retail", "propertyLevel": true, "label": "Retail showrooms", "keywords": ["showroom", "retail store", "boutique", "shop interior"] },
    { "id": "landscape", "propertyLevel": true, "label": "Landscape and garden design", "keywords": ["landscape", "garden", "terrace garden", "lawn"] },
    { "id": "single_furniture", "label": "Single-item furniture purchase", "keywords": ["buy a sofa", "just a sofa", "only a sofa", "single sofa", "dining table only", "buy furniture", "one bed"] },
    { "id": "vastu", "label": "Standalone vastu consultation", "keywords": ["vastu consult", "only vastu", "vastu check"] },
    { "id": "brokerage", "label": "Brokerage or rental furnishing", "keywords": ["broker", "rent out", "airbnb", "rental furnish"] }
  ],
  "faq": [
    { "id": "location", "keywords": ["where are you", "address", "located", "location of the studio", "studio located"], "answer": "Our studio is in Baner, Pune. Visits are by appointment." },
    { "id": "hours", "keywords": ["timing", "hours", "open", "what time"], "answer": "The front desk works 10 AM to 7 PM, Monday to Saturday. This line is answered at all hours." },
    { "id": "consultation_fee", "keywords": ["consultation free", "consultation charge", "consultation fee", "first meeting"], "answer": "The first consultation is free — about 45 minutes, at the studio or on a video call." },
    { "id": "site_visit", "keywords": ["site visit", "visit my site", "come and see"], "answer": "A site visit is ₹2,500, and it's adjusted against the design fee if the project goes ahead." },
    { "id": "process", "keywords": ["process", "how does it work", "steps"], "answer": "It goes consultation, then a site visit and measurement, then concept and 3D, then a detailed quotation, then execution." },
    { "id": "duration", "keywords": ["how long", "how much time", "duration", "weeks"], "answer": "A full home usually takes 10 to 16 weeks to execute, depending on scope." }
  ]
}
```
