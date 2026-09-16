/* =========================================================
   Streak — a small, honest habit tracker (galaxy edition)
   All data lives in localStorage under STORAGE_KEY.
   ========================================================= */

const STORAGE_KEY = "streak.habits.v1";
const META_KEY = "streak.meta.v1";
const THEME_KEY = "streak.theme.v1";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MILESTONES = [7, 14, 21, 30, 50, 75, 100, 150, 200, 365];

// Indexed by Date#getDay(): 0=Sun ... 6=Sat
const MOTIVATION_LINES = [
  "Sunday reset — one small habit, one big head start.",
  "Monday momentum — a fresh week is yours to shape.",
  "Tuesday traction — small steps still count as progress.",
  "Wednesday willpower — you're over the hump, keep going.",
  "Thursday drive — the streak is close, don't let it slip.",
  "Friday finish — end the week the way you started it.",
  "Saturday steady — showing up on weekends is what builds streaks.",
];

const HAPPY_EMOJIS = ["🎉", "✨", "💪", "🌟", "🔥", "👏", "😄"];

/* ---------------------------------------------------------
   Date helpers (local time, no timezone surprises)
   --------------------------------------------------------- */
function fmt(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function parseYMD(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function todayStr() { return fmt(new Date()); }
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function longDate(str) {
  const d = parseYMD(str);
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

/* ---------------------------------------------------------
   Persistence
   --------------------------------------------------------- */
function loadHabits() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { console.error("Could not read habits, starting fresh.", e); return []; }
}
function saveHabits(h) { localStorage.setItem(STORAGE_KEY, JSON.stringify(h)); }

function loadMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : { lastOpenedDate: todayStr(), reminderDismissedDate: null };
  } catch (e) { return { lastOpenedDate: todayStr(), reminderDismissedDate: null }; }
}
function saveMeta(m) { localStorage.setItem(META_KEY, JSON.stringify(m)); }

function loadTheme() {
  try { return localStorage.getItem(THEME_KEY) || "dark"; } catch (e) { return "dark"; }
}
function saveTheme(t) { try { localStorage.setItem(THEME_KEY, t); } catch (e) {} }

const USERNAME_KEY = "streak.username.v1";
function loadUserName() { try { return localStorage.getItem(USERNAME_KEY) || ""; } catch (e) { return ""; } }
function saveUserName(n) { try { localStorage.setItem(USERNAME_KEY, n); } catch (e) {} }
function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/* ---------------------------------------------------------
   Seed data — only used the very first time
   --------------------------------------------------------- */
function seedHabits() {
  const created = fmt(addDays(new Date(), -12));
  return [
    { id: uid(), name: "Drink water", schedule: { type: "daily" }, createdAt: created, archived: false, logs: {}, lastStreakSeen: 0 },
    { id: uid(), name: "Read", schedule: { type: "daily" }, createdAt: created, archived: false, logs: {}, lastStreakSeen: 0 },
    { id: uid(), name: "Work out", schedule: { type: "weekdays" }, createdAt: created, archived: false, logs: {}, lastStreakSeen: 0 },
    { id: uid(), name: "No sugar", schedule: { type: "daily" }, createdAt: created, archived: false, logs: {}, lastStreakSeen: 0 },
  ];
}
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

/* ---------------------------------------------------------
   Schedule logic
   --------------------------------------------------------- */
function isDue(habit, dateStr) {
  const day = parseYMD(dateStr).getDay();
  switch (habit.schedule.type) {
    case "daily": return true;
    case "weekdays": return day >= 1 && day <= 5;
    case "custom": return habit.schedule.days.includes(day);
    default: return true;
  }
}
function scheduleLabel(habit) {
  if (habit.schedule.type === "daily") return "Every day";
  if (habit.schedule.type === "weekdays") return "Weekdays";
  const days = [...habit.schedule.days].sort();
  if (days.length === 7) return "Every day";
  return days.map((d) => DAY_LABELS[d]).join(", ");
}
function groupLabel(habit) {
  if (habit.schedule.type === "daily") return "Every day";
  if (habit.schedule.type === "weekdays") return "Weekdays";
  return "Custom days";
}

