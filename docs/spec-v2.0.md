# Jesun.Code spec v2.0: PC games (native 2D graphics, input, audio, game loop)

Status: ROADMAP rung, scoped 2026-09-30 by Anvil. Founder directive
ladder (2026-09-25): v2.0 = "games on PC (native 2D graphics, input,
audio, and game loop). A visual game written in Jesun.Code, running on
PC, no bridge."

Founder's law: one language, all solutions. The whole engine is the jpm
package `game` (`packages/game/game.jc`), pure Jesun.Code, no Python
bridge. The Python bridge carries no domain logic.

v2.0 adds one small interpreter feature, because the WAV writer needs
it: `\uXXXX` string escapes (section 10). Everything else in v2.0 is
the `game` package.

Honest framing: v2.0 sprint 1 is the headless-verifiable engine. Frames
render to real P3 PPM files (plain ASCII, byte-exact through
`write ... to file`). Audio synthesizes to real playable WAV files
(8-bit unsigned mono, 11025 Hz, emitted as text where every byte stays
below 128, so UTF-8 file writes are byte-identical). The game loop runs
a fixed tick count with update/draw callbacks; input is a scripted event
queue. Every frame and every sample lands on disk and is verifiable.
What it is NOT yet: a live on-screen window and live keyboard capture.
Those are the OS surface driver, sprint 2, scoped in section 9. A game
whose every frame is on disk is still a real game.

## 1. What the engine is (and is not)

The engine is `packages/game/game.jc`, used with `bring in "game"`.
It gives a game three things: a software framebuffer with 2D draw
primitives, a fixed-timestep loop with an input event queue, and a
sample-accurate audio synthesizer with a WAV writer. It does not open a
window (sprint 2). It does not read the real keyboard (sprint 2); the
demo drives the queue with a script, and tests inject exact event
streams, which is also how gameplay logic is proven correct.

## 2. Framebuffer

A frame is a table: `w`, `h`, and `pixels`, a flat list of `w*h`
pixels in row-major order. Colors are 6-hex-digit texts at the API
boundary (`"FF0000"`); internally pixels are stored as numbers
0 to 0xFFFFFF for speed, converted at the edges. The API in section 2
is unchanged by this.

- `game_frame with w and h` gives back a frame, all pixels `"000000"`.
  `w` and `h` must be whole numbers from 1 to 1024.
- `game_clear with frame and color` fills every pixel.
- `game_rgb with r and g and b` gives back the hex text for channels
  0 to 255 (whole numbers; anything else fails plainly).
- `game_pixel with frame and x and y and color` sets one pixel.
  Coordinates outside the frame are clipped silently (drawing off the
  edge is normal in games, never an error).
- `game_rect with frame and x and y and w and h and color` fills a
  rectangle, clipped to the frame. `w`/`h` below 1 fail plainly.
- `game_line with frame and x1 and y1 and x2 and y2 and color`
  (Bresenham, all octants, clipped).
- `game_circle with frame and cx and cy and r and color` (filled disc,
  midpoint scanlines, clipped). `r` below 1 fails plainly.
- `game_digit with frame and x and y and d and scale and color` draws
  one 7-segment digit (`d` 0 to 9, `scale` 1 to 8).
- `game_number with frame and x and y and n and scale and color` draws
  a non-negative whole number, most significant digit first, with a
  minus sign for negatives. Anything non-numeric fails plainly.
- `game_ppm with frame` gives back the P3 ASCII PPM text:
  `P3`, `w h`, `255`, then `w*h` triples of `r g b` decimals.
- `game_save with frame and path` writes the PPM with
  `write ... to file` and gives back the path. The folder must exist
  (the v0.4 rule); otherwise the plain-English write error applies.

All draw calls validate their frame and color arguments and fail in
plain English with line numbers (the failure table, section 7). Zero
leakage: no tracebacks, no Python reprs, no em dashes.

## 3. Game loop and input

A sim is a table: `tick`, `frame`, `pad`.

- `game_sim with w and h` gives back a fresh sim (tick 0).
- `game_pad_new` gives back an empty input queue (a table holding a
  list; games usually take it from the sim).
