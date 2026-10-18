"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const GRID = 20;
const TICK_MS = 140;
const TICK_MIN = 70;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const safe = path
    .normalize(urlPath)
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^[/\\]+/, "");
  const filePath = path.join(PUBLIC_DIR, safe);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
    });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

const rooms = new Map();
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function genCode() {
  let code;
  do {
    code = "";
    for (let i = 0; i < 4; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
  } while (rooms.has(code));
  return code;
}

function send(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

class Room {
  constructor(code) {
    this.code = code;
    this.clients = [null, null];
    this.timer = null;
    this.reset();
  }

  reset() {
    const c = Math.floor(GRID / 2);
    this.snakes = [
      [[4, c], [3, c], [2, c]],
      [[GRID - 5, c], [GRID - 4, c], [GRID - 3, c]],
    ];
    this.dirs = [[1, 0], [-1, 0]];
    this.pending = [null, null];
    this.scores = [0, 0];
    this.alive = [true, true];
    this.over = false;
    this.winner = null;
    this.speed = TICK_MS;
    this.spawnFood();
  }

  playerCount() {
    return this.clients.filter(Boolean).length;
  }

  join(ws) {
    const pid = this.clients[0] ? 1 : 0;
    this.clients[pid] = ws;
    ws.roomCode = this.code;
    ws.playerId = pid;
    return pid;
  }

  remove(ws) {
    if (ws && this.clients[ws.playerId] === ws) {
      this.clients[ws.playerId] = null;
    }
  }

  broadcast(obj) {
    for (const ws of this.clients) send(ws, obj);
  }

  freeCells() {
    const occupied = new Set();
    for (const body of this.snakes) {
      for (const [x, z] of body) occupied.add(x + "," + z);
    }
    const free = [];
    for (let x = 0; x < GRID; x++) {
      for (let z = 0; z < GRID; z++) {
        if (!occupied.has(x + "," + z)) free.push([x, z]);
      }
    }
    return free;
  }

  spawnFood() {
    const free = this.freeCells();
    this.food = free.length ? free[Math.floor(Math.random() * free.length)] : [0, 0];
  }

  applyInput(pid, dir) {
    const vec = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] }[dir];
    if (!vec || this.over) return;
    const cur = this.dirs[pid];
    if (vec[0] === -cur[0] && vec[1] === -cur[1]) return;
    this.pending[pid] = vec;
  }

  step() {
    for (let p = 0; p < 2; p++) {
      if (this.pending[p]) {
        this.dirs[p] = this.pending[p];
        this.pending[p] = null;
      }
    }

    const nuevas = {};
    for (let p = 0; p < 2; p++) {
      if (!this.alive[p]) continue;
      const [hx, hz] = this.snakes[p][0];
      const [dx, dz] = this.dirs[p];
      nuevas[p] = [hx + dx, hz + dz];
    }

    const muere = [false, false];
    const contiene = (cuerpo, x, z) => cuerpo.some(([cx, cz]) => cx === x && cz === z);

    for (const key of Object.keys(nuevas)) {
      const p = Number(key);
      const [nx, nz] = nuevas[p];
      if (nx < 0 || nx >= GRID || nz < 0 || nz >= GRID) {
        muere[p] = true;
        continue;
      }
      if (contiene(this.snakes[p].slice(0, -1), nx, nz)) {
        muere[p] = true;
        continue;
      }
      const o = 1 - p;
      if (this.alive[o] && contiene(this.snakes[o].slice(0, -1), nx, nz)) {
        muere[p] = true;
      }
    }

    if (nuevas[0] && nuevas[1] && nuevas[0][0] === nuevas[1][0] && nuevas[0][1] === nuevas[1][1]) {
      muere[0] = true;
      muere[1] = true;
    }

    let comio = false;
    for (let p = 0; p < 2; p++) {
      if (!this.alive[p] || !nuevas[p] || muere[p]) continue;
      this.snakes[p].unshift([nuevas[p][0], nuevas[p][1]]);
      if (this.food && nuevas[p][0] === this.food[0] && nuevas[p][1] === this.food[1]) {
        this.scores[p]++;
        comio = true;
      } else {
        this.snakes[p].pop();
      }
    }

    if (comio) {
      const total = this.scores[0] + this.scores[1];
      this.speed = Math.max(TICK_MIN, TICK_MS - total * 4);
      this.spawnFood();
    }

    for (let p = 0; p < 2; p++) if (muere[p]) this.alive[p] = false;

    if (!(this.alive[0] && this.alive[1])) {
      this.over = true;
      if (this.alive[0] && !this.alive[1]) this.winner = 0;
      else if (this.alive[1] && !this.alive[0]) this.winner = 1;
      else this.winner = null;
    }

    return this.snapshot();
  }

  snapshot() {
    return {
      snakes: this.snakes,
      scores: this.scores,
      alive: this.alive,
      food: this.food,
      over: this.over,
      winner: this.winner,
      dirs: this.dirs,
      speed: this.speed,
    };
  }

  start() {
    this.stop();
    this.broadcast({ type: "state", ...this.snapshot() });
    this.timer = setTimeout(() => this.tick(), this.speed);
  }

  tick() {
    const snap = this.step();
    this.broadcast({ type: "state", ...snap });
    if (this.over) {
      this.broadcast({ type: "over", winner: this.winner, scores: this.scores });
      return;
    }
    this.timer = setTimeout(() => this.tick(), this.speed);
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

wss.on("connection", (ws) => {
  ws.roomCode = null;
  ws.playerId = null;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "create") {
      const room = new Room(genCode());
      rooms.set(room.code, room);
      const pid = room.join(ws);
      send(ws, { type: "created", code: room.code, playerId: pid });
      send(ws, { type: "lobby", count: room.playerCount() });
    } else if (msg.type === "join") {
      const code = String(msg.code || "").toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) {
        send(ws, { type: "error", message: "La sala no existe." });
        return;
      }
      if (room.playerCount() >= 2) {
        send(ws, { type: "error", message: "La sala esta llena." });
        return;
      }
      const pid = room.join(ws);
      send(ws, { type: "joined", code: room.code, playerId: pid });
      room.broadcast({ type: "lobby", count: room.playerCount() });
      if (room.playerCount() === 2) room.start();
    } else if (msg.type === "input") {
      const room = rooms.get(ws.roomCode);
      if (room) room.applyInput(ws.playerId, msg.dir);
    } else if (msg.type === "rematch") {
      const room = rooms.get(ws.roomCode);
      if (room && room.over && room.playerCount() === 2) {
        room.reset();
        room.broadcast({ type: "rematch" });
        room.start();
      }
    }
  });

  ws.on("close", () => {
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    const pid = ws.playerId;
    room.remove(ws);
    if (room.playerCount() === 0) {
      room.stop();
      rooms.delete(room.code);
      return;
    }
    if (!room.over) {
      room.over = true;
      room.winner = 1 - pid;
      room.stop();
      room.broadcast({ type: "peer_left", winner: room.winner });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Snake web escuchando en http://localhost:${PORT}`);
});