/* ---------------------------------------------------------
   Streak math
   --------------------------------------------------------- */
function computeCurrentStreak(habit, today = todayStr()) {
  let count = 0;
  let cursor = parseYMD(today);
  const created = parseYMD(habit.createdAt);
  while (cursor >= created) {
    const dstr = fmt(cursor);
    if (isDue(habit, dstr)) {
      if (habit.logs[dstr]) count++;
      else if (dstr === today) { /* today isn't over yet */ }
      else break;
    }
    cursor = addDays(cursor, -1);
  }
  return count;
}
function computeBestStreak(habit, today = todayStr()) {
  let run = 0, best = 0;
  let cursor = parseYMD(habit.createdAt);
  const end = parseYMD(today);
  while (cursor <= end) {
    const dstr = fmt(cursor);
    if (isDue(habit, dstr)) {
      if (habit.logs[dstr]) { run++; if (run > best) best = run; }
      else run = 0;
    }
    cursor = addDays(cursor, 1);
  }
  return best;
}
function totalCompletions(habit) {
  return Object.keys(habit.logs).filter((k) => habit.logs[k]).length;
}

/* ---------------------------------------------------------
   App state
   --------------------------------------------------------- */
let habits = loadHabits();
let meta = loadMeta();
if (habits.length === 0 && !localStorage.getItem(STORAGE_KEY)) {
  habits = seedHabits();
  saveHabits(habits);
}

let currentView = "today";
let searchTerm = "";
let showArchived = false;
let editingHabitId = null;
let draftSchedule = { type: "daily" };
let lastArchivedId = null;
let calHabitId = null;
let calCursor = new Date(); // month being viewed in calendar modal
let userName = loadUserName();

/* ---------------------------------------------------------
   DOM refs
   --------------------------------------------------------- */
const $ = (sel) => document.querySelector(sel);
const dateLine = $("#dateLine");
const progressLine = $("#progressLine");
const todayGroups = $("#todayGroups");
const todayEmpty = $("#todayEmpty");
const manageActive = $("#manageActive");
const manageEmpty = $("#manageEmpty");
const searchTermEcho = $("#searchTermEcho");
const searchInput = $("#searchInput");
const archiveSection = $("#archiveSection");
const archiveToggleLabel = $("#archiveToggleLabel");
const archivedList = $("#archivedList");
const modalBackdrop = $("#modalBackdrop");
const modalTitle = $("#modalTitle");
const habitNameInput = $("#habitNameInput");
const scheduleOptions = $("#scheduleOptions");
const dayPicker = $("#dayPicker");
const modalError = $("#modalError");
const archiveHabitBtn = $("#archiveHabitBtn");
const deleteHabitBtn = $("#deleteHabitBtn");
const toast = $("#toast");
const toastMessage = $("#toastMessage");
const toastActionBtn = $("#toastActionBtn");
const reminderBanner = $("#reminderBanner");
const reminderList = $("#reminderList");
const statsSummary = $("#statsSummary");
const statsHabits = $("#statsHabits");
const statsEmpty = $("#statsEmpty");

/* ---------------------------------------------------------
   Starfield generation
   --------------------------------------------------------- */
function buildStarfield() {
  const field = $("#starField");
  const frag = document.createDocumentFragment();
  const count = window.innerWidth < 560 ? 70 : 120;
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.className = "star";
    const size = Math.random() < 0.15 ? (2 + Math.random() * 1.4) : (1 + Math.random());
    s.style.width = size + "px";
    s.style.height = size + "px";
    s.style.top = Math.random() * 100 + "%";
    s.style.left = Math.random() * 100 + "%";
    s.style.setProperty("--min-op", (0.1 + Math.random() * 0.2).toFixed(2));
    s.style.setProperty("--max-op", (0.6 + Math.random() * 0.4).toFixed(2));
    s.style.animationDuration = (2.5 + Math.random() * 4).toFixed(2) + "s";
    s.style.animationDelay = (Math.random() * 4).toFixed(2) + "s";
    frag.appendChild(s);
  }
  const blob1 = document.createElement("div");
  blob1.className = "nebula-blob";
  blob1.style.cssText = "width:340px;height:340px;top:-80px;left:-100px;background:radial-gradient(circle, rgba(199,156,255,0.35), transparent 70%);";
  const blob2 = document.createElement("div");
  blob2.className = "nebula-blob";
  blob2.style.cssText = "width:280px;height:280px;bottom:-60px;right:-80px;background:radial-gradient(circle, rgba(114,232,194,0.28), transparent 70%);";
  frag.appendChild(blob1);
  frag.appendChild(blob2);
  field.appendChild(frag);
}

