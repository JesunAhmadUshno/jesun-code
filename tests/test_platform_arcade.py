"""Task 4 (arcade) tests: STACKFALL pages, run APIs, throttle, security.

Live tests run against a test app that mirrors platform/app.jc plus the
arcade wiring (bring in platform_arcade_data, bring in platform_arcade,
arcade_init, arcade_routes) under the bootstrap interpreter AND the
self-hosted walker. platform/app.jc itself is NOT edited: the test copy
is rewritten in ArcadeServer._write_app.

The platform_arcade_data and platform_arcade packages are installed
verbatim from platform/arcade/content.jc and platform/arcade/server.jc
by the harness (see platform_harness.MODULES).

The end throttle is per-IP with a 60s sliding window, shared by every
test in a class. Each test resets it first through the test-only route
POST /arcade/test/reset-throttle (exists only in the test app copy),
so tests stay independent of order and of each other's budgets.
"""

import json
import os
import sys
import time as _time
import unittest
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from platform_harness import (  # noqa: E402
    CONFIG_REWRITES,
    MODULES,
    PLATFORM,
    LiveCase,
    PlatformServer,
    fixture_password_hash,
    header_values,
    parse_response,
    session_cookie_from,
)

MODULES["platform_arcade_data"] = os.path.join(PLATFORM, "arcade", "content.jc")
MODULES["platform_arcade"] = os.path.join(PLATFORM, "arcade", "server.jc")

ARCADE_USERS = [
    ("run_ada", "ada@example.com", "member"),
    ("run_bob", "bob@example.com", "member"),
]
ARCADE_PASSWORD = "arcade-pass-1"

XSS_CORPUS = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "\"><svg onload=alert(1)>",
    "'; DROP TABLE arcade_runs; --",
    "<iframe src=javascript:alert(1)>",
]

SQLI_CORPUS = [
    "1 OR 1=1",
    "1; DROP TABLE arcade_runs; --",
    "' OR '1'='1",
    "0 UNION SELECT * FROM users --",
    "1 AND SLEEP(5) --",
]


class ArcadeServer(PlatformServer):
    """App copy that also wires platform_arcade_data + platform_arcade.

    platform/app.jc untouched. Bring-in order matches the arcade SPEC:
    the data package comes before the server package.
    """

    def _write_app(self):
        with open(os.path.join(PLATFORM, "app.jc"), encoding="utf-8") as f:
            src = f.read()
        for line, tmpl in CONFIG_REWRITES:
            assert line in src, f"config line missing from platform/app.jc: {line!r}"
            src = src.replace(
                line,
                tmpl.format(
                    port=self.port,
                    db=self.db,
                    static=os.path.join(PLATFORM, "static"),
                ),
            )
        assert 'bring in "platform_admin"' in src, "admin bring-in missing"
        src = src.replace(
            'bring in "platform_admin"',
            'bring in "platform_admin"\n'
            'bring in "platform_arcade_data"\n'
            'bring in "platform_arcade"',
        )
        assert "admin_init with platform_db" in src, "admin_init anchor missing"
        src = src.replace(
            "admin_init with platform_db",
            "admin_init with platform_db\narcade_init with platform_db",
        )
        assert "\nadmin_routes\n" in src, "admin_routes anchor missing"
        src = src.replace("\nadmin_routes\n", "\nadmin_routes\narcade_routes\n")
        if self.extra_routes:
            anchor = "serve_start with platform_port"
            assert anchor in src, "serve_start anchor missing"
            src = src.replace(anchor, self.extra_routes + "\n" + anchor)
        app_path = os.path.join(self.tmp, "app.jc")
        with open(app_path, "w", encoding="utf-8") as f:
            f.write(src)
        self.app_path = app_path


# Test-only route (test app copy only): reset the arcade end throttle.
ARCADE_TEST_ROUTES = """
to arcade_test_reset_throttle with request
    arcade_reset_throttle
    give back {"status": 200, "headers": {"content-type": "application/json"}, "body": json of {"ok": true}}

serve_route with "POST /arcade/test/reset-throttle" and arcade_test_reset_throttle
"""


class ArcadeLiveCase(LiveCase):
    extra_routes = ARCADE_TEST_ROUTES

    @classmethod
    def setUpClass(cls):
        cls.server = ArcadeServer(walker=cls.walker, extra_routes=cls.extra_routes)
        cls.server.start()