- `game_press with pad and key` pushes a key event. Keys are texts:
  `"up"`, `"down"`, `"left"`, `"right"`, `"space"`, single letters and
  digits (`"a"` to `"z"`, `"0"` to `"9"`). Anything else fails plainly.
- `game_poll with pad` gives back the oldest pressed key, or `nothing`
  when the queue is empty.
- `game_loop with ticks and sim and update and draw` runs the loop:
  each tick increments `sim["tick"]`, then calls
  `attempt update with sim`, then `attempt draw with sim`.
  `update` and `draw` are ordinary Jesun.Code functions (the v1.2
  handler-callback precedent). It gives back `{ticks, frames}`.
  `ticks` must be a whole number from 1 to 100000.

The loop is deterministic: the same scripted input always produces the
same frames. That is the testability contract.

## 4. Audio

Samples are numbers in the range -1 to 1. The sample rate is fixed at
11025 Hz (chosen so every WAV header byte stays below 128; section 5).

- `snd_tone with freq and ms and wave` gives back a list of samples.
  `freq` 20 to 4000 Hz, `ms` 1 to 10000. `wave` is `"square"`,
  `"saw"`, `"triangle"`, or `"noise"` (seeded LCG, deterministic).
  A 5 ms linear attack and a 10 ms linear release are baked in so
  notes do not click.
- `snd_silence with ms` gives back `ms` of zeros.
- `snd_seq with notes and wave` chains notes, where each note is
  `[freq, ms]`; `freq` 0 means rest. Gives back one sample list.
- `snd_mix with a and b` adds two sample lists sample-wise (the
  shorter is padded with silence) and clips to -1..1.
- `snd_wav with samples` gives back the complete WAV file as text
  (section 5). `samples` must be a list of numbers in -1..1.
- `snd_save with samples and path` writes the WAV with
  `write ... to file` and gives back the number of samples written.

## 5. The WAV writer and the 128 rule

`write ... to file` writes UTF-8 text. Any code point at or above 128
becomes two bytes on disk, which would corrupt a binary format. So the
writer emits every WAV byte as a code point below 128, and the format
is chosen to make that always possible:

- 8-bit unsigned mono at 11025 Hz. 11025 = 0x2B11, so the sample-rate
  bytes are 0x11, 0x2B, 0x00, 0x00, all below 128.
- Samples map from -1..1 to bytes 1..127 (center 64, amplitude 63).
  The full 0..255 range is deliberately unused; half the dynamic range
  is the price of the text path, and it is documented here, not hidden.
- The two 32-bit size fields (RIFF chunk size = 36 + data, data size)
  must have every little-endian byte below 128. When they do not, the
  writer appends silent samples (byte 0x40) up to the next size that
  qualifies, at most 131071 samples of padding (about 12 seconds);
  beyond that it fails plainly and names the byte writer (sprint 2)
  as the unblock. The padded count is what `snd_save` gives back.

The byte lookup is a 128-character table of `\u0000` to `\u007F`
escapes; indexing it needs no bridge and no new syntax.

This is honest framing, written down: the day Jesun.Code grows a byte
writer, this whole section collapses to one line. Until then, jingles
under ~12 seconds are real playable WAV files, today.

## 6. Demo and acceptance

`examples/snake.jc`: Snake on a 64x48 frame. The snake moves on a
scripted input program (right, down, left, up), eats two pellets,
grows, and the score renders as 7-seg digits. It writes one PPM per
10th tick plus `jingle.wav` (a three-note square-wave jingle). The
full demo runs on the bootstrap interpreter; a small differential
slice (one 8x8 frame, one short tone, one input poll) runs on both
interpreters and is asserted byte-identical. Rationale, measured
2026-09-30: the self-hosted walker is roughly 1000x slower than the
bootstrap (20,000 trivial loop iterations took over 6 minutes and were
killed), so the full demo on the walker is not a sane gate.

v2.0 milestone acceptance (all must hold before the v2.0.0 release):
1. The full suite is green on both interpreters, fuzzer extended for
   the input queue and draw calls, zero violations.
2. `examples/snake.jc` runs on the bootstrap; the differential slice
   is byte-identical between interpreters.
