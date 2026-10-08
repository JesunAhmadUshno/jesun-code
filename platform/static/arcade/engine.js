"use strict";
/* STACKFALL engine v1. Plain JS, no dependencies.
   Auto-boots on DOMContentLoaded from the canvas data attributes:
   <canvas id="game" data-data-url="/arcade/data" data-logged-in="true">
   Determinism: dungeon gen and AI layout decisions use mulberry32 only.
   No Math.random or Date.now in generation paths. */
(function () {

var TILE = 24, GW = 40, GH = 25, CW = 960, CH = 600;
var WINDUP_TIME = 1.0;

/* ---------- seeded RNG ---------- */
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- default data (used when /arcade/data is unreachable) ----------
   Mirrors the GET /arcade/data contract key for key (SPEC.md /
   platform/arcade/content.jc); the engine consumes the server schema,
   so the fallback uses the same one. */
function defaultMissions() {
  return [
    {id: "cold_boot", layer: 1, title: "Cold Boot",
     brief: "Reach the stairs down.",
     objective: {kind: "reach_stairs"},
     reward: {gold: 50}},
    {id: "defragment", layer: 2, title: "Defragment",
     brief: "Destroy 3 corruption nodes.",
     objective: {kind: "destroy", target: "corruption_node", count: 3},
     reward: {weapon: "w_iron"}},
    {id: "clear_bus", layer: 3, title: "Clear the Bus",
     brief: "Defeat 12 hostiles.",
     objective: {kind: "kill", target: "hostile", count: 12},
     reward: {gold: 120}},
    {id: "redacted", layer: 4, title: "Redacted",
     brief: "Collect 3 registry keys, then reach the stairs.",
     objective: {kind: "collect", target: "registry_key", count: 3, then: "reach_stairs"},
     reward: {max_hp: 25}},
    {id: "kernel_panic", layer: 5, title: "Kernel Panic",
     brief: "Defeat Warden Panic.",
     objective: {kind: "boss", target: "panic"},
     reward: {weapon: "w_kernel"}},
    {id: "etched_silicon", layer: 6, title: "Etched in Silicon",
     brief: "Reboot 4 beacons while waves spawn.",
     objective: {kind: "reboot", target: "beacon", count: 4},
     reward: {armor: "a_warded"}},
    {id: "halt_catch_fire", layer: 7, title: "Halt and Catch Fire",
     brief: "Defeat THE WATCHDOG.",
     objective: {kind: "boss", target: "watchdog"},
     reward: {victory: true}},
    {id: "pest_control", layer: 0, title: "Pest Control", giver: "byte", side: true,
     brief: "Kill 8 Null Pointers for Byte.",
     objective: {kind: "kill", target: "nullpointer", count: 8},
     reward: {gold: 80}},
    {id: "lost_pages", layer: 0, title: "Lost Pages", giver: "ada", side: true,
     brief: "Collect 5 data shards (enemy drops) for Ada.",
     objective: {kind: "collect", target: "data_shard", count: 5},
     reward: {max_hp: 15}},
    {id: "field_medicine", layer: 0, title: "Field Medicine", giver: "medic", side: true,
     brief: "Bring 3 ichor vials (Segfault drops) to Medic Cache.",
     objective: {kind: "collect", target: "ichor_vial", count: 3},
     reward: {potions: 2, gold: 60}}
  ];
}

function defaultData() {
  return {
    hero: {hp: 100, atk: 12, def: 2, potions: 3, potion_heal: 40},
    layers: [
      {depth: 1, name: "The Cache", floor: "#0b0b0d", wall: "#2a2a2e", accent: "#ffb347",
       warden: {id: "prefetch", name: "Prefetch", hp: 220, atk: 16, def: 2, patterns: ["charge", "summon"]},
       enemies: ["nullpointer", "dangling_thread"], elite_from: false},
      {depth: 2, name: "The Heap", floor: "#0c0f0e", wall: "#2a3230", accent: "#2dd4bf",
       warden: {id: "fragmentor", name: "Fragmentor", hp: 320, atk: 20, def: 3, patterns: ["slam", "scatter"]},
       enemies: ["nullpointer", "memory_leak", "segfault"], elite_from: false},
      {depth: 3, name: "The Bus", floor: "#100b0b", wall: "#332a2a", accent: "#ff3b30",
       warden: {id: "arbiter", name: "Arbiter", hp: 420, atk: 24, def: 3, patterns: ["lane_dash", "rotating_shots"]},
       enemies: ["dangling_thread", "race_condition", "nullpointer"], elite_from: false},
      {depth: 4, name: "The Registry", floor: "#0b0e12", wall: "#2a2f36", accent: "#5aa9ff",
       warden: {id: "redactor", name: "Redactor", hp: 540, atk: 28, def: 4, patterns: ["blackout", "heavy_melee"]},
       enemies: ["race_condition", "deadlock", "bit_rotter"], elite_from: true},
      {depth: 5, name: "The Kernel", floor: "#0e0b12", wall: "#2f2a36", accent: "#a855f7",
       warden: {id: "panic", name: "Panic", hp: 700, atk: 34, def: 5, patterns: ["enrage", "double_slam"]},
       enemies: ["segfault", "deadlock", "memory_leak"], elite_from: true},
      {depth: 6, name: "The Silicon", floor: "#0d0c08", wall: "#333026", accent: "#e8b34b",
       warden: {id: "lithographer", name: "Lithographer", hp: 880, atk: 40, def: 6, patterns: ["etch_lines", "adds"]},
       enemies: ["deadlock", "bit_rotter", "race_condition"], elite_from: true},
      {depth: 7, name: "The Core", floor: "#050505", wall: "#1f1f22", accent: "#ffffff",
       warden: {id: "watchdog", name: "THE WATCHDOG", hp: 1200, atk: 48, def: 8,
                patterns: ["charge", "slam", "sweep", "all_patterns"]},
       enemies: ["memory_leak", "deadlock", "bit_rotter", "segfault"], elite_from: true}
    ],
    missions: defaultMissions(),
    npcs: [
      {id: "byte", kind: "friendly", name: "Byte", role: "Merchant",
       dialogue: ["Welcome to the last shop before nowhere.",
                  "I find my own stock, thanks. No questions asked.",
                  "Pest problem? Eight Null Pointers, 80 gold. You know where to find me.",
                  "Everything here fell off a truck. A very tall truck."],
       shop: [{id: "potion", name: "Patch potion", cost: 25},
               {id: "w_iron", name: "Iron Dagger", cost: 150, atk: 16},
               {id: "w_bus", name: "Bus Blade", cost: 320, atk: 22},
               {id: "a_reinforced", name: "Reinforced Wrap", cost: 200, def: 2}]},
      {id: "ada", kind: "friendly", name: "Ada", role: "Archivist",
       dialogue: ["The old manual said \"down is the only way\" and the manual was right.",
                  "I keep the last library. Bring me five data shards and I will tell you what the Stack used to be.",
                  "The Cache was warm once. Prefetch remembers. Ask it with your blade.",
                  "They say the Watchdog used to be a Runner. That is all I will say."],
       shop: []},
      {id: "medic", kind: "friendly", name: "Medic Cache", role: "Field Medic",
       dialogue: ["You look like a crash report with legs. Forty gold and I put you back together.",
                  "Segfaults carry ichor vials. Three of them and I will owe you potions.",
                  "Full repair. No questions, no receipts."],
       shop: [{id: "heal", name: "Full repair", cost: 40},
              {id: "hp_up", name: "Max HP +10", cost: 120}]},
      {id: "wanderer", kind: "neutral", name: "Wanderer", role: "Drifter",
       dialogue: ["They say the Watchdog used to be a Runner.",
                  "Do not trust the quiet rooms.",
                  "Down is the only direction that still works."],
       shop: []}
    ],
    enemies: [
      {id: "nullpointer", name: "Null Pointer", hp: 20, atk: 6, def: 0, speed: "slow", behavior: "chase", gold: [5, 15]},
      {id: "dangling_thread", name: "Dangling Thread", hp: 14, atk: 5, def: 0, speed: "fast", behavior: "skirmish", gold: [4, 12]},
      {id: "segfault", name: "Segfault", hp: 45, atk: 12, def: 2, speed: "slow", behavior: "charge", gold: [10, 25]},
      {id: "race_condition", name: "Race Condition", hp: 26, atk: 10, def: 0, speed: "fast", behavior: "ambush", gold: [8, 20]},
      {id: "memory_leak", name: "Memory Leak", hp: 30, atk: 8, def: 1, speed: "slow", behavior: "grow", gold: [8, 22]},
      {id: "deadlock", name: "Deadlock", hp: 70, atk: 10, def: 5, speed: "very slow", behavior: "block", gold: [15, 35]},
      {id: "bit_rotter", name: "Bit Rotter", hp: 24, atk: 7, def: 0, speed: "slow", behavior: "ranged", gold: [8, 18]}
    ],
    loot: {weapons: [{id: "w_stick", name: "Stick", atk: 12},
                     {id: "w_iron", name: "Iron Dagger", atk: 16},
                     {id: "w_bus", name: "Bus Blade", atk: 22},
                     {id: "w_kernel", name: "Kernel Edge", atk: 30},
                     {id: "w_fang", name: "Watchdog Fang", atk: 40}],
           armor: [{id: "a_cloth", name: "Cloth Wrap", def: 1},
                   {id: "a_reinforced", name: "Reinforced Wrap", def: 2},
                   {id: "a_warded", name: "Warded Plating", def: 3}]},
    dialogue: {
      intro: ["They built me from a stack trace and a prayer.",
              "The machine is eating itself, layer by layer, and the Watchdog has decided the cure is deletion: all of us, clean, at midnight.",
              "My orders are simple. Go down. Wake the beacons. Find the keys. Put the Kernel back in its chair.",
              "Then stand in front of the Watchdog and tell it, in person, that we are not done yet."],
      death: ["The Runner was garbage collected. Another process will try.",
              "Signal lost in the dark between layers.",
              "The stack trace ends here. For now."],
      victory: ["The Watchdog halted. The Stack sleeps instead of dying.",
                "Clean halt issued. Somewhere, a fan spins down.",
                "You told it we are not done yet. It listened."]
    }
  };
}

var SPEEDS = {"very slow": 38, slow: 62, medium: 100, fast: 150};
var HERO_SPEED = 200; /* 1 tile per 120ms */
var ATTACK_CD = 0.35, IFRAMES = 0.5, TOUCH_CD = 0.8;

/* Server data carries no drop table or flee flags; the design doc does:
   Segfaults drop ichor vials, and the fast skirmishers break off at low
   HP. Kept engine-side so both the live payload and the fallback play
   the same. */
var DROPS = {segfault: "ichor"};
function enemyFlees(def) {
  if (def.flees) return true;
  return def.behavior === "skirmish" || def.behavior === "ambush" ||
         def.behavior === "dart" || def.behavior === "zigzag";
}

/* ---------- combat math (pure) ---------- */
function damage(atk, def) { return Math.max(1, atk - def); }
function scaleStat(base, depth) {
  return Math.round(base * Math.pow(1.15, depth - 1));
}
function eliteStats(hp, atk) {
  return {hp: Math.round(hp * 2.5), atk: Math.round(atk * 2.5)};
}

/* ---------- dungeon generation (pure, seeded) ---------- */
function tileIndex(tx, ty) { return ty * GW + tx; }

function carveH(tiles, x0, x1, y) {
  var a = Math.min(x0, x1), b = Math.max(x0, x1), x;
  for (x = a; x <= b; x++) tiles[tileIndex(x, y)] = 1;
}
function carveV(tiles, y0, y1, x) {
  var a = Math.min(y0, y1), b = Math.max(y0, y1), y;
  for (y = a; y <= b; y++) tiles[tileIndex(x, y)] = 1;
}
function overlaps(r, rooms) {
  for (var i = 0; i < rooms.length; i++) {
    var o = rooms[i];
    if (r.x < o.x + o.w + 1 && r.x + r.w + 1 > o.x &&
        r.y < o.y + o.h + 1 && r.y + r.h + 1 > o.y) return true;
  }
  return false;
}
function roomCenter(r) {
  return {tx: r.x + Math.floor(r.w / 2), ty: r.y + Math.floor(r.h / 2)};
}
function connectRooms(tiles, a, b, rng) {
  var ca = roomCenter(a), cb = roomCenter(b);
  if (rng() < 0.5) { carveH(tiles, ca.tx, cb.tx, ca.ty); carveV(tiles, ca.ty, cb.ty, cb.tx); }
  else { carveV(tiles, ca.ty, cb.ty, ca.tx); carveH(tiles, ca.tx, cb.tx, cb.ty); }
}
function randomTileInRoom(r, rng) {
  return {tx: r.x + Math.floor(rng() * r.w), ty: r.y + Math.floor(rng() * r.h)};
}

function genFloor(seed, depth, data) {
  var rng = mulberry32(seed);
  var tiles = new Array(GW * GH);
  var i, x, y;
  for (i = 0; i < tiles.length; i++) tiles[i] = 0;
  var rooms = [];
  var target = 8 + Math.floor(rng() * 7); /* 8 to 14 rooms */
  var tries = 0;
  while (rooms.length < target && tries < 2000) {
    tries++;
    var w = 3 + Math.floor(rng() * 6), h = 3 + Math.floor(rng() * 5);
    var rx = 1 + Math.floor(rng() * (GW - w - 2));
    var ry = 1 + Math.floor(rng() * (GH - h - 2));
    var r = {x: rx, y: ry, w: w, h: h};
    if (overlaps(r, rooms)) continue;
    rooms.push(r);
    for (y = ry; y < ry + h; y++)
      for (x = rx; x < rx + w; x++) tiles[tileIndex(x, y)] = 1;
  }
  for (i = 0; i + 1 < rooms.length; i++) connectRooms(tiles, rooms[i], rooms[i + 1], rng);
  for (i = 0; i < 2; i++) { /* 2 extra loops */
    var a = Math.floor(rng() * rooms.length), b = Math.floor(rng() * rooms.length);
    if (a !== b) connectRooms(tiles, rooms[a], rooms[b], rng);
  }
  var spawnC = roomCenter(rooms[0]);
  var spawn = {x: (spawnC.tx + 0.5) * TILE, y: (spawnC.ty + 0.5) * TILE, tx: spawnC.tx, ty: spawnC.ty};
  var far = 0, farD = -1;
  for (i = 1; i < rooms.length; i++) {
    var c = roomCenter(rooms[i]);
    var d = (c.tx - spawn.tx) * (c.tx - spawn.tx) + (c.ty - spawn.ty) * (c.ty - spawn.ty);
    if (d > farD) { farD = d; far = i; }
  }
  var stairsC = roomCenter(rooms[far]);
  var stairs = {tx: stairsC.tx, ty: stairsC.ty, x: (stairsC.tx + 0.5) * TILE, y: (stairsC.ty + 0.5) * TILE};
  var arenaIdx = -1, arenaArea = -1;
  for (i = 0; i < rooms.length; i++) {
    if (i === far) continue;
    var area = rooms[i].w * rooms[i].h;
    if (area > arenaArea) { arenaArea = area; arenaIdx = i; }
  }
  if (arenaIdx < 0) arenaIdx = far === 0 ? 1 : 0;

  var layer = data.layers[depth - 1] || data.layers[0];
  var enemyDefs = {};
  for (i = 0; i < data.enemies.length; i++) enemyDefs[data.enemies[i].id] = data.enemies[i];
  var enemies = [], npcs = [], items = [], nodes = [], keys = [], beacons = [];

  function spawnEnemy(typeId, tx, ty) {
    var def = enemyDefs[typeId];
    var hp = scaleStat(def.hp, depth), atk = scaleStat(def.atk, depth);
    var elite = depth >= 4 && rng() < 0.18;
    if (elite) { var es = eliteStats(hp, atk); hp = es.hp; atk = es.atk; }
    var gold = def.gold[0] + Math.floor(rng() * (def.gold[1] - def.gold[0] + 1));
    if (elite) gold *= 3;
    enemies.push({
      id: typeId, name: def.name, elite: elite,
      x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE,
      hp: hp, maxhp: hp, atk: atk, def: def.def,
      speed: SPEEDS[def.speed] || 62, behavior: def.behavior,
      sight: 7 * TILE, attackRange: 1.2 * TILE,
      state: "wander", atkCd: 0, touchCd: 0, iframes: 0,
      wx: 0, wy: 0, wanderT: 0, spitT: 1 + rng() * 2,
      growT: 0, drops: def.drops || DROPS[typeId] || null,
      fleeAt: enemyFlees(def) ? Math.ceil(hp * 0.25) : 0,
      gold: gold, r: elite ? 13 : 10
    });
  }

  for (i = 1; i < rooms.length; i++) {
    var count = 2 + Math.floor(depth / 2);
    if (i === far) count = Math.max(1, count - 1);
    for (var k = 0; k < count; k++) {
      var t = randomTileInRoom(rooms[i], rng);
      var typeId = layer.enemies[Math.floor(rng() * layer.enemies.length)];
      spawnEnemy(typeId, t.tx, t.ty);
    }
  }

  function spawnNpc(defId, roomIdx) {
    var def = null;
    for (var j = 0; j < data.npcs.length; j++) if (data.npcs[j].id === defId) def = data.npcs[j];
    if (!def) return;
    var t = randomTileInRoom(rooms[roomIdx % rooms.length], rng);
    npcs.push({id: def.id, name: def.name, role: def.role, kind: "friendly",
      x: (t.tx + 0.5) * TILE, y: (t.ty + 0.5) * TILE,
      state: "idle", wx: 0, wy: 0, wanderT: 0, line: 0, r: 10});
  }
  spawnNpc("byte", 0);
  if (rooms.length > 1) spawnNpc("ada", 1);
  if (rooms.length > 2) spawnNpc("medic", 2);
  /* Wanderers come from the NPC table (the server ships no
     wanderer_lines key); the wanderer entry carries the dialogue. */
  var wandererDef = null;
  for (i = 0; i < data.npcs.length; i++)
    if (data.npcs[i].id === "wanderer") wandererDef = data.npcs[i];
  var wandererName = wandererDef ? wandererDef.name : "Wanderer";
  var wandererRole = wandererDef ? wandererDef.role : "Drifter";
  var wandererLineCount = wandererDef ? wandererDef.dialogue.length : 1;
  for (i = 0; i < 2; i++) {
    var wr = rooms[Math.floor(rng() * rooms.length)];
    var wt = randomTileInRoom(wr, rng);
    npcs.push({id: "wanderer" + i, name: wandererName, role: wandererRole, kind: "friendly",
      x: (wt.tx + 0.5) * TILE, y: (wt.ty + 0.5) * TILE,
      state: "wander", wx: 0, wy: 0, wanderT: 0,
      line: Math.floor(rng() * wandererLineCount), r: 9});
  }

  function dropItem(kind, ref, roomIdx) {
    var t = randomTileInRoom(rooms[roomIdx % rooms.length], rng);
    items.push({kind: kind, ref: ref,
      x: (t.tx + 0.5) * TILE, y: (t.ty + 0.5) * TILE, r: 7});
  }
  var goldPiles = 2 + Math.floor(rng() * 3);
  for (i = 0; i < goldPiles; i++)
    dropItem("gold", 5 + Math.floor(rng() * 36) * depth, Math.floor(rng() * rooms.length));
  if (rng() < 0.7) dropItem("potion", null, Math.floor(rng() * rooms.length));
  if (depth >= 2 && rng() < 0.5)
    dropItem("weapon", data.loot.weapons[Math.min(depth - 1, data.loot.weapons.length - 1)].id,
             Math.floor(rng() * rooms.length));
  if (depth >= 3 && rng() < 0.4)
    dropItem("armor", data.loot.armor[Math.min(depth - 2, data.loot.armor.length - 1)].id,
             Math.floor(rng() * rooms.length));

  if (depth === 2) {
    for (i = 0; i < 3; i++) {
      var nt = randomTileInRoom(rooms[(i + 1) % rooms.length], rng);
      nodes.push({x: (nt.tx + 0.5) * TILE, y: (nt.ty + 0.5) * TILE, hp: 30, r: 11});
    }
  }
  if (depth === 4) {
    for (i = 0; i < 3; i++) {
      var kt = randomTileInRoom(rooms[(rooms.length - 1 - i + rooms.length) % rooms.length], rng);
      keys.push({x: (kt.tx + 0.5) * TILE, y: (kt.ty + 0.5) * TILE, taken: false, r: 7});
    }
  }
  if (depth === 6) {
    for (i = 0; i < 4; i++) {
      var bt = randomTileInRoom(rooms[(i * 2 + 1) % rooms.length], rng);
      beacons.push({x: (bt.tx + 0.5) * TILE, y: (bt.ty + 0.5) * TILE, on: false, r: 10});
    }
  }

  return {seed: seed, depth: depth, tiles: tiles, rooms: rooms, spawn: spawn,
    stairs: stairs, stairsRoom: far, arenaRoom: arenaIdx,
    enemies: enemies, npcs: npcs, items: items, nodes: nodes, keys: keys,
    beacons: beacons, wardenId: layer.warden.id};
}

function floodReachable(floor) {
  var seen = new Array(GW * GH), q = [];
  for (var i = 0; i < seen.length; i++) seen[i] = false;
  q.push([floor.spawn.tx, floor.spawn.ty]);
  seen[tileIndex(floor.spawn.tx, floor.spawn.ty)] = true;
  while (q.length) {
    var c = q.pop(), tx = c[0], ty = c[1];
    if (tx === floor.stairs.tx && ty === floor.stairs.ty) return true;
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var d = 0; d < 4; d++) {
      var nx = tx + dirs[d][0], ny = ty + dirs[d][1];
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      var idx = tileIndex(nx, ny);
      if (!seen[idx] && floor.tiles[idx] === 1) { seen[idx] = true; q.push([nx, ny]); }
    }
  }
  return false;
}

/* ---------- hostile AI state selection (pure) ---------- */
function enemyBrain(e, hero) {
  var dx = hero.x - e.x, dy = hero.y - e.y;
  var dist = Math.sqrt(dx * dx + dy * dy);
  if (e.fleeAt > 0 && e.hp <= e.fleeAt && e.hp > 0) { e.state = "flee"; return e.state; }
  if (dist <= e.attackRange) e.state = "attack";
  else if (dist <= e.sight) e.state = "chase";
  else e.state = "wander";
  return e.state;
}

/* Memory Leak growth: +2 HP every 10s, capped at 60 (pure) */
function leakTick(e, dt) {
  if (e.id !== "memory_leak") return e.hp;
  e.growT = (e.growT || 0) + dt;
  while (e.growT >= 10) {
    e.growT -= 10;
    if (e.hp < 60) e.hp = Math.min(60, e.hp + 2);
  }
  return e.hp;
}

/* ---------- warden patterns (pure timing core) ---------- */
function startPattern(w, patternId, windupSecs) {
  w.windup = {t: windupSecs || WINDUP_TIME, id: patternId};
}
function tickPattern(w, dt) {
  if (!w.windup) return null;
  w.windup.t -= dt;
  if (w.windup.t <= 1e-9) {
    var id = w.windup.id;
    w.windup = null;
    return id;
  }
  return null;
}

/* ---------- missions (pure progress; SPEC objective schema) ---------- */
function newStats() {
  return {descended: {}, nodes: 0, hostileKills: 0, keys: 0, beacons: 0,
    nullKills: 0, shards: 0, ichor: 0, wardenKills: {}};
}
function missionCount(m, s) {
  var g = m.objective || {};
  var goal = g.count || 1;
  function capped(v) { return Math.min(goal, v); }
  switch (g.kind) {
    case "reach_stairs": return s.descended[m.layer] ? 1 : 0;
    case "destroy": return capped(s.nodes); /* corruption_node */
    case "kill":
      if (g.target === "nullpointer") return capped(s.nullKills);
      return capped(s.hostileKills); /* "hostile" */
    case "collect":
      if (g.target === "registry_key") return capped(s.keys);
      if (g.target === "data_shard") return capped(s.shards);
      if (g.target === "ichor_vial") return capped(s.ichor);
      return 0;
    case "reboot": return capped(s.beacons); /* beacon */
    case "boss": return s.wardenKills[g.target] ? 1 : 0;
  }
  return 0;
}
function missionGoal(m) {
  var g = m.objective || {};
  if (g.kind === "reach_stairs" || g.kind === "boss") return 1;
  return g.count || 1;
}
function missionDone(m, s) {
  if (missionCount(m, s) < missionGoal(m)) return false;
  var g = m.objective || {};
  if (g.then === "reach_stairs") return !!s.descended[m.layer];
  return true;
}

/* ---------- save blob (pure shape) ---------- */
function makeSaveBlob(state) {
  return JSON.stringify({
    v: 1, seed: state.seed, depth: state.depth, floorSeed: state.floorSeed,
    hero: {hp: state.hero.hp, maxhp: state.hero.maxhp, atk: state.hero.atk,
           def: state.hero.def, gold: state.hero.gold, kills: state.hero.kills,
           potions: state.hero.potions, weapon: state.hero.weapon,
           armor: state.hero.armor, x: state.hero.x, y: state.hero.y},
    stats: state.stats,
    missions: state.missions
  });
}

/* ---------- game ---------- */
function tileAt(floor, px, py) {
  var tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  if (tx < 0 || ty < 0 || tx >= GW || ty >= GH) return 0;
  return floor.tiles[tileIndex(tx, ty)];
}
function walkable(floor, px, py, r) {
  return tileAt(floor, px - r, py - r) === 1 && tileAt(floor, px + r, py - r) === 1 &&
         tileAt(floor, px - r, py + r) === 1 && tileAt(floor, px + r, py + r) === 1;
}
function dist2(ax, ay, bx, by) {
  var dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

function Game(cfg) {
  this.cfg = cfg;
  this.canvas = cfg.canvas;
  this.ctx = cfg.canvas.getContext("2d");
  this.canvas.width = CW; this.canvas.height = CH;
  this.data = null;
  this.rng = mulberry32(1);
  this.depth = 1;
  this.runSeed = 1;
  this.runId = null;
  this.attract = !cfg.loggedIn;
  this.floor = null;
  this.hero = null;
  this.projectiles = [];
  this.floaters = [];
  this.stats = newStats();
  this.missions = {};
  this.warden = null;
  this.darknessT = 0;
  this.beams = [];
  this.chainSlam = 0;
  this.keys = {};
  this.panel = null;   /* shop | talk | missions | pause | over | victory | intro */
  this.shopFor = null;
  this.talkNpc = null;
  this.talkLine = 0;
  this.paused = false;
  this.over = false;
  this.lastSave = 0;
  this.saveTimer = 0;
  this.msg = "";
  this.msgT = 0;
  this.introIdx = 0;
  this.attractT = 0;
  this.frame = 0;
}

Game.prototype.log = function (t) { this.msg = t; this.msgT = 3; };

Game.prototype.init = function () {
  var self = this;
  function ready() {
    self.newRun();
    self.loop();
  }
  if (this.attract) {
    this.data = defaultData();
    ready();
    return;
  }
  fetch(this.cfg.dataUrl, {headers: {"Accept": "application/json"}})
    .then(function (r) {
      if (!r.ok) throw new Error("bad status " + r.status);
      return r.json();
    })
    .then(function (d) { self.data = d && d.hero ? d : defaultData(); ready(); })
    .catch(function () { self.data = defaultData(); ready(); });
};

Game.prototype.api = function (path, body, method) {
  if (this.attract) return Promise.resolve(null);
  var opts = {method: method || "POST", headers: {"Content-Type": "application/json"}};
  if (body) opts.body = JSON.stringify(body);
  return fetch(path, opts).then(function (r) {
    if (!r.ok) throw new Error("api " + r.status);
    return r.json();
  }).catch(function () { return null; });
};

Game.prototype.newRun = function () {
  var self = this;
  function startWith(seed) {
    self.runSeed = seed >>> 0;
    self.resetHero();
    self.depth = 1;
    self.stats = newStats();
    self.missions = {};
    self.enterFloor();
    self.panel = self.attract ? null : "intro";
    self.introIdx = 0;
  }
  if (this.attract) { startWith(0xC0FFEE); return; }
  var self2 = this;
  this.api(this.cfg.api.mine, null, "GET").then(function (m) {
    if (m && m.run_id) {
      self2.runId = m.run_id;
      self2.restore(m);
    } else {
      self2.api(self.cfg.api.start, {}).then(function (s) {
        if (s && s.run_id) { self2.runId = s.run_id; startWith(s.seed); }
        else startWith((Math.random() * 0xFFFFFFFF) >>> 0);
      });
    }
  });
};

Game.prototype.resetHero = function () {
  var h = this.data.hero;
  this.hero = {x: 0, y: 0, hp: h.hp, maxhp: h.hp, atk: h.atk, def: h.def,
    gold: 0, kills: 0, potions: h.potions, potionHeal: h.potion_heal,
    weapon: "w_stick", armor: null, facing: "down",
    atkCd: 0, iframes: 0, swingT: 0, r: 10};
};

Game.prototype.floorSeed = function () {
  return (this.runSeed + this.depth * 7919) >>> 0;
};

Game.prototype.enterFloor = function () {
  var fs = this.floorSeed();
  this.floor = genFloor(fs, this.depth, this.data);
  this.hero.x = this.floor.spawn.x;
  this.hero.y = this.floor.spawn.y;
  this.projectiles = [];
  this.floaters = [];
  this.beams = [];
  this.chainSlam = 0;
  this.darknessT = 0;
  this.warden = null;
  this.spawnWarden();
  if (!this.attract) this.saveNow();
};

Game.prototype.spawnWarden = function () {
  var layer = this.data.layers[this.depth - 1];
  if (!layer) return;
  var wd = layer.warden;
  var room = this.floor.rooms[this.floor.arenaRoom];
  var c = roomCenter(room);
  var hp = scaleStat(wd.hp, this.depth);
  var atk = scaleStat(wd.atk, this.depth);
  this.warden = {id: wd.id, name: wd.name, x: (c.tx + 0.5) * TILE, y: (c.ty + 0.5) * TILE,
    hp: hp, maxhp: hp, atk: atk, def: wd.def, patterns: wd.patterns.slice(),
    active: false, patT: 2, windup: null, enraged: false, dashT: 0, dashVx: 0,
    dashVy: 0, r: 16, iframes: 0, touchCd: 0};
};

Game.prototype.restore = function (m) {
  var self = this;
  try {
    var b = JSON.parse(m.blob || "{}");
    this.runSeed = b.seed >>> 0;
    this.depth = m.depth || b.depth || 1;
    this.stats = b.stats || newStats();
    this.missions = b.missions || {};
    this.resetHero();
    var hh = b.hero || {};
    if (hh.hp) {
      this.hero.hp = hh.hp; this.hero.maxhp = hh.maxhp || hh.hp;
      this.hero.atk = hh.atk; this.hero.def = hh.def;
      this.hero.gold = hh.gold || 0; this.hero.kills = hh.kills || 0;
      this.hero.potions = hh.potions || 0;
      this.hero.weapon = hh.weapon || "w_stick"; this.hero.armor = hh.armor || null;
    }
    this.enterFloor();
    if (hh.x) { this.hero.x = hh.x; this.hero.y = hh.y; }
    this.log("Run restored at depth " + this.depth);
  } catch (e) {
    this.runSeed = (m.seed || 1) >>> 0;
    this.resetHero();
    this.depth = m.depth || 1;
    this.enterFloor();
  }
  this.panel = null;
};

Game.prototype.saveNow = function () {
  if (this.attract || !this.runId || this.over) return;
  var blob = makeSaveBlob({seed: this.runSeed, depth: this.depth, floorSeed: this.floorSeed(),
    hero: this.hero, stats: this.stats, missions: this.missions});
  if (blob.length > 16384) return;
  this.api(this.cfg.api.save, {run_id: this.runId, depth: this.depth,
    hp: Math.max(0, Math.round(this.hero.hp)), gold: this.hero.gold,
    kills: this.hero.kills, blob: blob});
};

Game.prototype.endRun = function (victory) {
  if (this.attract || !this.runId || this.over) return;
  this.over = true;
  var score = this.depth * 1000 + this.hero.kills * 25 + this.hero.gold + (victory ? 5000 : 0);
  var self = this;
  this.api(this.cfg.api.end, {run_id: this.runId, depth: this.depth,
    kills: this.hero.kills, gold: this.hero.gold, victory: !!victory})
    .then(function (r) { if (r && r.score) self.finalScore = r.score; });
  this.finalScore = score;
  this.panel = victory ? "victory" : "over";
};

/* ---------- input ---------- */
Game.prototype.bindInput = function () {
  var self = this;
  document.addEventListener("keydown", function (ev) {
    var k = ev.key;
    if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(k) >= 0) ev.preventDefault();
    if (self.panel === "shop" && k >= "1" && k <= "9") { self.buyItem(parseInt(k, 10) - 1); return; }
    if (k === "Escape" || k === "p" || k === "P") {
      if (self.panel === "shop" || self.panel === "talk" || self.panel === "missions") self.panel = null;
      else if (!self.over) self.paused = !self.paused;
      return;
    }
    if (self.over) {
      if (k === "r" || k === "R") { self.over = false; self.panel = null; self.newRun(); }
      return;
    }
    if (self.panel === "intro") { self.introIdx++; if (self.introIdx >= self.data.dialogue.intro.length) self.panel = null; return; }
    if (self.panel === "talk") {
      if (k === "e" || k === "E" || k === " ") self.advanceTalk();
      return;
    }
    if (self.panel) return;
    self.keys[k.length === 1 ? k.toLowerCase() : k] = true;
    if (k === " " || k === "j" || k === "J") self.tryAttack();
    if (k === "e" || k === "E") self.interact();
    if (k === "q" || k === "Q") self.drinkPotion();
    if (k === "m" || k === "M") self.panel = "missions";
  });
  document.addEventListener("keyup", function (ev) {
    var k = ev.key;
    self.keys[k.length === 1 ? k.toLowerCase() : k] = false;
  });
};

/* ---------- main loop ---------- */
Game.prototype.loop = function () {
  var self = this;
  this.bindInput();
  var last = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
    last = ts;
    if (!self.paused && !self.panel && !self.over) self.update(dt);
    self.render();
    self.frame++;
  }
  requestAnimationFrame(frame);
};

