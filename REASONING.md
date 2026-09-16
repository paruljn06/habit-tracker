# Reasoning — Streak, a galaxy-themed habit tracker

## Starting point

The brief came with an existing, working project: `index.html`,
`style.css`, `app.js`, `README.md`, and a `devcontainer.json` set up for
Live Server. Before changing anything, I read all of it — especially
`app.js` — to understand what was already solid:

- A pure, stateless streak calculation (`computeCurrentStreak` /
  `computeBestStreak`) that recomputes from `logs` on every render, so a
  streak number can never drift out of sync with the actual history it's
  derived from.
- Schedule-aware "due" logic (`isDue`) so a weekdays-only habit isn't
  punished for Saturday, and a habit due today but not yet checked off
  isn't treated as broken until the day actually passes.
- Archive-not-delete as the default "I've given up on this" action, with
  a separate, confirmed "Delete forever."
- A documented CSS gotcha (`[hidden]` needing `display: none !important`
  to beat a competing `display: flex` rule on the modal) that had already
  cost someone real debugging time — worth preserving and not
  reintroducing.

Given that, my approach was **additive, not a rewrite**: keep the data
model, the streak math, and the existing UX decisions exactly as they
were, and layer the new requirements on top.

## The brief's two hard requirements

1. **The twist** — remind the user each morning of habits still not
   logged. The existing code already had a once-per-day "a streak just
   broke" toast, but nothing that surfaced *remaining* habits. A one-time
   toast felt wrong for this: the point is to keep nudging gently while
   something is still outstanding, not just announce it once and vanish.
   I implemented it as a **banner**, recomputed on every render, that
   lists the remaining due-but-unlogged habits by name and disappears
   automatically the moment they're all done — with a dismiss option so
   it doesn't nag for the rest of the day if the person has already seen
   it.

2. **Galaxy / navy / white-star visual theme.** This was a hard
   constraint from the brief, so it overrides any "default" aesthetic
   choice — no generic warm-cream-and-terracotta template here. I kept
   the existing typography (Fraunces + IBM Plex Sans) since the brief
   didn't ask to change it and it already reads as distinctive, and
   spent the visual budget on: a layered starfield (CSS-animated
   twinkling stars + two soft nebula blobs), a navy/void background, and
   three consistent accent colors used for *meaning* rather than
   decoration — gold (`--nova`) for current streaks, mint (`--aurora`)
   for completion, violet (`--nebula`) for best streaks.

## The five requested features

I treated each as its own small, testable unit rather than one big
change, so a bug in one wouldn't be able to hide inside another:

- **Export / Import JSON** — the tricky part wasn't the JSON, it was
  where this app would actually run. If published as a Claude Artifact,
  a plain `<a download>` link is inert inside that sandbox; the platform
  instead exposes a `downloads` capability. So export tries that
  capability first and falls back to a normal Blob/anchor download if
  it's unavailable (i.e. running locally) — one code path that works in
  both places. Import validates the shape of the incoming JSON before
  touching anything, and always asks for confirmation before it
  overwrites existing data, since that's a destructive action.
- **Stats view** — three numbers (total check-ins, longest streak ever,
  30-day completion rate) plus a per-habit summary. I chose a *trailing
  30-day* completion rate rather than lifetime, since lifetime rate on a
  months-old habit becomes a nearly meaningless flat number, while a
  rolling window stays informative.
- **Dark/light toggle** — since the brand theme itself is dark (the
  galaxy), "dark mode" doesn't mean the usual "add a dark variant" — it
  means the *light* variant needed to be designed as the deliberate
  alternative. I called it "Daylight" internally: same layout and same
  three accent colors, but a light background instead of stars. When the
  first light palette came out looking pale blue, I re-neutralized it to
  white/gray tokens per the follow-up feedback rather than trying to keep
  any of the "sky" metaphor on the light side.
- **Calendar / heatmap per habit** — implemented at two zoom levels: a
  compact 12-week GitHub-style heatmap inline in Stats for a fast glance,
  and a full month calendar (with prev/next navigation, capped at the
  current month) in a modal for a habit the person wants to actually
  inspect. Both reuse the same `isDue` / `logs` data, so there's no
  second source of truth for what counts as "done."
- **Undo after archiving** — rather than adding a new confirmation step
  (which slows down the "get this off my list" action the brief
  specifically said should be quick), I let the archive happen
  immediately and surfaced a toast with an "Undo" action for a few
  seconds afterward. This keeps the fast path fast while still giving a
  safety net.

## Later refinements

Two follow-up rounds added: a rotating motivational line per weekday, a
small animated emoji burst on the check button the instant a habit is
completed (kept separate from the existing milestone toast, so routine
check-ins get a light acknowledgment without every single tick spamming
a full toast), and a first-run "what should we call you" prompt that
turns the header into a personalized time-of-day greeting. All three
are deliberately optional/skippable and stored locally, consistent with
the project's no-account, no-backend design.

## Delivery format

The working app is one self-contained HTML file (CSS and JS inlined) so
it can be published as a live, shareable Claude Artifact with zero setup
— and the same file is mechanically split back into `index.html` /
`style.css` / `app.js` so it drops into the original repo structure and
Live Server / Codespaces workflow without any changes to how the person
already runs it.