/* ---------------------------------------------------------
   Theme
   --------------------------------------------------------- */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const icon = $("#themeIcon");
  if (theme === "light") {
    icon.innerHTML = '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2M12 19.5v2M4.5 12h-2M21.5 12h-2M6 6l-1.4-1.4M19.4 19.4L18 18M18 6l1.4-1.4M4.6 19.4L6 18"/>';
  } else {
    icon.innerHTML = '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>';
  }
}
$("#themeToggleBtn").addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
  applyTheme(next);
  saveTheme(next);
});

/* ---------------------------------------------------------
   Rendering: header + reminder banner
   --------------------------------------------------------- */
function renderHeader() {
  dateLine.textContent = longDate(todayStr());
  const greet = timeGreeting();
  $("#greetingLine").textContent = userName ? `${greet}, ${userName} ✨` : `${greet} ✨`;
  const dayOfWeek = new Date().getDay();
  $("#motivationLine").innerHTML = `<span class="spark">✨</span>${MOTIVATION_LINES[dayOfWeek]}`;

  const dueToday = habits.filter((h) => !h.archived && isDue(h, todayStr()));
  const doneToday = dueToday.filter((h) => h.logs[todayStr()]);
  const remaining = dueToday.filter((h) => !h.logs[todayStr()]);

  if (dueToday.length === 0) {
    progressLine.textContent = "A quiet day";
  } else if (doneToday.length === dueToday.length) {
    progressLine.textContent = `All ${dueToday.length} done`;
  } else {
    progressLine.textContent = `${doneToday.length} of ${dueToday.length} done`;
  }

  const today = todayStr();
  const dismissedToday = meta.reminderDismissedDate === today;
  if (remaining.length > 0 && !dismissedToday) {
    reminderBanner.hidden = false;
    reminderList.textContent = remaining.map((h) => h.name).join(" · ");
  } else {
    reminderBanner.hidden = true;
  }
}

$("#reminderDismissBtn").addEventListener("click", () => {
  meta.reminderDismissedDate = todayStr();
  saveMeta(meta);
  reminderBanner.hidden = true;
});

/* ---------------------------------------------------------
   Rendering: Today view
   --------------------------------------------------------- */
function renderToday() {
  const today = todayStr();
  const due = habits.filter((h) => !h.archived && isDue(h, today));

  todayGroups.innerHTML = "";
  todayEmpty.hidden = due.length > 0;

  const order = ["Every day", "Weekdays", "Custom days"];
  const groups = {};
  due.forEach((h) => { const g = groupLabel(h); (groups[g] = groups[g] || []).push(h); });

  order.forEach((groupName) => {
    const list = groups[groupName];
    if (!list || list.length === 0) return;
    const heading = document.createElement("p");
    heading.className = "group-label";
    heading.textContent = groupName;
    todayGroups.appendChild(heading);
    const container = document.createElement("div");
    container.className = "habit-list";
    list.forEach((h) => container.appendChild(renderTodayRow(h)));
    todayGroups.appendChild(container);
  });
}

