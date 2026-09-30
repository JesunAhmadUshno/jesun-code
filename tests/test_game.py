"""v2.0 game package: differential tests for the game library and \\u escapes.

Every case runs through the bootstrap interpreter AND the self-hosted
Jesun.Code walker; the outputs must match byte for byte. Frames are tiny
(5x5 or smaller) and tones short (20 ms or less) to keep the walker leg
fast. The full snake demo in examples/snake.jc is bootstrap-only, per
spec v2.0 section 6.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from selfhost_harness import InlineSandbox, LINE_RE  # noqa: E402

HDR = 'bring in "game"\n'


class GameCase(unittest.TestCase):
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


class FrameTest(GameCase):
    def test_frame_ppm_empty(self):
        self.check(
            HDR + "f is game_frame with 2 and 2\nshow game_ppm with f\n",
            "P3\n2 2\n255\n0 0 0\n0 0 0\n0 0 0\n0 0 0\n\n",
        )

    def test_rgb(self):
        self.check(
            HDR + 'show game_rgb with 255 and 128 and 0\n',
            "FF8000\n",
        )

    def test_pixel_ppm(self):
        self.check(
            HDR
            + "f is game_frame with 2 and 2\n"
            + 'game_pixel with f and 1 and 0 and "FF0000"\n'
            + "show game_ppm with f\n",
            "P3\n2 2\n255\n0 0 0\n255 0 0\n0 0 0\n0 0 0\n\n",
        )

    def test_clear(self):
        self.check(
            HDR
            + "f is game_frame with 2 and 1\n"
            + 'game_pixel with f and 0 and 0 and "FFFFFF"\n'
            + 'game_clear with f and "0000FF"\n'
            + "show game_ppm with f\n",
            "P3\n2 1\n255\n0 0 255\n0 0 255\n\n",
        )

    def test_save_roundtrip(self):
        self.check(
            HDR
            + "f is game_frame with 2 and 1\n"
            + 'game_pixel with f and 0 and 0 and "FF0000"\n'
            + 'game_save with f and "t_game.ppm"\n'
            + 'read file "t_game.ppm" giving t\n'
            + "show t\n",
            "P3\n2 1\n255\n255 0 0\n0 0 0\n\n",
        )


class DrawTest(GameCase):
    def test_rect(self):
        self.check(
            HDR
            + "f is game_frame with 3 and 2\n"
            + 'game_rect with f and 1 and 0 and 2 and 2 and "00FF00"\n'
            + "show game_ppm with f\n",
            "P3\n3 2\n255\n"
            "0 0 0\n0 255 0\n0 255 0\n"
            "0 0 0\n0 255 0\n0 255 0\n\n",
        )

    def test_line_diagonal(self):
        self.check(
            HDR
            + "f is game_frame with 3 and 3\n"
            + 'game_line with f and 0 and 0 and 2 and 2 and "0000FF"\n'
            + "show game_ppm with f\n",
            "P3\n3 3\n255\n"
            "0 0 255\n0 0 0\n0 0 0\n"
            "0 0 0\n0 0 255\n0 0 0\n"
            "0 0 0\n0 0 0\n0 0 255\n\n",
        )

    def test_circle(self):
        self.check(
            HDR
            + "f is game_frame with 5 and 5\n"
            + 'game_circle with f and 2 and 2 and 2 and "FFFFFF"\n'
            + "show game_ppm with f\n",
            "P3\n5 5\n255\n"
            "0 0 0\n0 0 0\n255 255 255\n0 0 0\n0 0 0\n"
            "0 0 0\n255 255 255\n255 255 255\n255 255 255\n0 0 0\n"
            "255 255 255\n255 255 255\n255 255 255\n255 255 255\n255 255 255\n"
            "0 0 0\n255 255 255\n255 255 255\n255 255 255\n0 0 0\n"
            "0 0 0\n0 0 0\n255 255 255\n0 0 0\n0 0 0\n\n",
        )

    def test_digit_seven(self):
        self.check(
            HDR
            + "f is game_frame with 4 and 6\n"
            + 'game_digit with f and 0 and 0 and 7 and 1 and "FFFFFF"\n'
            + "show game_ppm with f\n",
            "P3\n4 6\n255\n"
            "0 0 0\n255 255 255\n255 255 255\n0 0 0\n"
            "0 0 0\n0 0 0\n0 0 0\n255 255 255\n"
            "0 0 0\n0 0 0\n0 0 0\n255 255 255\n"
            "0 0 0\n0 0 0\n0 0 0\n0 0 0\n"
            "0 0 0\n0 0 0\n0 0 0\n255 255 255\n"
            "0 0 0\n0 0 0\n0 0 0\n255 255 255\n\n",
        )

    def test_number_42(self):
        self.check(
            HDR
            + "f is game_frame with 11 and 7\n"
            + 'game_number with f and 0 and 0 and 42 and 1 and "FFFFFF"\n'
            + "show game_ppm with f\n",
            "P3\n11 7\n255\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "255 255 255\n"
            "255 255 255\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "255 255 255\n"
            "0 0 0\n"
            "0 0 0\n"
            "255 255 255\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "255 255 255\n"
            "0 0 0\n"
            "0 0 0\n"
            "255 255 255\n"
            "0 0 0\n"
            "0 0 0\n"
            "255 255 255\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "255 255 255\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "255 255 255\n"
            "255 255 255\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "255 255 255\n"
            "255 255 255\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "255 255 255\n"
            "0 0 0\n"
            "255 255 255\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "255 255 255\n"
            "0 0 0\n"
            "255 255 255\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            "255 255 255\n"
            "255 255 255\n"
            "0 0 0\n"
            "0 0 0\n"
            "0 0 0\n"
            + "\n",
        )


class InputTest(GameCase):
    def test_press_poll_order(self):
        self.check(
            HDR
            + "p is game_pad_new\n"
            + 'game_press with p and "up"\n'
            + 'game_press with p and "a"\n'
            + "show game_poll with p\n"
            + "show game_poll with p\n"
            + "k is game_poll with p\n"
            + "show k is nothing\n",
            "up\na\ntrue\n",
        )

    def test_press_bad_key(self):
        self.check_fails(
            HDR + "p is game_pad_new\n" + 'game_press with p and "f1"\n',
            "does not know the key",
        )


class LoopTest(GameCase):
    def test_loop_ticks(self):
        self.check(
            HDR
            + "to upd with s\n"
            + '    s["n"] is s["n"] + 1\n'
            + "    give back nothing\n"
            + "to drw with s\n"
            + "    give back nothing\n"
            + "s is game_sim with 2 and 2\n"
            + 's["n"] is 0\n'
            + "game_loop with 3 and s and upd and drw\n"
            + 'show s["n"]\n',
            "3\n",
        )

    def test_loop_reports_update_error(self):
        self.check_fails(
            HDR
            + "to upd with s\n"
            + '    fail with "boom"\n'
            + "to drw with s\n"
            + "    give back nothing\n"
            + "s is game_sim with 2 and 2\n"
            + "game_loop with 2 and s and upd and drw\n",
            "the update step failed",
        )


class SoundTest(GameCase):
    def test_tone_length_and_shape(self):
        self.check(
            HDR
            + 't is snd_tone with 440 and 10 and "square"\n'
            + "show length of t\n"
            + "show t[0]\n"
            + "show t[55]\n",
            "110\n0\n1\n",
        )

    def test_silence(self):
        self.check(
            HDR
            + "t is snd_silence with 10\n"
            + "show length of t\n"
            + "show t[7]\n",
            "110\n0\n",
        )

    def test_seq(self):
        self.check(
            HDR
            + 's is snd_seq with [[440, 10], [660, 20]] and "square"\n'
            + "show length of s\n",
            "330\n",
        )

    def test_mix(self):
        self.check(
            HDR
            + 'a is snd_tone with 440 and 10 and "square"\n'
            + 'b is snd_tone with 660 and 10 and "square"\n'
            + "m is snd_mix with a and b\n"
            + "show length of m\n"
            + "show m[0]\n",
            "110\n0\n",
        )

    def test_wav_pads_for_128_rule(self):
        self.check(
            HDR
            + 'w is snd_wav with snd_seq with [[440, 10]] and "square"\n'
            + "show length of w\n",
            "300\n",
        )

    def test_tone_bad_freq(self):
        self.check_fails(
            HDR + 'snd_tone with 0 and 10 and "square"\n',
            "needs 20 to 4000 Hz",
        )

    def test_seq_bad_shape(self):
        self.check_fails(
            HDR + 'snd_seq with [[440]] and "square"\n',
            "needs a list of [freq, ms] notes",
        )


class UnicodeEscapeTest(GameCase):
    def test_u_escape_basic(self):
        self.check(
            'show "A\\u0041B"\n',
            "AAB\n",
        )

    def test_u_escape_inert_braces(self):
        self.check(
            'show "\\u007b\\u007d"\nshow length of "\\u007b\\u007d"\n',
            "{}\n2\n",
        )

    def test_u_escape_with_interpolation(self):
        self.check(
            'n is 42\nshow "n is {n}\\u0041"\n',
            "n is 42A\n",
        )

    def test_u_escape_malformed(self):
        self.check_fails(
            'show "\\u00zz"\n',
            "needs 4 hex digits",
        )

    def test_u_escape_cut_short(self):
        self.check_fails(
            'show "abc\\u12"\n',
            "needs 4 hex digits",
        )


class GameFailTest(GameCase):
    def test_frame_bad_size(self):
        self.check_fails(
            HDR + "game_frame with 0 and 4\n",
            "needs a whole width",
        )

    def test_pixel_bad_color(self):
        self.check_fails(
            HDR
            + "f is game_frame with 2 and 2\n"
            + 'game_pixel with f and 0 and 0 and "red"\n',
            'needs a color like "FF0000"',
        )

    def test_pixel_off_frame(self):
        self.check(
            HDR
            + "f is game_frame with 2 and 2\n"
            + 'game_pixel with f and 5 and 0 and "FF0000"\n'
            + "show game_ppm with f\n",
            "P3\n2 2\n255\n0 0 0\n0 0 0\n0 0 0\n0 0 0\n\n",
        )


if __name__ == "__main__":
    unittest.main()
