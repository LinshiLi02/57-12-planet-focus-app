import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const WORK_SECONDS = 52 * 60;
const BREAK_SECONDS = 17 * 60;
const STORAGE_PREFIX = "weekly-focus-planet";
const PLANET_RADIUS = 1.65;

const planetViewport = document.querySelector("#planetViewport");
const expandedPlanetViewport = document.querySelector("#expandedPlanetViewport");
const expandedView = document.querySelector("#planetExpandedView");
const expandPlanetButton = document.querySelector("#expandPlanetButton");
const backButton = document.querySelector("#backButton");
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

const flowerColors = ["#ffaaa7", "#ffc3c2", "#ffd8a8", "#fff0a8", "#d8c4ff", "#b9d7ff", "#ffb7d4"];
const flowerTypes = ["blossom", "sunny", "wild"];

let timerId = null;
let state = loadState();
let renderer;
let scene;
let camera;
let controls;
let planetGroup;
let flowerGroup;
let isExpanded = false;
let isUserRotating = false;

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

    const loadedState = {
      ...fallback,
      ...saved,
      running: false,
      remaining: Number.isFinite(saved.remaining) ? saved.remaining : fallback.remaining,
      flowers: Array.isArray(saved.flowers) ? saved.flowers.map(normalizeFlower) : [],
      dailySlots: saved.dailySlots && typeof saved.dailySlots === "object" ? saved.dailySlots : {}
    };

    return loadedState;
  } catch {
    return fallback;
  }
}

function normalizeFlower(flower) {
  if (Number.isFinite(flower.lat) && Number.isFinite(flower.lon)) {
    return flower;
  }

  const x = Number.isFinite(flower.x) ? flower.x : 50;
  const y = Number.isFinite(flower.y) ? flower.y : 50;
  const lon = ((x - 50) / 50) * Math.PI;
  const lat = THREE.MathUtils.clamp(((50 - y) / 50) * (Math.PI / 2), -1.15, 1.15);

  return {
    ...flower,
    type: flower.type || "blossom",
    color: flower.color || flowerColors[0],
    scale: Number.isFinite(flower.scale) ? flower.scale : THREE.MathUtils.clamp((flower.size || 34) / 380, 0.06, 0.12),
    lat,
    lon,
    spin: Number.isFinite(flower.spin) ? flower.spin : (flower.turn || 0) * (Math.PI / 180)
  };
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
  renderFlowers3D();
}

function createScene() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0.2, 6);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute("aria-hidden", "true");
  planetViewport.appendChild(renderer.domElement);

  const ambient = new THREE.HemisphereLight(0xffffff, 0x8faf94, 1.9);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xfff4dc, 2.2);
  keyLight.position.set(3.8, 4.6, 5.2);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xb7d9e8, 1.1);
  rimLight.position.set(-5, 1.5, -2);
  scene.add(rimLight);

  planetGroup = new THREE.Group();
  planetGroup.rotation.set(-0.16, 0.42, 0);
  scene.add(planetGroup);

  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_RADIUS, 96, 96),
    new THREE.MeshStandardMaterial({
      color: 0xaed28e,
      roughness: 0.82,
      metalness: 0.02
    })
  );
  planetGroup.add(planet);

  createPlanetBands();

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_RADIUS * 1.018, 96, 96),
    new THREE.MeshBasicMaterial({
      color: 0xdff5ef,
      transparent: true,
      opacity: 0.16,
      depthWrite: false
    })
  );
  planetGroup.add(atmosphere);

  flowerGroup = new THREE.Group();
  planetGroup.add(flowerGroup);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minDistance = 4.4;
  controls.maxDistance = 7.2;
  controls.rotateSpeed = 0.75;
  controls.zoomSpeed = 0.55;
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_ROTATE
  };
  controls.addEventListener("start", () => {
    isUserRotating = true;
  });
  controls.addEventListener("end", () => {
    isUserRotating = false;
  });

  window.addEventListener("resize", resizeRenderer);
  animateScene();
  resizeRenderer();
}

function createPlanetBands() {
  const bandMaterial = new THREE.MeshBasicMaterial({
    color: 0xf5f0bc,
    transparent: true,
    opacity: 0.28,
    depthWrite: false
  });

  const waterMaterial = new THREE.MeshBasicMaterial({
    color: 0x6aaab6,
    transparent: true,
    opacity: 0.24,
    depthWrite: false
  });

  [
    { lat: 0.26, lon: -0.8, scale: [1.28, 0.22, 0.06], material: bandMaterial, rot: 0.08 },
    { lat: -0.42, lon: 1.35, scale: [0.98, 0.18, 0.06], material: waterMaterial, rot: -0.2 },
    { lat: 0.02, lon: 2.45, scale: [0.72, 0.13, 0.05], material: bandMaterial, rot: 0.4 }
  ].forEach((patch) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.32, 32, 16), patch.material);
    const normal = normalFromLatLon(patch.lat, patch.lon);
    mesh.position.copy(normal.multiplyScalar(PLANET_RADIUS * 1.006));
    mesh.scale.set(...patch.scale);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.normalize());
    mesh.rotateY(patch.rot);
    planetGroup.add(mesh);
  });
}

