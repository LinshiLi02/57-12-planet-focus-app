import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const WORK_SECONDS = 52 * 60;
const BREAK_SECONDS = 17 * 60;
const STORAGE_PREFIX = "weekly-focus-planet";
const PLANET_RADIUS = 1.65;
const HOME_CAMERA_DISTANCE = 7.2;
const EXPANDED_CAMERA_DISTANCE = 7.8;
const PLANET_BLOOM_TARGET = 25;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

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
const flowerCodex = document.querySelector("#flowerCodex");
const codexCount = document.querySelector("#codexCount");
const codexPreview = document.querySelector("#codexPreview");
const codexPreviewViewport = document.querySelector("#codexPreviewViewport");
const codexPreviewClose = document.querySelector("#codexPreviewClose");
const codexPreviewName = document.querySelector("#codexPreviewName");
const codexPreviewCount = document.querySelector("#codexPreviewCount");

const FLOWER_CATALOG = [
  {
    id: "moon-jelly",
    name: "Moon Jelly",
    color: "#f6fbff",
    rim: "#bcd9ff",
    accent: "#ff304c",
    core: "#fff05a",
    petalCount: 6,
    petalWidth: 1.28,
    petalHeight: 1.72,
    scallop: 4,
    redDots: 8,
    stamens: 18
  },
  {
    id: "coral-lantern",
    name: "Coral Lantern",
    color: "#ffb1a8",
    rim: "#ff7f62",
    accent: "#ff2d35",
    core: "#ffd84f",
    petalCount: 8,
    petalWidth: 1.05,
    petalHeight: 1.52,
    scallop: 6,
    redDots: 14,
    stamens: 22
  },
  {
    id: "glass-orchid",
    name: "Glass Orchid",
    color: "#ffe4ef",
    rim: "#b8c8ff",
    accent: "#ff5a3d",
    core: "#ffd96a",
    petalCount: 5,
    petalWidth: 1.34,
    petalHeight: 1.62,
    scallop: 3,
    redDots: 4,
    stamens: 16
  },
  {
    id: "foam-pom",
    name: "Foam Pom",
    color: "#f1eaff",
    rim: "#ffc8e1",
    accent: "#ff6a55",
    core: "#ffe0a3",
    petalCount: 13,
    petalWidth: 0.62,
    petalHeight: 0.92,
    scallop: 8,
    redDots: 0,
    stamens: 8
  },
  {
    id: "sea-fan",
    name: "Sea Fan",
    color: "#d9f8ff",
    rim: "#7aa8ff",
    accent: "#ff244a",
    core: "#fff069",
    petalCount: 7,
    petalWidth: 0.9,
    petalHeight: 1.92,
    scallop: 5,
    redDots: 10,
    stamens: 14
  }
];

const legacyFlowerColors = ["#ffaaa7", "#ffc3c2", "#ffd8a8", "#fff0a8", "#d8c4ff", "#b9d7ff", "#ffb7d4"];
const petalTextureCache = new Map();
let planetSurfaceTexture;
let mistTexture;

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
let previewRenderer;
let previewScene;
let previewCamera;
let previewFlowerRoot;
let previewAnimationId;
let activePreviewFlowerId = null;
let audioContext;

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

    const phase = saved.phase === "break" ? "break" : "work";
    const duration = phase === "work" ? WORK_SECONDS : BREAK_SECONDS;
    const remaining = Number.isFinite(saved.remaining) && saved.remaining <= duration
      ? saved.remaining
      : duration;

    const loadedState = {
      ...fallback,
      ...saved,
      phase,
      running: false,
      remaining,
      flowers: Array.isArray(saved.flowers) ? saved.flowers.map(normalizeFlower) : [],
      dailySlots: saved.dailySlots && typeof saved.dailySlots === "object" ? saved.dailySlots : {}
    };

    return loadedState;
  } catch {
    return fallback;
  }
}