3. The WAV plays (header parses: RIFF, 11025 Hz, 8-bit mono) and the
   PPMs render (P3 parses, correct dimensions).
4. The live surface driver (section 9) opens a window and takes real
   keyboard input on a PC, or the release notes say exactly why not.

Differential findings, fixed 2026-09-30: writing the game tests caught
two real bugs. (1) The walker's `kind of` returned `"list"` for
function values while the bootstrap returns `"function"`, so
`game_loop`'s callback check could never pass on the walker; the
walker's `kind of` now special-cases `is_function_value`, mirroring
the bootstrap. (2) `game_linen` (Bresenham) had a duplicate end-check
after the step update that skipped plotting the endpoint; removed, so
lines now draw both endpoints.

## 7. Failure table

Every row is a plain-English `Line N:` error, no tracebacks.

| Call | Bad input | Error |
| --- | --- | --- |
| `game_frame` | w/h not whole 1..1024 | `game_frame needs a whole width 1 to 1024, but this is ...` |
| `game_rgb` | channel outside 0..255 | `game_rgb needs channels 0 to 255, but ... is out of range.` |
| draw calls | color not 6-hex text | `... needs a color like "FF0000", but this is ...` |
| draw calls | frame not a game frame | `... needs a game frame, but this is ...` |
| `game_rect`/`game_circle` | w/h/r below 1 | `... needs a size of at least 1, but this is ...` |
| `game_digit` | d not 0..9 | `game_digit needs a digit 0 to 9, but this is ...` |
| `game_press` | unknown key | `game_press does not know the key ..., expected up/down/left/right/space/a-z/0-9.` |
| `game_loop` | ticks outside 1..100000 | `game_loop needs 1 to 100000 ticks, but this is ...` |
| `game_loop` | update/draw not functions | `game_loop needs functions for update and draw, but ... is ...` |
| `snd_tone` | freq outside 20..4000 | `snd_tone needs 20 to 4000 Hz, but this is ...` |
| `snd_tone` | unknown wave | `snd_tone does not know the wave ..., expected square/saw/triangle/noise.` |
| `snd_wav` | sample outside -1..1 | `snd_wav needs samples from -1 to 1, but sample N is ...` |
| `snd_wav` | padding beyond cap | `snd_wav cannot size this song as text (over ~12 s of padding); it needs the byte writer.` |
| `game_save`/`snd_save` | folder missing | the v0.4 write error: `I could not write ...: its folder does not exist.` |

Kinds follow the sitegen precedent (`game_article`/`game_describe`):
agent, true/false, python value, and `a <kind>` otherwise; text shown
quoted, numbers and true/false shown bare.

## 8. Performance notes

A 64x48 frame is 3072 pixels; Python-list speed is plenty. The
self-hosted walker is roughly 1000x slower than the bootstrap
(measured 2026-09-30), so the demo keeps frames small and the jingle
short; the suite asserts logic on tiny frames (8x8 and below) and the
differential slice stays tiny. Big frames are the user's adventure,
not the suite's.

## 9. Sprint 2: the live surface driver (SHIPPED 2026-09-30, this section)

Sprint 2 ships the `window` companion: the same `update`/`draw` game
now runs LIVE in the player's terminal window, with real keypresses
driving the pad. Two language additions carry it (`display` and
`read key`, section 11); the driver itself is the pure-Jesun.Code
jpm package `window` (section 12).

Design decisions, dated 2026-09-30, answering the open questions from
sprint 1:

1. **Surface: the terminal ANSI driver.** The spec's own first
   candidate. The terminal emulator is a window on a PC; the driver
   opens the game inside it (alternate screen, hidden cursor) and
   takes real keypresses in raw mode. It is verifiable here: the
   acceptance run drives the demo inside tmux with real `send-keys`
   keystrokes and reads the live frames back with `capture-pane`.
   Frames render as ANSI 24-bit half-blocks (`▀`: foreground pixel on
   top, background pixel below), two framebuffer rows per terminal
   row, so a 64x48 game fits a standard 80x24 terminal.