/* ---------- update ---------- */
Game.prototype.update = function (dt) {
  if (!this.floor || !this.hero) return;
  var h = this.hero;
  h.atkCd = Math.max(0, h.atkCd - dt);
  h.iframes = Math.max(0, h.iframes - dt);
  h.swingT = Math.max(0, h.swingT - dt);
  if (this.msgT > 0) this.msgT -= dt;
  if (this.darknessT > 0) this.darknessT -= dt;

  if (this.attract) this.attractBrain(dt);
  else this.heroMove(dt);

  this.updateEnemies(dt);
  this.updateNpcs(dt);
  this.updateProjectiles(dt);
  this.updateWarden(dt);
  this.updateFloaters(dt);
  this.updateBeams(dt);
  this.checkMissions();

  if (!this.attract && !this.over) {
    this.saveTimer += dt;
    if (this.saveTimer >= 30) { this.saveTimer = 0; this.saveNow(); }
  }
  if (h.hp <= 0 && !this.over) {
    h.hp = 0;
    this.endRun(false);
  }
};

Game.prototype.heroMove = function (dt) {
  var h = this.hero, k = this.keys;
  var dx = 0, dy = 0;
  if (k["a"] || k["ArrowLeft"]) dx -= 1;
  if (k["d"] || k["ArrowRight"]) dx += 1;
  if (k["w"] || k["ArrowUp"]) dy -= 1;
  if (k["s"] || k["ArrowDown"]) dy += 1;
  if (dx === 0 && dy === 0) return;
  if (Math.abs(dx) > Math.abs(dy)) h.facing = dx < 0 ? "left" : "right";
  else h.facing = dy < 0 ? "up" : "down";
  var len = Math.sqrt(dx * dx + dy * dy);
  var nx = h.x + (dx / len) * HERO_SPEED * dt;
  var ny = h.y + (dy / len) * HERO_SPEED * dt;
  if (walkable(this.floor, nx, h.y, h.r)) h.x = nx;
  if (walkable(this.floor, h.x, ny, h.r)) h.y = ny;
};