function normalizeFlower(flower) {
  const legacyTypeMap = {
    blossom: "glass-orchid",
    sunny: "coral-lantern",
    wild: "sea-fan"
  };
  const normalizedType = legacyTypeMap[flower.type] || flower.type || "moon-jelly";

  if (Number.isFinite(flower.lat) && Number.isFinite(flower.lon)) {
    const definition = getFlowerDefinition(normalizedType);

    return {
      ...flower,
      type: definition.id,
      color: flower.color || definition.color
    };
  }

  const x = Number.isFinite(flower.x) ? flower.x : 50;
  const y = Number.isFinite(flower.y) ? flower.y : 50;
  const lon = ((x - 50) / 50) * Math.PI;
  const lat = THREE.MathUtils.clamp(((50 - y) / 50) * (Math.PI / 2), -1.15, 1.15);

  return {
    ...flower,
    type: normalizedType,
    color: flower.color || legacyFlowerColors[0],
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

function formatDurationLabel(seconds) {
  if (seconds < 60) {
    return `${seconds}-second`;
  }

  return `${Math.round(seconds / 60)}-minute`;
}

function setStatus() {
  if (state.running) {
    statusText.textContent = state.phase === "work" ? "Growing focus" : "Resting before the flower blooms";
    return;
  }

  statusText.textContent = state.phase === "work"
    ? `Ready for a ${formatDurationLabel(WORK_SECONDS)} focus session`
    : `Break queued: ${formatDurationLabel(BREAK_SECONDS)} break to complete the slot`;
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
  renderCodex();
}

function createScene() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0.2, HOME_CAMERA_DISTANCE);

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
    createSoftPlanetGeometry(),
    new THREE.MeshStandardMaterial({
      color: 0xaed28e,
      map: createPlanetSurfaceTexture(),
      bumpMap: createPlanetSurfaceTexture(),
      bumpScale: 0.016,
      roughness: 0.82,
      metalness: 0.02
    })
  );
  planet.renderOrder = 0;
  planetGroup.add(planet);

  createPlanetGlowClouds();

  flowerGroup = new THREE.Group();
  flowerGroup.renderOrder = 2;
  planetGroup.add(flowerGroup);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minDistance = 6.8;
  controls.maxDistance = 10;
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

