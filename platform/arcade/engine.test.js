"use strict";
/* STACKFALL engine unit tests. No dependencies, plain node:assert.
   Run: node platform/arcade/engine.test.js */
var assert = require("node:assert");
var S = require("../static/arcade/engine.js");

var passed = 0;
function t(name, fn) {
  fn();
  passed++;
  console.log("ok - " + name);
}

/* ---------- mulberry32 determinism ---------- */
t("mulberry32: same seed gives identical stream", function () {
  var a = S.mulberry32(12345), b = S.mulberry32(12345);
  for (var i = 0; i < 1000; i++) assert.strictEqual(a(), b(), "stream diverged at " + i);
});
t("mulberry32: different seeds differ", function () {
  var a = S.mulberry32(1), b = S.mulberry32(2);
  var same = 0;
  for (var i = 0; i < 100; i++) if (a() === b()) same++;
  assert.ok(same < 100, "streams unexpectedly identical");
});
t("mulberry32: values in [0,1)", function () {
  var r = S.mulberry32(999);
  for (var i = 0; i < 500; i++) { var v = r(); assert.ok(v >= 0 && v < 1, "out of range " + v); }
});

/* ---------- dungeon gen ---------- */
function canonFloor(f) {
  return JSON.stringify({
    rooms: f.rooms, tiles: f.tiles,
    spawn: [f.spawn.tx, f.spawn.ty], stairs: [f.stairs.tx, f.stairs.ty],
    arena: f.arenaRoom,
    enemies: f.enemies.map(function (e) { return [e.id, Math.round(e.x), Math.round(e.y), e.hp, e.atk, e.elite]; }),
    npcs: f.npcs.map(function (n) { return [n.id, Math.round(n.x), Math.round(n.y)]; }),
    items: f.items.map(function (it) { return [it.kind, it.ref, Math.round(it.x), Math.round(it.y)]; }),
    nodes: f.nodes.length, keys: f.keys.length, beacons: f.beacons.length,
    warden: f.wardenId
  });
}

t("genFloor: same seed gives same floor", function () {
  var d = S.defaultData();
  var f1 = S.genFloor(424242, 3, d), f2 = S.genFloor(424242, 3, d);
  assert.strictEqual(canonFloor(f1), canonFloor(f2));
});
t("genFloor: different seeds give different floors", function () {
  var d = S.defaultData();
  var f1 = S.genFloor(1, 1, d), f2 = S.genFloor(2, 1, d);
  assert.notStrictEqual(canonFloor(f1), canonFloor(f2));
});
t("genFloor: room count in range 8-14", function () {
  var d = S.defaultData();
  for (var s = 0; s < 50; s++) {
    var f = S.genFloor(s * 7919 + 13, 1, d);
    assert.ok(f.rooms.length >= 8 && f.rooms.length <= 14,
      "seed " + s + " gave " + f.rooms.length + " rooms");
  }
});
t("genFloor: stairs reachable from spawn via flood fill", function () {
  var d = S.defaultData();
  var f = S.genFloor(777, 5, d);
  assert.ok(S.floodReachable(f), "stairs not reachable");
});
t("genFloor: warden id matches layer", function () {
  var d = S.defaultData();
  var expect = ["prefetch", "fragmentor", "arbiter", "redactor", "panic", "lithographer", "watchdog"];
  for (var depth = 1; depth <= 7; depth++) {
    var f = S.genFloor(1000 + depth, depth, d);
    assert.strictEqual(f.wardenId, expect[depth - 1], "depth " + depth);
  }
});
t("genFloor: depth 2 has 3 corruption nodes, depth 4 has 3 keys, depth 6 has 4 beacons", function () {
  var d = S.defaultData();
  assert.strictEqual(S.genFloor(55, 2, d).nodes.length, 3);
  assert.strictEqual(S.genFloor(55, 4, d).keys.length, 3);
  assert.strictEqual(S.genFloor(55, 6, d).beacons.length, 4);
});
t("100-seed sweep: deterministic, room count in range, stairs reachable", function () {
  var d = S.defaultData();
  for (var s = 0; s < 100; s++) {
    var seed = s * 104729 + 7;
    var f1 = S.genFloor(seed, (s % 7) + 1, d);
    var f2 = S.genFloor(seed, (s % 7) + 1, d);
    assert.strictEqual(canonFloor(f1), canonFloor(f2), "non-deterministic at seed " + seed);
    assert.ok(f1.rooms.length >= 8 && f1.rooms.length <= 14, "room count out of range at seed " + seed);
    assert.ok(S.floodReachable(f1), "stairs unreachable at seed " + seed);
  }
});