Game.prototype.attractBrain = function (dt) {
  /* demo dungeon: hero drifts to the nearest enemy and swings */
  var h = this.hero, best = null, bd = 1e12, i;
  for (i = 0; i < this.floor.enemies.length; i++) {
    var e = this.floor.enemies[i];
    if (e.hp <= 0) continue;
    var d = dist2(h.x, h.y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  if (best) {
    var dx = best.x - h.x, dy = best.y - h.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    h.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down");
    if (len > 40) {
      var nx = h.x + (dx / len) * HERO_SPEED * 0.7 * dt;
      var ny = h.y + (dy / len) * HERO_SPEED * 0.7 * dt;
      if (walkable(this.floor, nx, h.y, h.r)) h.x = nx;
      if (walkable(this.floor, h.x, ny, h.r)) h.y = ny;
    } else if (h.atkCd <= 0) {
      this.tryAttack();
    }
  } else {
    this.attractT += dt;
    if (this.attractT > 2) {
      this.attractT = 0;
      this.rng = mulberry32((this.frame * 2654435761) >>> 0);
      var r = this.floor.rooms[Math.floor(this.rng() * this.floor.rooms.length)];
      var c = roomCenter(r);
      h.x = (c.tx + 0.5) * TILE; h.y = (c.ty + 0.5) * TILE;
    }
  }
  if (h.hp <= 0) { /* attract hero is immortal-ish: respawn quietly */
    h.hp = h.maxhp; h.x = this.floor.spawn.x; h.y = this.floor.spawn.y;
  }
};

Game.prototype.moveEntity = function (e, dx, dy, dt) {
  var nx = e.x + dx * dt, ny = e.y + dy * dt;
  if (walkable(this.floor, nx, e.y, e.r)) e.x = nx;
  if (walkable(this.floor, e.x, ny, e.r)) e.y = ny;
};

Game.prototype.updateEnemies = function (dt) {
  var h = this.hero, i, e;
  for (i = 0; i < this.floor.enemies.length; i++) {
    e = this.floor.enemies[i];
    if (e.hp <= 0) continue;
    e.atkCd = Math.max(0, e.atkCd - dt);
    e.touchCd = Math.max(0, e.touchCd - dt);
    e.iframes = Math.max(0, e.iframes - dt);
    leakTick(e, dt);
    enemyBrain(e, h);
    var dx = h.x - e.x, dy = h.y - e.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    if (e.state === "wander") {
      e.wanderT -= dt;
      if (e.wanderT <= 0) {
        e.wanderT = 1 + this.rng() * 2;
        var a = this.rng() * Math.PI * 2;
        e.wx = Math.cos(a); e.wy = Math.sin(a);
      }
      this.moveEntity(e, e.wx * e.speed * 0.4, e.wy * e.speed * 0.4, dt);
    } else if (e.state === "chase") {
      var mx = dx / len, my = dy / len;
      if (e.behavior === "zigzag" || e.behavior === "ambush") {
        var t = this.frame * 0.15 + i;
        var px = -my * Math.sin(t), py = mx * Math.sin(t);
        mx += px * 0.8; my += py * 0.8;
        var ml = Math.sqrt(mx * mx + my * my) || 1;
        mx /= ml; my /= ml;
      }
      if (e.behavior === "charge") { mx *= 1.6; my *= 1.6; }
      var skirmish = e.behavior === "dart" || e.behavior === "skirmish";
      var sp = e.speed * (skirmish ? (len < 3 * TILE ? -1 : 1.4) : 1);
      this.moveEntity(e, mx * sp, my * sp, dt);
    } else if (e.state === "flee") {
      this.moveEntity(e, -(dx / len) * e.speed, -(dy / len) * e.speed, dt);
    } else if (e.state === "attack") {
      if (e.atkCd <= 0) {
        e.atkCd = 1.0;
        if (e.behavior === "spitter" || e.behavior === "ranged") this.spit(e, h);
        else this.hurtHero(damage(e.atk, h.def), e);
      }
    }
    /* contact damage */
    if (dist2(h.x, h.y, e.x, e.y) < (h.r + e.r) * (h.r + e.r) && e.touchCd <= 0) {
      e.touchCd = TOUCH_CD;
      this.hurtHero(damage(e.atk, h.def), e);
    }
  }
  /* sweep dead */
  this.floor.enemies = this.floor.enemies.filter(function (en) { return en.hp > 0; });
};

Game.prototype.spit = function (e, target) {
  var dx = target.x - e.x, dy = target.y - e.y;
  var len = Math.sqrt(dx * dx + dy * dy) || 1;
  this.projectiles.push({x: e.x, y: e.y, vx: (dx / len) * 160, vy: (dy / len) * 160,
    dmg: damage(e.atk, this.hero.def), from: "enemy", life: 4, r: 5});
};

Game.prototype.hurtHero = function (dmg, src) {
  var h = this.hero;
  if (h.iframes > 0 || this.over) return;
  h.hp -= dmg;
  h.iframes = IFRAMES;
  this.floaters.push({x: h.x, y: h.y - 14, txt: "-" + dmg, color: "#ff3b30", t: 1});
};

Game.prototype.updateNpcs = function (dt) {
  var h = this.hero, i, n;
  for (i = 0; i < this.floor.npcs.length; i++) {
    n = this.floor.npcs[i];
    n.wanderT -= dt;
    var dx = h.x - n.x, dy = h.y - n.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    if (n.id.indexOf("wanderer") === 0 && len < 4 * TILE && n.state !== "flee") {
      n.state = "flee"; /* wanderers flee from fights */
    }
    if (n.state === "talk") continue;
    if (n.state === "flee") {
      this.moveEntity(n, -(dx / len) * 70, -(dy / len) * 70, dt);
      if (len > 8 * TILE) n.state = "wander";
    } else if (n.state === "wander" || (n.id.indexOf("wanderer") === 0 && n.state === "idle")) {
      if (n.wanderT <= 0) {
        n.wanderT = 2 + this.rng() * 3;
        var a = this.rng() * Math.PI * 2;
        n.wx = Math.cos(a); n.wy = Math.sin(a);
        n.state = "wander";
      }
      this.moveEntity(n, n.wx * 45, n.wy * 45, dt);
    }
  }
};

Game.prototype.updateProjectiles = function (dt) {
  var h = this.hero, i, p;
  for (i = 0; i < this.projectiles.length; i++) {
    p = this.projectiles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.life -= dt;
    if (tileAt(this.floor, p.x, p.y) !== 1) p.life = 0;
    if (p.from === "enemy" && dist2(p.x, p.y, h.x, h.y) < (p.r + h.r) * (p.r + h.r)) {
      this.hurtHero(p.dmg, null);
      p.life = 0;
    }
  }
  this.projectiles = this.projectiles.filter(function (pr) { return pr.life > 0; });
};

Game.prototype.updateFloaters = function (dt) {
  var i;
  for (i = 0; i < this.floaters.length; i++) {
    this.floaters[i].t -= dt;
    this.floaters[i].y -= 24 * dt;
  }
  this.floaters = this.floaters.filter(function (f) { return f.t > 0; });
};

Game.prototype.updateBeams = function (dt) {
  var h = this.hero, i;
  for (i = 0; i < this.beams.length; i++) {
    var b = this.beams[i];
    b.t -= dt;
    if (b.live && Math.abs(h.y - b.y) < h.r + 6 && h.x > b.x0 && h.x < b.x1) {
      this.hurtHero(b.dmg, null);
    }
  }
  this.beams = this.beams.filter(function (b2) { return b2.t > 0; });
};

/* ---------- combat: hero attack ---------- */
Game.prototype.tryAttack = function () {
  var h = this.hero;
  if (h.atkCd > 0 || this.over) return;
  h.atkCd = ATTACK_CD;
  h.swingT = 0.18;
  var range = 56, i;
  var hitAny = false;
  for (i = 0; i < this.floor.enemies.length; i++) {
    var e = this.floor.enemies[i];
    if (e.hp <= 0 || e.iframes > 0) continue;
    var dx = e.x - h.x, dy = e.y - h.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d > range + e.r) continue;
    var ok = false;
    if (h.facing === "left" && dx < 6) ok = true;
    if (h.facing === "right" && dx > -6) ok = true;
    if (h.facing === "up" && dy < 6) ok = true;
    if (h.facing === "down" && dy > -6) ok = true;
    if (!ok) continue;
    hitAny = true;
    var dmg = damage(h.atk, e.def);
    e.hp -= dmg;
    e.iframes = 0.2;
    this.floaters.push({x: e.x, y: e.y - 12, txt: "-" + dmg, color: "#ffffff", t: 0.8});
    if (e.hp <= 0) this.onKill(e);
  }
  /* nodes */
  for (i = 0; i < this.floor.nodes.length; i++) {
    var nd = this.floor.nodes[i];
    if (nd.hp <= 0) continue;
    if (dist2(h.x, h.y, nd.x, nd.y) < (range + nd.r) * (range + nd.r)) {
      nd.hp -= damage(h.atk, 0);
      hitAny = true;
      if (nd.hp <= 0) {
        this.stats.nodes++;
        this.log("Corruption node destroyed (" + this.stats.nodes + "/3)");
        this.floaters.push({x: nd.x, y: nd.y - 12, txt: "NODE DOWN", color: "#4fd1c5", t: 1.2});
      }
    }
  }
  /* warden */
  var w = this.warden;
  if (w && w.active && w.hp > 0 && w.iframes <= 0) {
    var wdx = w.x - h.x, wdy = w.y - h.y;
    var wd = Math.sqrt(wdx * wdx + wdy * wdy);
    if (wd < range + w.r) {
      var wOk = (h.facing === "left" && wdx < 6) || (h.facing === "right" && wdx > -6) ||
                (h.facing === "up" && wdy < 6) || (h.facing === "down" && wdy > -6);
      if (wOk) {
        var wdmg = damage(h.atk, w.def);
        w.hp -= wdmg;
        w.iframes = 0.2;
        this.floaters.push({x: w.x, y: w.y - 18, txt: "-" + wdmg, color: "#ffffff", t: 0.8});
        if (w.hp <= 0) this.onWardenKill(w);
      }
    }
  }
  if (!hitAny) { /* whiff, no penalty */ }
};

Game.prototype.onKill = function (e) {
  var h = this.hero;
  h.kills++;
  this.stats.hostileKills++;
  if (e.id === "nullpointer") this.stats.nullKills++;
  h.gold += e.gold;
  this.floaters.push({x: e.x, y: e.y, txt: "+" + e.gold + "g", color: "#ffd75e", t: 1});
  if (e.drops === "ichor" && this.rng() < 0.6) {
    this.stats.ichor++;
    this.log("Ichor vial recovered (" + this.stats.ichor + "/3)");
  }
  if (this.rng() < 0.12) {
    this.stats.shards++;
    this.log("Data shard recovered (" + this.stats.shards + "/5)");
  }
  if (this.rng() < 0.08) {
    this.floor.items.push({kind: "potion", ref: null, x: e.x, y: e.y, r: 7});
  }
};

Game.prototype.onWardenKill = function (w) {
  this.stats.wardenKills[w.id] = true;
  this.hero.gold += 200;
  this.log(w.name + " deleted. +200g");
  this.floaters.push({x: w.x, y: w.y - 24, txt: "WARDEN DOWN", color: "#ffb347", t: 2});
  if (w.id === "watchdog") this.endRun(true);
};

/* ---------- warden update ---------- */
Game.prototype.updateWarden = function (dt) {
  var w = this.warden;
  if (!w || w.hp <= 0) return;
  var h = this.hero;
  w.iframes = Math.max(0, w.iframes - dt);
  w.touchCd = Math.max(0, w.touchCd - dt);
  if (!w.active) {
    var room = this.floor.rooms[this.floor.arenaRoom];
    var tx = Math.floor(h.x / TILE), ty = Math.floor(h.y / TILE);
    if (tx >= room.x && tx < room.x + room.w && ty >= room.y && ty < room.y + room.h) {
      w.active = true;
      this.log("WARDEN " + w.name + " has you.");
    } else return;
  }
  /* enrage (Panic) */
  if (!w.enraged && w.id === "panic" && w.hp < w.maxhp * 0.3) {
    w.enraged = true;
    w.atk = Math.round(w.atk * 1.5);
    this.log("Panic enrages.");
  }
  /* wind-up then fire */
  var fired = tickPattern(w, dt);
  if (fired) this.firePattern(w, fired);
  else if (!w.windup) {
    w.patT -= dt * (w.id === "watchdog" ? 1.6 : 1);
    if (w.patT <= 0) {
      w.patT = 2.2 + this.rng() * 2;
      var pid = w.patterns[Math.floor(this.rng() * w.patterns.length)];
      if (pid === "enrage" && w.enraged) pid = "double_slam";
      /* all_patterns runs the full set: shorter telegraph, faster. */
      startPattern(w, pid, pid === "all_patterns" ? 0.5 : WINDUP_TIME);
    }
  }
  /* dash movement */
  if (w.dashT > 0) {
    w.dashT -= dt;
    var nx = w.x + w.dashVx * dt, ny = w.y + w.dashVy * dt;
    if (walkable(this.floor, nx, w.y, w.r)) w.x = nx;
    if (walkable(this.floor, w.x, ny, w.r)) w.y = ny;
  } else if (!w.windup) {
    var dx = h.x - w.x, dy = h.y - w.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    if (len > 3 * TILE) this.moveEntity(w, (dx / len) * 55, (dy / len) * 55, dt);
  }
  /* contact damage */
  if (dist2(h.x, h.y, w.x, w.y) < (h.r + w.r) * (h.r + w.r) && w.touchCd <= 0) {
    w.touchCd = TOUCH_CD;
    this.hurtHero(damage(w.atk, h.def), w);
  }
  /* watchdog 50% sweep */
  if (w.id === "watchdog" && !w.swept && w.hp < w.maxhp * 0.5) {
    w.swept = true;
    this.firePattern(w, "sweep");
  }
  if (this.chainSlam > 0) {
    this.chainSlam -= dt;
    if (this.chainSlam <= 0) this.slamAt(w.x, w.y, w.atk, 110);
  }
};

Game.prototype.slamAt = function (x, y, atk, radius) {
  var h = this.hero;
  this.floaters.push({x: x, y: y - 20, txt: "SLAM", color: "#ff3b30", t: 0.7});
  if (dist2(h.x, h.y, x, y) < radius * radius) this.hurtHero(damage(atk, h.def), null);
};

Game.prototype.firePattern = function (w, pid) {
  var h = this.hero, i;
  var dx = h.x - w.x, dy = h.y - w.y;
  var len = Math.sqrt(dx * dx + dy * dy) || 1;
  if (pid === "charge") {
    w.dashT = 0.5; w.dashVx = (dx / len) * 420; w.dashVy = (dy / len) * 420;
  } else if (pid === "lane_dash") {
    w.dashT = 0.6; w.dashVx = (dx > 0 ? 1 : -1) * 480; w.dashVy = 0;
  } else if (pid === "summon" || pid === "adds") {
    var n = pid === "summon" ? 2 : 3;
    var types = this.data.layers[this.depth - 1].enemies;
    for (i = 0; i < n; i++) {
      var t = types[Math.floor(this.rng() * types.length)];
      var def = null;
      for (var j = 0; j < this.data.enemies.length; j++)
        if (this.data.enemies[j].id === t) def = this.data.enemies[j];
      var hp = scaleStat(def.hp, this.depth), atk = scaleStat(def.atk, this.depth);
      var a = this.rng() * Math.PI * 2;
      this.floor.enemies.push({id: t, name: def.name, elite: false,
        x: w.x + Math.cos(a) * 40, y: w.y + Math.sin(a) * 40,
        hp: hp, maxhp: hp, atk: atk, def: def.def,
        speed: SPEEDS[def.speed] || 62, behavior: def.behavior,
        sight: 8 * TILE, attackRange: 1.2 * TILE, state: "chase",
        atkCd: 0, touchCd: 0, iframes: 0, wx: 0, wy: 0, wanderT: 0,
        spitT: 1, growT: 0, drops: def.drops || DROPS[t] || null,
        fleeAt: enemyFlees(def) ? Math.ceil(hp * 0.25) : 0, gold: def.gold[0], r: 10});
    }
    this.log(w.name + " calls reinforcements.");
  } else if (pid === "slam") {
    this.slamAt(w.x, w.y, w.atk, 100);
  } else if (pid === "double_slam") {
    this.slamAt(w.x, w.y, w.atk, 100);
    this.chainSlam = 0.7;
  } else if (pid === "scatter") {
    for (i = 0; i < 8; i++) {
      var a2 = (i / 8) * Math.PI * 2;
      this.projectiles.push({x: w.x, y: w.y, vx: Math.cos(a2) * 170, vy: Math.sin(a2) * 170,
        dmg: damage(w.atk, h.def), from: "enemy", life: 4, r: 5});
    }
  } else if (pid === "rotating_shots") {
    for (i = 0; i < 12; i++) {
      var a3 = (i / 12) * Math.PI * 2 + this.rng() * 0.3;
      this.projectiles.push({x: w.x, y: w.y, vx: Math.cos(a3) * 140, vy: Math.sin(a3) * 140,
        dmg: damage(w.atk, h.def), from: "enemy", life: 5, r: 5});
    }
  } else if (pid === "blackout") {
    this.darknessT = 2.0;
    w.x = h.x + (this.rng() < 0.5 ? -1 : 1) * 3 * TILE;
    w.y = h.y;
    if (!walkable(this.floor, w.x, w.y, w.r)) { w.x = h.x; w.y = h.y - 3 * TILE; }
  } else if (pid === "heavy_melee") {
    if (len < 3 * TILE) this.hurtHero(damage(Math.round(w.atk * 1.5), h.def), w);
  } else if (pid === "etch_lines") {
    for (i = 0; i < 3; i++) {
      var by = h.y + (this.rng() - 0.5) * 8 * TILE;
      this.beams.push({y: by, x0: 0, x1: CW, t: 1.2, live: true,
        dmg: damage(w.atk, h.def)});
    }
    this.log("Lithographer etches the floor.");
  } else if (pid === "sweep") {
    for (i = 0; i < 10; i++) {
      this.projectiles.push({x: 0, y: (i + 0.5) * (CH / 10),
        vx: 220, vy: 0, dmg: damage(w.atk, h.def), from: "enemy", life: 6, r: 6});
    }
    this.log("THE WATCHDOG sweeps the Stack.");
  } else if (pid === "enrage") {
    if (!w.enraged) { w.enraged = true; w.atk = Math.round(w.atk * 1.5); }
  } else if (pid === "all_patterns") {
    /* The Watchdog's signature: the full pattern set at once, on a
       shorter telegraph than a normal pattern (see updateWarden). */
    var all = ["charge", "summon", "slam", "scatter", "lane_dash",
               "rotating_shots", "blackout", "heavy_melee", "double_slam",
               "etch_lines", "adds", "sweep"];
    for (var q = 0; q < all.length; q++) this.firePattern(w, all[q]);
    this.log("THE WATCHDOG runs every pattern it has.");
  }
};

/* ---------- interact ---------- */
Game.prototype.nearest = function (list, maxD) {
  var h = this.hero, best = null, bd = maxD * maxD, i;
  for (i = 0; i < list.length; i++) {
    var d = dist2(h.x, h.y, list[i].x, list[i].y);
    if (d < bd) { bd = d; best = list[i]; }
  }
  return best;
};

Game.prototype.interact = function () {
  var h = this.hero;
  /* stairs */
  if (dist2(h.x, h.y, this.floor.stairs.x, this.floor.stairs.y) < (2 * TILE) * (2 * TILE)) {
    this.descend();
    return;
  }
  /* npc */
  var n = this.nearest(this.floor.npcs, 2 * TILE);
  if (n) { this.startTalk(n); return; }
  /* items */
  var it = this.nearest(this.floor.items, 1.6 * TILE);
  if (it) { this.pickup(it); return; }
  /* keys */
  var k = this.nearest(this.floor.keys.filter(function (kk) { return !kk.taken; }), 1.6 * TILE);
  if (k) {
    k.taken = true;
    this.stats.keys++;
    this.log("Registry key secured (" + this.stats.keys + "/3)");
    return;
  }
  /* beacons */
  var b = this.nearest(this.floor.beacons.filter(function (bb) { return !bb.on; }), 1.8 * TILE);
  if (b) {
    b.on = true;
    this.stats.beacons++;
    this.log("Beacon rebooted (" + this.stats.beacons + "/4)");
    this.spawnWave();
    return;
  }
};

Game.prototype.spawnWave = function () {
  /* beacon waves on layer 6: 2 hostiles near a random room */
  var types = this.data.layers[this.depth - 1].enemies;
  var room = this.floor.rooms[Math.floor(this.rng() * this.floor.rooms.length)];
  var c = roomCenter(room);
  for (var i = 0; i < 2; i++) {
    var t = types[Math.floor(this.rng() * types.length)];
    var def = null;
    for (var j = 0; j < this.data.enemies.length; j++)
      if (this.data.enemies[j].id === t) def = this.data.enemies[j];
    var hp = scaleStat(def.hp, this.depth), atk = scaleStat(def.atk, this.depth);
    this.floor.enemies.push({id: t, name: def.name, elite: false,
      x: (c.tx + 0.5) * TILE, y: (c.ty + 0.5) * TILE,
      hp: hp, maxhp: hp, atk: atk, def: def.def,
      speed: SPEEDS[def.speed] || 62, behavior: def.behavior,
      sight: 8 * TILE, attackRange: 1.2 * TILE, state: "chase",
      atkCd: 0, touchCd: 0, iframes: 0, wx: 0, wy: 0, wanderT: 0,
      spitT: 1, growT: 0, drops: def.drops || null,
      fleeAt: def.flees ? Math.ceil(hp * 0.25) : 0, gold: def.gold[0], r: 10});
  }
  this.log("The Stack pushes back.");
};

Game.prototype.pickup = function (it) {
  var h = this.hero;
  var idx = this.floor.items.indexOf(it);
  if (idx >= 0) this.floor.items.splice(idx, 1);
  if (it.kind === "gold") { h.gold += it.ref; this.log("+" + it.ref + "g"); }
  else if (it.kind === "potion") { h.potions++; this.log("Potion acquired (" + h.potions + ")"); }
  else if (it.kind === "weapon") {
    var w = null;
    for (var i = 0; i < this.data.loot.weapons.length; i++)
      if (this.data.loot.weapons[i].id === it.ref) w = this.data.loot.weapons[i];
    if (w && w.atk > h.atk) { h.atk = w.atk; h.weapon = w.id; this.log("Equipped " + w.name + " (ATK " + w.atk + ")"); }
    else this.log("No upgrade. Left behind.");
  }
  else if (it.kind === "armor") {
    var a = null;
    for (var i2 = 0; i2 < this.data.loot.armor.length; i2++)
      if (this.data.loot.armor[i2].id === it.ref) a = this.data.loot.armor[i2];
    var curDef = h.armor ? this.armorDef(h.armor) : 0;
    if (a && a.def > curDef) {
      h.armor = a.id; h.def = 2 + a.def; this.log("Equipped " + a.name + " (DEF " + h.def + ")");
    } else this.log("No upgrade. Left behind.");
  }
};

Game.prototype.armorDef = function (id) {
  for (var i = 0; i < this.data.loot.armor.length; i++)
    if (this.data.loot.armor[i].id === id) return this.data.loot.armor[i].def;
  return 0;
};

Game.prototype.descend = function () {
  this.stats.descended[this.depth] = true;
  this.checkMissions();
  if (this.depth >= 7) return;
  this.depth++;
  this.enterFloor();
  var layer = this.data.layers[this.depth - 1];
  this.log("Depth " + this.depth + ": " + (layer ? layer.name : ""));
};

Game.prototype.drinkPotion = function () {
  var h = this.hero;
  if (this.over) return;
  if (h.potions <= 0) { this.log("No potions left."); return; }
  if (h.hp >= h.maxhp) { this.log("Already at full HP."); return; }
  h.potions--;
  h.hp = Math.min(h.maxhp, h.hp + h.potionHeal);
  this.floaters.push({x: h.x, y: h.y - 14, txt: "+" + h.potionHeal, color: "#3ddc84", t: 1});
};

/* ---------- dialogue / shop ---------- */
Game.prototype.npcDef = function (id) {
  for (var i = 0; i < this.data.npcs.length; i++)
    if (this.data.npcs[i].id === id) return this.data.npcs[i];
  return null;
};

Game.prototype.startTalk = function (n) {
  n.state = "talk";
  this.talkNpc = n;
  this.talkLine = 0;
  this.panel = "talk";
};

Game.prototype.advanceTalk = function () {
  var n = this.talkNpc;
  var def = this.npcDef(n.id);
  if (!def && n.id.indexOf("wanderer") === 0) def = this.npcDef("wanderer");
  var lines = def ? def.dialogue : [];
  if (this.talkLine < lines.length - 1) { this.talkLine++; return; }
  /* End of dialogue: quest-givers hand out their side quest, then any
     merchant opens their shop. Talking to Byte accepts pest_control. */
  if (n.id === "byte" || n.id === "ada" || n.id === "medic") this.acceptQuest(n.id);
  if (def && def.shop && def.shop.length) { this.shopFor = def; this.panel = "shop"; }
  else {
    n.state = "idle";
    this.talkNpc = null;
    this.panel = null;
  }
};

Game.prototype.acceptQuest = function (npcId) {
  var mid = npcId === "ada" ? "lost_pages" :
            npcId === "medic" ? "field_medicine" :
            npcId === "byte" ? "pest_control" : null;
  if (!mid || this.missions[mid]) return false;
  this.missions[mid] = {active: true};
  var m = this.missionDef(mid);
  this.log("Quest accepted: " + (m ? m.title : mid));
  return true;
};

Game.prototype.missionDef = function (id) {
  for (var i = 0; i < this.data.missions.length; i++)
    if (this.data.missions[i].id === id) return this.data.missions[i];
  return null;
};

Game.prototype.buyItem = function (idx) {
  var def = this.shopFor;
  if (!def || !def.shop || idx < 0 || idx >= def.shop.length) return;
  var item = def.shop[idx], h = this.hero;
  if (h.gold < item.cost) { this.log("Not enough gold."); return; }
  if (item.id === "potion") { h.gold -= item.cost; h.potions++; this.log("Bought a patch potion."); }
  else if (item.id === "heal") {
    if (h.hp >= h.maxhp) { this.log("Already at full HP."); return; }
    h.gold -= item.cost; h.hp = h.maxhp; this.log("Patched to full.");
  }
  else if (item.id === "hp_up") {
    h.gold -= item.cost; h.maxhp += 10; h.hp += 10; this.log("Max HP up.");
  }
  else if (item.id === "maxhp") { h.gold -= item.cost; h.maxhp += item.maxhp; h.hp += item.maxhp; this.log("Max HP up."); }
  else if (item.atk) {
    if (item.atk <= h.atk) { this.log("No upgrade."); return; }
    h.gold -= item.cost; h.atk = item.atk; h.weapon = item.id;
    this.log("Bought " + item.name + ".");
  }
  else if (item.def) {
    h.gold -= item.cost; h.def = 2 + item.def; h.armor = item.id;
    this.log("Bought " + item.name + ".");
  }
};

/* ---------- missions ---------- */
Game.prototype.checkMissions = function () {
  if (this.attract) return;
  for (var i = 0; i < this.data.missions.length; i++) {
    var m = this.data.missions[i];
    if (this.missions[m.id] && this.missions[m.id].done) continue;
    if (m.giver && !(this.missions[m.id] && this.missions[m.id].active)) continue;
    if (missionDone(m, this.stats)) {
      this.missions[m.id] = {done: true};
      this.applyReward(m);
      this.log("Mission complete: " + m.title);
    }
  }
};

/* ---------- mission rewards (pure; reward keys are the server's) ---------- */
function applyReward(hero, reward, loot) {
  var r = reward || {};
  if (r.gold) hero.gold += r.gold;
  var hpUp = r.max_hp || r.maxhp || 0;
  if (hpUp) { hero.maxhp += hpUp; hero.hp += hpUp; }
  if (r.potions) hero.potions += r.potions;
  if (r.weapon) {
    for (var i = 0; i < loot.weapons.length; i++) {
      var w = loot.weapons[i];
      if (w.id === r.weapon && w.atk > hero.atk) { hero.atk = w.atk; hero.weapon = w.id; }
    }
  }
  if (r.armor) {
    for (var j = 0; j < loot.armor.length; j++) {
      var a = loot.armor[j];
      if (a.id === r.armor) { hero.def = 2 + a.def; hero.armor = a.id; }
    }
  }
}

Game.prototype.applyReward = function (m) {
  applyReward(this.hero, m.reward, this.data.loot);
};

/* ---------- render ---------- */
Game.prototype.render = function () {
  var ctx = this.ctx;
  if (!this.floor) {
    ctx.fillStyle = "#0b0b0d"; ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = "#f5f5f5"; ctx.font = "16px monospace"; ctx.textAlign = "center";
    ctx.fillText("STACKFALL booting...", CW / 2, CH / 2);
    return;
  }
  var layer = this.data.layers[this.depth - 1] || this.data.layers[0];
  ctx.fillStyle = layer.floor; ctx.fillRect(0, 0, CW, CH);
  var x, y;
  for (y = 0; y < GH; y++) for (x = 0; x < GW; x++) {
    var t = this.floor.tiles[tileIndex(x, y)];
    if (t === 0) { ctx.fillStyle = layer.wall; ctx.fillRect(x * TILE, y * TILE, TILE, TILE); }
    else {
      ctx.strokeStyle = "rgba(255,255,255,0.03)";
      ctx.strokeRect(x * TILE + 0.5, y * TILE + 0.5, TILE - 1, TILE - 1);
    }
  }
  /* stairs */
  var st = this.floor.stairs;
  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(st.x - 8, st.y - 8, 16, 16);
  ctx.fillStyle = layer.floor;
  ctx.beginPath();
  ctx.moveTo(st.x, st.y + 5); ctx.lineTo(st.x - 4, st.y - 2); ctx.lineTo(st.x + 4, st.y - 2);
  ctx.closePath(); ctx.fill();
  /* nodes / keys / beacons */
  var i;
  for (i = 0; i < this.floor.nodes.length; i++) {
    var nd = this.floor.nodes[i];
    if (nd.hp <= 0) continue;
    ctx.fillStyle = "#4fd1c5";
    ctx.beginPath(); ctx.arc(nd.x, nd.y, nd.r, 0, Math.PI * 2); ctx.fill();
  }
  for (i = 0; i < this.floor.keys.length; i++) {
    var kk = this.floor.keys[i];
    if (kk.taken) continue;
    ctx.fillStyle = "#5aa9ff";
    ctx.fillRect(kk.x - 4, kk.y - 4, 8, 8);
  }
  for (i = 0; i < this.floor.beacons.length; i++) {
    var bc = this.floor.beacons[i];
    ctx.fillStyle = bc.on ? "#3ddc84" : "#d4a017";
    ctx.beginPath(); ctx.arc(bc.x, bc.y, bc.r, 0, Math.PI * 2); ctx.fill();
  }
  /* items */
  for (i = 0; i < this.floor.items.length; i++) {
    var it = this.floor.items[i];
    if (it.kind === "gold") {
      ctx.fillStyle = "#ffd75e";
      ctx.beginPath(); ctx.arc(it.x, it.y, 5, 0, Math.PI * 2); ctx.fill();
    } else if (it.kind === "potion") {
      ctx.fillStyle = "#ff3b30"; ctx.fillRect(it.x - 4, it.y - 6, 8, 12);
    } else if (it.kind === "weapon") {
      ctx.fillStyle = "#f5f5f5";
      ctx.beginPath(); ctx.moveTo(it.x, it.y - 7); ctx.lineTo(it.x - 5, it.y + 5); ctx.lineTo(it.x + 5, it.y + 5);
      ctx.closePath(); ctx.fill();
    } else if (it.kind === "armor") {
      ctx.fillStyle = "#8a8a8e"; ctx.fillRect(it.x - 6, it.y - 6, 12, 12);
    }
  }
  /* npcs: amber friendlies, green medic, blue ada */
  for (i = 0; i < this.floor.npcs.length; i++) {
    var n = this.floor.npcs[i];
    var col = "#ffb347";
    if (n.id === "medic") col = "#3ddc84";
    else if (n.id === "ada") col = "#5aa9ff";
    var bob = n.state === "idle" || n.state === "talk" ? Math.sin(this.frame * 0.1 + i) * 2 : 0;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(n.x, n.y + bob, n.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#0b0b0d";
    ctx.font = "9px monospace"; ctx.textAlign = "center";
    ctx.fillText(n.name === "Wanderer" ? "?" : n.name[0], n.x, n.y + bob + 3);
    ctx.fillStyle = col; ctx.font = "9px monospace";
    ctx.fillText(n.name, n.x, n.y - n.r - 4 + bob);
  }
  /* enemies: signal red, elites get amber outline */
  for (i = 0; i < this.floor.enemies.length; i++) {
    var e = this.floor.enemies[i];
    if (e.iframes > 0 && Math.floor(this.frame / 3) % 2 === 0) continue;
    ctx.fillStyle = "#ff3b30";
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
    if (e.elite) {
      ctx.strokeStyle = "#ffd75e"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 3, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
    }
    if (e.hp < e.maxhp) {
      ctx.fillStyle = "#330000"; ctx.fillRect(e.x - 12, e.y - e.r - 8, 24, 4);
      ctx.fillStyle = "#ff3b30"; ctx.fillRect(e.x - 12, e.y - e.r - 8, 24 * (e.hp / e.maxhp), 4);
    }
  }
  /* warden */
  var w = this.warden;
  if (w && w.hp > 0) {
    var flashing = w.windup && Math.floor(this.frame / 4) % 2 === 0;
    ctx.fillStyle = flashing ? "#ffffff" : "#ff3b30";
    ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = flashing ? "#ff3b30" : "#ffffff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(w.x, w.y, w.r + 5, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = "#ffffff"; ctx.font = "11px monospace"; ctx.textAlign = "center";
    ctx.fillText(w.name, w.x, w.y - w.r - 12);
    ctx.fillStyle = "#330000"; ctx.fillRect(w.x - 40, w.y - w.r - 10, 80, 5);
    ctx.fillStyle = "#ff3b30"; ctx.fillRect(w.x - 40, w.y - w.r - 10, 80 * (w.hp / w.maxhp), 5);
  }
  /* hero: paper white */
  var h = this.hero;
  if (h.iframes <= 0 || Math.floor(this.frame / 3) % 2 === 0) {
    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(h.x - h.r, h.y - h.r, h.r * 2, h.r * 2);
    ctx.fillStyle = "#0b0b0d";
    if (h.facing === "left") ctx.fillRect(h.x - h.r, h.y - 3, 6, 6);
    if (h.facing === "right") ctx.fillRect(h.x + h.r - 6, h.y - 3, 6, 6);
    if (h.facing === "up") ctx.fillRect(h.x - 3, h.y - h.r, 6, 6);
    if (h.facing === "down") ctx.fillRect(h.x - 3, h.y + h.r - 6, 6, 6);
  }
  /* swing arc */
  if (h.swingT > 0) {
    ctx.strokeStyle = "#f5f5f5"; ctx.lineWidth = 3;
    ctx.beginPath();
    var sa = h.facing === "right" ? -0.9 : h.facing === "left" ? Math.PI - 0.9 :
             h.facing === "down" ? Math.PI / 2 - 0.9 : -Math.PI / 2 - 0.9;
    ctx.arc(h.x, h.y, 44, sa, sa + 1.8);
    ctx.stroke(); ctx.lineWidth = 1;
  }
  /* projectiles */
  for (i = 0; i < this.projectiles.length; i++) {
    var p = this.projectiles[i];
    ctx.fillStyle = "#ff3b30";
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  /* beams */
  for (i = 0; i < this.beams.length; i++) {
    var bm = this.beams[i];
    ctx.fillStyle = "rgba(255,59,48,0.55)";
    ctx.fillRect(bm.x0, bm.y - 6, bm.x1 - bm.x0, 12);
  }
  /* floaters */
  ctx.font = "11px monospace"; ctx.textAlign = "center";
  for (i = 0; i < this.floaters.length; i++) {
    var f = this.floaters[i];
    ctx.fillStyle = f.color;
    ctx.globalAlpha = Math.min(1, f.t);
    ctx.fillText(f.txt, f.x, f.y);
    ctx.globalAlpha = 1;
  }
  /* blackout */
  if (this.darknessT > 0) {
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = "#ff3b30"; ctx.font = "20px monospace"; ctx.textAlign = "center";
    ctx.fillText("SIGNAL LOST", CW / 2, CH / 2);
  }
  /* low HP vignette */
  if (h.hp < h.maxhp * 0.3 && !this.over) {
    var pulse = 0.25 + 0.2 * Math.sin(this.frame * 0.2);
    ctx.strokeStyle = "rgba(255,59,48," + pulse.toFixed(2) + ")";
    ctx.lineWidth = 24;
    ctx.strokeRect(0, 0, CW, CH);
    ctx.lineWidth = 1;
  }
  this.renderHud(ctx);
  this.renderPanel(ctx);
  if (this.attract) {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, CH - 120, CW, 120);
    ctx.fillStyle = "#f5f5f5"; ctx.font = "22px monospace"; ctx.textAlign = "center";
    ctx.fillText("STACKFALL", CW / 2, CH - 84);
    ctx.font = "14px monospace";
    ctx.fillText("Seven layers down. One way back: through.", CW / 2, CH - 58);
    ctx.fillStyle = "#ffb347";
    ctx.fillText("Log in to play the full run.", CW / 2, CH - 32);
  }
};

Game.prototype.renderHud = function (ctx) {
  var h = this.hero;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, CW, 34);
  ctx.fillStyle = "#f5f5f5"; ctx.font = "12px monospace"; ctx.textAlign = "left";
  var layer = this.data.layers[this.depth - 1] || {name: ""};
  ctx.fillText("DEPTH " + this.depth + " " + layer.name, 10, 22);
  /* hp bar */
  ctx.fillStyle = "#330000"; ctx.fillRect(220, 12, 160, 12);
  ctx.fillStyle = h.hp > h.maxhp * 0.3 ? "#3ddc84" : "#ff3b30";
  ctx.fillRect(220, 12, 160 * Math.max(0, h.hp / h.maxhp), 12);
  ctx.fillStyle = "#f5f5f5";
  ctx.fillText(Math.max(0, Math.ceil(h.hp)) + "/" + h.maxhp, 386, 22);
  ctx.fillStyle = "#ffd75e";
  ctx.fillText(h.gold + "g", 470, 22);
  ctx.fillStyle = "#ff3b30";
  ctx.fillText("potions " + h.potions + " [Q]", 540, 22);
  ctx.fillStyle = "#8a8a8e";
  ctx.fillText("kills " + h.kills, 660, 22);
  ctx.fillText("[M] missions", 740, 22);
  if (this.msgT > 0) {
    ctx.fillStyle = "#f5f5f5"; ctx.textAlign = "center";
    ctx.fillText(this.msg, CW / 2, 52);
  }
};

Game.prototype.panelBox = function (ctx, lines, title) {
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(0, 0, CW, CH);
  var w = 560, h = 60 + lines.length * 22;
  var x0 = (CW - w) / 2, y0 = (CH - h) / 2;
  ctx.fillStyle = "#111114";
  ctx.fillRect(x0, y0, w, h);
  ctx.strokeStyle = "#f5f5f5";
  ctx.strokeRect(x0, y0, w, h);
  ctx.fillStyle = "#ffb347"; ctx.font = "15px monospace"; ctx.textAlign = "left";
  ctx.fillText(title, x0 + 20, y0 + 32);
  ctx.fillStyle = "#f5f5f5"; ctx.font = "13px monospace";
  for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], x0 + 20, y0 + 60 + i * 22);
};