function createSoftPlanetGeometry() {
  const geometry = new THREE.SphereGeometry(PLANET_RADIUS, 128, 128);
  const positions = geometry.attributes.position;
  const vertex = new THREE.Vector3();

  for (let i = 0; i < positions.count; i += 1) {
    vertex.fromBufferAttribute(positions, i);
    const normal = vertex.clone().normalize();
    const wave =
      Math.sin(normal.x * 5.1 + normal.y * 1.7) * 0.009 +
      Math.sin(normal.y * 6.2 - normal.z * 2.4) * 0.007 +
      Math.sin((normal.x + normal.z) * 7.3) * 0.005;
    vertex.copy(normal.multiplyScalar(PLANET_RADIUS * (1 + wave)));
    positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  geometry.computeVertexNormals();
  return geometry;
}

function createPlanetSurfaceTexture() {
  if (planetSurfaceTexture) {
    return planetSurfaceTexture;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  const base = ctx.createLinearGradient(0, 0, 512, 256);
  base.addColorStop(0, "#8fbd88");
  base.addColorStop(0.28, "#c5df9b");
  base.addColorStop(0.62, "#b3d294");
  base.addColorStop(1, "#78aa8e");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 256);

  [
    ["rgba(255, 246, 196, 0.24)", 96, 76, 172, 34, -0.16],
    ["rgba(132, 184, 162, 0.18)", 220, 154, 148, 30, 0.22],
    ["rgba(106, 170, 182, 0.16)", 390, 180, 150, 28, 0.28],
    ["rgba(255, 253, 245, 0.13)", 310, 86, 94, 18, -0.44],
    ["rgba(83, 139, 100, 0.1)", 154, 204, 132, 24, 0.12]
  ].forEach(([fill, x, y, width, height, rotation]) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = "#fff7cb";
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i += 1) {
    ctx.beginPath();
    ctx.moveTo(-42, 36 + i * 27);
    ctx.bezierCurveTo(112, 12 + i * 24, 314, 58 + i * 19, 554, 18 + i * 31);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = "#517b67";
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 5; i += 1) {
    ctx.beginPath();
    ctx.moveTo(20, 54 + i * 38);
    ctx.bezierCurveTo(168, 90 + i * 18, 300, 24 + i * 36, 500, 78 + i * 22);
    ctx.stroke();
  }

  planetSurfaceTexture = new THREE.CanvasTexture(canvas);
  planetSurfaceTexture.colorSpace = THREE.SRGBColorSpace;
  planetSurfaceTexture.wrapS = THREE.RepeatWrapping;
  planetSurfaceTexture.wrapT = THREE.ClampToEdgeWrapping;
  planetSurfaceTexture.needsUpdate = true;
  return planetSurfaceTexture;
}

function createPlanetGlowClouds() {
  const cloudGroup = new THREE.Group();
  cloudGroup.renderOrder = 1.8;
  planetGroup.add(cloudGroup);

  [
    { lat: 0.42, lon: -0.56, width: 1.02, tint: 0xfffbf1, opacity: 0.58, rot: 0.1 },
    { lat: 0.14, lon: 0.78, width: 1.24, tint: 0xf9fff8, opacity: 0.55, rot: -0.24 },
    { lat: -0.2, lon: -1.34, width: 1.06, tint: 0xfff7e8, opacity: 0.52, rot: 0.36 },
    { lat: -0.44, lon: 1.86, width: 0.92, tint: 0xf4f9ff, opacity: 0.5, rot: -0.48 },
    { lat: 0.02, lon: 2.54, width: 0.86, tint: 0xffffff, opacity: 0.46, rot: 0.28 }
  ].forEach((bank) => {
    cloudGroup.add(createSurfaceCloudBank(bank));
  });
}

function createSurfaceCloudBank(bank) {
  const group = new THREE.Group();
  const normal = normalFromLatLon(bank.lat, bank.lon);
  group.position.copy(normal.clone().multiplyScalar(PLANET_RADIUS * 1.048));
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.normalize());
  group.rotateY(bank.rot);
  group.renderOrder = 1.85;

  const puffMaterial = new THREE.MeshBasicMaterial({
    color: bank.tint,
    transparent: true,
    opacity: bank.opacity,
    depthWrite: false,
    depthTest: true
  });
  const shadeMaterial = new THREE.MeshBasicMaterial({
    color: 0xbdd7df,
    transparent: true,
    opacity: bank.opacity * 0.2,
    depthWrite: false,
    depthTest: true
  });
  const highlightMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: bank.opacity * 0.74,
    depthWrite: false,
    depthTest: true
  });
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: bank.tint,
    map: createMistTexture(),
    transparent: true,
    opacity: bank.opacity * 0.42,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide
  });

  const underside = new THREE.Mesh(new THREE.SphereGeometry(bank.width * 0.34, 24, 12), shadeMaterial);
  underside.position.set(0, -0.025, bank.width * 0.08);
  underside.scale.set(1.72, 0.12, 0.16);
  underside.renderOrder = 1.83;
  group.add(underside);

  [
    [-0.52, 0.02, 0.02, 0.34, 0.18, 0.18],
    [-0.28, 0.08, -0.04, 0.42, 0.25, 0.22],
    [0.02, 0.11, 0.03, 0.5, 0.3, 0.24],
    [0.34, 0.07, -0.03, 0.4, 0.23, 0.2],
    [0.58, 0.02, 0.04, 0.32, 0.16, 0.17],
    [-0.05, -0.02, 0.17, 0.72, 0.18, 0.14],
    [-0.36, 0.12, 0.1, 0.28, 0.13, 0.12],
    [0.24, 0.17, 0.12, 0.32, 0.14, 0.12]
  ].forEach(([x, y, z, sx, sy, sz], index) => {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(bank.width * 0.28, 24, 14), puffMaterial.clone());
    puff.material.opacity = bank.opacity * (index === 5 ? 0.38 : index > 5 ? 0.48 : 0.86);
    puff.position.set(bank.width * x, y, bank.width * z);
    puff.scale.set(sx, sy, sz);
    puff.renderOrder = 1.86;
    group.add(puff);
  });

  [
    [-0.2, 0.17, 0.09, 0.22, 0.09, 0.08],
    [0.12, 0.21, 0.1, 0.25, 0.1, 0.08],
    [0.4, 0.12, 0.08, 0.18, 0.07, 0.06]
  ].forEach(([x, y, z, sx, sy, sz]) => {
    const highlight = new THREE.Mesh(new THREE.SphereGeometry(bank.width * 0.22, 18, 10), highlightMaterial.clone());
    highlight.position.set(bank.width * x, y, bank.width * z);
    highlight.scale.set(sx, sy, sz);
    highlight.renderOrder = 1.88;
    group.add(highlight);
  });

  const veil = new THREE.Mesh(new THREE.CircleGeometry(bank.width * 0.82, 48), glowMaterial);
  veil.rotation.x = -Math.PI / 2;
  veil.position.y = -0.03;
  veil.scale.set(1.22, 0.52, 1);
  veil.renderOrder = 1.84;
  group.add(veil);

  return group;
}

