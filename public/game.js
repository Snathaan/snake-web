import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const GRID = 20;
const COLORS = [0x46e678, 0x5aaaff];
const ES_TACTIL =
  (navigator.maxTouchPoints || 0) > 0 ||
  "ontouchstart" in window ||
  window.matchMedia("(pointer: coarse)").matches;

const offset = (v) => v - (GRID - 1) / 2;
const worldX = (x) => -offset(x);
const worldZ = (z) => offset(z);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10141c);
scene.fog = new THREE.FogExp2(0x10141c, 0.012);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 30, -26);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enablePan = false;
controls.enableDamping = true;
controls.minPolarAngle = 0.25;
controls.maxPolarAngle = 1.45;
controls.enabled = !ES_TACTIL;
controls.update();

scene.add(new THREE.AmbientLight(0x8899aa, 0.6));
const sun = new THREE.DirectionalLight(0xfff5e6, 2.5);
sun.position.set(12, 30, -10);
sun.castShadow = true;
sun.shadow.mapSize.width = 2048;
sun.shadow.mapSize.height = 2048;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 100;
sun.shadow.camera.left = -15;
sun.shadow.camera.right = 15;
sun.shadow.camera.top = 15;
sun.shadow.camera.bottom = -15;
sun.shadow.bias = -0.0004;
scene.add(sun);

const hemi = new THREE.HemisphereLight(0x87ceeb, 0x362d1f, 0.4);
scene.add(hemi);

function createGroundTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#2a3a2a";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 8000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const shade = Math.random() * 40 - 20;
    const r = Math.max(0, Math.min(255, 42 + shade));
    const g = Math.max(0, Math.min(255, 58 + shade));
    const b = Math.max(0, Math.min(255, 42 + shade));
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x, y, 2, 2);
  }
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const len = Math.random() * 8 + 3;
    const angle = Math.random() * Math.PI;
    const shade = Math.random() * 30 - 15;
    ctx.strokeStyle = `rgb(${50 + shade},${80 + shade},${50 + shade})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(GRID, GRID),
  new THREE.MeshStandardMaterial({
    map: createGroundTexture(),
    roughness: 0.95,
    metalness: 0.0
  })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(GRID, GRID, 0x4a6a4a, 0x3a5a3a);
grid.position.y = 0.011;
scene.add(grid);

const wallMat = new THREE.MeshStandardMaterial({ color: 0x5a7a5a, roughness: 0.7, metalness: 0.1 });
function addWall(w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}
addWall(GRID, 0.7, 0.25, 0, 0.35, -GRID / 2);
addWall(GRID, 0.7, 0.25, 0, 0.35, GRID / 2);
addWall(0.25, 0.7, GRID, -GRID / 2, 0.35, 0);
addWall(0.25, 0.7, GRID, GRID / 2, 0.35, 0);

const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
const pools = [[], []];

const foodGeo = new THREE.SphereGeometry(0.35, 24, 18);
foodGeo.scale(1, 0.85, 1);
const foodMat = new THREE.MeshPhysicalMaterial({
  color: 0xff6a00,
  roughness: 0.25,
  metalness: 0.1,
  transmission: 0.3,
  thickness: 0.5,
  emissive: 0x331100,
  emissiveIntensity: 0.4
});
const foodMesh = new THREE.Mesh(foodGeo, foodMat);
foodMesh.position.y = 0.5;
foodMesh.visible = false;
foodMesh.castShadow = true;
scene.add(foodMesh);

const baseColors = COLORS.map((c) => new THREE.Color(c));
const deadColor = new THREE.Color(0x6e282d);

function renderSnake(p, cells, alive) {
  const pool = pools[p];
  while (pool.length < cells.length) {
    const mesh = new THREE.Mesh(cubeGeo, new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.15,
      clearcoat: 0.6,
      clearcoatRoughness: 0.3
    }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    pool.push(mesh);
  }
  const base = baseColors[p];
  for (let i = 0; i < cells.length; i++) {
    const mesh = pool[i];
    mesh.visible = true;
    const target = new THREE.Vector3(worldX(cells[i][0]), 0.5, worldZ(cells[i][1]));
    if (!mesh.userData.target) mesh.position.copy(target);
    mesh.userData.target = target;

    let scale;
    let color;
    if (!alive) {
      scale = 0.72;
      color = deadColor;
    } else if (i === 0) {
      scale = 0.98;
      color = base;
      mesh.material.roughness = 0.2;
      mesh.material.clearcoat = 0.8;
    } else {
      const f = 1 - 0.35 * (i / Math.max(1, cells.length - 1));
      scale = 0.86;
      color = base.clone().multiplyScalar(f);
      mesh.material.roughness = 0.4;
      mesh.material.clearcoat = 0.5;
    }
    mesh.scale.setScalar(scale);
    mesh.material.color.copy(color);
  }
  for (let i = cells.length; i < pool.length; i++) pool[i].visible = false;
}

function renderState(state) {
  const now = performance.now();

  if (myPlayerId === null) {
    renderSnake(0, state.snakes[0], state.alive[0]);
    renderSnake(1, state.snakes[1], state.alive[1]);
  } else {
    const me = myPlayerId;
    const rival = 1 - me;

    if (rivalPrev && rivalCurr && state.snakes[rival]) {
      rivalPrev = rivalCurr;
      rivalPrevTime = rivalCurrTime;
      rivalCurr = state.snakes[rival].map((c) => [c[0], c[1]]);
      rivalCurrTime = now;
    } else if (state.snakes[rival]) {
      rivalPrev = state.snakes[rival].map((c) => [c[0], c[1]]);
      rivalCurr = state.snakes[rival].map((c) => [c[0], c[1]]);
      rivalPrevTime = now;
      rivalCurrTime = now;
    }

    const interp = getInterpolatedRival(now, state.alive[rival]);
    if (interp) {
      renderSnake(rival, interp.cells, interp.alive);
    } else {
      renderSnake(rival, state.snakes[rival], state.alive[rival]);
    }

    if (pred.active && pred.snake) {
      renderSnake(me, pred.snake, true);
    } else {
      renderSnake(me, state.snakes[me], state.alive[me]);
    }
  }

  if (state.food) {
    foodMesh.visible = true;
    foodMesh.userData.target = new THREE.Vector3(worldX(state.food[0]), 0.5, worldZ(state.food[1]));
  } else {
    foodMesh.visible = false;
  }
}

const DIR_VEC = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] };

const INTERP_DELAY = 100;
let rivalPrev = null;
let rivalCurr = null;
let rivalPrevTime = 0;
let rivalCurrTime = 0;

function lerpCell(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function interpolateSnake(prevCells, currCells, t) {
  const len = Math.max(prevCells.length, currCells.length);
  const result = [];
  for (let i = 0; i < len; i++) {
    const prev = prevCells[Math.min(i, prevCells.length - 1)];
    const curr = currCells[Math.min(i, currCells.length - 1)];
    result.push(lerpCell(prev, curr, t));
  }
  return result;
}

function getInterpolatedRival(now, alive) {
  if (!rivalPrev || !rivalCurr) return null;
  const renderTime = now - INTERP_DELAY;
  if (renderTime <= rivalPrevTime) return { cells: rivalPrev, alive };
  if (renderTime >= rivalCurrTime) return { cells: rivalCurr, alive };
  const t = (renderTime - rivalPrevTime) / (rivalCurrTime - rivalPrevTime);
  return { cells: interpolateSnake(rivalPrev, rivalCurr, t), alive };
}

function stopTick() {
  if (tickTimer) {
    clearTimeout(tickTimer);
    tickTimer = null;
  }
}

function restartTick() {
  stopTick();
  if (!inGame || !pred.active) return;
  tickTimer = setTimeout(localTick, tickMs);
}

function localTick() {
  tickTimer = null;
  if (!inGame || !pred.active || !pred.snake) return;

  if (pred.pending) {
    pred.dir = pred.pending;
    pred.pending = null;
  }

  const [dx, dz] = pred.dir;
  const [hx, hz] = pred.snake[0];
  const nx = hx + dx;
  const nz = hz + dz;

  if (nx >= 0 && nx < GRID && nz >= 0 && nz < GRID) {
    pred.snake.unshift([nx, nz]);
    const food = serverState && serverState.food;
    const ate = food && nx === food[0] && nz === food[1];
    if (!ate) pred.snake.pop();
  }

  restartTick();
}

function seedPrediction(state) {
  pred.snake = state.snakes[myPlayerId].map((c) => [c[0], c[1]]);
  pred.dir = (state.dirs && state.dirs[myPlayerId]) || [1, 0];
  pred.pending = null;
  pred.active = true;
  restartTick();
}

function reconcile(state) {
  serverState = state;
  if (state.speed) tickMs = state.speed;
  if (myPlayerId === null) return;

  if (state.over || !state.alive[myPlayerId]) {
    pred.active = false;
    pred.pending = null;
    stopTick();
    return;
  }

  if (!pred.active || !pred.snake) {
    seedPrediction(state);
    return;
  }

  const mine = state.snakes[myPlayerId];
  const head = pred.snake[0];
  const real = mine[0];
  const dist = Math.abs(head[0] - real[0]) + Math.abs(head[1] - real[1]);
  if (dist >= 4 || Math.abs(pred.snake.length - mine.length) >= 3) {
    pred.snake = mine.map((c) => [c[0], c[1]]);
    pred.dir = (state.dirs && state.dirs[myPlayerId]) || pred.dir;
    restartTick();
  } else if (dist > 0 || pred.snake.length !== mine.length) {
    pred.snake = mine.map((c) => [c[0], c[1]]);
    pred.dir = (state.dirs && state.dirs[myPlayerId]) || pred.dir;
  }
}

let lastFrameTime = performance.now();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;

  const lerpFactor = 1 - Math.pow(0.001, dt);

  for (const pool of pools) {
    for (const mesh of pool) {
      if (mesh.visible && mesh.userData.target) mesh.position.lerp(mesh.userData.target, lerpFactor);
    }
  }
  if (foodMesh.visible && foodMesh.userData.target) {
    foodMesh.position.lerp(foodMesh.userData.target, lerpFactor * 0.8);
    foodMesh.position.y = 0.5 + Math.abs(Math.sin(now / 250)) * 0.25;
    foodMesh.rotation.y += dt * 2.5;
  }
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const overlay = document.getElementById("overlay");
const menu = document.getElementById("menu");
const estado = document.getElementById("estado");
const salaBox = document.getElementById("sala");
const codigoTxt = document.getElementById("codigo-txt");
const codigoInput = document.getElementById("codigo");
const revanchaBtn = document.getElementById("revancha");
const hud = document.getElementById("hud");
const puntajes = document.getElementById("puntajes");

let ws = null;
let myPlayerId = null;
let inGame = false;

let serverState = null;
const pred = { snake: null, dir: [1, 0], pending: null, active: false };
let tickTimer = null;
let tickMs = 140;

function setEstado(text) {
  estado.textContent = text;
}

function showCode(code) {
  menu.style.display = "none";
  salaBox.style.display = "block";
  codigoTxt.textContent = code;
}

function startGameUI() {
  inGame = true;
  overlay.style.display = "none";
  hud.style.display = "block";
  revanchaBtn.style.display = "none";
}

function updateScores(state) {
  const mine = state.scores[myPlayerId] || 0;
  const rival = state.scores[1 - myPlayerId] || 0;
  puntajes.textContent = `Tu: ${mine}   |   Rival: ${rival}`;
}

function showResult(winner, mensaje) {
  inGame = false;
  hud.style.display = "none";
  overlay.style.display = "flex";
  menu.style.display = "none";
  salaBox.style.display = "block";

  let texto;
  if (mensaje) texto = mensaje;
  else if (winner === null || winner === undefined) texto = "EMPATE";
  else if (winner === myPlayerId) texto = "GANASTE";
  else texto = "PERDISTE";
  setEstado(texto);

  revanchaBtn.style.display = myPlayerId === 0 ? "block" : "none";
}

function joinRoom(code) {
  if (ws && ws.readyState === WebSocket.OPEN && code) {
    ws.send(JSON.stringify({ type: "join", code }));
  }
}

function handle(msg) {
  switch (msg.type) {
    case "created":
      myPlayerId = msg.playerId;
      showCode(msg.code);
      setEstado("Esperando jugador... (1/2)");
      break;
    case "joined":
      myPlayerId = msg.playerId;
      showCode(msg.code);
      setEstado("Conectado. Esperando al host...");
      break;
    case "lobby":
      if (msg.count >= 2) setEstado("Jugadores: 2/2");
      else if (salaBox.style.display === "block") setEstado("Esperando jugador... (1/2)");
      break;
    case "state":
      if (!inGame) startGameUI();
      reconcile(msg);
      renderState(msg);
      updateScores(msg);
      break;
    case "over":
      pred.active = false;
      stopTick();
      showResult(msg.winner);
      break;
    case "rematch":
      pred.active = false;
      startGameUI();
      break;
    case "peer_left":
      pred.active = false;
      stopTick();
      showResult(msg.winner, "El rival salio de la partida.");
      break;
    case "error":
      setEstado(msg.message);
      break;
    default:
      break;
  }
}

function resolveWsUrl() {
  const fromQuery = new URLSearchParams(location.search).get("server");
  if (fromQuery) return fromQuery;
  if (window.SNAKE_WS && window.SNAKE_WS.trim()) return window.SNAKE_WS.trim();
  const proto = location.protocol === "https:" ? "wss://" : "ws://";
  return proto + location.host;
}

function connect() {
  ws = new WebSocket(resolveWsUrl());

  ws.addEventListener("open", () => {
    const room = new URLSearchParams(location.search).get("room");
    if (room) {
      codigoInput.value = room.toUpperCase();
      joinRoom(room.toUpperCase());
    }
  });

  ws.addEventListener("message", (event) => handle(JSON.parse(event.data)));

  ws.addEventListener("close", () => {
    setEstado("Desconectado del servidor.");
  });
}

document.getElementById("crear").addEventListener("click", () => {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "create" }));
});

document.getElementById("unir").addEventListener("click", () => {
  joinRoom(codigoInput.value.trim().toUpperCase());
});

codigoInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") joinRoom(codigoInput.value.trim().toUpperCase());
});

revanchaBtn.addEventListener("click", () => {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "rematch" }));
  revanchaBtn.style.display = "none";
  setEstado("Esperando al rival...");
});

const KEYMAP = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
};

function sendDirection(dir) {
  if (!inGame) return;
  const vec = DIR_VEC[dir];
  if (vec && pred.active) {
    const cur = pred.dir;
    if (!(vec[0] === -cur[0] && vec[1] === -cur[1])) {
      pred.pending = vec;
    }
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "input", dir }));
  }
}

window.addEventListener("keydown", (event) => {
  const dir = KEYMAP[event.key] || KEYMAP[event.key.toLowerCase()];
  if (!dir) return;
  event.preventDefault();
  sendDirection(dir);
});

const controlesTactiles = document.getElementById("controles-tactiles");

if (ES_TACTIL) {
  controlesTactiles.style.display = "grid";
}

for (const boton of controlesTactiles.querySelectorAll("button")) {
  const dir = boton.dataset.dir;
  const manejar = (event) => {
    event.preventDefault();
    sendDirection(dir);
  };
  boton.addEventListener("touchstart", manejar, { passive: false });
  boton.addEventListener("mousedown", manejar);
}

let inicioToque = null;
const UMBRAL = 24;
const lienzo = renderer.domElement;

lienzo.addEventListener(
  "touchstart",
  (event) => {
    if (event.touches.length !== 1) return;
    const t = event.touches[0];
    inicioToque = { x: t.clientX, y: t.clientY };
  },
  { passive: true }
);

lienzo.addEventListener(
  "touchend",
  (event) => {
    if (!inicioToque) return;
    const t = event.changedTouches[0];
    const dx = t.clientX - inicioToque.x;
    const dy = t.clientY - inicioToque.y;
    inicioToque = null;
    if (Math.hypot(dx, dy) < UMBRAL) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      sendDirection(dx > 0 ? "right" : "left");
    } else {
      sendDirection(dy > 0 ? "down" : "up");
    }
  },
  { passive: true }
);

connect();