/* ---------- combat math ---------- */
t("damage: max(1, ATK - DEF)", function () {
  assert.strictEqual(S.damage(12, 2), 10);
  assert.strictEqual(S.damage(3, 10), 1);
  assert.strictEqual(S.damage(5, 5), 1);
  assert.strictEqual(S.damage(44, 8), 36);
});
t("scaleStat: +15 percent per depth multiplicative", function () {
  assert.strictEqual(S.scaleStat(20, 1), 20);
  assert.strictEqual(S.scaleStat(20, 2), Math.round(20 * 1.15));
  assert.strictEqual(S.scaleStat(20, 3), Math.round(20 * 1.15 * 1.15));
  assert.strictEqual(S.scaleStat(20, 4), Math.round(20 * Math.pow(1.15, 3)));
  assert.strictEqual(S.scaleStat(100, 7), Math.round(100 * Math.pow(1.15, 6)));
});
t("eliteStats: 2.5x, rounded", function () {
  var e = S.eliteStats(20, 6);
  assert.deepStrictEqual(e, {hp: 50, atk: 15});
  var e2 = S.eliteStats(23, 7);
  assert.deepStrictEqual(e2, {hp: Math.round(23 * 2.5), atk: Math.round(7 * 2.5)});
});
t("scaled enemies: depth 7 segfault stats", function () {
  var d = S.defaultData();
  var f = S.genFloor(31337, 7, d);
  var sg = null;
  for (var i = 0; i < f.enemies.length; i++)
    if (f.enemies[i].id === "segfault" && !f.enemies[i].elite) { sg = f.enemies[i]; break; }
  assert.ok(sg, "no non-elite segfault found");
  assert.strictEqual(sg.hp, Math.round(45 * Math.pow(1.15, 6)));
  assert.strictEqual(sg.atk, Math.round(12 * Math.pow(1.15, 6)));
});
t("elites only from depth 4", function () {
  var d = S.defaultData();
  var anyEliteShallow = false, anyEliteDeep = false;
  for (var s = 0; s < 30; s++) {
    var f1 = S.genFloor(s + 5000, 3, d), f2 = S.genFloor(s + 5000, 5, d);
    var i;
    for (i = 0; i < f1.enemies.length; i++) if (f1.enemies[i].elite) anyEliteShallow = true;
    for (i = 0; i < f2.enemies.length; i++) if (f2.enemies[i].elite) anyEliteDeep = true;
  }
  assert.ok(!anyEliteShallow, "elite found before depth 4");
  assert.ok(anyEliteDeep, "no elites at depth 5 across 30 seeds");
});

/* ---------- NPC AI transitions ---------- */
function mkEnemy(over) {
  var e = {id: "nullpointer", x: 0, y: 0, hp: 20, state: "wander",
    sight: 7 * 24, attackRange: 1.2 * 24, fleeAt: 0, behavior: "chase"};
  for (var k in over) e[k] = over[k];
  return e;
}
t("enemyBrain: wander far, chase in sight, attack in range", function () {
  var hero = {x: 1000, y: 1000};
  var e = mkEnemy({});
  assert.strictEqual(S.enemyBrain(e, hero), "wander");
  hero = {x: 100, y: 0}; /* within sight (168px) */
  assert.strictEqual(S.enemyBrain(e, hero), "chase");
  hero = {x: 20, y: 0}; /* within attack range (28.8px) */
  assert.strictEqual(S.enemyBrain(e, hero), "attack");
});
t("enemyBrain: flees at low HP when flagged", function () {
  var hero = {x: 20, y: 0};
  var e = mkEnemy({id: "dangling_thread", hp: 3, fleeAt: 4});
  assert.strictEqual(S.enemyBrain(e, hero), "flee");
  var e2 = mkEnemy({id: "dangling_thread", hp: 14, fleeAt: 4});
  assert.strictEqual(S.enemyBrain(e2, hero), "attack");
});
t("enemyBrain: non-fleeing type never flees", function () {
  var hero = {x: 20, y: 0};
  var e = mkEnemy({hp: 1, fleeAt: 0});
  assert.strictEqual(S.enemyBrain(e, hero), "attack");
});