function createMistTexture() {
  if (mistTexture) {
    return mistTexture;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(72, 72, 5, 80, 80, 78);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.94)");
  gradient.addColorStop(0.36, "rgba(255, 255, 255, 0.46)");
  gradient.addColorStop(0.68, "rgba(255, 255, 255, 0.16)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 160, 160);

  ctx.globalCompositeOperation = "screen";
  [
    [48, 86, 30, 0.28],
    [82, 62, 38, 0.22],
    [110, 92, 34, 0.2]
  ].forEach(([x, y, radius, alpha]) => {
    const puff = ctx.createRadialGradient(x, y, 3, x, y, radius);
    puff.addColorStop(0, `rgba(255,255,255,${alpha})`);
    puff.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = puff;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  });

  mistTexture = new THREE.CanvasTexture(canvas);
  mistTexture.colorSpace = THREE.SRGBColorSpace;
  mistTexture.needsUpdate = true;
  return mistTexture;
}

function resizeRenderer() {
  const host = isExpanded ? expandedPlanetViewport : planetViewport;
  const rect = host.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));

  camera.aspect = width / height || 1;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
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
  state.flowers.forEach((flower, index) => {
    flowerGroup.add(createFlowerMesh(normalizeFlower(flower), index, state.flowers.length));
  });
}

function getFlowerDefinition(type) {
  return FLOWER_CATALOG.find((flower) => flower.id === type) || FLOWER_CATALOG[0];
}

function getCodexCounts() {
  return state.flowers.reduce((counts, flower) => {
    const definition = getFlowerDefinition(flower.type);
    counts[definition.id] = (counts[definition.id] || 0) + 1;
    return counts;
  }, {});
}

function renderCodex() {
  const counts = getCodexCounts();
  const unlockedCount = FLOWER_CATALOG.filter((flower) => counts[flower.id]).length;

  codexCount.textContent = `${unlockedCount} / ${FLOWER_CATALOG.length}`;
  flowerCodex.innerHTML = "";

  FLOWER_CATALOG.forEach((flower) => {
    const count = counts[flower.id] || 0;
    const card = document.createElement("button");
    card.className = `codex-card${count ? "" : " locked"}`;
    card.type = "button";
    card.disabled = !count;
    card.setAttribute("aria-label", count ? `Open ${flower.name} preview` : "Locked flower");
    card.style.setProperty("--codex-color", count ? flower.color : "#d9ddd9");
    card.style.setProperty("--codex-glow", count ? `${flower.rim}66` : "rgba(33, 48, 44, 0.08)");
    card.addEventListener("click", () => {
      if (count) {
        openCodexPreview(flower.id);
      }
    });

    card.innerHTML = `
      <i class="codex-flower" aria-hidden="true"></i>
      <span>${count ? flower.name : "Locked"}</span>
      <small>${count ? `${count} found` : "???"}</small>
    `;
    flowerCodex.appendChild(card);
  });
}

function createCodexPreviewScene() {
  previewScene = new THREE.Scene();
  previewCamera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  previewCamera.position.set(0, 0.06, 4.7);

  previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
  previewRenderer.setClearColor(0x000000, 0);
  codexPreviewViewport.appendChild(previewRenderer.domElement);

  previewScene.add(new THREE.HemisphereLight(0xffffff, 0x273c55, 2.4));

  const previewKey = new THREE.DirectionalLight(0xfff0dc, 1.8);
  previewKey.position.set(2.4, 2.8, 4);
  previewScene.add(previewKey);

  previewFlowerRoot = new THREE.Group();
  previewFlowerRoot.rotation.set(0, 0, 0);
  previewScene.add(previewFlowerRoot);
  resizeCodexPreview();
}

function resizeCodexPreview() {
  if (!previewRenderer) {
    return;
  }

  const rect = codexPreviewViewport.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  previewCamera.aspect = width / height || 1;
  previewCamera.updateProjectionMatrix();
  previewRenderer.setSize(width, height, false);
}

function openCodexPreview(flowerId) {
  const counts = getCodexCounts();
  const definition = getFlowerDefinition(flowerId);
  activePreviewFlowerId = definition.id;
  codexPreview.hidden = false;
  codexPreviewName.textContent = definition.name;
  codexPreviewCount.textContent = `${counts[definition.id] || 0} found`;

  if (!previewRenderer) {
    createCodexPreviewScene();
  }

  previewFlowerRoot.clear();
  previewFlowerRoot.add(createPreviewFlowerMesh(definition));
  requestAnimationFrame(resizeCodexPreview);
  animateCodexPreview();
}

