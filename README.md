# Streak —  habit tracker-75 days

A small, no-backend habit tracker built around one morning ritual: open it,
see what's due today, tick it off. Built for a 75-day challenge, but works
for any habit on any schedule.

## What's in this project

- **Today view** — grouped by schedule (Every day / Weekdays / Custom days),
  with current + best streak on every habit.
- **A morning reminder ("the twist")** — a banner that lists exactly which
  due habits you haven't logged yet, and clears itself once you finish (or
  you can dismiss it for the day).
- **A personalized greeting** — asks your name once, then opens with
  "Good morning/afternoon/evening, {name} ✨" from then on.
- **A motivational line for every day of the week**, rotating automatically.
- **A happy emoji burst** on the check button the moment you complete a
  habit, plus a milestone toast at 7/14/21/30/50/75/100/150/200/365 days.
- **All habits view** — search, edit, archive (with an **Undo** toast),
  and a separate "Show archived" section. Deleting is a distinct, confirmed
  action.
- **Stats view** — total check-ins, longest streak ever, 30-day completion
  rate, and a per-habit mini heatmap with a full navigable month calendar.
- **Export / Import** — download all data as a JSON backup, or restore
  from one (with a confirmation before it overwrites anything).
- **Dark ("Galaxy") / Light ("Daylight") theme toggle**, remembered across
  visits.

## Data model

Each habit is stored as:

```json
{
  "id": "abc123",
  "name": "Drink water",
  "schedule": { "type": "daily" },
  "createdAt": "2026-09-01",
  "archived": false,
  "logs": { "2026-09-16": true },
  "lastStreakSeen": 4
}
```

`schedule.type` is one of `"daily"`, `"weekdays"`, or `"custom"` (with a
`days` array of 0–6, Sunday–Saturday). Streaks are never stored — they're
recalculated from `logs` on every render, so they can never drift out of
sync with the actual history.

Everything lives in the browser's `localStorage`:

| Key                      | Holds                                   |
|---------------------------|------------------------------------------|
| `streak.habits.v1`         | the array of habits                     |
| `streak.meta.v1`           | last-opened date, reminder dismiss date |
| `streak.theme.v1`          | `"dark"` or `"light"`                   |
| `streak.username.v1`       | the name you gave it                    |

There's no server and no account — data is tied to one browser on one
device. The hosted version and a locally-run copy each keep their **own**
separate `localStorage`, so they will not show the same data.

## Running it

No build step, no dependencies.

**Option A — just open the file**
Double-click `index.html`. It runs entirely client-side.

**Option B — VS Code / Codespaces Live Server**
1. Install the "Live Server" extension (Ritwick Dey).
2. Right-click `index.html` → "Open with Live Server".

**Option C — plain Python server**
```bash
python3 -m http.server 8000
```
Then open `http://localhost:8000`.

In GitHub Codespaces, either B or C works — Codespaces will auto-forward
the port and give you a clickable preview link.

## Debugging

**"Open with Live Server" doesn't appear in the right-click menu**
The extension either isn't installed or hasn't finished installing.
Open the Extensions panel, search "Live Server" by Ritwick Dey, and
confirm it shows "Uninstall" (meaning it's already installed) rather
than "Install". Right-click the file name in the Explorer sidebar
specifically — right-clicking inside the open editor pane shows a
different menu without this option.

**No preview link or port popup appears**
Check the "Ports" tab in the bottom panel. If port 5500 isn't listed or
its visibility is set to something restrictive, right-click it and set
visibility to Public, then click the globe icon to open it. As a
fallback that doesn't depend on any extension, run:
```bash
python3 -m http.server 8000
```
and open the forwarded port when the notification appears.

**A modal/popup won't close, or the page looks "stuck"**
`.modal-backdrop` uses `display: flex`, which overrides the browser's
default handling of the `hidden` attribute — so toggling `hidden` in
JavaScript alone has no visible effect. Fixed with a single global rule
near the top of the stylesheet:
```css
[hidden] {
  display: none !important;
}
```
If you see similar "won't hide" behavior on any element you add later,
check whether it has its own `display` value fighting with `hidden`.

**Export button doesn't download anything**
The export flow first tries a native "save file" prompt that only
exists inside the Claude artifact viewer (`window.claude.use("downloads")`).
Outside that environment — i.e. running `index.html` locally — it
automatically falls back to a normal `<a download>` Blob URL, so it
should still work in any regular browser. If it silently does nothing,
check the browser console for a blocked pop-up or download permission.

**Data seems to have disappeared**
Habit data lives in that specific browser's `localStorage`. Opening the
app in a different browser, a private/incognito window, after clearing
site data, or on the hosted artifact link instead of your local copy,
will show a fresh seeded state — this is expected, there's no backend.

**Streak numbers look wrong**
Open DevTools (F12) → Console and run:
```js
JSON.parse(localStorage.getItem("streak.habits.v1"))
```
to inspect the raw records, especially `schedule` and `logs`, and check
that against what `computeCurrentStreak` / `computeBestStreak` in
`app.js` would compute — the logic is intentionally pure (no hidden
state) so it can be reasoned about directly from stored `logs`.

**The name prompt / theme keeps resetting**
Both are stored under `streak.username.v1` and `streak.theme.v1`. If a
browser extension or privacy mode is clearing `localStorage` between
sessions, those settings (and all habit data) will reset too.

## File structure

```
habit-tracker/
├── index.html      # markup for Today / All habits / Stats views + modals
├── style.css        # design tokens (galaxy + daylight themes) + layout
├── app.js            # data model, streak math, rendering, events
├── README.md
├── REASONING.md      # write-up of the design/implementation approach
└── AI_LOGS.md        # full conversation log with the AI assistant
```

## Possible next steps

- Multi-device sync via a real backend
- Push/local notifications for the morning reminder
- Weekly/monthly review email or summary
- Habit categories or tags