const WORK_SECONDS = 52 * 60;
const BREAK_SECONDS = 17 * 60;
const STORAGE_PREFIX = "weekly-focus-planet";

const planet = document.querySelector("#planet");
const weekRange = document.querySelector("#weekRange");
const phaseBadge = document.querySelector("#phaseBadge");
const statusText = document.querySelector("#statusText");
const timeDisplay = document.querySelector("#timeDisplay");
const progressFill = document.querySelector("#progressFill");
const startButton = document.querySelector("#startButton");
const pauseButton = document.querySelector("#pauseButton");
const resetButton = document.querySelector("#resetButton");
const manualCompleteButton = document.querySelector("#manualCompleteButton");
const todaySlots = document.querySelector("#todaySlots");
const weekSlots = document.querySelector("#weekSlots");

const flowerColors = ["#df6f76", "#f3b45b", "#faf1a8", "#a36bd6", "#5aaec7", "#f29db2", "#f7f2ff"];
const flowerTypes = ["daisy", "tulip", "star"];

let timerId = null;
let state = loadState();

function getTodayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekStart(date = new Date()) {
  const weekStart = new Date(date);
  weekStart.setHours(0, 0, 0, 0);
  const day = weekStart.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  weekStart.setDate(weekStart.getDate() + diff);
  return weekStart;
}

function getWeekKey(date = new Date()) {
  return getTodayKey(getWeekStart(date));
}

function getStorageKey() {
  return `${STORAGE_PREFIX}:${getWeekKey()}`;
}

function getInitialState() {
  return {
    weekKey: getWeekKey(),
    phase: "work",
    remaining: WORK_SECONDS,
    running: false,
    flowers: [],
    dailySlots: {}
  };
}

function loadState() {
  const fallback = getInitialState();

  try {
    const saved = JSON.parse(localStorage.getItem(getStorageKey()));
    if (!saved || saved.weekKey !== fallback.weekKey) {
      return fallback;
    }

    return {
      ...fallback,
      ...saved,
      running: false,
      remaining: Number.isFinite(saved.remaining) ? saved.remaining : fallback.remaining,
      flowers: Array.isArray(saved.flowers) ? saved.flowers : [],
      dailySlots: saved.dailySlots && typeof saved.dailySlots === "object" ? saved.dailySlots : {}
    };
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(getStorageKey(), JSON.stringify({ ...state, running: false }));
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
}

function phaseDuration() {
  return state.phase === "work" ? WORK_SECONDS : BREAK_SECONDS;
}

function setStatus() {
  if (state.running) {
    statusText.textContent = state.phase === "work" ? "Growing focus" : "Resting before the flower blooms";
    return;
  }

  statusText.textContent = state.phase === "work"
    ? "Ready for a 52-minute focus session"
    : "Break queued: 17 minutes to complete the slot";
}

function render() {
  const today = getTodayKey();
  const weekStart = getWeekStart();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  weekRange.textContent = `${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  phaseBadge.textContent = state.phase === "work" ? "Work" : "Break";
  phaseBadge.classList.toggle("break", state.phase === "break");
  timeDisplay.textContent = formatTime(state.remaining);
  progressFill.style.width = `${Math.round(((phaseDuration() - state.remaining) / phaseDuration()) * 100)}%`;
  todaySlots.textContent = state.dailySlots[today] || 0;
  weekSlots.textContent = state.flowers.length;
  setStatus();
  renderFlowers();
}

function renderFlowers() {
  planet.querySelectorAll(".flower").forEach((flower) => flower.remove());

  state.flowers.forEach((flower) => {
    const element = document.createElement("span");
    element.className = `flower ${flower.type}`;
    element.style.setProperty("--x", `${flower.x}%`);
    element.style.setProperty("--y", `${flower.y}%`);
    element.style.setProperty("--size", `${flower.size}px`);
    element.style.setProperty("--turn", `${flower.turn}deg`);
    element.style.setProperty("--flower-color", flower.color);
    element.setAttribute("aria-hidden", "true");

    for (let i = 0; i < 6; i += 1) {
      const petal = document.createElement("span");
      petal.className = "petal";
      element.appendChild(petal);
    }

    const core = document.createElement("span");
    core.className = "flower-core";
    element.appendChild(core);
    planet.appendChild(element);
  });
}

function createFlower() {
  const angle = Math.random() * Math.PI * 2;
  const radius = 11 + Math.sqrt(Math.random()) * 36;

  return {
    type: flowerTypes[Math.floor(Math.random() * flowerTypes.length)],
    color: flowerColors[Math.floor(Math.random() * flowerColors.length)],
    size: Math.round(24 + Math.random() * 24),
    x: Number((50 + Math.cos(angle) * radius).toFixed(2)),
    y: Number((50 + Math.sin(angle) * radius).toFixed(2)),
    turn: Math.round(Math.random() * 360),
    createdAt: new Date().toISOString()
  };
}

function completeSlot() {
  const today = getTodayKey();
  state.flowers.push(createFlower());
  state.dailySlots[today] = (state.dailySlots[today] || 0) + 1;
  state.phase = "work";
  state.remaining = WORK_SECONDS;
  state.running = false;
  stopTimer();
  saveState();
  render();
}

function handlePhaseFinished() {
  if (state.phase === "work") {
    state.phase = "break";
    state.remaining = BREAK_SECONDS;
    saveState();
    render();
    return;
  }

  completeSlot();
}

function tick() {
  if (!state.running) {
    return;
  }

  state.remaining -= 1;

  if (state.remaining <= 0) {
    handlePhaseFinished();
    return;
  }

  saveState();
  render();
}

function startTimer() {
  if (state.running) {
    return;
  }

  state.running = true;
  timerId = window.setInterval(tick, 1000);
  render();
}

function stopTimer() {
  window.clearInterval(timerId);
  timerId = null;
  state.running = false;
}

function pauseTimer() {
  stopTimer();
  saveState();
  render();
}

function resetTimer() {
  stopTimer();
  state.phase = "work";
  state.remaining = WORK_SECONDS;
  saveState();
  render();
}

startButton.addEventListener("click", startTimer);
pauseButton.addEventListener("click", pauseTimer);
resetButton.addEventListener("click", resetTimer);
manualCompleteButton.addEventListener("click", completeSlot);

window.addEventListener("beforeunload", saveState);

render();
