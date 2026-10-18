# docs/org — Ethos Sustainability HQ documents

## What these are

Verbatim copies of the five HQ governance documents that describe how Ethos Sustainability
actually works: chapters, officers, the HQ relationship, finances, the reporting cycle,
and the brand.

They were written by HQ, not by anyone working on this repo. They are **the source of
truth for the organization model**, and they outrank this repo's own planning docs
wherever the two disagree. `docs/01_product_overview.md` through
`docs/12_security.md` were written earlier and drifted: they describe a project-centred
system, and the org is chapter-centred.

`docs/14_chapter_model_plan.md` is the plan for closing that gap. It was written against
these documents.

## Files

| File | Source doc | What it settles |
|---|---|---|
| `01_overview.md` | Ethos Sustainability Overview | Mission, the chapter model, centralized finances, what HQ approves |
| `02_officer_roles.md` | Officer Roles & Responsibilities | Every officer seat and what each one is responsible for |
| `03_chapter_lead_training_guide.md` | Chapter Lead Training Guide | Chapter Lead duties, communication systems, the proposal and report cycle, active-chapter expectations |
| `04_chapter_lead_training_meeting_1_2.md` | Chapter Lead Training, Combined Meeting 1 & 2 | The HQ-to-chapter hierarchy, the HQ vs chapter decision boundary, what a new chapter builds first |
| `05_brand_guidelines.md` | Brand Guidelines, Chapter Version | Logo rules, the colour palette with hex values, typography, tone, what needs HQ approval |

## Why they are in the repo

Anyone working on this codebase needs them, and they were previously only reachable
through the Claude project attached to one person's account. A contributor cloning the
repo could not read them. Neither could an agent working in the repo.

## What they do NOT cover

These are copies, so they are only as current as September 2026 and they are not
authoritative on anything they do not mention. Two known gaps, both recorded in
`docs/14_chapter_model_plan.md` under "Decisions taken":

1. **Monthly requirement.** `03_chapter_lead_training_guide.md` says "at least one event
   or activity each month" and never mentions a fundraiser. The Technical Director has
   set the requirement as one event **and** one fundraiser per month. HQ is updating the
   source doc. Build to one event and one fundraiser.
2. **Members with no chapter.** None of these docs describe what it means to belong to no
   chapter. The answer is that such a member is an HQ member and works on HQ teams:
   conference, podcast, newsletter, media, and so on. HQ is already modelled as a chapter
   via `chapters.is_hq`, so `users.chapter_id NOT NULL` is correct as written.

## Divergences between these docs and the code, as of 2026-10-18

Recorded here so nobody has to rediscover them.

**The colour palette matches exactly.** All eight hex values in
`05_brand_guidelines.md` §3 are present and identical in the `@theme` block of
`app/globals.css`: espresso `#413429`, peach `#FCBD9D`, cream `#FFFBF4`, warm-gray
`#A89E94`, sand `#D4CCC4`, peach-light `#FFE2D6`, brown-mid `#7D6F63`, brown-dark
`#514033`. Note that Tailwind v4 reads `@theme`, not `tailwind.config.ts`, which still
holds a stale duplicate of the palette and has no effect.

**The font does not match, and probably does not need to.** The app loads DM Sans
(`app/layout.tsx:3`, `next/font/google`). §4 recommends Georgia for headings and Times
New Roman or EB Garamond for body. But §4 opens with "Until a specific font system is
finalized", so it is explicitly provisional. Worth one question to HQ rather than a
change.

**`05_brand_guidelines.md` contradicts itself on body text.** §3.1 says Ethos Peach is
"used for body text and strong headings". §3.3 says use Espresso for body text and Peach
for highlights and accents. §3.3 is the one that makes sense, and it is what the app
does: peach on cream would fail contrast. Treat §3.3 as correct and flag §3.1 to HQ.

**§4 names two colours that §3 never defines:** "Ethos Green" and "Ethos Dark". There is
no green anywhere in the palette or in `@theme`. Read "Ethos Dark" as Espresso. Ask HQ
about the green before using one.

## If you change these files

Don't, except to replace a file wholesale with a newer HQ version. They are copies, and
editing a copy silently forks it from the document HQ maintains. Corrections belong
upstream with HQ, and findings belong in this index or in
`docs/14_chapter_model_plan.md`.