class ArcadeTests:
    """Test methods shared by the bootstrap and walker runs.

    A plain mixin (NOT a TestCase): only the concrete subclasses below
    are collected, so every test runs exactly once per interpreter.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.server.wait_for_table("users")
        cls.server.wait_for_table("arcade_runs")
        cls.server.wait_for_table("arcade_saves")
        cls.server.wait_for_table("arcade_missions_done")
        con = cls.server.db_connect()
        try:
            for handle, email, role in ARCADE_USERS:
                salt, digest = fixture_password_hash(ARCADE_PASSWORD)
                con.execute(
                    "INSERT INTO users (handle, email, password_hash, salt, role, created_at)"
                    " VALUES (?, ?, ?, ?, ?, ?)",
                    (handle, email, digest, salt, role, "2026-10-07"),
                )
            con.commit()
        finally:
            con.close()
        cls.ada_cookie = cls._login_cookie("run_ada")
        cls.bob_cookie = cls._login_cookie("run_bob")

    def setUp(self):
        # The end throttle is per-IP and shared across tests; reset it so
        # each test starts with a full 10/min budget.
        raw = self.server.request("POST", "/arcade/test/reset-throttle")
        self.assert_status(raw, 200, "throttle reset")

    @classmethod
    def _login_cookie(cls, handle):
        raw = cls.server.post_form(
            "/login", {"login": handle, "password": ARCADE_PASSWORD}
        )
        _, headers, _ = parse_response(raw)
        sid = session_cookie_from(headers)
        assert sid, f"no session cookie logging in {handle}"
        return {"Cookie": f"jesun_session={sid}"}

    # -- small helpers --

    def post_json(self, path, payload, headers=None):
        body = json.dumps(payload)
        hdrs = {"Content-Type": "application/json"}
        hdrs.update(headers or {})
        return self.server.request("POST", path, headers=hdrs, body=body)

    def json_body(self, raw):
        status, headers, body = parse_response(raw)
        ctype = header_values(headers, "content-type")
        assert any(b"application/json" in v for v in ctype), f"content-type: {ctype}"
        return status, json.loads(body.decode("utf-8"))

    def start_run(self, cookie=None):
        raw = self.post_json("/arcade/run/start", {}, headers=cookie)
        status, payload = self.json_body(raw)
        self.assertEqual(status, 200, "run start")
        self.assertIn("run_id", payload, "run_id in start response")
        self.assertIn("seed", payload, "seed in start response")
        return payload["run_id"], payload["seed"]

    def end_run(self, run_id, cookie, depth=3, kills=10, gold=100, victory=False,
                missions=None):
        payload = {
            "run_id": run_id,
            "depth": depth,
            "kills": kills,
            "gold": gold,
            "victory": victory,
        }
        if missions is not None:
            payload["missions"] = missions
        raw = self.post_json("/arcade/run/end", payload, headers=cookie)
        return self.json_body(raw)

    # -- landing page --

    def test_landing_renders(self):
        raw = self.server.get("/arcade")
        self.assert_status(raw, 200, "GET /arcade")
        self.assert_body_has(raw, "STACKFALL", "title shown")
        self.assert_body_has(raw, "Seven layers down", "tagline shown")

    def test_landing_lore_and_controls(self):
        raw = self.server.get("/arcade")
        self.assert_status(raw, 200, "GET /arcade")
        self.assert_body_has(raw, "stack trace and a prayer", "intro lore shown")
        self.assert_body_has(raw, "WASD", "controls shown")
        self.assert_body_has(raw, "Mission log", "controls list the mission log key")

    def test_landing_npc_roster(self):
        raw = self.server.get("/arcade")
        self.assert_status(raw, 200, "GET /arcade")
        for name in ("Byte", "Ada", "Medic Cache", "Wanderer"):
            self.assert_body_has(raw, name, f"NPC {name} in roster")
        self.assert_body_has(raw, "last shop before nowhere", "NPC dialogue shown")

    def test_landing_npc_dialogue_escaped(self):
        # Ada's lore line carries double quotes; the render path must
        # escape them, which proves dialogue goes through escape_html.
        _, _, body = parse_response(self.server.get("/arcade"))
        text = body.decode("utf-8")
        self.assertIn("&quot;down is the only way&quot;", text,
                      "dialogue quotes are escaped")
        self.assertNotIn('"down is the only way"', text,
                         "no raw quotes from dialogue")

    def test_landing_career_stats_logged_in(self):
        run_id, _ = self.start_run(self.ada_cookie)
        self.end_run(run_id, self.ada_cookie, depth=4, kills=20, gold=150)
        raw = self.server.get("/arcade", headers=self.ada_cookie)
        self.assert_status(raw, 200, "GET /arcade logged in")
        self.assert_body_has(raw, "Best depth", "career stats shown")
        self.assert_body_has(raw, "Best score", "career score shown")

    def test_landing_no_career_stats_anonymous(self):
        _, _, body = parse_response(self.server.get("/arcade"))
        self.assertNotIn(b"Best depth", body, "no career stats for anonymous")

    def test_landing_leaderboard_preview(self):
        run_id, _ = self.start_run(self.ada_cookie)
        status, payload = self.end_run(run_id, self.ada_cookie, depth=2,
                                       kills=5, gold=50)
        self.assertEqual(status, 200, "end for preview seed")
        raw = self.server.get("/arcade")
        self.assert_body_has(raw, "run_ada", "ended run appears in preview")

    def test_landing_empty_board(self):
        # N7: actually assert the empty state: clear the board first so
        # earlier tests' seeded runs cannot satisfy the assertion.
        con = self.server.db_connect()
        try:
            con.execute("DELETE FROM arcade_runs")
            con.commit()
        finally:
            con.close()
        _, _, body = parse_response(self.server.get("/arcade"))
        text = body.decode("utf-8")
        self.assertIn("No runs on the board yet", text,
                      "empty board state renders")

    def test_landing_career_empty(self):
        # N6: a logged-in user with no runs gets "No runs yet.", not a
        # dangling "Best depth: .".
        con = self.server.db_connect()
        try:
            con.execute("DELETE FROM arcade_runs")
            con.commit()
        finally:
            con.close()
        raw = self.server.get("/arcade", headers=self.ada_cookie)
        self.assert_status(raw, 200, "GET /arcade logged in, no runs")
        self.assert_body_has(raw, "No runs yet", "empty career state")
        _, _, body = parse_response(raw)
        self.assertNotIn(b"Best depth:", body, "no dangling best-depth line")

    # -- play page --

    def test_play_page_renders(self):
        raw = self.server.get("/arcade/play")
        self.assert_status(raw, 200, "GET /arcade/play")
        self.assert_body_has(raw, 'id="game"', "canvas present")
        self.assert_body_has(raw, 'data-data-url="/arcade/data"',
                             "canvas carries the data URL")
        self.assert_body_has(raw, "/static/arcade/engine.js",
                             "engine script referenced")

    def test_play_page_login_state(self):
        _, _, anon = parse_response(self.server.get("/arcade/play"))
        self.assertIn(b'data-logged-in="false"', anon,
                      "anonymous viewer flagged")
        self.assertIn(b"Log in", anon, "anonymous sees the login note")
        _, _, authed = parse_response(
            self.server.get("/arcade/play", headers=self.ada_cookie))
        self.assertIn(b'data-logged-in="true"', authed,
                      "logged-in viewer flagged")

    def test_play_page_zero_inline_js(self):
        _, _, body = parse_response(self.server.get("/arcade/play"))
        text = body.decode("utf-8")
        self.assertNotIn("<script>", text, "no inline script block")
        self.assertEqual(text.count("<script"), 1,
                         "exactly one script tag (the engine)")

    # -- leaderboard page --

    def test_leaderboard_renders(self):
        raw = self.server.get("/arcade/leaderboard")
        self.assert_status(raw, 200, "GET /arcade/leaderboard")
        self.assert_body_has(raw, "STACKFALL leaderboard", "leaderboard title")

    def test_leaderboard_shows_ended_run(self):
        run_id, _ = self.start_run(self.bob_cookie)
        status, payload = self.end_run(run_id, self.bob_cookie, depth=5,
                                       kills=40, gold=300, victory=False)
        self.assertEqual(status, 200, "end")
        self.assertEqual(payload["score"], 5 * 1000 + 40 * 25 + 300,
                         "score math: depth*1000 + kills*25 + gold")
        raw = self.server.get("/arcade/leaderboard")
        self.assert_body_has(raw, "run_bob", "ended run listed")
        self.assert_body_has(raw, str(payload["score"]), "score listed")

    def test_leaderboard_victory_bonus(self):
        run_id, _ = self.start_run(self.ada_cookie)
        # O2: a victory claim needs the run saved at depth 7 first.
        self.post_json(
            "/arcade/run/save",
            {"run_id": run_id, "depth": 7, "hp": 60, "gold": 500,
             "kills": 100, "blob": "{}"},
            headers=self.ada_cookie,
        )
        status, payload = self.end_run(run_id, self.ada_cookie, depth=7,
                                       kills=100, gold=500, victory=True)
        self.assertEqual(status, 200, "victory end")
        self.assertEqual(payload["score"], 7 * 1000 + 100 * 25 + 500 + 5000,
                         "victory adds 5000")

    def test_end_victory_without_depth7_save_400(self):
        # O2: victory:true is rejected unless the last save is at depth 7.
        run_id, _ = self.start_run(self.ada_cookie)
        status, payload = self.end_run(run_id, self.ada_cookie, depth=7,
                                       kills=100, gold=500, victory=True)
        self.assertEqual(status, 400, "victory with no save at all")
        self.assertIn("depth 7", payload["error"], "plain-English error")
        run_id2, _ = self.start_run(self.ada_cookie)
        self.post_json(
            "/arcade/run/save",
            {"run_id": run_id2, "depth": 6, "hp": 60, "gold": 100,
             "kills": 10, "blob": "{}"},
            headers=self.ada_cookie,
        )
        status2, payload2 = self.end_run(run_id2, self.ada_cookie, depth=7,
                                         kills=100, gold=500, victory=True)
        self.assertEqual(status2, 400, "victory with a depth-6 save")

    def test_leaderboard_escapes_handles(self):
        evil = "<script>alert(1)</script>"
        con = self.server.db_connect()
        try:
            con.execute(
                "INSERT INTO arcade_runs (user_handle, seed, depth, kills, gold,"
                " score, state, victory, started_at, updated_at)"
                " VALUES (?, 1, 1, 1, 1, 99999, 'dead', 0, '2026-10-07', '2026-10-07')",
                (evil,),
            )
            con.commit()
        finally:
            con.close()
        # Score 99999 lands the evil handle in the /arcade top-5 preview
        # as well as the full leaderboard page.
        for path in ("/arcade/leaderboard", "/arcade"):
            _, _, body = parse_response(self.server.get(path))
            self.assertNotIn(evil.encode("utf-8"), body,
                             f"raw handle not rendered on {path}")
            self.assertIn(b"&lt;script&gt;", body,
                          f"handle escaped on {path}")

    @staticmethod
    def _escape_html(text):
        # Mirrors the html package's escape_html (& < > ", not ').
        return (text.replace("&", "&amp;").replace("<", "&lt;")
                    .replace(">", "&gt;").replace('"', "&quot;"))

    def test_leaderboard_xss_corpus(self):
        con = self.server.db_connect()
        try:
            for i, payload in enumerate(XSS_CORPUS):
                con.execute(
                    "INSERT INTO arcade_runs (user_handle, seed, depth, kills,"
                    " gold, score, state, victory, started_at, updated_at)"
                    " VALUES (?, 1, 1, 1, 1, ?, 'dead', 0, '2026-10-07', '2026-10-07')",
                    (f"xss_{i}:" + payload, 50000 + i),
                )
            con.commit()
        finally:
            con.close()
        _, _, body = parse_response(self.server.get("/arcade/leaderboard"))
        text = body.decode("utf-8")
        for i, payload in enumerate(XSS_CORPUS):
            with self.subTest(payload=payload):
                escaped = self._escape_html(payload)
                self.assertIn(f"xss_{i}:{escaped}", text,
                              "handle rendered escaped")
                if payload != escaped:
                    self.assertNotIn(payload, text,
                                     "raw XSS payload not rendered")
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", text,
                      "script payload escaped")
        self.assertIn("&lt;img", text, "img payload escaped")

    # -- data route --

    def test_data_json_shape(self):
        raw = self.server.get("/arcade/data")
        status, payload = self.json_body(raw)
        self.assertEqual(status, 200, "GET /arcade/data")
        for key in ("hero", "layers", "missions", "npcs", "enemies", "loot",
                    "dialogue"):
            self.assertIn(key, payload, f"top-level key {key}")
        hero = payload["hero"]
        self.assertEqual(
            hero, {"hp": 100, "atk": 12, "def": 2, "potions": 3, "potion_heal": 40},
            "hero stats match the design doc",
        )
        self.assertEqual(len(payload["layers"]), 7, "seven layers")
        self.assertEqual(len(payload["missions"]), 10, "seven mains + three sides")
        self.assertEqual(len(payload["npcs"]), 4, "four NPCs")
        self.assertEqual(len(payload["enemies"]), 7, "seven enemies")
        self.assertEqual(len(payload["loot"]["weapons"]), 5, "five weapons")
        self.assertEqual(len(payload["loot"]["armor"]), 3, "three armor")
        for key in ("intro", "death", "victory"):
            self.assertIn(key, payload["dialogue"], f"dialogue key {key}")
            self.assertTrue(payload["dialogue"][key], f"{key} lines non-empty")

    def test_data_layer_content(self):
        _, payload = self.json_body(self.server.get("/arcade/data"))
        names = [layer["name"] for layer in payload["layers"]]
        self.assertEqual(
            names,
            ["The Cache", "The Heap", "The Bus", "The Registry", "The Kernel",
             "The Silicon", "The Core"],
            "layer names in order",
        )
        wardens = [layer["warden"]["name"] for layer in payload["layers"]]
        self.assertEqual(
            wardens,
            ["Prefetch", "Fragmentor", "Arbiter", "Redactor", "Panic",
             "Lithographer", "THE WATCHDOG"],
            "warden names in order",
        )
        core = payload["layers"][6]
        self.assertEqual(core["warden"]["hp"], 1200, "Watchdog has 1200 HP")
        self.assertEqual(core["enemies"], ["memory_leak", "deadlock", "bit_rotter",
                                           "segfault"],
                         "core enemy set")

    def test_data_enemy_stats(self):
        _, payload = self.json_body(self.server.get("/arcade/data"))
        by_id = {e["id"]: e for e in payload["enemies"]}
        segfault = by_id["segfault"]
        self.assertEqual(
            (segfault["hp"], segfault["atk"], segfault["def"]),
            (45, 12, 2),
            "Segfault stats match the design doc",
        )
        deadlock = by_id["deadlock"]
        self.assertEqual(deadlock["speed"], "very slow", "Deadlock speed")

    def test_data_mission_rewards(self):
        _, payload = self.json_body(self.server.get("/arcade/data"))
        by_id = {m["id"]: m for m in payload["missions"]}
        self.assertEqual(by_id["cold_boot"]["reward"], {"gold": 50},
                         "Cold Boot reward")
        self.assertEqual(by_id["kernel_panic"]["reward"], {"weapon": "w_kernel"},
                         "Kernel Panic reward")
        self.assertEqual(by_id["pest_control"]["reward"], {"gold": 80},
                         "Pest Control reward")
        self.assertEqual(by_id["halt_catch_fire"]["reward"], {"victory": True},
                         "final mission reward is victory")

    def test_data_npc_shops(self):
        _, payload = self.json_body(self.server.get("/arcade/data"))
        by_id = {n["id"]: n for n in payload["npcs"]}
        byte_shop = {item["id"]: item for item in by_id["byte"]["shop"]}
        self.assertEqual(byte_shop["potion"]["cost"], 25, "potion price")
        self.assertEqual(byte_shop["w_iron"]["atk"], 16, "Iron Dagger attack")
        self.assertEqual(by_id["medic"]["shop"][0]["cost"], 40,
                         "full repair price")

    def test_data_no_em_dash(self):
        _, _, body = parse_response(self.server.get("/arcade/data"))
        self.assertNotIn("—".encode("utf-8"), body, "no em dash in game data")

    def test_data_fixture_pinned(self):
        # R4: the checked-in fixture is byte-identical to the live
        # GET /arcade/data, which pins it to content.jc and kills drift.
        fixture_path = os.path.join(PLATFORM, "arcade", "data.fixture.json")
        with open(fixture_path, "rb") as f:
            expected = f.read()
        _, _, body = parse_response(self.server.get("/arcade/data"))
        self.assertEqual(body, expected,
                         "data.fixture.json drifts from /arcade/data")

    # -- run start --

    def test_start_returns_run_id_and_seed(self):
        run_id, seed = self.start_run(self.ada_cookie)
        self.assertIsInstance(run_id, int, "run_id is an integer")
        self.assertIsInstance(seed, int, "seed is an integer")
        con = self.server.db_connect()
        try:
            row = con.execute(
                "SELECT user_handle, state FROM arcade_runs WHERE id = ?",
                (run_id,),
            ).fetchone()
        finally:
            con.close()
        self.assertEqual(row[0], "run_ada", "run owned by the starter")
        self.assertEqual(row[1], "live", "new run is live")

    def test_start_anonymous_redirects_to_login(self):
        raw = self.post_json("/arcade/run/start", {})
        status, headers, _ = parse_response(raw)
        self.assertEqual(status, 302, "anonymous start redirects")
        loc = header_values(headers, "location")
        self.assertTrue(any(b"/login" in v for v in loc), f"location: {loc}")

    def test_second_start_abandons_first(self):
        first, _ = self.start_run(self.ada_cookie)
        self.post_json(
            "/arcade/run/save",
            {"run_id": first, "depth": 3, "hp": 70, "gold": 120, "kills": 15,
             "blob": "{}"},
            headers=self.ada_cookie,
        )
        second, _ = self.start_run(self.ada_cookie)
        self.assertNotEqual(first, second, "second start mints a new run")
        con = self.server.db_connect()
        try:
            rows = con.execute(
                "SELECT id, state, score FROM arcade_runs WHERE user_handle = ?"
                " ORDER BY id",
                ("run_ada",),
            ).fetchall()
        finally:
            con.close()
        by_id = {r[0]: (r[1], r[2]) for r in rows}
        self.assertEqual(by_id[first][0], "dead", "first run abandoned")
        self.assertEqual(by_id[second][0], "live", "second run live")
        # O3: the abandoned run keeps a computed score, not 0.
        self.assertEqual(by_id[first][1], 3 * 1000 + 15 * 25 + 120,
                         "abandon score from the last-saved row")

    def test_start_throttle_429s_after_thirty(self):
        # R1: 30 starts, then the 31st inside the same 60s window is
        # throttled. The setUp reset gives this test a full budget. On a
        # slow walker the 30 starts can spill past the 60s window, which
        # would make the 31st legitimately allowed; skip instead of
        # failing then (the sliding-window mechanism itself is proven on
        # bootstrap; same precedent as the end-throttle test).
        t0 = _time.time()
        for _ in range(30):
            self.start_run(self.ada_cookie)
        if _time.time() - t0 > 50:
            self.skipTest("30 starts took over 50s: outside the 60s window")
        raw = self.post_json("/arcade/run/start", {}, headers=self.ada_cookie)
        status, payload = self.json_body(raw)
        self.assertEqual(status, 429, "31st start in a minute is throttled")
        self.assertFalse(payload["ok"], "ok false on 429")
        _, headers, _ = parse_response(raw)
        retry = header_values(headers, "retry-after")
        self.assertTrue(retry and retry[0] == b"60",
                        f"Retry-After: 60 on the 429 (got {retry})")

    # -- run save --

    def test_save_round_trips_blob(self):
        run_id, _ = self.start_run(self.ada_cookie)
        blob = json.dumps({"floor": 3, "hp": 77, "note": "round-trip"})
        raw = self.post_json(
            "/arcade/run/save",
            {"run_id": run_id, "depth": 3, "hp": 77, "gold": 120, "kills": 15,
             "blob": blob},
            headers=self.ada_cookie,
        )
        status, payload = self.json_body(raw)
        self.assertEqual(status, 200, "save")
        self.assertEqual(payload, {"ok": True}, "save ok")
        con = self.server.db_connect()
        try:
            row = con.execute(
                "SELECT depth, hp, gold, kills, blob FROM arcade_saves"
                " WHERE run_id = ?",
                (run_id,),
            ).fetchone()
        finally:
            con.close()
        self.assertEqual(tuple(row), (3, 77, 120, 15, blob), "save row stored")

    def test_save_anonymous_redirects_to_login(self):
        raw = self.post_json("/arcade/run/save", {"run_id": 1})
        status, headers, _ = parse_response(raw)
        self.assertEqual(status, 302, "anonymous save redirects")
        loc = header_values(headers, "location")
        self.assertTrue(any(b"/login" in v for v in loc), f"location: {loc}")

    def test_save_foreign_run_forbidden(self):
        run_id, _ = self.start_run(self.ada_cookie)
        raw = self.post_json(
            "/arcade/run/save",
            {"run_id": run_id, "depth": 1, "hp": 100, "gold": 0, "kills": 0,
             "blob": "{}"},
            headers=self.bob_cookie,
        )
        status, payload = self.json_body(raw)
        self.assertEqual(status, 403, "foreign save")
        self.assertFalse(payload["ok"], "ok false")

    def test_run_id_float_number_400(self):
        # R2: a JSON number run_id of 1.5 is not a whole number, so it is
        # rejected (text "1.5" was already rejected).
        for path in ("/arcade/run/save", "/arcade/run/end"):
            with self.subTest(path=path):
                body = {"run_id": 1.5, "depth": 1, "kills": 0, "gold": 0,
                        "hp": 100, "blob": "{}"}
                raw = self.post_json(path, body, headers=self.ada_cookie)
                status, payload = self.json_body(raw)
                self.assertEqual(status, 400, f"float run_id on {path}")
                self.assertIn("whole number", payload["error"],
                              "error text kept")

    def test_run_id_whole_float_number_ok(self):
        # 1.0 is a whole number and still passes (no over-rejection).
        run_id, _ = self.start_run(self.ada_cookie)
        raw = self.post_json(
            "/arcade/run/save",
            {"run_id": float(run_id), "depth": 1, "hp": 100, "gold": 0,
             "kills": 0, "blob": "{}"},
            headers=self.ada_cookie,
        )
        status, payload = self.json_body(raw)
        self.assertEqual(status, 200, "whole float run_id accepted")
        self.assertEqual(payload, {"ok": True}, "save ok")

    def test_save_missing_run_400(self):
        raw = self.post_json(
            "/arcade/run/save",
            {"run_id": 999999, "depth": 1, "hp": 100, "gold": 0, "kills": 0,
             "blob": "{}"},
            headers=self.ada_cookie,
        )
        status, _ = self.json_body(raw)
        self.assertEqual(status, 400, "unknown run")

    def test_save_bad_run_id_400(self):
        for bad in ("abc", "", "1.5", None):
            with self.subTest(bad=bad):
                raw = self.post_json(
                    "/arcade/run/save",
                    {"run_id": bad, "depth": 1, "hp": 100, "gold": 0,
                     "kills": 0, "blob": "{}"},
                    headers=self.ada_cookie,
                )
                status, _ = self.json_body(raw)
                self.assertEqual(status, 400, f"bad run_id {bad!r}")

    def test_save_oversize_blob_413(self):
        run_id, _ = self.start_run(self.ada_cookie)
        raw = self.post_json(
            "/arcade/run/save",
            {"run_id": run_id, "depth": 1, "hp": 100, "gold": 0, "kills": 0,
             "blob": "x" * 16385},
            headers=self.ada_cookie,
        )
        status, _ = self.json_body(raw)
        self.assertEqual(status, 413, "blob over 16 KiB")

    def test_save_blob_at_cap_ok(self):
        run_id, _ = self.start_run(self.ada_cookie)
        raw = self.post_json(
            "/arcade/run/save",
            {"run_id": run_id, "depth": 1, "hp": 100, "gold": 0, "kills": 0,
             "blob": "x" * 16384},
            headers=self.ada_cookie,
        )
        status, payload = self.json_body(raw)
        self.assertEqual(status, 200, "blob at exactly 16 KiB")
        self.assertEqual(payload, {"ok": True}, "save ok")

    def test_save_dead_run_400(self):
        run_id, _ = self.start_run(self.ada_cookie)
        self.end_run(run_id, self.ada_cookie)
        raw = self.post_json(
            "/arcade/run/save",
            {"run_id": run_id, "depth": 1, "hp": 100, "gold": 0, "kills": 0,
             "blob": "{}"},
            headers=self.ada_cookie,
        )
        status, _ = self.json_body(raw)
        self.assertEqual(status, 400, "dead run rejects saves")

    def test_save_negative_values_400(self):
        # N3: depth is clamped to 1..7, hp/gold/kills cannot be negative.
        run_id, _ = self.start_run(self.ada_cookie)
        cases = (("depth", 0), ("depth", 8), ("hp", -1), ("gold", -5),
                 ("kills", -3))
        for field, bad in cases:
            with self.subTest(field=field, bad=bad):
                body = {"run_id": run_id, "depth": 3, "hp": 90, "gold": 10,
                        "kills": 3, "blob": "{}"}
                body[field] = bad
                raw = self.post_json("/arcade/run/save", body,
                                     headers=self.ada_cookie)
                status, _ = self.json_body(raw)
                self.assertEqual(status, 400, f"{field}={bad} rejected")

    def test_save_throttle_429s_after_sixty(self):
        # O1: 60 saves, then the 61st inside the same 60s window is
        # throttled. The setUp reset gives this test a full budget. On a
        # slow walker the 60 saves can spill past the 60s window, which
        # would make the 61st legitimately allowed; skip instead of
        # failing then (the sliding-window mechanism itself is proven on
        # bootstrap; same precedent as the end-throttle test).
        t0 = _time.time()
        run_id, _ = self.start_run(self.ada_cookie)
        body = {"run_id": run_id, "depth": 1, "hp": 100, "gold": 0,
                "kills": 0, "blob": "{}"}
        for _ in range(60):
            raw = self.post_json("/arcade/run/save", body,
                                 headers=self.ada_cookie)
            status, _ = self.json_body(raw)
            self.assertEqual(status, 200, "save inside the budget")
        if _time.time() - t0 > 50:
            self.skipTest("60 saves took over 50s: outside the 60s window")
        raw = self.post_json("/arcade/run/save", body, headers=self.ada_cookie)
        status, payload = self.json_body(raw)
        self.assertEqual(status, 429, "61st save in a minute is throttled")
        self.assertFalse(payload["ok"], "ok false on 429")

    def test_save_form_encoded(self):
        run_id, _ = self.start_run(self.ada_cookie)
        raw = self.server.post_form(
            "/arcade/run/save",
            {"run_id": str(run_id), "depth": "2", "hp": "90", "gold": "10",
             "kills": "3", "blob": "{}"},
            headers=self.ada_cookie,
        )
        status, payload = self.json_body(raw)
        self.assertEqual(status, 200, "form-encoded save")
        self.assertEqual(payload, {"ok": True}, "save ok")

    # -- run end --

    def test_end_scores_and_deletes_save(self):
        run_id, _ = self.start_run(self.ada_cookie)
        self.post_json(
            "/arcade/run/save",
            {"run_id": run_id, "depth": 3, "hp": 50, "gold": 120, "kills": 15,
             "blob": "{}"},
            headers=self.ada_cookie,
        )
        status, payload = self.end_run(run_id, self.ada_cookie, depth=3,
                                       kills=15, gold=120)
        self.assertEqual(status, 200, "end")
        self.assertEqual(payload["score"], 3 * 1000 + 15 * 25 + 120,
                         "server-side score")
        con = self.server.db_connect()
        try:
            run = con.execute(
                "SELECT state, score FROM arcade_runs WHERE id = ?", (run_id,)
            ).fetchone()
            saves = con.execute(
                "SELECT COUNT(*) FROM arcade_saves WHERE run_id = ?", (run_id,)
            ).fetchone()[0]
        finally:
            con.close()
        self.assertEqual(run[0], "dead", "run marked dead")
        self.assertEqual(run[1], 3 * 1000 + 15 * 25 + 120, "score stored")
        self.assertEqual(saves, 0, "save deleted on end")

    def test_end_records_missions(self):
        run_id, _ = self.start_run(self.ada_cookie)
        status, _ = self.end_run(run_id, self.ada_cookie,
                                 missions=["cold_boot", "pest_control",
                                           "not_a_mission"])
        self.assertEqual(status, 200, "end with missions")
        con = self.server.db_connect()
        try:
            rows = con.execute(
                "SELECT mission_id FROM arcade_missions_done WHERE run_id = ?"
                " ORDER BY mission_id",
                (run_id,),
            ).fetchall()
        finally:
            con.close()
        self.assertEqual([r[0] for r in rows], ["cold_boot", "pest_control"],
                         "known missions recorded, unknown ignored")

    def test_end_clamps_tampered_values(self):
        run_id, _ = self.start_run(self.ada_cookie)
        status, payload = self.end_run(run_id, self.ada_cookie, depth=99,
                                       kills=2000000, gold=2000000)
        self.assertEqual(status, 200, "end with tampered values")
        # depth clamped to 7, kills and gold clamped to 1000000
        self.assertEqual(payload["score"],
                         7 * 1000 + 1000000 * 25 + 1000000,
                         "tampered values clamped")
        run_id2, _ = self.start_run(self.ada_cookie)
        status2, payload2 = self.end_run(run_id2, self.ada_cookie, depth=-5,
                                         kills=-10, gold=-20)
        self.assertEqual(status2, 200, "end with negative values")
        self.assertEqual(payload2["score"], 1 * 1000 + 0 + 0,
                         "negatives clamped to the floor")

    def test_end_best_flag(self):
        run_id, _ = self.start_run(self.ada_cookie)
        _, first = self.end_run(run_id, self.ada_cookie, depth=2, kills=0,
                                gold=0)
        self.assertTrue(first["best"], "first run is the best")
        run_id2, _ = self.start_run(self.ada_cookie)
        _, second = self.end_run(run_id2, self.ada_cookie, depth=1, kills=0,
                                 gold=0)
        self.assertFalse(second["best"], "worse run is not the best")

    def test_end_anonymous_redirects_to_login(self):
        raw = self.post_json("/arcade/run/end", {"run_id": 1})
        status, headers, _ = parse_response(raw)
        self.assertEqual(status, 302, "anonymous end redirects")
        loc = header_values(headers, "location")
        self.assertTrue(any(b"/login" in v for v in loc), f"location: {loc}")

    def test_end_foreign_run_forbidden(self):
        run_id, _ = self.start_run(self.ada_cookie)
        raw = self.post_json(
            "/arcade/run/end",
            {"run_id": run_id, "depth": 1, "kills": 0, "gold": 0},
            headers=self.bob_cookie,
        )
        status, _ = self.json_body(raw)
        self.assertEqual(status, 403, "foreign end")

    def test_end_missing_run_400(self):
        raw = self.post_json(
            "/arcade/run/end",
            {"run_id": 999999, "depth": 1, "kills": 0, "gold": 0},
            headers=self.ada_cookie,
        )
        status, _ = self.json_body(raw)
        self.assertEqual(status, 400, "unknown run")

    def test_end_bad_values_400(self):
        run_id, _ = self.start_run(self.ada_cookie)
        for field, bad in (("depth", "deep"), ("kills", "many"),
                           ("gold", "lots"), ("run_id", "xyz")):
            with self.subTest(field=field, bad=bad):
                body = {"run_id": run_id, "depth": 1, "kills": 0, "gold": 0}
                body[field] = bad
                raw = self.post_json("/arcade/run/end", body,
                                     headers=self.ada_cookie)
                status, _ = self.json_body(raw)
                self.assertEqual(status, 400, f"bad {field}")

    def test_end_twice_400(self):
        run_id, _ = self.start_run(self.ada_cookie)
        status, _ = self.end_run(run_id, self.ada_cookie)
        self.assertEqual(status, 200, "first end")
        status2, _ = self.end_run(run_id, self.ada_cookie)
        self.assertEqual(status2, 400, "second end on a dead run")

    def test_end_bad_json_400(self):
        raw = self.server.request(
            "POST", "/arcade/run/end",
            headers={"Content-Type": "application/json",
                     "Cookie": self.ada_cookie["Cookie"]},
            body=b"{not json",
        )
        status, _ = self.json_body(raw)
        self.assertEqual(status, 400, "malformed JSON")

    # -- run mine --

    def test_mine_empty(self):
        raw = self.server.get("/arcade/run/mine", headers=self.bob_cookie)
        status, payload = self.json_body(raw)
        self.assertEqual(status, 200, "GET /arcade/run/mine")
        self.assertEqual(payload, {"run_id": None}, "no live run")

    def test_mine_returns_live_run_and_blob(self):
        run_id, seed = self.start_run(self.bob_cookie)
        blob = json.dumps({"floor": 2})
        self.post_json(
            "/arcade/run/save",
            {"run_id": run_id, "depth": 2, "hp": 88, "gold": 40, "kills": 7,
             "blob": blob},
            headers=self.bob_cookie,
        )
        raw = self.server.get("/arcade/run/mine", headers=self.bob_cookie)
        status, payload = self.json_body(raw)
        self.assertEqual(status, 200, "GET /arcade/run/mine")
        self.assertEqual(payload["run_id"], run_id, "run_id")
        self.assertEqual(payload["seed"], seed, "seed")
        self.assertEqual(payload["depth"], 2, "depth")
        self.assertEqual(payload["hp"], 88, "hp from the save")
        self.assertEqual(payload["blob"], blob, "blob round-trips")
        # R3: the JSON boundary carries integers, not 88.0 floats.
        for key in ("run_id", "seed", "depth", "hp", "gold", "kills"):
            self.assertIsInstance(payload[key], int,
                                  f"{key} is an int, not a float")

    def test_mine_anonymous_redirects_to_login(self):
        raw = self.server.get("/arcade/run/mine")
        status, headers, _ = parse_response(raw)
        self.assertEqual(status, 302, "anonymous mine redirects")
        loc = header_values(headers, "location")
        self.assertTrue(any(b"/login" in v for v in loc), f"location: {loc}")

    def test_mine_after_end_empty(self):
        run_id, _ = self.start_run(self.bob_cookie)
        self.end_run(run_id, self.bob_cookie)
        raw = self.server.get("/arcade/run/mine", headers=self.bob_cookie)
        _, payload = self.json_body(raw)
        self.assertEqual(payload, {"run_id": None}, "no live run after end")

    # -- SQLi corpus (inert by construction: ? params everywhere) --

    def test_sqli_corpus_inert(self):
        run_id, _ = self.start_run(self.ada_cookie)
        for payload in SQLI_CORPUS:
            with self.subTest(payload=payload):
                raw = self.post_json(
                    "/arcade/run/save",
                    {"run_id": payload, "depth": 1, "hp": 100, "gold": 0,
                     "kills": 0, "blob": "{}"},
                    headers=self.ada_cookie,
                )
                status, _ = self.json_body(raw)
                self.assertEqual(status, 400, "SQLi run_id rejected as bad input")
                raw = self.post_json(
                    "/arcade/run/save",
                    {"run_id": run_id, "depth": 1, "hp": 100, "gold": 0,
                     "kills": 0, "blob": payload},
                    headers=self.ada_cookie,
                )
                status, data = self.json_body(raw)
                self.assertEqual(status, 200, "SQLi blob stored as inert data")
                self.assertEqual(data, {"ok": True}, "save ok")
        # The tables all survived; the run is intact.
        con = self.server.db_connect()
        try:
            tables = {r[0] for r in con.execute(
                "SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
            run = con.execute(
                "SELECT state FROM arcade_runs WHERE id = ?", (run_id,)
            ).fetchone()
        finally:
            con.close()
        self.assertIn("arcade_runs", tables, "arcade_runs survived")
        self.assertIn("users", tables, "users survived")
        self.assertEqual(run[0], "live", "run still live")

    # -- throttle --

    def test_end_throttle_429s_after_ten(self):
        # 10 ends, then the 11th inside the same 60s window is throttled.
        # The setUp reset gives this test a full budget. On a slow walker
        # the 10 ends can spill past the 60s window, which would make the
        # 11th legitimately allowed; skip instead of failing then (the
        # sliding-window mechanism itself is proven on bootstrap).
        t0 = _time.time()
        for _ in range(10):
            run_id, _ = self.start_run(self.ada_cookie)
            status, _ = self.end_run(run_id, self.ada_cookie)
            self.assertEqual(status, 200, "end inside the budget")
        if _time.time() - t0 > 50:
            self.skipTest("10 ends took over 50s: outside the 60s window")
        run_id, _ = self.start_run(self.ada_cookie)
        raw = self.post_json(
            "/arcade/run/end",
            {"run_id": run_id, "depth": 1, "kills": 0, "gold": 0},
            headers=self.ada_cookie,
        )
        status, payload = self.json_body(raw)
        self.assertEqual(status, 429, "11th end in a minute is throttled")
        self.assertFalse(payload["ok"], "ok false on 429")
        _, headers, _ = parse_response(raw)
        retry = header_values(headers, "retry-after")
        self.assertTrue(retry and retry[0] == b"60",
                        f"Retry-After: 60 on the 429 (got {retry})")


class ArcadeLiveBootstrap(ArcadeTests, ArcadeLiveCase):
    walker = False


class ArcadeLiveWalker(ArcadeTests, ArcadeLiveCase):
    walker = True

    @unittest.skip(
        "Walker JSON parsing of a 16 KiB body takes 10+ minutes "
        "(self-hosted double interpretation); the 16 KiB cap is proven "
        "on bootstrap. D15 precedent: the 65 KiB fence test is skipped "
        "on the walker for the same reason."
    )
    def test_save_oversize_blob_413(self):
        pass

    @unittest.skip(
        "Walker JSON parsing of a 16 KiB body takes 10+ minutes "
        "(self-hosted double interpretation); the 16 KiB boundary is "
        "proven on bootstrap. D15 precedent."
    )
    def test_save_blob_at_cap_ok(self):
        pass


class ArcadeDifferential(unittest.TestCase):
    """Byte-identical bodies under both interpreters.

    Covers GET /arcade/data and GET /arcade (anonymous, seeded board).
    Headers are never compared: Set-Cookie values differ per server by
    construction, so cookie-bearing pages compare status + body bytes
    only (neither differential path uses cookies).
    """

    @classmethod
    def setUpClass(cls):
        cls.boot = ArcadeServer(walker=False)
        cls.boot.start()
        cls.walk = ArcadeServer(walker=True)
        cls.walk.start()
        for srv in (cls.boot, cls.walk):
            srv.wait_for_table("arcade_runs")
            con = srv.db_connect()
            try:
                con.execute(
                    "INSERT INTO arcade_runs (user_handle, seed, depth, kills,"
                    " gold, score, state, victory, started_at, updated_at)"
                    " VALUES ('diff_runner', 424242, 5, 40, 300, 9300, 'dead',"
                    " 0, '2026-10-07', '2026-10-07')"
                )
                con.commit()
            finally:
                con.close()

    @classmethod
    def tearDownClass(cls):
        cls.boot.stop()
        cls.walk.stop()

    def compare(self, method, path, label, expected=200):
        bodies = []
        for name, server in (("boot", self.boot), ("walk", self.walk)):
            raw = server.request(method, path)
            status, _, body = parse_response(raw)
            self.assertEqual(status, expected, f"{label} status ({name})")
            bodies.append(body)
        self.assertEqual(bodies[0], bodies[1], f"{label} body differs")

    def test_differential_arcade_data(self):
        self.compare("GET", "/arcade/data", "GET /arcade/data")

    def test_differential_arcade_landing(self):
        self.compare("GET", "/arcade", "GET /arcade")

    def test_differential_arcade_play(self):
        self.compare("GET", "/arcade/play", "GET /arcade/play")

    def test_differential_arcade_leaderboard(self):
        self.compare("GET", "/arcade/leaderboard", "GET /arcade/leaderboard")


if __name__ == "__main__":
    unittest.main()