/* ---------- Memory Leak growth ---------- */
t("leakTick: +2 HP per 10s", function () {
  var leak = {id: "memory_leak", hp: 30, growT: 0};
  S.leakTick(leak, 10);
  assert.strictEqual(leak.hp, 32);
  S.leakTick(leak, 25);
  assert.strictEqual(leak.hp, 36);
  assert.ok(Math.abs(leak.growT - 5) < 1e-9, "leftover growT should be 5, got " + leak.growT);
});
t("leakTick: capped at 60", function () {
  var leak = {id: "memory_leak", hp: 59, growT: 0};
  S.leakTick(leak, 100);
  assert.strictEqual(leak.hp, 60);
  S.leakTick(leak, 1000);
  assert.strictEqual(leak.hp, 60);
});
t("leakTick: ignores other enemies", function () {
  var e = {id: "segfault", hp: 45, growT: 0};
  S.leakTick(e, 100);
  assert.strictEqual(e.hp, 45);
});

/* ---------- warden pattern telegraph ---------- */
t("warden pattern: 1s wind-up before fire", function () {
  var w = {};
  S.startPattern(w, "slam");
  assert.ok(w.windup && w.windup.t === S.WINDUP_TIME, "windup not set to 1.0s");
  assert.strictEqual(S.tickPattern(w, 0.5), null, "fired too early");
  assert.strictEqual(S.tickPattern(w, 0.49), null, "fired too early");
  assert.strictEqual(S.tickPattern(w, 0.01), "slam", "did not fire after 1s");
  assert.strictEqual(w.windup, null, "windup not cleared");
});
t("warden pattern: id passes through", function () {
  var w = {};
  S.startPattern(w, "sweep");
  S.tickPattern(w, 1.0);
  assert.strictEqual(S.tickPattern(w, 0.001), null);
});

/* ---------- missions: scripted walkthrough of all 10 (SPEC schema) ---------- */
t("missions: all 10 completable in scripted walkthrough", function () {
  var missions = S.defaultMissions();
  assert.strictEqual(missions.length, 10, "expected 10 missions");
  var byId = {};
  missions.forEach(function (m) { byId[m.id] = m; });
  var s = S.newStats();
  function done(id) { return S.missionDone(byId[id], s); }
  /* 1. Cold Boot: reach the stairs on layer 1 */
  assert.ok(!done("cold_boot"));
  s.descended[1] = true;
  assert.ok(done("cold_boot"), "cold_boot");
  /* 2. Defragment: destroy 3 corruption nodes */
  s.nodes = 2;
  assert.ok(!done("defragment"));
  s.nodes = 3;
  assert.ok(done("defragment"), "defragment");
  /* 3. Clear the Bus: kill 12 hostiles */
  s.hostileKills = 11;
  assert.ok(!done("clear_bus"));
  s.hostileKills = 12;
  assert.ok(done("clear_bus"), "clear_bus");
  /* 4. Redacted: 3 registry keys THEN the stairs */
  s.keys = 3;
  assert.ok(!done("redacted"), "redacted should need stairs too");
  s.descended[4] = true;
  assert.ok(done("redacted"), "redacted");
  /* 5. Kernel Panic: boss Panic */
  assert.ok(!done("kernel_panic"));
  s.wardenKills.panic = true;
  assert.ok(done("kernel_panic"), "kernel_panic");
  /* 6. Etched in Silicon: reboot 4 beacons */
  s.beacons = 4;
  assert.ok(done("etched_silicon"), "etched_silicon");
  /* 7. Halt and Catch Fire: boss Watchdog */
  assert.ok(!done("halt_catch_fire"));
  s.wardenKills.watchdog = true;
  assert.ok(done("halt_catch_fire"), "halt_catch_fire");
  /* 8. Pest Control: kill 8 Null Pointers */
  s.nullKills = 8;
  assert.ok(done("pest_control"), "pest_control");
  /* 9. Lost Pages: collect 5 data shards */
  s.shards = 5;
  assert.ok(done("lost_pages"), "lost_pages");
  /* 10. Field Medicine: collect 3 ichor vials */
  s.ichor = 3;
  assert.ok(done("field_medicine"), "field_medicine");
});
t("missions: progress counts clamp to goal", function () {
  var missions = S.defaultMissions();
  var s = S.newStats();
  s.nodes = 99;
  var m = null;
  for (var i = 0; i < missions.length; i++) if (missions[i].id === "defragment") m = missions[i];
  assert.strictEqual(S.missionCount(m, s), 3);
  assert.strictEqual(S.missionGoal(m), 3);
});
t("missions: defaultMissions matches the SPEC contract schema", function () {
  var kinds = {};
  S.defaultMissions().forEach(function (m) {
    assert.ok(m.objective, m.id + " has objective");
    assert.ok(!("goal" in m), m.id + " must not carry the old goal key");
    kinds[m.objective.kind] = true;
    if (m.objective.kind !== "reach_stairs" && m.objective.kind !== "boss")
      assert.ok(m.objective.count > 0, m.id + " has a count");
    var r = m.reward || {};
    assert.ok(!("maxhp" in r), m.id + " reward must use max_hp, not maxhp");
  });
  ["reach_stairs", "destroy", "kill", "collect", "reboot", "boss"].forEach(function (k) {
    assert.ok(kinds[k], "objective kind covered: " + k);
  });
});

