import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

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

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 30, -26);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enablePan = false;
controls.enableDamping = true;
controls.minPolarAngle = 0.25;
controls.maxPolarAngle = 1.45;
controls.enabled = !ES_TACTIL;
controls.update();

scene.add(new THREE.AmbientLight(0x8899aa, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(12, 30, -10);
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(GRID, GRID),
  new THREE.MeshStandardMaterial({ color: 0x1c222c, roughness: 1 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const grid = new THREE.GridHelper(GRID, GRID, 0x465569, 0x465569);
grid.position.y = 0.011;
scene.add(grid);

const wallMat = new THREE.MeshStandardMaterial({ color: 0x506e96, roughness: 0.8 });
function addWall(w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  mesh.position.set(x, y, z);
  scene.add(mesh);
}
addWall(GRID, 0.7, 0.25, 0, 0.35, -GRID / 2);
addWall(GRID, 0.7, 0.25, 0, 0.35, GRID / 2);
addWall(0.25, 0.7, GRID, -GRID / 2, 0.35, 0);
addWall(0.25, 0.7, GRID, GRID / 2, 0.35, 0);

const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
const pools = [[], []];

const foodMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.35, 16, 12),
  new THREE.MeshStandardMaterial({ color: 0xff8a00, emissive: 0x552200 })
);
foodMesh.position.y = 0.5;
foodMesh.visible = false;
scene.add(foodMesh);

const baseColors = COLORS.map((c) => new THREE.Color(c));
const deadColor = new THREE.Color(0x6e282d);

function renderState(state) {
  for (let p = 0; p < 2; p++) {
    const cells = state.snakes[p];
    const pool = pools[p];
    while (pool.length < cells.length) {
      const mesh = new THREE.Mesh(cubeGeo, new THREE.MeshStandardMaterial({ color: 0xffffff }));
      scene.add(mesh);
      pool.push(mesh);
    }
    const base = baseColors[p];
    const alive = state.alive[p];
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
      } else {
        const f = 1 - 0.45 * (i / Math.max(1, cells.length - 1));
        scale = 0.86;
        color = base.clone().multiplyScalar(f);
      }
      mesh.scale.setScalar(scale);
      mesh.material.color.copy(color);
    }
    for (let i = cells.length; i < pool.length; i++) pool[i].visible = false;
  }

  if (state.food) {
    foodMesh.visible = true;
    foodMesh.userData.target = new THREE.Vector3(worldX(state.food[0]), 0.5, worldZ(state.food[1]));
  } else {
    foodMesh.visible = false;
  }
}

function animate() {
  requestAnimationFrame(animate);
  for (const pool of pools) {
    for (const mesh of pool) {
      if (mesh.visible && mesh.userData.target) mesh.position.lerp(mesh.userData.target, 0.3);
    }
  }
  if (foodMesh.visible && foodMesh.userData.target) {
    foodMesh.position.lerp(foodMesh.userData.target, 0.25);
    foodMesh.position.y = 0.5 + Math.abs(Math.sin(performance.now() / 250)) * 0.25;
    foodMesh.rotation.y += 0.04;
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
      renderState(msg);
      updateScores(msg);
      break;
    case "over":
      showResult(msg.winner);
      break;
    case "rematch":
      startGameUI();
      break;
    case "peer_left":
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