function resizeRenderer() {
  const host = isExpanded ? expandedPlanetViewport : planetViewport;
  const rect = host.getBoundingClientRect();
  const size = Math.max(1, Math.floor(Math.min(rect.width, rect.height)));

  camera.aspect = rect.width / rect.height || 1;
  camera.updateProjectionMatrix();
  renderer.setSize(Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height)), false);
  renderer.domElement.style.width = `${size}px`;
  renderer.domElement.style.height = `${size}px`;
}

function animateScene() {
  requestAnimationFrame(animateScene);

  if (!isUserRotating) {
    planetGroup.rotation.y += 0.0014;
  }

  controls.update();
  renderer.render(scene, camera);
}

function renderFlowers3D() {
  if (!flowerGroup) {
    return;
  }

  flowerGroup.clear();
  state.flowers.forEach((flower) => {
    flowerGroup.add(createFlowerMesh(normalizeFlower(flower)));
  });
}

function createFlowerMesh(flower) {
  const group = new THREE.Group();
  const normal = normalFromLatLon(flower.lat, flower.lon);
  const scale = flower.scale || 0.085;
  const color = new THREE.Color(flower.color);

  group.position.copy(normal.clone().multiplyScalar(PLANET_RADIUS * 1.012));
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  group.rotateY(flower.spin || 0);

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(scale * 0.09, scale * 0.12, scale * 1.55, 8),
    new THREE.MeshStandardMaterial({ color: 0x3f7d5b, roughness: 0.72 })
  );
  stem.position.y = scale * 0.62;
  stem.rotation.z = -0.18;
  group.add(stem);

  const blossom = new THREE.Group();
  blossom.position.y = scale * 1.44;
  blossom.rotation.x = Math.PI / 2;
  group.add(blossom);

  const petalCount = flower.type === "sunny" ? 6 : flower.type === "wild" ? 7 : 5;
  const petalTexture = createPetalTexture(color);
  const petalMaterial = new THREE.MeshBasicMaterial({
    map: petalTexture,
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  for (let i = 0; i < petalCount; i += 1) {
    const angle = (i / petalCount) * Math.PI * 2;
    const petal = new THREE.Mesh(
      new THREE.PlaneGeometry(scale * 1.08, scale * 1.58),
      petalMaterial
    );
    petal.position.set(Math.cos(angle) * scale * 0.42, Math.sin(angle) * scale * 0.42, 0);
    petal.rotation.z = angle - Math.PI / 2;
    petal.scale.y = flower.type === "wild" && i % 2 ? 0.86 : 1;
    blossom.add(petal);
  }

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(scale * 0.25, 18, 12),
    new THREE.MeshBasicMaterial({ color: 0xffee57 })
  );
  core.position.z = scale * 0.025;
  blossom.add(core);

  return group;
}

function createPetalTexture(color) {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 140;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(48, 95, 2, 48, 78, 72);

  gradient.addColorStop(0, "#fff36a");
  gradient.addColorStop(0.22, color.getStyle());
  gradient.addColorStop(0.72, color.offsetHSL(0.02, -0.08, 0.14).getStyle());
  gradient.addColorStop(1, "rgba(255,255,255,0)");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(48, 132);
  ctx.bezierCurveTo(10, 112, 4, 48, 28, 16);
  ctx.bezierCurveTo(41, -1, 58, -1, 70, 16);
  ctx.bezierCurveTo(94, 48, 86, 112, 48, 132);
  ctx.fill();

  ctx.globalAlpha = 0.38;
  ctx.strokeStyle = "#fff6c8";
  ctx.lineWidth = 2;
  for (let i = -3; i <= 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(48, 120);
    ctx.quadraticCurveTo(48 + i * 7, 70, 48 + i * 4, 18);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function normalFromLatLon(lat, lon) {
  return new THREE.Vector3(
    Math.cos(lat) * Math.cos(lon),
    Math.sin(lat),
    Math.cos(lat) * Math.sin(lon)
  ).normalize();
}

function createFlower() {
  return {
    type: flowerTypes[Math.floor(Math.random() * flowerTypes.length)],
    color: flowerColors[Math.floor(Math.random() * flowerColors.length)],
    scale: Number((0.07 + Math.random() * 0.055).toFixed(3)),
    lat: Number((THREE.MathUtils.randFloatSpread(1.9)).toFixed(3)),
    lon: Number((Math.random() * Math.PI * 2).toFixed(3)),
    spin: Number((Math.random() * Math.PI * 2).toFixed(3)),
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

function setExpanded(nextExpanded) {
  isExpanded = nextExpanded;
  expandedView.hidden = !isExpanded;
  (isExpanded ? expandedPlanetViewport : planetViewport).appendChild(renderer.domElement);
  controls.enableZoom = isExpanded;
  camera.position.set(0, 0.2, isExpanded ? 5.1 : 6);
  controls.update();
  resizeRenderer();
}

startButton.addEventListener("click", startTimer);
pauseButton.addEventListener("click", pauseTimer);
resetButton.addEventListener("click", resetTimer);
manualCompleteButton.addEventListener("click", completeSlot);
expandPlanetButton.addEventListener("click", () => setExpanded(true));
backButton.addEventListener("click", () => setExpanded(false));

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isExpanded) {
    setExpanded(false);
  }
});
window.addEventListener("beforeunload", saveState);

createScene();
render();