/* ---------- save blob shape ---------- */
t("makeSaveBlob: shape and size", function () {
  var blob = S.makeSaveBlob({
    seed: 123, depth: 4, floorSeed: 999,
    hero: {hp: 80, maxhp: 125, atk: 22, def: 4, gold: 300, kills: 55,
           potions: 2, weapon: "w_bus", armor: "a_mesh", x: 100, y: 200},
    stats: S.newStats(),
    missions: {cold_boot: {done: true}}
  });
  assert.ok(blob.length <= 16384, "blob too large: " + blob.length);
  var b = JSON.parse(blob);
  assert.strictEqual(b.v, 1);
  assert.strictEqual(b.seed, 123);
  assert.strictEqual(b.depth, 4);
  assert.strictEqual(b.floorSeed, 999);
  assert.strictEqual(b.hero.hp, 80);
  assert.strictEqual(b.hero.maxhp, 125);
  assert.strictEqual(b.hero.atk, 22);
  assert.strictEqual(b.hero.def, 4);
  assert.strictEqual(b.hero.gold, 300);
  assert.strictEqual(b.hero.kills, 55);
  assert.strictEqual(b.hero.potions, 2);
  assert.strictEqual(b.hero.weapon, "w_bus");
  assert.strictEqual(b.hero.armor, "a_mesh");
  assert.ok(b.stats && b.stats.descended !== undefined, "stats missing");
  assert.ok(b.missions && b.missions.cold_boot.done === true, "missions missing");
});

/* ---------- R4: integration against the real /arcade/data payload ---------- */
var fs = require("node:fs");
var path = require("node:path");
var fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "data.fixture.json"), "utf8"));

t("R4: fixture carries the SPEC shape, no fallback-only keys", function () {
  ["hero", "layers", "missions", "npcs", "enemies", "loot", "dialogue"].forEach(function (k) {
    assert.ok(fixture[k], "missing top-level key " + k);
  });
  assert.strictEqual(fixture.layers.length, 7, "seven layers");
  assert.strictEqual(fixture.missions.length, 10, "ten missions");
  assert.ok(!("wanderer_lines" in fixture), "server ships no wanderer_lines key");
});

t("R4: genFloor boots past the intro on the real payload, all 7 depths", function () {
  var expect = ["prefetch", "fragmentor", "arbiter", "redactor", "panic", "lithographer", "watchdog"];
  for (var depth = 1; depth <= 7; depth++) {
    var f = S.genFloor(9000 + depth, depth, fixture);
    assert.ok(f.rooms.length >= 8 && f.rooms.length <= 14,
      "depth " + depth + ": room count " + f.rooms.length);
    assert.ok(S.floodReachable(f), "depth " + depth + ": stairs reachable");
    assert.strictEqual(f.wardenId, expect[depth - 1], "depth " + depth + ": warden");
    assert.ok(f.arenaRoom >= 0 && f.arenaRoom < f.rooms.length,
      "depth " + depth + ": warden arena present");
    var wanderers = f.npcs.filter(function (n) { return n.id.indexOf("wanderer") === 0; });
    assert.strictEqual(wanderers.length, 2, "depth " + depth + ": wanderers spawn");
  }
});