Game.prototype.renderPanel = function (ctx) {
  var p = this.panel, i;
  if (this.paused && !p) {
    this.panelBox(ctx, ["Paused. [Esc] resume."], "PAUSED");
    return;
  }
  if (p === "intro") {
    var lines = this.data.dialogue.intro;
    var shown = lines.slice(0, this.introIdx + 1);
    shown.push("");
    shown.push("[any key] continue");
    this.panelBox(ctx, shown, "STACKFALL");
  } else if (p === "talk" && this.talkNpc) {
    var n = this.talkNpc;
    var def = this.npcDef(n.id);
    if (!def && n.id.indexOf("wanderer") === 0) def = this.npcDef("wanderer");
    var dlines = def ? def.dialogue : [""];
    var out = [n.name + " (" + n.role + "):", ""];
    out.push(dlines[this.talkLine]);
    out.push("");
    out.push("[E] continue");
    this.panelBox(ctx, out, "DIALOGUE");
  } else if (p === "shop" && this.shopFor) {
    var out2 = ["Gold: " + this.hero.gold + "g", ""];
    for (i = 0; i < this.shopFor.shop.length; i++) {
      var it = this.shopFor.shop[i];
      out2.push("[" + (i + 1) + "] " + it.name + " - " + it.cost + "g");
    }
    out2.push("");
    out2.push("[1-9] buy, [Esc] leave");
    this.panelBox(ctx, out2, this.shopFor.name.toUpperCase() + " - SHOP");
  } else if (p === "missions") {
    var out3 = [];
    for (i = 0; i < this.data.missions.length; i++) {
      var m = this.data.missions[i];
      if (m.giver && !(this.missions[m.id] && this.missions[m.id].active)) continue;
      var st = this.missions[m.id] && this.missions[m.id].done ? "[DONE] " :
               "[....] " + missionCount(m, this.stats) + "/" + missionGoal(m) + " ";
      out3.push(st + m.title + " - " + m.brief);
    }
    out3.push("");
    out3.push("[Esc] close");
    this.panelBox(ctx, out3, "MISSION LOG");
  } else if (p === "over") {
    var dl = this.data.dialogue.death;
    var ol = dl.concat(["", "Depth reached: " + this.depth,
      "Score: " + (this.finalScore || 0), "", "[R] new run"]);
    this.panelBox(ctx, ol, "RUN TERMINATED");
  } else if (p === "victory") {
    var vl = this.data.dialogue.victory;
    var vo = vl.concat(["", "Score: " + (this.finalScore || 0), "", "[R] new run"]);
    this.panelBox(ctx, vo, "CLEAN HALT ISSUED");
  }
};

