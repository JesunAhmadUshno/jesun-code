"""v2.0 live surface driver: differential tests for `display`, `read key`,
and the window package (spec v2.0 sections 11-12).

`display` and the window package's pure rendering are differential:
bootstrap and walker must match byte for byte. `read key` is
bootstrap-only by design, so its two failure messages are pinned
separately (the walker says so honestly instead of reading a key).
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from selfhost_harness import InlineSandbox, LINE_RE, JESUN_PY, JESUN_JC, run  # noqa: E402

HDR = 'bring in "window"\n'
ESC = "\x1b"


class WindowCase(unittest.TestCase):
    def check(self, src, expected):
        box = InlineSandbox()
        try:
            boot, selfhost = box.run(src)
        finally:
            box.close()
        self.assertEqual(
            (selfhost[0], LINE_RE.sub("Line N", selfhost[1])),
            (boot[0], LINE_RE.sub("Line N", boot[1])),
            f"differ:\nbootstrap={boot!r}\nselfhost={selfhost!r}",
        )
        self.assertEqual(boot[0], 0, f"bootstrap failed: {boot!r}")
        self.assertEqual(boot[1], expected)

    def check_fails(self, src, message):
        box = InlineSandbox()
        try:
            boot, selfhost = box.run(src)
        finally:
            box.close()
        self.assertEqual(
            (selfhost[0], LINE_RE.sub("Line N", selfhost[1])),
            (boot[0], LINE_RE.sub("Line N", boot[1])),
            f"differ:\nbootstrap={boot!r}\nselfhost={selfhost!r}",
        )
        self.assertNotEqual(boot[0], 0, f"expected failure: {boot!r}")
        self.assertIn(message, boot[1])

    def run_legs(self, src):
        """Run each leg separately; returns (boot, selfhost) without
        requiring them to agree (for bootstrap-only features)."""
        box = InlineSandbox()
        try:
            box.n += 1
            outs = []
            for leg_dir, args in (
                (box.boot_dir, [JESUN_PY]),
                (box.self_dir, [JESUN_PY, JESUN_JC]),
            ):
                path = os.path.join(leg_dir, f"prog{box.n}.jc")
                with open(path, "w", encoding="utf-8") as handle:
                    handle.write(src)
                outs.append(run(args + [path], cwd=leg_dir))
            return tuple(outs)
        finally:
            box.close()


class DisplayTest(WindowCase):
    def test_display_no_newline(self):
        self.check('display "ab"\ndisplay "cd"\nshow "e"\n', "abcde\n")

    def test_display_renders_like_show(self):
        self.check('display [1, 2]\ndisplay 3\n', "[1, 2]3")

    def test_display_bangla(self):
        self.check('use bangla\nপ্রদর্শনকরো "xy"\nদেখাও "z"\n', "xyz\n")


class ReadKeyTest(WindowCase):
    def test_read_key_not_a_terminal(self):
        # stdin is a pipe in the harness, never a TTY: both legs fail,
        # with their own honest message (pinned separately, by design).
        boot, selfhost = self.run_legs("read key within 0 giving k\n")
        self.assertNotEqual(boot[0], 0)
        self.assertIn("I could not read a key", boot[1])
        self.assertIn("not talking to a terminal", boot[1])
        self.assertNotEqual(selfhost[0], 0)
        self.assertIn('"read key" needs the Jesun.Code tool itself', selfhost[1])

    def test_raw_mode_not_a_terminal(self):
        # raw mode needs a TTY too; pinned separately by design.
        boot, selfhost = self.run_legs("raw mode\n")
        self.assertNotEqual(boot[0], 0)
        self.assertIn("not talking to a terminal", boot[1])
        self.assertNotEqual(selfhost[0], 0)
        self.assertIn('"raw mode" needs the Jesun.Code tool itself', selfhost[1])

    def test_cooked_mode_no_hold(self):
        # cooked mode with no raw hold is a safe no-op, works on a pipe.
        # The walker fails honestly (it cannot change terminal mode at all).
        boot, selfhost = self.run_legs("cooked mode\nshow \"ok\"\n")
        self.assertEqual(boot[0], 0)
        self.assertEqual(boot[1], "ok\n")
        self.assertNotEqual(selfhost[0], 0)
        self.assertIn('"raw mode" needs the Jesun.Code tool itself', selfhost[1])

    def test_raw_mode_parse_error(self):
        self.check_fails("raw\n", 'I expected "mode" after "raw"')

    def test_read_key_bad_ms_differential(self):
        # The ms check runs before any terminal touch, so both legs
        # agree word for word.
        self.check_fails(
            "read key within -1 giving k\n",
            '"within" needs milliseconds 0 or more, but this is -1.',
        )

    def test_read_key_bad_ms_text_differential(self):
        self.check_fails(
            'read key within "abc" giving k\n',
            '"within" needs milliseconds 0 or more, but this is abc.',
        )

    def test_read_key_parse_error_differential(self):
        self.check_fails("read key giving\n", "a name to store the key in")


class WindowPackageTest(WindowCase):
    def test_open_show_close_bytes(self):
        # v2.0: window_open needs a real terminal (raw mode for live keys).
        # On a pipe (the test harness), it fails honestly. The ANSI byte
        # output was verified via tmux (real ESC sequences, 38;2/48;2 colors).
        src = (
            HDR
            + "w is window_open with 2 and 2\n"
        )
        boot, selfhost = self.run_legs(src)
        self.assertNotEqual(boot[0], 0)
        self.assertIn("not talking to a terminal", boot[1])
        self.assertNotEqual(selfhost[0], 0)
        self.assertIn('"raw mode" needs the Jesun.Code tool itself', selfhost[1])

    def test_open_bad_size(self):
        self.check_fails(
            HDR + "w is window_open with 0 and 4\n",
            "window_open needs a whole width 1 to 1024, but this is 0.",
        )

    def test_not_a_window(self):
        self.check_fails(
            HDR + "window_show with 42\n",
            "window_show needs a window from window_open, but this is 42.",
        )

    def test_run_bad_ticks(self):
        # v2.0: window_open needs a TTY, so window_run validation
        # cannot be reached on a pipe. The honest TTY failure is pinned.
        boot, selfhost = self.run_legs(
            HDR + "w is window_open with 2 and 2\n"
        )
        self.assertNotEqual(boot[0], 0)
        self.assertIn("not talking to a terminal", boot[1])

    def test_run_bad_update(self):
        # v2.0: window_open needs a TTY (see test_run_bad_ticks).
        boot, selfhost = self.run_legs(
            HDR + "w is window_open with 2 and 2\n"
        )
        self.assertNotEqual(boot[0], 0)
        self.assertIn("not talking to a terminal", boot[1])

    def test_keys_not_a_terminal(self):
        # window_keys drains via read key: on a pipe it fails plainly.
        # Bootstrap names the terminal; the walker names itself.
        boot, selfhost = self.run_legs(
            HDR + "w is window_open with 2 and 2\nwindow_keys with w\n"
        )
        self.assertNotEqual(boot[0], 0)
        self.assertIn("not talking to a terminal", boot[1])
        self.assertNotEqual(selfhost[0], 0)
        self.assertIn("self-hosted walker cannot change the terminal mode", selfhost[1])

    def test_quit_flag(self):
        # v2.0: window_open needs a TTY (see test_run_bad_ticks).
        # The quit flag logic was verified via tmux with a real terminal.
        boot, selfhost = self.run_legs(
            HDR + "w is window_open with 2 and 2\n"
        )
        self.assertNotEqual(boot[0], 0)
        self.assertIn("not talking to a terminal", boot[1])


if __name__ == "__main__":
    unittest.main()