function driveStats(s, m, delta) {
  /* Drive one mission's counters to (count + delta). delta -1 must leave
     the mission incomplete; delta 0 must complete it. */
  var g = m.objective || {};
  var n = Math.max(0, (g.count || 1) + delta);
  if (delta >= 0 && g.then === "reach_stairs") s.descended[m.layer] = true;
  switch (g.kind) {
    case "reach_stairs": if (delta >= 0) s.descended[m.layer] = true; return;
    case "destroy": s.nodes = n; return;
    case "kill":
      if (g.target === "nullpointer") s.nullKills = n; else s.hostileKills = n;
      return;
    case "collect":
      if (g.target === "registry_key") s.keys = n;
      else if (g.target === "data_shard") s.shards = n;
      else if (g.target === "ichor_vial") s.ichor = n;
      return;
    case "reboot": s.beacons = n; return;
    case "boss": if (delta >= 0) s.wardenKills[g.target] = true; return;
  }
}

t("R4: every fixture mission completes and its reward applies", function () {
  var kindsSeen = {};
  fixture.missions.forEach(function (m) {
    var g = m.objective || {};
    kindsSeen[g.kind] = true;
    assert.ok(g.kind, m.id + " has an objective kind");
    var partial = S.newStats();
    driveStats(partial, m, -1);
    if (g.kind !== "boss" && g.kind !== "reach_stairs")
      assert.ok(!S.missionDone(m, partial), m.id + " not done one short");
    var s = S.newStats();
    driveStats(s, m, 0);
    assert.ok(S.missionDone(m, s), m.id + " completes");
    assert.strictEqual(S.missionCount(m, s), S.missionGoal(m), m.id + " count hits goal");
    var hero = {hp: 80, maxhp: 100, atk: 12, def: 2, gold: 0, kills: 0,
                potions: 1, weapon: "w_stick", armor: null};
    S.applyReward(hero, m.reward, fixture.loot); /* must not throw */
    var r = m.reward || {};
    if (r.gold) assert.ok(hero.gold >= r.gold, m.id + ": gold reward applied");
    if (r.max_hp) assert.strictEqual(hero.maxhp, 100 + r.max_hp, m.id + ": max_hp reward applied");
    if (r.potions) assert.strictEqual(hero.potions, 1 + r.potions, m.id + ": potion reward applied");
    if (r.weapon) assert.strictEqual(hero.weapon, r.weapon, m.id + ": weapon reward applied");
    if (r.armor) assert.strictEqual(hero.armor, r.armor, m.id + ": armor reward applied");
  });
  ["reach_stairs", "destroy", "kill", "collect", "reboot", "boss"].forEach(function (k) {
    assert.ok(kindsSeen[k], "objective kind covered: " + k);
  });
});

/* ---------- C1: server warden pattern ids ---------- */
function fakeGame(data) {
  var g = Object.create(S.Game.prototype);
  g.hero = {x: 205, y: 205, hp: 100, maxhp: 100, atk: 12, def: 2};
  g.data = data;
  g.depth = 3;
  g.rng = S.mulberry32(7);
  g.projectiles = [];
  g.beams = [];
  g.floaters = [];
  g.frame = 0;
  g.chainSlam = 0;
  g.darknessT = 0;
  g.hurt = 0;
  g.hurtHero = function () { g.hurt++; };
  g.log = function () {};
  g.moveEntity = function () {};
  var tiles = [];
  for (var i = 0; i < S.GW * S.GH; i++) tiles.push(1);
  g.floor = {enemies: [], tiles: tiles};
  return g;
}
function fireAs(g, pid) {
  var w = {x: 200, y: 200, atk: 20, def: 3, name: "Test Warden", patterns: [pid]};
  S.Game.prototype.firePattern.call(g, w, pid);
  return w;
}

t("C1: every server warden pattern id fires an effect", function () {
  var data = S.defaultData();
  var g = fakeGame(data), w;
  w = fireAs(g, "charge");
  assert.ok(w.dashT > 0, "charge dashes");
  g = fakeGame(data); w = fireAs(g, "summon");
  assert.strictEqual(g.floor.enemies.length, 2, "summon adds 2");
  g = fakeGame(data); w = fireAs(g, "slam");
  assert.ok(g.floaters.length > 0 && g.hurt > 0, "slam lands");
  g = fakeGame(data); w = fireAs(g, "scatter");
  assert.strictEqual(g.projectiles.length, 8, "scatter fires 8");
  g = fakeGame(data); w = fireAs(g, "lane_dash");
  assert.ok(w.dashT > 0 && w.dashVy === 0, "lane_dash is a horizontal dash");
  g = fakeGame(data); w = fireAs(g, "rotating_shots");
  assert.strictEqual(g.projectiles.length, 12, "rotating_shots fires 12");
  g = fakeGame(data); w = fireAs(g, "blackout");
  assert.ok(g.darknessT > 0, "blackout darkens");
  g = fakeGame(data); w = fireAs(g, "heavy_melee");
  assert.ok(g.hurt > 0, "heavy_melee hits up close");
  g = fakeGame(data); w = fireAs(g, "enrage");
  assert.ok(w.enraged && w.atk > 20, "enrage empowers");
  g = fakeGame(data); w = fireAs(g, "double_slam");
  assert.ok(g.floaters.length > 0 && g.chainSlam > 0, "double_slam chains");
  g = fakeGame(data); w = fireAs(g, "etch_lines");
  assert.strictEqual(g.beams.length, 3, "etch_lines draws 3 beams");
  g = fakeGame(data); w = fireAs(g, "adds");
  assert.strictEqual(g.floor.enemies.length, 3, "adds spawns 3");
  g = fakeGame(data); w = fireAs(g, "sweep");
  assert.strictEqual(g.projectiles.length, 10, "sweep fires 10");
});