function closeCodexPreview() {
  codexPreview.hidden = true;
  activePreviewFlowerId = null;
  if (previewAnimationId) {
    cancelAnimationFrame(previewAnimationId);
    previewAnimationId = null;
  }
}

function animateCodexPreview() {
  if (!activePreviewFlowerId || codexPreview.hidden) {
    return;
  }

  previewAnimationId = requestAnimationFrame(animateCodexPreview);
  previewFlowerRoot.rotation.y = Math.sin(Date.now() * 0.001) * 0.06;
  previewFlowerRoot.rotation.z = Math.sin(Date.now() * 0.0012) * 0.035;
  previewRenderer.render(previewScene, previewCamera);
}

function createPreviewFlowerMesh(definition) {
  const group = new THREE.Group();
  const blossom = new THREE.Group();
  const scale = 0.62;
  const color = new THREE.Color(definition.color);
  group.add(blossom);

  const petalTexture = createPetalTexture(definition, color);
  const petalMaterial = new THREE.MeshBasicMaterial({
    map: petalTexture,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  for (let i = 0; i < definition.petalCount; i += 1) {
    const angle = (i / definition.petalCount) * Math.PI * 2;
    const petal = new THREE.Mesh(
      new THREE.PlaneGeometry(scale * definition.petalWidth, scale * definition.petalHeight),
      petalMaterial
    );
    petal.position.set(Math.cos(angle) * scale * 0.44, Math.sin(angle) * scale * 0.44, Math.sin(i) * scale * 0.026);
    petal.rotation.z = angle - Math.PI / 2;
    petal.rotation.x = Math.sin(angle) * 0.14;
    petal.scale.y = i % 2 ? 0.95 : 1.08;
    blossom.add(petal);
  }

  addStamens(blossom, definition, scale);
  addRedDetails(blossom, definition, scale);
  addGloss(blossom, definition, scale);
  addSeaTendrils(blossom, definition, scale);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(scale * 0.22, 28, 18),
    new THREE.MeshBasicMaterial({ color: definition.core, transparent: true, opacity: 0.98 })
  );
  core.position.z = scale * 0.05;
  blossom.add(core);

  return group;
}

function createFlowerMesh(flower, index = 0, total = 1) {
  const group = new THREE.Group();
  const definition = getFlowerDefinition(flower.type);
  const normal = getPlanetFlowerNormal(flower, index, total);
  const fullnessScale = THREE.MathUtils.clamp(1.08 - total * 0.004, 0.92, 1.08);
  const scale = (flower.scale || definition.baseScale || 0.085) * 2.82 * fullnessScale;
  const color = new THREE.Color(flower.color || definition.color);

  group.position.copy(normal.clone().multiplyScalar(PLANET_RADIUS * 1.038));
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  group.rotateY(flower.spin || 0);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(scale * 0.92, 28),
    new THREE.MeshBasicMaterial({
      color: 0x375644,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = scale * 0.006;
  shadow.scale.set(1.04, 0.62, 1);
  group.add(shadow);

  const rootGlow = new THREE.Mesh(
    new THREE.CircleGeometry(scale * 0.48, 24),
    new THREE.MeshBasicMaterial({
      color: 0xf6fff0,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  rootGlow.rotation.x = -Math.PI / 2;
  rootGlow.position.y = scale * 0.012;
  rootGlow.scale.y = 0.66;
  group.add(rootGlow);

  addFlowerMist(group, scale, flower);

  const blossom = new THREE.Group();
  const bloomLift = 0.2 + (Math.sin((flower.spin || 0) * 1.7) + 1) * 0.035;
  blossom.position.y = scale * bloomLift;
  blossom.rotation.x = Math.PI / 2;
  group.add(blossom);

  const petalCount = definition.petalCount;
  const petalTexture = createPetalTexture(definition, color);
  const petalMaterial = new THREE.MeshBasicMaterial({
    map: petalTexture,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide
  });

  const backPetalMaterial = petalMaterial.clone();
  backPetalMaterial.opacity = 0.56;

  for (let i = 0; i < petalCount; i += 1) {
    const angle = (i / petalCount) * Math.PI * 2;
    const alternate = i % 2 ? 0.94 : 1.06;
    const lift = Math.sin(i * 1.7 + flower.spin) * scale * 0.024;

    const backPetal = new THREE.Mesh(
      new THREE.PlaneGeometry(scale * definition.petalWidth * 1.12, scale * definition.petalHeight * 1.08),
      backPetalMaterial
    );
    backPetal.position.set(Math.cos(angle) * scale * 0.38, Math.sin(angle) * scale * 0.38, -scale * 0.055 + lift);
    backPetal.rotation.z = angle - Math.PI / 2;
    backPetal.rotation.x = 0.2 + Math.sin(angle + flower.spin) * 0.12;
    backPetal.rotation.y = Math.cos(angle) * 0.08;
    backPetal.scale.y = alternate;
    blossom.add(backPetal);

    const petal = new THREE.Mesh(
      new THREE.PlaneGeometry(scale * definition.petalWidth * 0.94, scale * definition.petalHeight * 0.98),
      petalMaterial
    );
    petal.position.set(Math.cos(angle) * scale * 0.48, Math.sin(angle) * scale * 0.48, scale * 0.035 + lift);
    petal.rotation.z = angle - Math.PI / 2;
    petal.rotation.x = -0.16 + Math.sin(angle + flower.spin) * 0.18;
    petal.rotation.y = Math.cos(angle - flower.spin) * 0.1;
    petal.scale.y = alternate;
    blossom.add(petal);
  }

  addStamens(blossom, definition, scale);
  addRedDetails(blossom, definition, scale);
  addGloss(blossom, definition, scale);
  addSeaTendrils(blossom, definition, scale);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(scale * 0.22, 24, 16),
    new THREE.MeshBasicMaterial({ color: definition.core, transparent: true, opacity: 0.96 })
  );
  core.position.z = scale * 0.04;
  blossom.add(core);

  blossom.traverse((child) => {
    if (child.isMesh) {
      child.renderOrder = 2.4;
    }
  });

  return group;
}

function addFlowerMist(group, scale, flower) {
  const cloudColor = new THREE.Color(flower.color || "#fffdf2").offsetHSL(0.02, -0.32, 0.24);
  const cloudShadeColor = new THREE.Color(0xcfe3e9);
  const cloudShadow = new THREE.Mesh(
    new THREE.CircleGeometry(scale * 1.04, 44),
    new THREE.MeshBasicMaterial({
      color: 0xf7fff5,
      map: createMistTexture(),
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide
    })
  );
  cloudShadow.rotation.x = -Math.PI / 2;
  cloudShadow.position.y = scale * 0.06;
  cloudShadow.scale.set(1.52, 0.66, 1);
  cloudShadow.rotateZ((flower.spin || 0) * 0.45);
  cloudShadow.renderOrder = 1.92;
  group.add(cloudShadow);

  const undersideMaterial = new THREE.MeshBasicMaterial({
    color: cloudShadeColor,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    depthTest: true
  });
  const underside = new THREE.Mesh(new THREE.SphereGeometry(scale * 0.64, 20, 10), undersideMaterial);
  underside.position.set(0, scale * 0.055, scale * 0.08);
  underside.scale.set(1.65, 0.18, 0.24);
  underside.renderOrder = 1.91;
  group.add(underside);

  const puffMaterial = new THREE.MeshBasicMaterial({
    color: cloudColor,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    depthTest: true
  });

  [
    [-0.54, 0.11, 0.02, 0.32, 1.28, 0.54],
    [-0.25, 0.17, -0.06, 0.4, 1.1, 0.64],
    [0.06, 0.2, 0.05, 0.44, 1.18, 0.68],
    [0.36, 0.15, -0.03, 0.36, 1.18, 0.58],
    [0.6, 0.09, 0.04, 0.28, 1.12, 0.5],
    [0.02, 0.08, 0.21, 0.6, 1.34, 0.3]
  ].forEach(([x, y, z, radius, width, height], index) => {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(scale * radius, 20, 12), puffMaterial.clone());
    puff.material.opacity = index === 5 ? 0.24 : 0.46 + index * 0.02;
    puff.position.set(scale * x, scale * y, scale * z);
    puff.scale.set(width, height, 0.52);
    puff.renderOrder = 1.95;
    group.add(puff);
  });

  const frontMaterial = new THREE.MeshBasicMaterial({
    color: 0xfffffb,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    depthTest: true
  });

  [
    [-0.28, 0.245, 0.17, 0.22, 1.08, 0.42],
    [0.04, 0.27, 0.18, 0.28, 1.0, 0.46],
    [0.34, 0.235, 0.16, 0.2, 1.04, 0.38]
  ].forEach(([x, y, z, radius, width, height], index) => {
    const frontPuff = new THREE.Mesh(new THREE.SphereGeometry(scale * radius, 18, 10), frontMaterial.clone());
    frontPuff.material.opacity = 0.34 + index * 0.035;
    frontPuff.position.set(scale * x, scale * y, scale * z);
    frontPuff.scale.set(width, height, 0.46);
    frontPuff.renderOrder = 3.1;
    group.add(frontPuff);
  });
}

function getPlanetFlowerNormal(flower, index, total) {
  if (index < PLANET_BLOOM_TARGET) {
    const y = 1 - ((index + 0.5) / PLANET_BLOOM_TARGET) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const jitter = (flower.spin || 0) * 0.11;
    const angle = index * GOLDEN_ANGLE + jitter;

    return new THREE.Vector3(
      Math.cos(angle) * radius,
      y * 0.96,
      Math.sin(angle) * radius
    ).normalize();
  }

  return normalFromLatLon(flower.lat, flower.lon);
}

function addStamens(blossom, definition, scale) {
  const filamentMaterial = new THREE.MeshBasicMaterial({
    color: definition.core,
    transparent: true,
    opacity: 0.74,
    side: THREE.DoubleSide
  });
  const pollenMaterial = new THREE.MeshBasicMaterial({
    color: definition.core,
    transparent: true,
    opacity: 0.98
  });

  for (let i = 0; i < definition.stamens; i += 1) {
    const angle = (i / definition.stamens) * Math.PI * 2 + (i % 3) * 0.12;
    const length = scale * (0.36 + (i % 5) * 0.035);
    const filament = new THREE.Mesh(
      new THREE.PlaneGeometry(scale * 0.018, length),
      filamentMaterial
    );
    filament.position.set(Math.cos(angle) * length * 0.32, Math.sin(angle) * length * 0.32, scale * 0.052);
    filament.rotation.z = angle - Math.PI / 2;
    blossom.add(filament);

    const pollen = new THREE.Mesh(
      new THREE.SphereGeometry(scale * 0.045, 12, 8),
      pollenMaterial
    );
    pollen.position.set(Math.cos(angle) * length * 0.58, Math.sin(angle) * length * 0.58, scale * 0.075);
    blossom.add(pollen);
  }
}

function addRedDetails(blossom, definition, scale) {
  if (!definition.redDots) {
    return;
  }

  const redMaterial = new THREE.MeshBasicMaterial({
    color: definition.accent,
    transparent: true,
    opacity: 0.94
  });

  for (let i = 0; i < definition.redDots; i += 1) {
    const angle = (i / definition.redDots) * Math.PI * 2 + 0.18;
    const radius = scale * (0.42 + (i % 3) * 0.1);
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(scale * 0.05, 12, 8),
      redMaterial
    );
    dot.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, scale * 0.085);
    blossom.add(dot);
  }
}

function addGloss(blossom, definition, scale) {
  const glossMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const gloss = new THREE.Mesh(
    new THREE.PlaneGeometry(scale * definition.petalWidth * 0.42, scale * 0.08),
    glossMaterial
  );
  gloss.position.set(-scale * 0.18, scale * 0.28, scale * 0.12);
  gloss.rotation.z = -0.42;
  blossom.add(gloss);
}

function addSeaTendrils(blossom, definition, scale) {
  const tendrilMaterial = new THREE.MeshBasicMaterial({
    color: definition.rim,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + 0.38;
    const tendril = new THREE.Mesh(
      new THREE.PlaneGeometry(scale * 0.018, scale * (0.72 + i * 0.08)),
      tendrilMaterial
    );
    tendril.position.set(
      Math.cos(angle) * scale * 0.72,
      Math.sin(angle) * scale * 0.72,
      -scale * 0.018
    );
    tendril.rotation.z = angle;
    tendril.rotation.x = 0.18;
    blossom.add(tendril);
  }
}

function createPetalTexture(definition, color) {
  const cacheKey = `${definition.id}:${color.getHexString()}`;
  if (petalTextureCache.has(cacheKey)) {
    return petalTextureCache.get(cacheKey);
  }

  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 220;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(80, 152, 4, 80, 112, 110);
  const rim = new THREE.Color(definition.rim);

  gradient.addColorStop(0, "rgba(255,246,111,0.92)");
  gradient.addColorStop(0.22, color.clone().offsetHSL(0, 0, 0.12).getStyle());
  gradient.addColorStop(0.7, color.clone().offsetHSL(0.03, -0.12, 0.28).getStyle());
  gradient.addColorStop(0.9, rim.getStyle());
  gradient.addColorStop(1, "rgba(255,255,255,0)");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(80, 206);
  ctx.bezierCurveTo(22, 178, 8, 78, 44, 24);
  ctx.bezierCurveTo(60, -4, 100, -4, 116, 24);
  ctx.bezierCurveTo(152, 78, 138, 178, 80, 206);
  ctx.fill();

  ctx.globalAlpha = 0.48;
  ctx.strokeStyle = "rgba(255, 255, 224, 0.92)";
  ctx.lineWidth = 2.4;
  for (let i = -5; i <= 5; i += 1) {
    ctx.beginPath();
    ctx.moveTo(80, 190);
    ctx.quadraticCurveTo(80 + i * 9, 104, 80 + i * 5, 24);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.65;
  ctx.strokeStyle = `${definition.rim}cc`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(80, 206);
  ctx.bezierCurveTo(22, 178, 8, 78, 44, 24);
  ctx.bezierCurveTo(60, -4, 100, -4, 116, 24);
  ctx.bezierCurveTo(152, 78, 138, 178, 80, 206);
  ctx.stroke();

  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.beginPath();
  ctx.ellipse(64, 70, 8, 22, 0.52, 0, Math.PI * 2);
  ctx.fill();

  if (definition.scallop > 0) {
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = `${definition.rim}aa`;
    for (let i = 0; i < definition.scallop; i += 1) {
      const x = 42 + (i / Math.max(1, definition.scallop - 1)) * 76;
      ctx.beginPath();
      ctx.arc(x, 29 + Math.sin(i) * 7, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  petalTextureCache.set(cacheKey, texture);
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
  const definition = FLOWER_CATALOG[Math.floor(Math.random() * FLOWER_CATALOG.length)];

  return {
    type: definition.id,
    color: definition.color,
    scale: Number((0.092 + Math.random() * 0.05).toFixed(3)),
    lat: Number((THREE.MathUtils.randFloatSpread(1.9)).toFixed(3)),
    lon: Number((Math.random() * Math.PI * 2).toFixed(3)),
    spin: Number((Math.random() * Math.PI * 2).toFixed(3)),
    createdAt: new Date().toISOString()
  };
}

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    return null;
  }

  if (!audioContext) {
    audioContext = new AudioContextClass();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  return audioContext;
}

function playCompletionChime() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;
  const notes = [
    { frequency: 659.25, start: 0, duration: 0.18 },
    { frequency: 830.61, start: 0.16, duration: 0.22 },
    { frequency: 987.77, start: 0.36, duration: 0.34 }
  ];

  notes.forEach((note) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(note.frequency, now + note.start);
    gain.gain.setValueAtTime(0.0001, now + note.start);
    gain.gain.exponentialRampToValueAtTime(0.11, now + note.start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.duration);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now + note.start);
    oscillator.stop(now + note.start + note.duration + 0.04);
  });
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
  playCompletionChime();

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

  getAudioContext();
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
  camera.position.set(0, 0.2, isExpanded ? EXPANDED_CAMERA_DISTANCE : HOME_CAMERA_DISTANCE);
  controls.update();
  requestAnimationFrame(resizeRenderer);
}

startButton.addEventListener("click", startTimer);
pauseButton.addEventListener("click", pauseTimer);
resetButton.addEventListener("click", resetTimer);
manualCompleteButton.addEventListener("click", completeSlot);
expandPlanetButton.addEventListener("click", () => setExpanded(true));
backButton.addEventListener("click", () => setExpanded(false));

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !codexPreview.hidden) {
    closeCodexPreview();
    return;
  }

  if (event.key === "Escape" && isExpanded) {
    setExpanded(false);
  }
});
window.addEventListener("beforeunload", saveState);
window.addEventListener("resize", resizeCodexPreview);
codexPreviewClose.addEventListener("click", closeCodexPreview);

createScene();
render();