/* ---------- boot ---------- */
function boot(cfg) {
  var g = new Game(cfg);
  g.init();
  return g;
}

var Stackfall = {
  boot: boot,
  Game: Game,
  mulberry32: mulberry32,
  genFloor: genFloor,
  floodReachable: floodReachable,
  damage: damage,
  scaleStat: scaleStat,
  eliteStats: eliteStats,
  enemyBrain: enemyBrain,
  leakTick: leakTick,
  startPattern: startPattern,
  tickPattern: tickPattern,
  WINDUP_TIME: WINDUP_TIME,
  defaultMissions: defaultMissions,
  defaultData: defaultData,
  newStats: newStats,
  missionCount: missionCount,
  missionGoal: missionGoal,
  missionDone: missionDone,
  applyReward: applyReward,
  makeSaveBlob: makeSaveBlob,
  TILE: TILE, GW: GW, GH: GH
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = Stackfall;
} else if (typeof window !== "undefined") {
  window.Stackfall = Stackfall;
}

/* Auto-boot from the play page canvas. No inline script needed:
   <canvas id="game" data-data-url="/arcade/data" data-logged-in="true">
   <script src="/static/arcade/engine.js"></script> */
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", function () {
    var c = document.getElementById("game");
    if (!c) return;
    boot({
      canvas: c,
      dataUrl: c.getAttribute("data-data-url") || "/arcade/data",
      api: {start: "/arcade/run/start", save: "/arcade/run/save",
            end: "/arcade/run/end", mine: "/arcade/run/mine"},
      loggedIn: c.getAttribute("data-logged-in") === "true"
    });
  });
}

})();