function renderTodayRow(habit) {
  const today = todayStr();
  const checked = !!habit.logs[today];
  const current = computeCurrentStreak(habit);
  const best = computeBestStreak(habit);

  const row = document.createElement("div");
  row.className = "habit-row" + (checked ? " is-checked" : "");

  const btn = document.createElement("button");
  btn.className = "check-btn" + (checked ? " is-checked" : "");
  btn.type = "button";
  btn.dataset.habitId = habit.id;
  btn.setAttribute("aria-pressed", String(checked));
  btn.setAttribute("aria-label", `Mark ${habit.name} ${checked ? "not done" : "done"} for today`);
  btn.innerHTML = `<svg viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.2 11.5L13 4.5" stroke="#04241a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  btn.addEventListener("click", () => toggleHabit(habit.id));

  const main = document.createElement("div");
  main.className = "habit-main";
  const name = document.createElement("p");
  name.className = "habit-name";
  name.textContent = habit.name;
  main.appendChild(name);

  const streaks = document.createElement("div");
  streaks.className = "habit-streaks";
  streaks.innerHTML = `
    <span class="streak-current${current === 0 ? " is-zero" : ""}">${current}</span>
    <span class="streak-best">best ${best}</span>
  `;

  row.appendChild(btn);
  row.appendChild(main);
  row.appendChild(streaks);
  return row;
}

function toggleHabit(id) {
  const habit = habits.find((h) => h.id === id);
  if (!habit) return;
  const today = todayStr();
  const justCompleted = !habit.logs[today];
  if (habit.logs[today]) delete habit.logs[today];
  else habit.logs[today] = true;

  saveHabits(habits);
  render();

  if (justCompleted) {
    triggerEmojiBurst(id);
    const newStreak = computeCurrentStreak(habit);
    if (MILESTONES.includes(newStreak)) {
      showToast(`${newStreak}-day streak on "${habit.name}" 🎉`, true);
    }
  }
}

function triggerEmojiBurst(id) {
  const btn = document.querySelector(`.check-btn[data-habit-id="${id}"]`);
  if (!btn) return;
  btn.style.position = "relative";
  const span = document.createElement("span");
  span.className = "emoji-burst";
  span.textContent = HAPPY_EMOJIS[Math.floor(Math.random() * HAPPY_EMOJIS.length)];
  btn.appendChild(span);
  setTimeout(() => span.remove(), 900);
}

/* ---------------------------------------------------------
   Rendering: Manage view
   --------------------------------------------------------- */
function renderManage() {
  const term = searchTerm.trim().toLowerCase();
  const active = habits.filter((h) => !h.archived);
  const archived = habits.filter((h) => h.archived);
  const filtered = term ? active.filter((h) => h.name.toLowerCase().includes(term)) : active;

  manageActive.innerHTML = "";
  filtered.forEach((h) => manageActive.appendChild(renderManageRow(h)));

  manageEmpty.hidden = !(term && filtered.length === 0);
  searchTermEcho.textContent = searchTerm;

  archiveSection.hidden = archived.length === 0;
  archiveToggleLabel.textContent = `${showArchived ? "Hide" : "Show"} archived (${archived.length})`;
  archivedList.hidden = !showArchived;
  archivedList.innerHTML = "";
  archived.forEach((h) => archivedList.appendChild(renderArchivedRow(h)));
}

function renderManageRow(habit) {
  const row = document.createElement("div");
  row.className = "manage-row";
  row.tabIndex = 0;
  row.setAttribute("role", "button");

  const main = document.createElement("div");
  main.className = "habit-main";
  const name = document.createElement("p");
  name.className = "habit-name";
  name.textContent = habit.name;
  main.appendChild(name);

  const tag = document.createElement("span");
  tag.className = "habit-schedule-tag";
  tag.textContent = scheduleLabel(habit);

  row.appendChild(main);
  row.appendChild(tag);

  const open = () => openEditModal(habit.id);
  row.addEventListener("click", open);
  row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  return row;
}

function renderArchivedRow(habit) {
  const row = document.createElement("div");
  row.className = "archived-row";
  const name = document.createElement("p");
  name.className = "habit-name";
  name.textContent = habit.name;
  const restore = document.createElement("button");
  restore.className = "restore-link";
  restore.type = "button";
  restore.textContent = "Restore";
  restore.addEventListener("click", () => {
    habit.archived = false;
    saveHabits(habits);
    render();
  });
  row.appendChild(name);
  row.appendChild(restore);
  return row;
}

/* ---------------------------------------------------------
   Rendering: Stats view
   --------------------------------------------------------- */
function renderStats() {
  const all = habits;
  statsEmpty.hidden = all.length > 0;
  statsSummary.innerHTML = "";
  statsHabits.innerHTML = "";
  if (all.length === 0) return;

  const totalDone = all.reduce((sum, h) => sum + totalCompletions(h), 0);
  const longestEver = all.reduce((max, h) => Math.max(max, computeBestStreak(h)), 0);

  // completion rate over the trailing 30 days, active habits only
  const today = todayStr();
  let dueCount = 0, doneCount = 0;
  const windowStart = addDays(parseYMD(today), -29);
  habits.filter((h) => !h.archived).forEach((h) => {
    const start = parseYMD(h.createdAt) > windowStart ? parseYMD(h.createdAt) : windowStart;
    let cursor = start;
    const end = parseYMD(today);
    while (cursor <= end) {
      const dstr = fmt(cursor);
      if (isDue(h, dstr)) { dueCount++; if (h.logs[dstr]) doneCount++; }
      cursor = addDays(cursor, 1);
    }
  });
  const rate = dueCount === 0 ? 0 : Math.round((doneCount / dueCount) * 100);

  statsSummary.appendChild(statCard(String(totalDone), "Total check-ins"));
  statsSummary.appendChild(statCard(String(longestEver), "Longest streak ever"));
  statsSummary.appendChild(statCard(rate + "%", "Completion, last 30 days"));

  all.forEach((h) => statsHabits.appendChild(renderStatsHabitRow(h)));
}

function statCard(number, label) {
  const card = document.createElement("div");
  card.className = "stat-card";
  card.innerHTML = `<div class="stat-number">${number}</div><div class="stat-label">${label}</div>`;
  return card;
}

function renderStatsHabitRow(habit) {
  const wrap = document.createElement("div");
  wrap.className = "stats-habit";

  const head = document.createElement("div");
  head.className = "stats-habit-head";
  head.innerHTML = `
    <span class="stats-habit-name">${habit.name}${habit.archived ? " (archived)" : ""}</span>
    <span class="stats-habit-nums"><b>${computeCurrentStreak(habit)}</b> now · <b>${computeBestStreak(habit)}</b> best · ${totalCompletions(habit)} total</span>
  `;
  wrap.appendChild(head);

  const scroll = document.createElement("div");
  scroll.className = "heatmap-scroll";
  const grid = document.createElement("div");
  grid.className = "heatmap-grid";
  buildMiniHeatmap(habit).forEach((cell) => grid.appendChild(cell));
  scroll.appendChild(grid);
  wrap.appendChild(scroll);

  const link = document.createElement("button");
  link.className = "view-calendar-link";
  link.type = "button";
  link.textContent = "View calendar →";
  link.addEventListener("click", () => openCalendarModal(habit.id));
  wrap.appendChild(link);

  return wrap;
}

function buildMiniHeatmap(habit) {
  const today = todayStr();
  const days = 84; // 12 weeks
  const end = parseYMD(today);
  const start = addDays(end, -(days - 1));
  const created = parseYMD(habit.createdAt);
  const cells = [];
  let cursor = start;
  while (cursor <= end) {
    const dstr = fmt(cursor);
    const cell = document.createElement("div");
    cell.className = "heat-cell";
    cell.title = dstr;
    if (cursor < created || !isDue(habit, dstr)) {
      cell.classList.add("is-not-due");
    } else if (habit.logs[dstr]) {
      cell.classList.add("is-done");
      cell.title += " — done";
    } else if (dstr === today) {
      cell.classList.add("is-pending");
      cell.title += " — due today";
    } else {
      cell.classList.add("is-missed");
      cell.title += " — missed";
    }
    cells.push(cell);
    cursor = addDays(cursor, 1);
  }
  return cells;
}

/* ---------------------------------------------------------
   Calendar modal (full month view per habit)
   --------------------------------------------------------- */
function openCalendarModal(id) {
  calHabitId = id;
  const habit = habits.find((h) => h.id === id);
  if (!habit) return;
  calCursor = new Date();
  $("#calendarModalTitle").textContent = habit.name;
  $("#calStreakLine").innerHTML = `<b>${computeCurrentStreak(habit)}</b> day streak now · <b>${computeBestStreak(habit)}</b> day best`;
  renderCalendarGrid();
  $("#calendarModalBackdrop").hidden = false;
}
function closeCalendarModal() { $("#calendarModalBackdrop").hidden = true; calHabitId = null; }

function renderCalendarGrid() {
  const habit = habits.find((h) => h.id === calHabitId);
  if (!habit) return;
  const today = todayStr();
  const y = calCursor.getFullYear();
  const m = calCursor.getMonth();
  $("#calMonthLabel").textContent = `${MONTH_LABELS[m]} ${y}`;

  const firstOfMonth = new Date(y, m, 1);
  const startOffset = firstOfMonth.getDay(); // 0=Sun
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const created = parseYMD(habit.createdAt);

  const grid = $("#calGrid");
  grid.innerHTML = "";

  for (let i = 0; i < startOffset; i++) {
    const filler = document.createElement("div");
    filler.className = "cal-day is-empty";
    grid.appendChild(filler);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m, d);
    const dstr = fmt(date);
    const cell = document.createElement("div");
    cell.className = "cal-day";
    cell.textContent = String(d);

    if (date < created) {
      // before the habit existed — neutral
    } else if (isDue(habit, dstr)) {
      cell.classList.add("is-due");
      if (habit.logs[dstr]) cell.classList.add("is-done");
      else if (dstr === today) cell.classList.add("is-pending");
      else if (dstr < today) cell.classList.add("is-missed");
    }
    if (dstr === today) cell.classList.add("is-today");
    grid.appendChild(cell);
  }

  const isCurrentMonth = (y === new Date().getFullYear() && m === new Date().getMonth());
  $("#calNextBtn").disabled = isCurrentMonth;
}

$("#calPrevBtn").addEventListener("click", () => {
  calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1);
  renderCalendarGrid();
});
$("#calNextBtn").addEventListener("click", () => {
  if ($("#calNextBtn").disabled) return;
  calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1);
  renderCalendarGrid();
});
$("#closeCalendarModalBtn").addEventListener("click", closeCalendarModal);
$("#calendarModalBackdrop").addEventListener("click", (e) => { if (e.target.id === "calendarModalBackdrop") closeCalendarModal(); });

/* ---------------------------------------------------------
   Add / Edit modal
   --------------------------------------------------------- */
function openAddModal() {
  editingHabitId = null;
  draftSchedule = { type: "daily" };
  modalTitle.textContent = "New habit";
  habitNameInput.value = "";
  archiveHabitBtn.hidden = true;
  deleteHabitBtn.hidden = true;
  modalError.hidden = true;
  syncScheduleUI();
  showModal();
}
function openEditModal(id) {
  const habit = habits.find((h) => h.id === id);
  if (!habit) return;
  editingHabitId = id;
  draftSchedule = JSON.parse(JSON.stringify(habit.schedule));
  modalTitle.textContent = "Edit habit";
  habitNameInput.value = habit.name;
  archiveHabitBtn.hidden = false;
  deleteHabitBtn.hidden = false;
  modalError.hidden = true;
  syncScheduleUI();
  showModal();
}
function showModal() { modalBackdrop.hidden = false; setTimeout(() => habitNameInput.focus(), 0); }
function closeModal() { modalBackdrop.hidden = true; }

function syncScheduleUI() {
  [...scheduleOptions.children].forEach((chip) => chip.classList.toggle("is-active", chip.dataset.schedule === draftSchedule.type));
  dayPicker.hidden = draftSchedule.type !== "custom";
  const activeDays = draftSchedule.type === "custom" ? draftSchedule.days : [];
  [...dayPicker.children].forEach((pip) => pip.classList.toggle("is-active", activeDays.includes(Number(pip.dataset.day))));
}

scheduleOptions.addEventListener("click", (e) => {
  const chip = e.target.closest(".schedule-chip");
  if (!chip) return;
  const type = chip.dataset.schedule;
  draftSchedule = type === "custom" && draftSchedule.type !== "custom" ? { type: "custom", days: [] } : { type };
  syncScheduleUI();
});
dayPicker.addEventListener("click", (e) => {
  const pip = e.target.closest(".day-pip");
  if (!pip) return;
  const day = Number(pip.dataset.day);
  if (!draftSchedule.days) draftSchedule.days = [];
  const idx = draftSchedule.days.indexOf(day);
  if (idx === -1) draftSchedule.days.push(day); else draftSchedule.days.splice(idx, 1);
  syncScheduleUI();
});

$("#saveHabitBtn").addEventListener("click", () => {
  const name = habitNameInput.value.trim();
  if (!name) { modalError.textContent = "Give the habit a name."; modalError.hidden = false; return; }
  if (draftSchedule.type === "custom" && (!draftSchedule.days || draftSchedule.days.length === 0)) {
    modalError.textContent = "Pick at least one day."; modalError.hidden = false; return;
  }
  if (editingHabitId) {
    const habit = habits.find((h) => h.id === editingHabitId);
    habit.name = name;
    habit.schedule = draftSchedule;
  } else {
    habits.push({ id: uid(), name, schedule: draftSchedule, createdAt: todayStr(), archived: false, logs: {}, lastStreakSeen: 0 });
  }
  saveHabits(habits);
  closeModal();
  render();
});

archiveHabitBtn.addEventListener("click", () => {
  const habit = habits.find((h) => h.id === editingHabitId);
  if (!habit) return;
  habit.archived = true;
  lastArchivedId = habit.id;
  saveHabits(habits);
  closeModal();
  render();
  showToast(`"${habit.name}" archived.`, false, "Undo", () => {
    const h = habits.find((x) => x.id === lastArchivedId);
    if (h) { h.archived = false; saveHabits(habits); render(); }
  });
});

deleteHabitBtn.addEventListener("click", () => {
  if (!confirm("Delete this habit and all its history? This can't be undone.")) return;
  habits = habits.filter((h) => h.id !== editingHabitId);
  saveHabits(habits);
  closeModal();
  render();
});

$("#cancelModalBtn").addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e) => { if (e.target === modalBackdrop) closeModal(); });
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!modalBackdrop.hidden) closeModal();
  if (!$("#dataModalBackdrop").hidden) closeDataModal();
  if (!$("#calendarModalBackdrop").hidden) closeCalendarModal();
  if (!$("#nameModalBackdrop").hidden) closeNameModal();
});

$("#openAddFromToday").addEventListener("click", openAddModal);
$("#openAddFromManage").addEventListener("click", openAddModal);

/* ---------------------------------------------------------
   Name modal — the personal "hello"
   --------------------------------------------------------- */
function openNameModal() {
  $("#nameInput").value = userName;
  $("#nameModalBackdrop").hidden = false;
  setTimeout(() => $("#nameInput").focus(), 0);
}
function closeNameModal() { $("#nameModalBackdrop").hidden = true; }

$("#editNameBtn").addEventListener("click", openNameModal);
$("#skipNameBtn").addEventListener("click", closeNameModal);
$("#saveNameBtn").addEventListener("click", () => {
  const v = $("#nameInput").value.trim();
  userName = v;
  saveUserName(v);
  closeNameModal();
  renderHeader();
  if (v) showToast(`Nice to meet you, ${v}! 👋`);
});
$("#nameModalBackdrop").addEventListener("click", (e) => { if (e.target.id === "nameModalBackdrop") closeNameModal(); });
$("#nameInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#saveNameBtn").click(); });

/* ---------------------------------------------------------
   Data modal — export / import
   --------------------------------------------------------- */
function openDataModal() {
  $("#dataStatus").textContent = "";
  $("#dataStatus").className = "data-status";
  $("#dataModalBackdrop").hidden = false;
}
function closeDataModal() { $("#dataModalBackdrop").hidden = true; }
$("#dataMenuBtn").addEventListener("click", openDataModal);
$("#closeDataModalBtn").addEventListener("click", closeDataModal);
$("#dataModalBackdrop").addEventListener("click", (e) => { if (e.target.id === "dataModalBackdrop") closeDataModal(); });

$("#exportBtn").addEventListener("click", async () => {
  const status = $("#dataStatus");
  status.className = "data-status";
  status.textContent = "Preparing export…";
  const payload = JSON.stringify({ exportedAt: todayStr(), habits, meta }, null, 2);
  const filename = `streak-backup-${todayStr()}.json`;
  try {
    let downloads = null;
    if (window.claude && typeof window.claude.use === "function") {
      downloads = await window.claude.use("downloads");
    }
    if (downloads) {
      await downloads.save({ filename, data: payload });
      status.textContent = "Exported.";
      status.className = "data-status is-ok";
      return;
    }
  } catch (err) {
    if (err && err.code === "declined") { status.textContent = "Export cancelled."; status.className = "data-status"; return; }
  }
  // Fallback for non-published / non-Claude hosts
  try {
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    status.textContent = "Exported.";
    status.className = "data-status is-ok";
  } catch (err) {
    status.textContent = "Couldn't export right now.";
    status.className = "data-status is-error";
  }
});

$("#importFileInput").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const status = $("#dataStatus");
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const incoming = Array.isArray(parsed) ? parsed : parsed.habits;
      if (!Array.isArray(incoming)) throw new Error("no habits array");
      const valid = incoming.every((h) => h && typeof h.id === "string" && typeof h.name === "string" && h.schedule);
      if (!valid) throw new Error("malformed habit records");
      if (!confirm(`Import ${incoming.length} habit${incoming.length === 1 ? "" : "s"}? This replaces everything currently saved here.`)) {
        status.textContent = "Import cancelled.";
        status.className = "data-status";
        return;
      }
      habits = incoming;
      saveHabits(habits);
      render();
      status.textContent = `Imported ${incoming.length} habit${incoming.length === 1 ? "" : "s"}.`;
      status.className = "data-status is-ok";
    } catch (err) {
      status.textContent = "That file doesn't look like a Streak backup.";
      status.className = "data-status is-error";
    } finally {
      e.target.value = "";
    }
  };
  reader.onerror = () => {
    status.textContent = "Couldn't read that file.";
    status.className = "data-status is-error";
  };
  reader.readAsText(file);
});

/* ---------------------------------------------------------
   Toast (supports an optional action button, e.g. Undo)
   --------------------------------------------------------- */
let toastTimer = null;
function showToast(message, isMilestone = false, actionLabel = null, actionFn = null) {
  clearTimeout(toastTimer);
  toastMessage.textContent = message;
  toast.classList.toggle("is-milestone", isMilestone);
  if (actionLabel && actionFn) {
    toastActionBtn.textContent = actionLabel;
    toastActionBtn.hidden = false;
    toastActionBtn.onclick = () => { actionFn(); toast.hidden = true; clearTimeout(toastTimer); };
  } else {
    toastActionBtn.hidden = true;
    toastActionBtn.onclick = null;
  }
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, actionLabel ? 5200 : 3200);
}

/* ---------------------------------------------------------
   Gentle streak-break acknowledgement (once per day)
   --------------------------------------------------------- */
function checkForBrokenStreaks() {
  const today = todayStr();
  if (meta.lastOpenedDate === today) return;
  const broken = [];
  habits.forEach((h) => {
    if (h.archived) return;
    const current = computeCurrentStreak(h);
    if ((h.lastStreakSeen || 0) >= 3 && current === 0) broken.push(h.name);
    h.lastStreakSeen = current;
  });
  meta.lastOpenedDate = today;
  saveMeta(meta);
  saveHabits(habits);
  if (broken.length === 1) showToast(`Your "${broken[0]}" streak ended — a fresh one starts today.`);
  else if (broken.length > 1) showToast(`A couple of streaks reset overnight. Today's a clean start.`);
}

/* ---------------------------------------------------------
   View switching
   --------------------------------------------------------- */
$("#tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  currentView = btn.dataset.view;
  [...$("#tabs").children].forEach((t) => t.classList.toggle("is-active", t === btn));
  $("#view-today").hidden = currentView !== "today";
  $("#view-manage").hidden = currentView !== "manage";
  $("#view-stats").hidden = currentView !== "stats";
  render();
});

searchInput.addEventListener("input", (e) => { searchTerm = e.target.value; renderManage(); });
$("#archiveToggle").addEventListener("click", () => { showArchived = !showArchived; renderManage(); });

/* ---------------------------------------------------------
   Main render
   --------------------------------------------------------- */
function render() {
  renderHeader();
  if (currentView === "today") renderToday();
  else if (currentView === "manage") renderManage();
  else renderStats();
}

buildStarfield();
applyTheme(loadTheme());
checkForBrokenStreaks();
render();
if (!userName) setTimeout(openNameModal, 400);