t("C1: all_patterns runs the full set", function () {
  var g = fakeGame(S.defaultData());
  var w = fireAs(g, "all_patterns");
  assert.ok(w.dashT > 0, "barrage dashes");
  assert.ok(g.projectiles.length >= 30, "barrage fires projectiles, got " + g.projectiles.length);
  assert.strictEqual(g.beams.length, 3, "barrage etches lines");
  assert.ok(g.floor.enemies.length >= 5, "barrage summons, got " + g.floor.enemies.length);
  assert.ok(g.darknessT > 0, "barrage blacks out");
  assert.ok(g.chainSlam > 0, "barrage chains a slam");
});

/* ---------- C1: quest givers, wanderer dialogue ---------- */
function talkGame() {
  var g = Object.create(S.Game.prototype);
  g.data = S.defaultData();
  g.missions = {};
  g.panel = null;
  g.shopFor = null;
  g.talkNpc = null;
  g.talkLine = 0;
  g.logged = [];
  g.log = function (t) { g.logged.push(t); };
  return g;
}
function talkThrough(g, npcId) {
  var n = {id: npcId, state: "idle", name: npcId};
  g.startTalk(n);
  assert.strictEqual(g.panel, "talk", npcId + " opens dialogue");
  var def = g.npcDef(npcId === "wanderer0" ? "wanderer" : npcId);
  for (var i = 0; i < def.dialogue.length; i++) g.advanceTalk();
  return n;
}

t("C1: talking to Byte accepts pest_control, then opens the shop", function () {
  var g = talkGame();
  talkThrough(g, "byte");
  assert.ok(g.missions.pest_control && g.missions.pest_control.active,
    "pest_control accepted from Byte");
  assert.strictEqual(g.panel, "shop", "Byte opens the shop after the quest");
  var before = g.logged.length;
  talkThrough(g, "byte");
  assert.strictEqual(g.logged.length, before, "re-taking the quest is quiet");
});

t("C1: Ada and Medic Cache grant their side quests", function () {
  var g = talkGame();
  talkThrough(g, "ada");
  assert.ok(g.missions.lost_pages && g.missions.lost_pages.active, "lost_pages accepted");
  assert.strictEqual(g.panel, null, "Ada closes after the quest");
  g = talkGame();
  talkThrough(g, "medic");
  assert.ok(g.missions.field_medicine && g.missions.field_medicine.active,
    "field_medicine accepted");
  assert.strictEqual(g.panel, "shop", "Medic opens the shop after the quest");
});

t("C1: wanderers talk from the NPC table, no wanderer_lines key", function () {
  var d = S.defaultData();
  assert.ok(!("wanderer_lines" in d), "fallback data has no wanderer_lines either");
  var f = S.genFloor(424242, 1, d);
  var wn = null;
  for (var i = 0; i < f.npcs.length; i++)
    if (f.npcs[i].id.indexOf("wanderer") === 0) { wn = f.npcs[i]; break; }
  assert.ok(wn, "a wanderer spawned");
  var g = talkGame();
  var n = {id: wn.id, state: "idle", name: wn.name};
  g.startTalk(n);
  var def = g.npcDef("wanderer");
  for (var k = 0; k < def.dialogue.length; k++) g.advanceTalk();
  assert.strictEqual(g.panel, null, "wanderer closes after dialogue");
  assert.ok(!g.missions.pest_control, "wanderer grants no quest");
});

console.log("\n" + passed + " tests passed.");