2. **The true GUI window stays out, honestly.** A real OS GUI window
   needs a toolkit (SDL, Tk, or similar). The only path to one today
   is the Python bridge, and the founder's law forbids counting the
   bridge as the solution for any domain. The release notes say
   exactly this. When Jesun.Code grows a native surface (the v2.1/v3.0
   rungs), the same `update`/`draw` game plugs into it unchanged: the
   driver boundary is the pad and the frame, not the pixels.

3. **The byte writer stays future work.** It is orthogonal to the live
   surface: it retires the 128 rule for file audio (section 5), and
   the live driver does not need it. The 128 rule stands with its
   honest framing; the byte writer moves to the v2.1 audio rung. No
   live audio playback either: there is no audio device on the build
   machine to verify against, and an unverifiable claim is not a
   shipped feature. The WAV writer (section 5) already produces real
   playable files; playing them is the player's media player, today.

What the driver is NOT: it does not change the engine (`game`
package, section 1-4, untouched). Scripted input and the live pad
merge: `window_keys` drains real keypresses into the same pad the
scripted demo uses, so a game is testable headless and playable live
with zero code changes.

## 10. `\uXXXX` string escapes (v2.0 language addition)

A string literal may contain `\uXXXX` (exactly 4 hex digits, either
case): it decodes to that Unicode code point. Surrogate pairs combine;
a high surrogate not followed by a low one stays lone, exactly like
Python's `json` module. A malformed escape is a plain-English error
naming the line: it needs 4 hex digits, like `\u0041`. Both
interpreters (bootstrap `jesun.py`, walker `jesun.jc`) implement it
identically; differential tests pin the agreement.

Why it exists: the WAV writer (section 5) emits bytes as text, and
bytes below 32 have no other spelling in a literal. `\n`, `\r`, `\t`
cover 9, 10, 13; `\uXXXX` covers the rest.

Interaction with `{...}` interpolation: braces are recognized on the
raw source text, before escapes decode. A `\u007b` escape decodes to an
inert `{` that never starts interpolation, and `\u007d` never closes
one. To write a literal brace the old way, `{{` and `}}` still work.
Rationale: an escape is data, not syntax; rescanning decoded text
would let data fake code.

## 11. `display` and `read key` (v2.0 language additions, sprint 2)

Two small interpreter additions, because the live driver needs them
and no package can provide them. Both are interpreter language work
(the tmux-statement precedent), not the Python bridge: user programs
never see the bridge.

- `display <expr>` writes the value's text with NO trailing newline
  and flushes stdout. `show` always ends the line; ANSI frame
  rendering must not. Both interpreters implement it (the walker via
  the bridge raw-write precedent, `agent_emit` in `jesun.jc`).
  Bangla: `প্রদর্শনকরো`.
- `read key [within <ms>] giving <name>` reads one keypress in raw
  terminal mode and gives back its name, or `nothing` if the wait
  runs out. `within 0` polls once without waiting. Bootstrap only:
  the walker parses the shape and fails honestly, because raw mode is
  a terminal property the self-hosted walker can never set
  (`Line N: "read key" needs the Jesun.Code tool itself; the
  self-hosted walker cannot put the terminal in raw mode.`).
  Bangla: `পড়ো কী [মধ্যে <ms>] রেখে <name>`.

Key names (exact): arrow escape sequences give `up`, `down`, `left`,
`right`; space gives `space`; return gives `enter`; backspace gives
`backspace`; Ctrl-C gives `quit`; a lone Escape gives `escape`;
letters `a` to `z` and digits `0` to `9` give themselves, as typed.
Anything else gives `nothing` (documented, not silent: the table
above is the whole contract).

Failures, all plain-English with line numbers:
- `read key` when stdin is not a terminal: `Line N: I could not read
  a key: this program is not talking to a terminal.`
- `within` not a non-negative number of milliseconds: `Line N:
  "within" needs milliseconds 0 or more, but this is ....`
- The terminal settings are always restored, even when the read
  fails; a failed read never leaves the user's terminal in raw mode.

### `raw mode` and `cooked mode` (v2.0)

The terminal must stay in raw mode for the whole game session, not
just during each `read key` call: keys pressed while the tty is in
canonical mode are consumed by the tty driver and lost. These two
statements hold and release the raw mode:

- `raw mode` puts the terminal in raw mode and holds it. Nested
  holds are counted; the terminal stays raw until the matching
  number of `cooked mode` statements run.
- `cooked mode` releases one hold. With no hold active it is a safe
  no-op (works on pipes, for tests).

`window_open` runs `raw mode`; `window_close` runs `cooked mode`.
A program that uses `raw mode` directly must pair it with
`cooked mode`, or the user's terminal is left in raw mode.

Bootstrap only, like `read key`: the walker parses the shape and
fails honestly (`Line N: "raw mode" needs the Jesun.Code tool
itself; the self-hosted walker cannot change the terminal mode.`).

Failures, all plain-English with line numbers:
- `raw mode` when stdin is not a terminal: `Line N: I could not
  change the terminal mode: this program is not talking to a
  terminal.`
- `raw` without `mode`: `Line N: I expected "mode" after "raw",
  but this is the end of the line.`

## 12. The `window` package (sprint 2)

`packages/window/window.jc`, used with `bring in "window"` (after
`bring in "game"`). Pure Jesun.Code; the only bridge primitive it
touches is `time_wait` from the `time` package for tick pacing (the
v1.2 raw-primitive boundary: sleep carries no game logic). ANSI text
is built with `\uXXXX` escapes (section 10); output goes through
`display` (section 11); keys come from `read key` (section 11).

- `window_open with w and h` gives back a window table: `w`, `h`, a
  fresh `game` frame, an empty pad, and `quit` set to false. It
  enters the live surface: alternate screen, hidden cursor, cleared.
  `w`/`h` follow the `game_frame` rule (whole numbers 1 to 1024).
- `window_frame with window` gives back the window's game frame, so
  the game draws with the ordinary `game_*` calls.
- `window_show with window` renders the frame to the terminal: cursor
  home, then one text row per two framebuffer rows, each cell a
  half-block `▀` with the top pixel as the 24-bit foreground and the
  bottom pixel as the 24-bit background. An odd last row pairs with
  black. Pure text; `display` writes it with no trailing newline.
- `window_keys with window` drains every pending keypress into the
  window's pad (non-blocking: `read key within 0`). Keys the game pad
  knows (`up`/`down`/`left`/`right`/`space`/letters/digits) are
  pressed; `quit` sets the window's quit flag; the rest are dropped.
  Gives back the number of keys drained.
- `window_quit with window` sets the quit flag (for games that quit
  on their own terms, e.g. a menu choice).
- `window_run with ticks and sim and update and draw and window`
  runs the live loop: each tick drains keys, stops early when the
  quit flag is set, bumps `sim["tick"]`, calls
  `attempt update with sim` then `attempt draw with sim` (draw targets
  the window's frame), shows the frame, and waits out the tick
  (20 frames per second). Gives back `{ticks, frames}`. `ticks`
  follows the `game_loop` rule (1 to 100000).
- `window_close with window` leaves the alternate screen and shows
  the cursor again. Call it when the game ends; the demo calls it on
  every exit path, because a hidden cursor left behind is a bug the
  player feels.

Failure rows (plain-English `Line N:`, section 7 style):

| Call | Bad input | Error |
| --- | --- | --- |
| `window_open` | w/h not whole 1..1024 | `window_open needs a whole width 1 to 1024, but this is ...` |
| `window_show`/`window_frame`/`window_keys`/`window_close` | not a window | `... needs a window from window_open, but this is ...` |
| `window_run` | ticks outside 1..100000 | `window_run needs 1 to 100000 ticks, but this is ...` |
| `window_run` | update/draw not functions | `window_run needs functions for update and draw, but ... is ...` |
| `read key` (drained inside `window_keys`/`window_run`) | stdin not a terminal | `Line N: I could not read a key: this program is not talking to a terminal.` |

v2.0 milestone acceptance, item 4 (2026-09-30): the terminal live
surface driver opens the game in the player's terminal window and
takes real keypresses on a PC, verified via tmux (`send-keys` real
keystrokes in, `capture-pane` live frames out). The GUI-window gap is
carried honestly in the release notes (section 9, decision 2), not in
the code.
