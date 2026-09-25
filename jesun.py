#!/usr/bin/env python3
"""Jesun.Code v0.3: an interpreter for a language that reads like plain English.

Usage:
    python jesun.py program.jc   run a Jesun.Code file
    python jesun.py              open the interactive REPL
    python jesun.py --version    print the version

Everything the user sees is plain English with a line number. Raw Python
tracebacks never reach the user.

=== PHASE 2 EXTENSION POINTS ===
- New statements (import, ask ai, tmux, ...) hook into Parser.parse_statement
  and Interpreter._STMT_HANDLERS.
- New value kinds (Python objects, AI replies) flow through show_text,
  is_truthy, type_name, and Environment.
- values_equal defines cross-type equality; extend it for new kinds.
"""

from __future__ import annotations

import difflib
import re
import sys
import threading
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Optional

VERSION = "0.6.0"
MAX_CALL_DEPTH = 100  # well under Python's own limit; the guard always fires first
MAX_LOOP_RUNS = 1_000_000
TOO_DEEP = "I got in too deep and stopped before falling over."
_TOP_MODULES_CACHE: Optional[list[str]] = None  # filled on first failed import

# Phase 2 constants: minds and machines (spec 17).
AI_NO_MIND = (
    "no mind connected. Set JESUNCODE_AI_COMMAND to a command that reads "
    "a prompt and writes an answer, for example: "
    'export JESUNCODE_AI_COMMAND="ollama run llama3.1"'
)
AI_TIMEOUT = 60
TMUX_TIMEOUT = 10
_MAX_AGENT_DEPTH = 3  # spec 19: how deep agents may call agents
_MEMORY_TURNS_KEPT = 200  # cap on turns kept in a saved memory file
CALL_RE = re.compile(r"^CALL:\s*([A-Za-z_][A-Za-z0-9_]*)\((.*)\)\s*$")


# ---------------------------------------------------------------------------
# Errors: everything the user sees is plain English with a line number.
# ---------------------------------------------------------------------------

class JesunError(Exception):
    """A user-facing error. Never let a raw Python traceback reach the user."""

    def __init__(self, line: int, message: str) -> None:
        self.line = line
        self.message = message
        super().__init__(f"Line {line}: {message}")


class _AgentDepthExceeded(JesunError):
    """Agent-to-agent nesting passed the cap: ends the loop, never feeds back."""


def fail(line: int, message: str) -> "None":
    raise JesunError(line, message)


# Control-flow signals. These never escape to the user; run() translates any
# stray ones into plain English.
class _Return(Exception):
    def __init__(self, value: Any, line: int) -> None:
        self.value = value
        self.line = line


class _TmuxFailed(Exception):
    """tmux said no. Caught by the terminal statements and translated."""

    def __init__(self, detail: str) -> None:
        self.detail = detail


class _Stop(Exception):
    def __init__(self, line: int) -> None:
        self.line = line


class _Skip(Exception):
    def __init__(self, line: int) -> None:
        self.line = line


# ---------------------------------------------------------------------------
# Values
# ---------------------------------------------------------------------------
# Jesun.Code values are plain Python values:
#   number -> int or float | text -> str | list -> list
#   true/false -> bool      | nothing -> None
# Phase 2: foreign objects (Python bridge) and AI replies plug in here.

def show_text(value: Any) -> str:
    """How a value looks when shown to a human. Never a debug repr."""
    if value is None:
        return "nothing"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return str(int(value)) if value.is_integer() else str(value)
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "[" + ", ".join(show_text(v) for v in value) + "]"
    if isinstance(value, Function):  # defined below; resolved at call time
        return f"<function {value.name}>"
    if isinstance(value, Agent):  # v0.2; defined below; resolved at call time
        return f"<agent {value.name}>"
    if isinstance(value, Foreign):  # defined above; resolved at call time
        return _foreign_text(value.obj)
    return str(value)  # last resort; never a raw repr of internals


def is_truthy(value: Any) -> bool:
    if value is None or value is False:
        return False
    if value is True:
        return True
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, (str, list)):
        return len(value) > 0
    if isinstance(value, Foreign):
        try:
            return bool(value.obj)
        except Exception:
            return True
    return True


def type_name(value: Any) -> str:
    if value is None:
        return "nothing"
    if isinstance(value, bool):
        return "true/false"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "text"
    if isinstance(value, list):
        return "list"
    if isinstance(value, Foreign):
        return "python value"
    if isinstance(value, Function):  # defined below; resolved at call time
        return "function"
    return "value"


def values_equal(a: Any, b: Any) -> bool:
    """Equality for `is`. true/false never equal numbers; numbers mix freely."""
    if isinstance(a, Foreign) or isinstance(b, Foreign):
        return a is b
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return a == b
    if isinstance(a, str) and isinstance(b, str):
        return a == b
    if a is None and b is None:
        return True
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(values_equal(x, y) for x, y in zip(a, b))
    return False


def suggest(name: str, candidates: list[str]) -> str:
    lower = name.lower()
    for cand in candidates:
        if cand == name:
            continue
        cl = cand.lower()
        if cl.startswith(lower) or lower.startswith(cl):
            return f' Did you mean "{cand}"?'
    match = difflib.get_close_matches(name, candidates, n=1, cutoff=0.6)
    if match:
        return f' Did you mean "{match[0]}"?'
    return ""


# ---------------------------------------------------------------------------
# Phase 2: foreign values (the Python bridge). A Foreign wraps a Python
# object that crossed the bridge. It never leaks a raw repr to the user.
# ---------------------------------------------------------------------------

class Foreign:
    """A Python value living in Jesun.Code. Opaque, but usable."""

    __slots__ = ("obj",)

    def __init__(self, obj: Any) -> None:
        self.obj = obj


def _safe_type_name(obj: Any) -> str:
    try:
        return type(obj).__name__
    except Exception:
        return "value"


def _foreign_text(obj: Any) -> str:
    import types
    if isinstance(obj, types.ModuleType):
        name = getattr(obj, "__name__", "unknown")
        return f'the python module "{name}"'
    return f'a python "{_safe_type_name(obj)}"'


def to_jesun(value: Any) -> Any:
    """Convert a Python value into a Jesun.Code value."""
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple)):
        return [to_jesun(v) for v in value]
    return Foreign(value)


def to_python(value: Any, line: int) -> Any:
    """Convert a Jesun.Code value into a Python value for a foreign call."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, list):
        return [to_python(v, line) for v in value]
    if isinstance(value, Foreign):
        return value.obj
    fail(line, f"I cannot hand {type_name(value)} to Python.")


def _split_top_level(text: str, sep: str) -> list[str]:
    """Split on sep, ignoring separators inside strings, (), [], {}."""
    parts: list[str] = []
    depth = 0
    cur: list[str] = []
    quote: Optional[str] = None
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if quote is not None:
            cur.append(ch)
            if ch == "\\" and i + 1 < n:
                cur.append(text[i + 1])
                i += 2
                continue
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
            cur.append(ch)
        elif ch in "([{":
            depth += 1
            cur.append(ch)
        elif ch in ")]}":
            depth = max(0, depth - 1)
            cur.append(ch)
        elif ch == sep and depth == 0:
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
        i += 1
    parts.append("".join(cur))
    return parts


# ---------------------------------------------------------------------------
# Lexer
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Token:
    type: str
    value: Any
    line: int


KEYWORDS: dict[str, str] = {
    "show": "SHOW", "is": "IS", "not": "NOT", "true": "TRUE", "false": "FALSE",
    "nothing": "NOTHING", "ask": "ASK", "giving": "GIVING", "if": "IF",
    "then": "THEN", "otherwise": "OTHERWISE", "repeat": "REPEAT",
    "times": "TIMES", "while": "WHILE", "for": "FOR", "each": "EACH",
    "in": "IN", "to": "TO", "with": "WITH", "and": "AND", "or": "OR",
    "give": "GIVE", "back": "BACK", "stop": "STOP", "skip": "SKIP",
    "of": "OF", "first": "FIRST", "last": "LAST", "length": "LENGTH",
    "uppercase": "UPPERCASE", "lowercase": "LOWERCASE", "greater": "GREATER",
    "less": "LESS", "than": "THAN", "least": "LEAST", "most": "MOST",
    "at": "AT", "contains": "CONTAINS",
    "split": "SPLIT", "join": "JOIN", "trim": "TRIM", "by": "BY",
    "keys": "KEYS",
    # v1.0: list building and character scanning for the self-hosted lexer.
    "push": "PUSH", "characters": "CHARACTERS",
    # v1.0: exact value rendering and type tests for the self-hosted walker.
    "text": "TEXT", "kind": "KIND",
    # Phase 2: the Python bridge, minds, and machines.
    "import": "IMPORT", "as": "AS", "ai": "AI", "tools": "TOOLS",
    "within": "WITHIN", "steps": "STEPS", "open": "OPEN",
    "terminal": "TERMINAL", "named": "NAMED", "send": "SEND",
    "read": "READ", "close": "CLOSE",
    # v0.2: agents.
    "agent": "AGENT", "persona": "PERSONA", "remember": "REMEMBER",
    # v0.3: deeper agents.
    "always": "ALWAYS", "forget": "FORGET", "memory": "MEMORY",
    "file": "FILE", "streaming": "STREAMING",
    # v0.4: files and words.
    "write": "WRITE", "append": "APPEND",
    # v0.4: jpm packages.
    "use": "USE", "bring": "BRING",
    # v0.6: fleets.
    "fleet": "FLEET",
}

# v0.5: the Bangla flavor. Same token types as KEYWORDS, Bangla words.
# Spec: docs/spec-v0.5.md section 23. In Bangla mode these replace the
# English words one for one; the grammar does not change.
BANGLA_KEYWORDS: dict[str, str] = {
    "দেখাও": "SHOW", "হয়": "IS", "না": "NOT", "সত্য": "TRUE",
    "মিথ্যা": "FALSE", "ফাঁকা": "NOTHING", "জিজ্ঞেস": "ASK",
    "রেখে": "GIVING", "যদি": "IF", "তাহলে": "THEN", "নইলে": "OTHERWISE",
    "আবার": "REPEAT", "বার": "TIMES", "যতক্ষণ": "WHILE", "জন্য": "FOR",
    "প্রতিটি": "EACH", "ভেতরে": "IN", "জন্যে": "TO", "সহ": "WITH",
    "এবং": "AND", "অথবা": "OR", "দাও": "GIVE", "ফেরত": "BACK",
    "থামো": "STOP", "এড়িয়ে": "SKIP", "এর": "OF", "প্রথম": "FIRST",
    "শেষ": "LAST", "দৈর্ঘ্য": "LENGTH", "বড়হাতা": "UPPERCASE",
    "ছোটহাতা": "LOWERCASE", "বড়": "GREATER", "ছোট": "LESS",
    "চেয়ে": "THAN", "কমপক্ষে": "LEAST", "সবচেয়ে": "MOST",
    "নম্বরে": "AT", "আছে": "CONTAINS", "ভাগ": "SPLIT", "জোড়া": "JOIN",
    "ছাঁটো": "TRIM", "দিয়ে": "BY", "চাবি": "KEYS", "আনো": "IMPORT",
    "হিসেবে": "AS", "এআই": "AI", "হাতিয়ার": "TOOLS", "মধ্যে": "WITHIN",
    "ধাপ": "STEPS", "খোলো": "OPEN", "টার্মিনাল": "TERMINAL",
    "নামে": "NAMED", "পাঠাও": "SEND", "পড়ো": "READ",
    "বন্ধকরো": "CLOSE", "এজেন্ট": "AGENT", "পারসোনা": "PERSONA",
    "মনেকরো": "REMEMBER", "সবসময়": "ALWAYS", "ভুলেযাও": "FORGET",
    "স্মৃতি": "MEMORY", "ফাইল": "FILE", "সরাসরি": "STREAMING",
    "লেখো": "WRITE", "যোগকরো": "APPEND", "ব্যবহার": "USE",
    "দল": "FLEET",
    "নিয়ে": "BRING",
}

# In Bangla mode, comments start with this word instead of `note`.
BANGLA_COMMENT = "মন্তব্য"


def _is_word_char(ch: str) -> bool:
    """Word characters for the lexer: letters, digits, underscore, and
    combining marks. Bangla vowel signs (ে, া) are marks, not letters;
    without this, দেখাও would split into pieces."""
    return ch.isalnum() or ch == "_" or unicodedata.category(ch).startswith("M")

SIMPLE_TOKENS: dict[str, str] = {
    "+": "PLUS", "-": "MINUS", "*": "STAR", "/": "SLASH", "%": "PERCENT",
    "(": "LPAREN", ")": "RPAREN", "[": "LBRACKET", "]": "RBRACKET",
    ",": "COMMA", ".": "DOT", "=": "EQ",
}


def _cut_comment(line: str, comment_word: str = "note") -> str:
    """Cut a comment to end of line, ignoring the word inside strings."""
    i, n = 0, len(line)
    wlen = len(comment_word)
    quote: Optional[str] = None
    while i < n:
        ch = line[i]
        if quote is not None:
            if ch == "\\":
                i += 2
                continue
            if ch == quote:
                quote = None
            i += 1
            continue
        if ch in "\"'":
            quote = ch
            i += 1
            continue
        if line.startswith(comment_word, i):
            before = line[i - 1] if i > 0 else " "
            after = line[i + wlen] if i + wlen < n else " "
            if not _is_word_char(before) and not _is_word_char(after):
                return line[:i]
            i += wlen
            continue
        i += 1
    return line


def _read_string(text: str, start: int, lineno: int) -> tuple[str, int]:
    quote = text[start]
    i, n = start + 1, len(text)
    out: list[str] = []
    while i < n:
        ch = text[i]
        if ch == "\\" and i + 1 < n:
            nxt = text[i + 1]
            out.append({"n": "\n", "t": "\t", '"': '"', "'": "'", "\\": "\\"}.get(nxt, nxt))
            i += 2
            continue
        if ch == quote:
            return "".join(out), i + 1
        out.append(ch)
        i += 1
    fail(lineno, "this text never ends; close the quote.")
    raise AssertionError("unreachable")


def _tokenize_line(text: str, lineno: int,
                   keywords: dict[str, str] = KEYWORDS) -> list[Token]:
    tokens: list[Token] = []
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if ch.isspace():
            i += 1
            continue
        if ch in "\"'":
            value, i = _read_string(text, i, lineno)
            tokens.append(Token("STRING", value, lineno))
            continue
        if ch.isdigit():
            j = i
            while j < n and text[j].isdigit():
                j += 1
            if j < n and text[j] == "." and j + 1 < n and text[j + 1].isdigit():
                j += 1
                while j < n and text[j].isdigit():
                    j += 1
                tokens.append(Token("NUMBER", float(text[i:j]), lineno))
            else:
                tokens.append(Token("NUMBER", int(text[i:j]), lineno))
            i = j
            continue
        if ch.isalpha() or ch == "_":
            j = i
            while j < n and _is_word_char(text[j]):
                j += 1
            word = text[i:j]
            tokens.append(Token(keywords.get(word, "NAME"), word, lineno))
            i = j
            continue
        if ch in SIMPLE_TOKENS:
            tokens.append(Token(SIMPLE_TOKENS[ch], ch, lineno))
            i += 1
            continue
        fail(lineno, f'I do not know what "{ch}" means here.')
    return tokens


def _bangla_header_lineno(source: str) -> int:
    """Line number of the Bangla-mode header, or 0 for English mode.

    The header is the first non-blank line of the file and must be exactly
    `use bangla` or the lone word `বাংলা` (a trailing English `note`
    comment is allowed; the header itself is read in English mode).
    """
    for lineno, raw in enumerate(source.split("\n"), start=1):
        if not _cut_comment(raw).strip():
            continue
        stripped = _cut_comment(raw).strip()
        if stripped == "use bangla" or stripped == "বাংলা":
            return lineno
        return 0
    return 0


def tokenize(source: str) -> list[Token]:
    source = source.lstrip("\ufeff")  # a BOM is not a word I know
    header = _bangla_header_lineno(source)
    keywords = BANGLA_KEYWORDS if header else KEYWORDS
    comment_word = BANGLA_COMMENT if header else "note"
    tokens: list[Token] = []
    indents: list[int] = [0]
    last_line = 1
    for lineno, raw in enumerate(source.split("\n"), start=1):
        last_line = lineno
        if lineno == header:
            continue  # the header is a directive, not a statement
        line = _cut_comment(raw, comment_word)
        if "\t" in line and line.strip():
            fail(lineno, "I do not understand tabs; please indent with spaces.")
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip(" "))
        if indent > indents[-1]:
            indents.append(indent)
            tokens.append(Token("INDENT", None, lineno))
        else:
            while indent < indents[-1]:
                indents.pop()
                tokens.append(Token("DEDENT", None, lineno))
            if indent != indents[-1]:
                fail(lineno, "this line does not line up with any block I opened.")
        tokens.extend(_tokenize_line(line.strip(), lineno, keywords))
        tokens.append(Token("NEWLINE", None, lineno))
    while len(indents) > 1:
        indents.pop()
        tokens.append(Token("DEDENT", None, last_line))
    tokens.append(Token("EOF", None, last_line))
    return tokens


# ---------------------------------------------------------------------------
# Parser: tokens -> AST
# ---------------------------------------------------------------------------
# Phase 2: new statements hook into parse_statement; new expression forms
# hook into parse_primary.

@dataclass
class Show:
    expr: "Expr"
    line: int


@dataclass
class Assign:
    name: str
    expr: "Expr"
    line: int


@dataclass
class Ask:
    prompt: "Expr"
    name: str
    line: int


@dataclass
class If:
    branches: list[tuple["Expr", list["Stmt"]]]
    else_body: list["Stmt"]
    line: int


@dataclass
class RepeatCount:
    count: "Expr"
    body: list["Stmt"]
    line: int


@dataclass
class RepeatWhile:
    cond: "Expr"
    body: list["Stmt"]
    line: int


@dataclass
class ForEach:
    var: str
    iterable: "Expr"
    body: list["Stmt"]
    line: int


@dataclass
class FuncDef:
    name: str
    params: list[str]
    body: list["Stmt"]
    line: int


@dataclass
class GiveBack:
    expr: "Expr"
    line: int


@dataclass
class Stop:
    line: int


@dataclass
class Skip:
    line: int


@dataclass
class ExprStmt:
    expr: "Expr"
    line: int


@dataclass
class BinOp:
    op: str  # PLUS MINUS STAR SLASH PERCENT AND OR
    left: "Expr"
    right: "Expr"
    line: int


@dataclass
class UnaryOp:
    op: str  # MINUS NOT
    operand: "Expr"
    line: int


@dataclass
class Compare:
    op: str  # EQ NEQ GT LT GTE LTE CONTAINS
    left: "Expr"
    right: "Expr"
    line: int


@dataclass
class Literal:
    value: Any
    line: int


@dataclass
class Var:
    name: str
    line: int


@dataclass
class ListLit:
    items: list["Expr"]
    line: int


@dataclass
class Call:
    name: str
    args: list["Expr"]
    line: int


@dataclass
class Builtin:
    kind: str  # FIRST LAST LENGTH UPPERCASE LOWERCASE SPLIT JOIN TRIM KEYS CHARACTERS TEXT KIND
    operand: "Expr"
    line: int
    sep: Optional["Expr"] = None  # SPLIT ... BY sep / JOIN ... WITH sep


# -- phase 2 AST ------------------------------------------------------------
# The Python bridge (spec 16), minds and machines (spec 17).

@dataclass
class Attr:
    obj: "Expr"
    name: str
    line: int


@dataclass
class ForeignCall:
    func: "Expr"
    args: list["Expr"]
    kwargs: list[tuple[str, "Expr"]]
    line: int


@dataclass
class Subscript:
    obj: "Expr"
    index: "Expr"
    line: int


@dataclass
class Import:
    module: str
    alias: Optional[str]  # None when no `as` was written
    line: int


@dataclass
class AskAi:
    prompt: "Expr"
    tools: list[str]
    max_steps: int
    name: str
    streaming: bool
    line: int


@dataclass
class TermOpen:
    name: "Expr"
    line: int


@dataclass
class TermSend:
    cmd: "Expr"
    name: "Expr"
    line: int


@dataclass
class TermRead:
    name: "Expr"
    target: str
    line: int


@dataclass
class TermClose:
    name: "Expr"
    line: int


# -- v0.2 AST: agents (spec 18), v0.3 memory (spec 19) -----------------------

@dataclass
class AgentDef:
    name: str
    persona: Optional["Expr"]  # None when no persona line was given
    tools: list[str]
    remember: str  # "off", "run" (this run only), or "always" (saved to disk)
    memory_file: Optional["Expr"]  # None unless `memory file is ...` was given
    max_steps: int
    line: int


@dataclass
class AskAgent:
    agent_name: str
    prompt: "Expr"
    name: str  # variable to store the answer in
    streaming: bool
    line: int


@dataclass
class FleetAsk:
    """One ask inside a fleet block (v0.6)."""
    agent_name: str
    prompt: "Expr"
    name: str  # variable to store the answer in
    line: int


@dataclass
class FleetDef:
    name: str
    members: list[str]  # agent names, in header order
    asks: list[FleetAsk]
    memory_file: Optional["Expr"]  # None unless `memory file is ...` was given
    line: int


@dataclass
class ForgetAgent:
    name: str
    line: int


# v0.4: files and words.
@dataclass
class Interp:
    parts: list  # [("text", str) | ("expr", Expr)]
    line: int


@dataclass
class ReadFile:
    path: "Expr"
    name: str
    line: int


@dataclass
class WriteFile:
    value: "Expr"
    path: "Expr"
    append: bool
    line: int


@dataclass
class UsePkg:
    address: "Expr"
    line: int


@dataclass
class BringIn:
    name: "Expr"
    line: int


@dataclass
class Push:
    """v1.0: `push <expr> to <name>` appends to the named list in place."""
    expr: "Expr"
    name: str
    line: int


Stmt = Any
Expr = Any


class Parser:
    def __init__(self, tokens: list[Token]) -> None:
        self.tokens = tokens
        self.pos = 0
        self.last_line = 1

    def peek(self) -> Token:
        return self.tokens[self.pos]

    def peek2(self) -> Token:
        if self.pos + 1 < len(self.tokens):
            return self.tokens[self.pos + 1]
        return self.tokens[-1]

    def advance(self) -> Token:
        tok = self.tokens[self.pos]
        self.pos += 1
        self.last_line = tok.line
        return tok

    def expect(self, type: str, what: str) -> Token:
        tok = self.peek()
        if tok.type != type:
            fail(tok.line, f"I expected {what} here.")
        return self.advance()

    # -- program ---------------------------------------------------------
    def parse_program(self) -> list[Stmt]:
        stmts: list[Stmt] = []
        while self.peek().type != "EOF":
            stmts.append(self.parse_statement())
        return stmts

    # -- statements ------------------------------------------------------
    def parse_statement(self) -> Stmt:
        tok = self.peek()
        if tok.type == "INDENT":
            fail(tok.line, "this line starts a block, but I did not expect one here.")
        if tok.type == "SHOW":
            return self.parse_show()
        if tok.type == "ASK":
            return self.parse_ask()
        if tok.type == "IF":
            return self.parse_if()
        if tok.type == "REPEAT":
            return self.parse_repeat()
        if tok.type == "FOR":
            return self.parse_foreach()
        if tok.type == "TO":
            return self.parse_funcdef()
        if tok.type == "AGENT":
            return self.parse_agent_def()
        if tok.type == "FLEET":
            return self.parse_fleet_def()
        if tok.type == "FORGET":
            return self.parse_forget()
        if tok.type == "GIVE":
            return self.parse_giveback()
        if tok.type == "STOP":
            self.advance()
            self.expect("NEWLINE", "the end of the line")
            return Stop(tok.line)
        if tok.type == "SKIP":
            self.advance()
            self.expect("NEWLINE", "the end of the line")
            return Skip(tok.line)
        if tok.type == "WRITE":
            return self.parse_write_file(tok, append=False)
        if tok.type == "APPEND":
            return self.parse_write_file(tok, append=True)
        # v0.4: jpm packages.
        if tok.type == "USE":
            return self.parse_use_pkg()
        if tok.type == "BRING":
            return self.parse_bring_in()
        if tok.type == "OTHERWISE":
            fail(tok.line, '"otherwise" needs an "if" above it.')
        # Phase 2 statements: the Python bridge, minds, and machines.
        if tok.type == "IMPORT":
            return self.parse_import()
        if tok.type == "OPEN":
            return self.parse_term_open()
        if tok.type == "SEND":
            return self.parse_term_send()
        if tok.type == "READ":
            self.advance()
            if self.peek().type == "FILE":
                return self.parse_read_file(tok)
            return self.parse_term_read(tok)
        if tok.type == "CLOSE":
            return self.parse_term_close()
        if tok.type == "NAME" and self.peek2().type == "IS":
            return self.parse_assign()
        if tok.type == "PUSH":  # v1.0
            return self.parse_push()
        expr = self.parse_or()
        self.expect("NEWLINE", "the end of the line")
        return ExprStmt(expr, tok.line)

    def parse_show(self) -> Show:
        tok = self.advance()
        expr = self.parse_or()
        self.expect("NEWLINE", "the end of the line")
        return Show(expr, tok.line)

    def parse_assign(self) -> Assign:
        name = self.advance().value
        line = self.advance().line  # IS
        expr = self.parse_or()
        self.expect("NEWLINE", "the end of the line")
        return Assign(name, expr, line)

    def parse_push(self) -> Push:
        # v1.0: `push <expr> to <name>`. TO stops the expression parse the
        # same way it stops nothing else, so `push a + b to xs` works.
        tok = self.advance()  # PUSH
        expr = self.parse_or()
        self.expect("TO", '"to"')
        name = self.expect("NAME", 'a list name after "to"').value
        self.expect("NEWLINE", "the end of the line")
        return Push(expr, name, tok.line)

    def parse_ask(self) -> Stmt:
        tok = self.advance()
        if self.peek().type == "AI":
            return self.parse_ask_ai(tok)
        if self.peek().type == "NAME" and self.peek2().type != "GIVING":
            return self.parse_ask_agent(tok)
        prompt = self.parse_or()
        self.expect("GIVING", '"giving" followed by a name')
        name = self.expect("NAME", "a name to store the answer in").value
        self.expect("NEWLINE", "the end of the line")
        return Ask(prompt, name, tok.line)

    def parse_ask_agent(self, tok: Token) -> AskAgent:
        agent_name = self.advance().value  # NAME
        prompt = self.parse_or()
        self.expect("GIVING", '"giving" followed by a name')
        name = self.expect("NAME", "a name to store the answer in").value
        streaming = self._optional_streaming()
        self.expect("NEWLINE", "the end of the line")
        return AskAgent(agent_name, prompt, name, streaming, tok.line)

    def parse_forget(self) -> ForgetAgent:
        tok = self.advance()  # FORGET
        name = self.expect("NAME", "an agent name to forget").value
        self.expect("NEWLINE", "the end of the line")
        return ForgetAgent(name, tok.line)

    def _optional_streaming(self) -> bool:
        if self.peek().type == "STREAMING":
            self.advance()
            return True
        return False

    def _agent_dup(self, seen: set[str], field: str, line: int) -> None:
        if field in seen:
            fail(line, f'"{field}" is already set for this agent.')
        seen.add(field)

    def _expect_is_or_are(self) -> None:
        if self.peek().type == "IS":
            self.advance()
        elif self.peek().type == "NAME" and self.peek().value == "are":
            self.advance()
        else:
            fail(self.peek().line, 'I expected "is" or "are" here.')

    def parse_agent_def(self) -> AgentDef:
        tok = self.advance()  # AGENT
        name = self.expect("NAME", "a name for the agent").value
        self.expect("NEWLINE", "the end of the line")
        if self.peek().type != "INDENT":
            fail(self.peek().line, "an agent needs an indented block of settings.")
        self.advance()  # INDENT
        persona: Optional[Expr] = None
        tools: list[str] = []
        remember = "off"
        memory_file: Optional[Expr] = None
        max_steps = 10
        seen: set[str] = set()
        while self.peek().type != "DEDENT":
            if self.peek().type == "EOF":
                fail(self.peek().line, "this block never ends.")
            fline = self.peek().line
            ftype = self.peek().type
            if ftype == "PERSONA":
                self._agent_dup(seen, "persona", fline)
                self.advance()
                self.expect("IS", '"is"')
                persona = self.parse_or()
            elif ftype == "TOOLS":
                self._agent_dup(seen, "tools", fline)
                self.advance()
                self._expect_is_or_are()
                self.expect("LBRACKET", '"[" around the tool names')
                if self.peek().type != "RBRACKET":
                    tools.append(self.expect("NAME", "a tool name").value)
                    while self.peek().type == "COMMA":
                        self.advance()
                        tools.append(self.expect("NAME", "a tool name").value)
                self.expect("RBRACKET", 'a closing "]"')
            elif ftype == "REMEMBER":
                self._agent_dup(seen, "remember", fline)
                self.advance()
                self.expect("IS", '"is"')
                if self.peek().type == "TRUE":
                    self.advance()
                    remember = "run"
                elif self.peek().type == "FALSE":
                    self.advance()
                    remember = "off"
                elif self.peek().type == "ALWAYS":
                    self.advance()
                    remember = "always"
                else:
                    fail(self.peek().line, '"remember" needs true, false, or always.')
            elif ftype == "MEMORY":
                self._agent_dup(seen, "memory file", fline)
                self.advance()
                self.expect("FILE", '"file"')
                self.expect("IS", '"is"')
                memory_file = self.parse_or()
            elif ftype == "STEPS":
                self._agent_dup(seen, "steps", fline)
                self.advance()
                self._expect_is_or_are()
                steps_tok = self.expect("NUMBER", "a number of steps")
                if isinstance(steps_tok.value, float) or steps_tok.value < 1:
                    fail(steps_tok.line, '"steps" needs a whole number of steps, at least 1.')
                max_steps = int(steps_tok.value)
            else:
                if self.peek().type == "NAME":
                    got = self.peek().value
                else:
                    got = self.peek().type.lower()
                fail(fline, f'I do not know the agent setting "{got}". '
                            "I know: persona, tools, remember, steps, memory file.")
            self.expect("NEWLINE", "the end of the line")
        self.advance()  # DEDENT
        return AgentDef(name, persona, tools, remember, memory_file, max_steps, tok.line)

    # -- v0.6: fleets (spec v0.6) ---------------------------------------------
    def parse_fleet_def(self) -> FleetDef:
        tok = self.advance()  # FLEET
        name = self.expect("NAME", "a name for the fleet").value
        self.expect("WITH", '"with"')
        members = [self.expect("NAME", "an agent name").value]
        while self.peek().type == "AND":
            self.advance()
            members.append(self.expect("NAME", "an agent name").value)
        self.expect("NEWLINE", "the end of the line")
        if self.peek().type != "INDENT":
            fail(self.peek().line, "a fleet needs an indented block of asks.")
        self.advance()  # INDENT
        asks: list[FleetAsk] = []
        memory_file: Optional[Expr] = None
        while self.peek().type != "DEDENT":
            if self.peek().type == "EOF":
                fail(self.peek().line, "this block never ends.")
            fline = self.peek().line
            ftype = self.peek().type
            if ftype == "ASK":
                self.advance()
                member = self.expect("NAME", "a fleet member to ask").value
                if member not in members:
                    fail(fline,
                         f'"{member}" is not a member of fleet "{name}".')
                prompt = self.parse_or()
                self.expect("GIVING", '"giving" followed by a name')
                gname = self.expect("NAME",
                                    "a name to store the answer in").value
                if self._optional_streaming():
                    fail(fline, "streaming asks cannot run in a fleet; "
                               'take "streaming" out.')
                self.expect("NEWLINE", "the end of the line")
                asks.append(FleetAsk(member, prompt, gname, fline))
            elif ftype == "MEMORY":
                if memory_file is not None:
                    fail(fline, '"memory file" is already set for this fleet.')
                self.advance()
                self.expect("FILE", '"file"')
                self.expect("IS", '"is"')
                memory_file = self.parse_or()
                self.expect("NEWLINE", "the end of the line")
            else:
                if self.peek().type == "NAME":
                    got = self.peek().value
                else:
                    got = self.peek().type.lower()
                fail(fline, f'I do not know the fleet line "{got}". '
                            'A fleet holds one ask per line, like '
                            'ask scout "is it up?" giving answer, and '
                            'optionally one line: memory file is "crew.json".')
            # NEWLINE already consumed per branch above.
        self.advance()  # DEDENT
        return FleetDef(name, members, asks, memory_file, tok.line)

    def parse_ask_ai(self, tok: Token) -> AskAi:
        self.advance()  # AI
        prompt = self.parse_or()
        tools: list[str] = []
        max_steps = 10
        if self.peek().type == "WITH":
            self.advance()
            self.expect("TOOLS", '"tools"')
            self.expect("LBRACKET", '"[" around the tool names')
            if self.peek().type != "RBRACKET":
                tools.append(self.expect("NAME", "a tool name").value)
                while self.peek().type == "COMMA":
                    self.advance()
                    tools.append(self.expect("NAME", "a tool name").value)
            self.expect("RBRACKET", 'a closing "]"')
            if self.peek().type == "WITHIN":
                self.advance()
                steps_tok = self.expect("NUMBER", "a number of steps")
                if isinstance(steps_tok.value, float) or steps_tok.value < 1:
                    fail(steps_tok.line, '"within" needs a whole number of steps, at least 1.')
                max_steps = int(steps_tok.value)
                self.expect("STEPS", '"steps"')
        self.expect("GIVING", '"giving" followed by a name')
        name = self.expect("NAME", "a name to store the answer in").value
        streaming = self._optional_streaming()
        self.expect("NEWLINE", "the end of the line")
        return AskAi(prompt, tools, max_steps, name, streaming, tok.line)

    def parse_import(self) -> Import:
        tok = self.advance()
        parts = [self.expect("NAME", "a module name").value]
        while self.peek().type == "DOT":
            self.advance()
            parts.append(self.expect("NAME", "a module name").value)
        module = ".".join(parts)
        alias: Optional[str] = None
        if self.peek().type == "AS":
            self.advance()
            alias = self.expect("NAME", "a name for the module").value
        self.expect("NEWLINE", "the end of the line")
        return Import(module, alias, tok.line)

    def parse_term_open(self) -> TermOpen:
        tok = self.advance()
        self.expect("TERMINAL", '"terminal"')
        self.expect("NAMED", '"named"')
        name = self.parse_or()
        self.expect("NEWLINE", "the end of the line")
        return TermOpen(name, tok.line)

    def parse_term_send(self) -> TermSend:
        tok = self.advance()
        cmd = self.parse_or()
        self.expect("TO", '"to"')
        self.expect("TERMINAL", '"terminal"')
        name = self.parse_or()
        self.expect("NEWLINE", "the end of the line")
        return TermSend(cmd, name, tok.line)

    # v0.4: files. The READ token was already consumed by parse_statement.
    def parse_read_file(self, tok: Token) -> ReadFile:
        self.expect("FILE", '"file"')
        path = self.parse_or()
        self.expect("GIVING", '"giving" followed by a name')
        name = self.expect("NAME", "a name to store the text in").value
        self.expect("NEWLINE", "the end of the line")
        return ReadFile(path, name, tok.line)

    def parse_write_file(self, tok: Token, append: bool) -> WriteFile:
        self.advance()  # WRITE or APPEND
        value = self.parse_or()
        self.expect("TO", '"to"')
        self.expect("FILE", '"file"')
        path = self.parse_or()
        self.expect("NEWLINE", "the end of the line")
        return WriteFile(value, path, append, tok.line)

    # v0.4: jpm packages.
    def parse_use_pkg(self) -> UsePkg:
        tok = self.advance()  # USE
        address = self.parse_or()
        self.expect("NEWLINE", "the end of the line")
        return UsePkg(address, tok.line)

    def parse_bring_in(self) -> BringIn:
        tok = self.advance()  # BRING
        self.expect("IN", '"in"')
        name = self.parse_or()
        self.expect("NEWLINE", "the end of the line")
        return BringIn(name, tok.line)

    def parse_term_read(self, tok: Token) -> TermRead:
        self.expect("TERMINAL", '"terminal"')
        name = self.parse_or()
        self.expect("GIVING", '"giving" followed by a name')
        target = self.expect("NAME", "a name to store the output in").value
        self.expect("NEWLINE", "the end of the line")
        return TermRead(name, target, tok.line)

    def parse_term_close(self) -> TermClose:
        tok = self.advance()
        self.expect("TERMINAL", '"terminal"')
        name = self.parse_or()
        self.expect("NEWLINE", "the end of the line")
        return TermClose(name, tok.line)

    def parse_block(self) -> list[Stmt]:
        tok = self.peek()
        if tok.type != "INDENT":
            fail(tok.line, "I expected an indented block here.")
        self.advance()
        stmts: list[Stmt] = []
        while self.peek().type != "DEDENT":
            if self.peek().type == "EOF":
                fail(self.peek().line, "this block never ends.")
            stmts.append(self.parse_statement())
        self.advance()
        return stmts

    def parse_if(self) -> If:
        tok = self.advance()
        cond = self.parse_or()
        self.expect("THEN", '"then"')
        self.expect("NEWLINE", "the end of the line")
        branches = [(cond, self.parse_block())]
        else_body: list[Stmt] = []
        while self.peek().type == "OTHERWISE":
            self.advance()
            if self.peek().type == "IF":
                self.advance()
                cond = self.parse_or()
                self.expect("THEN", '"then"')
                self.expect("NEWLINE", "the end of the line")
                branches.append((cond, self.parse_block()))
            else:
                self.expect("NEWLINE", "a new line after \"otherwise\"")
                else_body = self.parse_block()
                break
        return If(branches, else_body, tok.line)

    def parse_repeat(self) -> Stmt:
        tok = self.advance()
        if self.peek().type == "WHILE":
            self.advance()
            cond = self.parse_or()
            self.expect("NEWLINE", "the end of the line")
            return RepeatWhile(cond, self.parse_block(), tok.line)
        count = self.parse_or()
        self.expect("TIMES", '"times"')
        self.expect("NEWLINE", "the end of the line")
        return RepeatCount(count, self.parse_block(), tok.line)

    def parse_foreach(self) -> ForEach:
        tok = self.advance()
        self.expect("EACH", '"each"')
        var = self.expect("NAME", "a name for each item").value
        self.expect("IN", '"in"')
        iterable = self.parse_or()
        self.expect("NEWLINE", "the end of the line")
        return ForEach(var, iterable, self.parse_block(), tok.line)

    def parse_funcdef(self) -> FuncDef:
        tok = self.advance()
        name = self.expect("NAME", "a name for the function").value
        params: list[str] = []
        if self.peek().type == "WITH":
            self.advance()
            params.append(self.expect("NAME", "a name for the input").value)
            while self.peek().type == "AND":
                self.advance()
                params.append(self.expect("NAME", "a name for the input").value)
        self.expect("NEWLINE", "the end of the line")
        return FuncDef(name, params, self.parse_block(), tok.line)

    def parse_giveback(self) -> GiveBack:
        tok = self.advance()
        self.expect("BACK", '"back"')
        expr = self.parse_or()
        self.expect("NEWLINE", "the end of the line")
        return GiveBack(expr, tok.line)

    # -- expressions -----------------------------------------------------
    def parse_or(self) -> Expr:
        node = self.parse_and()
        while self.peek().type == "OR":
            line = self.advance().line
            node = BinOp("OR", node, self.parse_and(), line)
        return node

    def parse_and(self) -> Expr:
        node = self.parse_not()
        while self.peek().type == "AND":
            line = self.advance().line
            node = BinOp("AND", node, self.parse_not(), line)
        return node

    def parse_not(self) -> Expr:
        tok = self.peek()
        if tok.type == "NOT":
            self.advance()
            return UnaryOp("NOT", self.parse_not(), tok.line)
        return self.parse_comparison()

    def parse_comparison(self) -> Expr:
        node = self.parse_additive()
        while True:
            tok = self.peek()
            if tok.type == "IS" and self.peek2().type == "NOT":
                self.advance()
                self.advance()
                node = Compare("NEQ", node, self.parse_additive(), tok.line)
            elif tok.type == "IS":
                self.advance()
                nxt = self.peek()
                if nxt.type == "GREATER":
                    self.advance()
                    self.expect("THAN", '"than"')
                    op = "GT"
                elif nxt.type == "LESS":
                    self.advance()
                    self.expect("THAN", '"than"')
                    op = "LT"
                elif nxt.type == "AT":
                    self.advance()
                    nxt2 = self.peek()
                    if nxt2.type == "LEAST":
                        self.advance()
                        op = "GTE"
                    elif nxt2.type == "MOST":
                        self.advance()
                        op = "LTE"
                    else:
                        fail(nxt2.line, 'I expected "least" or "most" after "at".')
                        op = "GTE"
                else:
                    op = "EQ"
                node = Compare(op, node, self.parse_additive(), tok.line)
            elif tok.type == "CONTAINS":
                self.advance()
                node = Compare("CONTAINS", node, self.parse_additive(), tok.line)
            else:
                return node

    def parse_additive(self) -> Expr:
        node = self.parse_multiplicative()
        while self.peek().type in ("PLUS", "MINUS"):
            line = self.advance().line
            op = self.tokens[self.pos - 1].type
            node = BinOp(op, node, self.parse_multiplicative(), line)
        return node

    def parse_multiplicative(self) -> Expr:
        node = self.parse_unary()
        while self.peek().type in ("STAR", "SLASH", "PERCENT"):
            line = self.advance().line
            op = self.tokens[self.pos - 1].type
            node = BinOp(op, node, self.parse_unary(), line)
        return node

    def parse_unary(self) -> Expr:
        tok = self.peek()
        if tok.type == "MINUS":
            self.advance()
            return UnaryOp("MINUS", self.parse_unary(), tok.line)
        return self.parse_primary()

    # v0.4: string interpolation. "{expr}" inside a string evaluates the
    # expression; "{{" and "}}" are literal braces.
    def _parse_string(self, tok: Token) -> Expr:
        value: str = tok.value
        if "{" not in value:
            return Literal(value, tok.line)
        parts: list = []
        buf: list[str] = []
        found = False
        i, n = 0, len(value)
        while i < n:
            ch = value[i]
            if ch == "{":
                if i + 1 < n and value[i + 1] == "{":
                    buf.append("{")
                    i += 2
                    continue
                depth = 1
                j = i + 1
                while j < n and depth > 0:
                    if value[j] == "{":
                        depth += 1
                    elif value[j] == "}":
                        depth -= 1
                    j += 1
                if depth != 0:
                    fail(tok.line, 'this "{" never closes; add a "}" to finish it.')
                inner = value[i + 1:j - 1]
                if not inner.strip():
                    fail(tok.line, "these braces are empty; put a value inside.")
                parts.append(("text", "".join(buf)))
                buf = []
                parts.append(("expr", self._parse_expr_fragment(inner, tok.line)))
                found = True
                i = j
                continue
            if ch == "}" and i + 1 < n and value[i + 1] == "}":
                buf.append("}")
                i += 2
                continue
            buf.append(ch)
            i += 1
        parts.append(("text", "".join(buf)))
        if not found:
            collapsed = "".join(text for kind, text in parts if kind == "text")
            return Literal(collapsed, tok.line)
        return Interp(parts, tok.line)

    def _parse_expr_fragment(self, text: str, line: int) -> Expr:
        toks = [Token(t.type, t.value, line) for t in tokenize(text.strip())]
        sub = Parser(toks)
        try:
            node = sub.parse_or()
        except RecursionError:
            fail(line, "this {...} is too deeply nested for me to read.")
        sub.expect("NEWLINE", 'the end of the {...}')
        return node

    def parse_builtin_operand(self) -> Expr:
        # Operand of split/join: a plain value, never a name-with-args call,
        # because the following by/with keyword belongs to the built-in.
        tok = self.peek()
        if tok.type == "NAME":
            self.advance()
            return self.parse_postfix(Var(tok.value, tok.line))
        return self.parse_unary()

    def parse_primary(self) -> Expr:
        tok = self.peek()
        if tok.type == "NUMBER":
            self.advance()
            return Literal(tok.value, tok.line)
        if tok.type == "STRING":
            self.advance()
            return self._parse_string(tok)
        if tok.type == "TRUE":
            self.advance()
            return Literal(True, tok.line)
        if tok.type == "FALSE":
            self.advance()
            return Literal(False, tok.line)
        if tok.type == "NOTHING":
            self.advance()
            return Literal(None, tok.line)
        if tok.type == "LPAREN":
            self.advance()
            node = self.parse_or()
            self.expect("RPAREN", 'a closing ")"')
            return node
        if tok.type == "LBRACKET":
            self.advance()
            items: list[Expr] = []
            if self.peek().type != "RBRACKET":
                items.append(self.parse_or())
                while self.peek().type == "COMMA":
                    self.advance()
                    items.append(self.parse_or())
            self.expect("RBRACKET", 'a closing "]"')
            return ListLit(items, tok.line)
        if tok.type in ("FIRST", "LAST", "LENGTH", "UPPERCASE", "LOWERCASE",
                        "SPLIT", "JOIN", "TRIM", "KEYS", "CHARACTERS",
                        "TEXT", "KIND"):
            self.advance()
            self.expect("OF", '"of"')
            if tok.type in ("SPLIT", "JOIN"):
                # The separator keyword (by/with) belongs to the built-in, so
                # the operand is parsed without the name-with-args call sugar:
                # use (f with x) when joining or splitting a call's result.
                operand = self.parse_builtin_operand()
            else:
                operand = self.parse_unary()
            sep: Optional[Expr] = None
            if tok.type == "SPLIT":
                self.expect("BY", '"by"')
                sep = self.parse_unary()
            elif tok.type == "JOIN":
                self.expect("WITH", '"with"')
                sep = self.parse_unary()
            return Builtin(tok.type, operand, tok.line, sep)
        if tok.type == "NAME":
            self.advance()
            if self.peek().type == "WITH":
                self.advance()
                args = [self.parse_not()]
                while self.peek().type == "AND":
                    self.advance()
                    args.append(self.parse_not())
                return Call(tok.value, args, tok.line)
            # Phase 2: dotted names, foreign calls, and subscripts chain here.
            return self.parse_postfix(Var(tok.value, tok.line))
        fail(tok.line, "I expected a value here.")
        raise AssertionError("unreachable")

    def parse_postfix(self, node: Expr) -> Expr:
        while True:
            tok = self.peek()
            if tok.type == "DOT":
                self.advance()
                name = self.expect("NAME", "a name after the dot").value
                node = Attr(node, name, tok.line)
                continue
            if tok.type == "LPAREN":
                node = self.parse_foreign_call(node, tok.line)
                continue
            if tok.type == "LBRACKET":
                self.advance()
                index = self.parse_or()
                self.expect("RBRACKET", 'a closing "]"')
                node = Subscript(node, index, tok.line)
                continue
            return node

    def parse_foreign_call(self, func: Expr, line: int) -> ForeignCall:
        self.advance()  # LPAREN
        args: list[Expr] = []
        kwargs: list[tuple[str, Expr]] = []
        if self.peek().type != "RPAREN":
            while True:
                if self.peek().type == "NAME" and self.peek2().type == "EQ":
                    kw = self.advance().value
                    self.advance()  # EQ
                    kwargs.append((kw, self.parse_or()))
                else:
                    if kwargs:
                        fail(self.peek().line, "named inputs must come after the plain ones.")
                    args.append(self.parse_or())
                if self.peek().type == "COMMA":
                    self.advance()
                    continue
                break
        self.expect("RPAREN", 'a closing ")"')
        return ForeignCall(func, args, kwargs, line)


# ---------------------------------------------------------------------------
# Interpreter: walks the AST. Statement dispatch goes through
# _STMT_HANDLERS so phase 2 can register new statements; expression dispatch
# goes through _EXPR_HANDLERS the same way.
# ---------------------------------------------------------------------------

class Environment:
    """A variable scope. Phase 2: modules and foreign values live here too."""

    def __init__(self, parent: Optional["Environment"] = None) -> None:
        self.vars: dict[str, Any] = {}
        self.parent = parent

    def get(self, name: str, line: int) -> Any:
        env: Optional[Environment] = self
        while env is not None:
            if name in env.vars:
                return env.vars[name]
            env = env.parent
        fail(line, f'I do not know the word "{name}".' + suggest(name, self.names()))

    def set(self, name: str, value: Any) -> None:
        self.vars[name] = value

    def names(self) -> list[str]:
        out: list[str] = []
        env: Optional[Environment] = self
        while env is not None:
            out.extend(env.vars.keys())
            env = env.parent
        return out


@dataclass
class Function:
    name: str
    params: list[str]
    body: list[Stmt]
    closure: Environment
    line: int
    origin: Optional[str] = None  # jpm package this was loaded from, if any


@dataclass
class Agent:
    """A named AI agent: persona, tools, memory, step budget (v0.2, v0.3)."""

    name: str
    persona: Optional[str]
    tools: list[str]
    remember: str  # "off", "run", or "always"
    memory_file: Optional[str]  # resolved path, None means the default
    max_steps: int
    history: list[tuple[str, str]]  # (prompt, answer) turns
    line: int
    # v0.6: per-agent lock. Fleet asks run in threads; the lock keeps one
    # agent's history and tool runs from interleaving with itself while
    # different agents truly run side by side. RLock: an agent used as a
    # tool may ask itself again on the same thread.
    lock: "threading.RLock" = field(
        default_factory=lambda: threading.RLock(), repr=False)


class Interpreter:
    def __init__(self, stdin: Any = None, stdout: Any = None) -> None:
        self.global_env = Environment()
        self.global_env.set("arguments", [])  # v1.0: words after the program file
        self.stdin = stdin if stdin is not None else sys.stdin
        self.stdout = stdout if stdout is not None else sys.stdout
        self.depth = 0
        self.current_line = 1
        self._jpm_loading: list[str] = []  # package names on the current bring-in chain
        self._tl = threading.local()  # v0.6: per-thread fleet flags
        self._STMT_HANDLERS: dict[Any, Any] = {
            Show: self.exec_show,
            Assign: self.exec_assign,
            Ask: self.exec_ask,
            If: self.exec_if,
            RepeatCount: self.exec_repeat_count,
            RepeatWhile: self.exec_repeat_while,
            ForEach: self.exec_foreach,
            FuncDef: self.exec_funcdef,
            GiveBack: self.exec_giveback,
            Stop: self.exec_stop,
            Skip: self.exec_skip,
            ExprStmt: self.exec_exprstmt,
            # Phase 2: the Python bridge, minds, and machines.
            Import: self.exec_import,
            AskAi: self.exec_ask_ai,
            TermOpen: self.exec_term_open,
            TermSend: self.exec_term_send,
            TermRead: self.exec_term_read,
            TermClose: self.exec_term_close,
            # v0.2: agents. v0.3: forgetting them.
            AgentDef: self.exec_agentdef,
            AskAgent: self.exec_ask_agent,
            ForgetAgent: self.exec_forget,
            # v0.6: fleets.
            FleetDef: self.exec_fleetdef,
            # v0.4: files.
            ReadFile: self.exec_read_file,
            WriteFile: self.exec_write_file,
            # v0.4: jpm packages.
            UsePkg: self.exec_use_pkg,
            BringIn: self.exec_bring_in,
            # v1.0: list building for the self-hosted lexer.
            Push: self.exec_push,
        }
        self._EXPR_HANDLERS: dict[Any, Any] = {
            Literal: self.eval_literal,
            Var: self.eval_var,
            ListLit: self.eval_list,
            BinOp: self.eval_binop,
            UnaryOp: self.eval_unary,
            Compare: self.eval_compare,
            Call: self.eval_call,
            Builtin: self.eval_builtin,
            # Phase 2 expressions.
            Attr: self.eval_attr,
            ForeignCall: self.eval_foreign_call,
            Subscript: self.eval_subscript,
            # v0.4: string interpolation.
            Interp: self.eval_interp,
        }

    # -- driver ----------------------------------------------------------
    def run(self, program: list[Stmt]) -> None:
        try:
            self.exec_block(program, self.global_env)
        except RecursionError:
            raise JesunError(self.current_line, TOO_DEEP)
        except _Return as r:
            fail(r.line, '"give back" only makes sense inside a function.')
        except _Stop as s:
            fail(s.line, '"stop" only makes sense inside a loop.')
        except _Skip as s:
            fail(s.line, '"skip" only makes sense inside a loop.')

    def emit(self, text: str) -> None:
        self.stdout.write(text + "\n")
        self.stdout.flush()

    # -- statements ------------------------------------------------------
    def exec_stmt(self, stmt: Stmt, env: Environment) -> Any:
        self.current_line = stmt.line
        handler = self._STMT_HANDLERS.get(type(stmt))
        if handler is None:
            fail(stmt.line, "I do not know how to run this yet.")
        return handler(stmt, env)

    def exec_block(self, stmts: list[Stmt], env: Environment) -> None:
        for stmt in stmts:
            self.exec_stmt(stmt, env)

    def exec_show(self, stmt: Show, env: Environment) -> None:
        self.emit(show_text(self.eval_expr(stmt.expr, env)))

    def exec_assign(self, stmt: Assign, env: Environment) -> None:
        env.set(stmt.name, self.eval_expr(stmt.expr, env))

    def exec_push(self, stmt: Push, env: Environment) -> None:
        # v1.0: appends in place; the list object is shared by reference.
        target = env.get(stmt.name, stmt.line)
        if not isinstance(target, list):
            fail(stmt.line,
                 f'I can only push to a list, but "{stmt.name}" holds '
                 f"{type_name(target)}.")
        target.append(self.eval_expr(stmt.expr, env))

    def exec_ask(self, stmt: Ask, env: Environment) -> None:
        prompt = self.eval_expr(stmt.prompt, env)
        if not isinstance(prompt, str):
            fail(stmt.line, "the question I ask must be text.")
        self.stdout.write(prompt)
        self.stdout.flush()
        line = self.stdin.readline()
        if line == "":
            fail(stmt.line, "I asked a question, but the input ended.")
        env.set(stmt.name, line[:-1] if line.endswith("\n") else line)

    def exec_if(self, stmt: If, env: Environment) -> None:
        for cond, body in stmt.branches:
            if is_truthy(self.eval_expr(cond, env)):
                self.exec_block(body, env)
                return
        if stmt.else_body:
            self.exec_block(stmt.else_body, env)

    def exec_repeat_count(self, stmt: RepeatCount, env: Environment) -> None:
        count = self.eval_expr(stmt.count, env)
        if isinstance(count, bool) or not isinstance(count, (int, float)):
            fail(stmt.line, '"repeat" needs a number of times.')
        if isinstance(count, float) and not count.is_integer():
            fail(stmt.line, '"repeat" needs a whole number of times.')
        count = int(count)
        if count < 0:
            fail(stmt.line, '"repeat" needs zero or more times.')
        runs = 0
        for _ in range(count):
            runs += 1
            if runs > MAX_LOOP_RUNS:
                fail(stmt.line, "this loop ran a million times; I stopped it.")
            try:
                self.exec_block(stmt.body, env)
            except _Skip:
                continue
            except _Stop:
                break

    def exec_repeat_while(self, stmt: RepeatWhile, env: Environment) -> None:
        runs = 0
        while is_truthy(self.eval_expr(stmt.cond, env)):
            runs += 1
            if runs > MAX_LOOP_RUNS:
                fail(stmt.line, "this loop ran a million times; I stopped it.")
            try:
                self.exec_block(stmt.body, env)
            except _Skip:
                continue
            except _Stop:
                break

    def exec_foreach(self, stmt: ForEach, env: Environment) -> None:
        items = self.eval_expr(stmt.iterable, env)
        if not isinstance(items, list):
            fail(stmt.line, "I can only loop over a list.")
        for item in items:
            env.set(stmt.var, item)
            try:
                self.exec_block(stmt.body, env)
            except _Skip:
                continue
            except _Stop:
                break

    def exec_funcdef(self, stmt: FuncDef, env: Environment) -> None:
        env.set(stmt.name, Function(stmt.name, stmt.params, stmt.body, env, stmt.line))

    def exec_giveback(self, stmt: GiveBack, env: Environment) -> None:
        raise _Return(self.eval_expr(stmt.expr, env), stmt.line)

    def exec_stop(self, stmt: Stop, env: Environment) -> None:
        raise _Stop(stmt.line)

    def exec_skip(self, stmt: Skip, env: Environment) -> None:
        raise _Skip(stmt.line)

    def exec_exprstmt(self, stmt: ExprStmt, env: Environment) -> Any:
        # A bare function name is a call: `dance` runs a zero-input function.
        if isinstance(stmt.expr, Var):
            target = env.get(stmt.expr.name, stmt.expr.line)
            if isinstance(target, Function):
                if target.params:
                    need = len(target.params)
                    word = "input" if need == 1 else "inputs"
                    fail(stmt.line, f'"{target.name}" needs {need} {word}, but you gave 0.')
                return self.eval_call(Call(target.name, [], stmt.line), env)
        return self.eval_expr(stmt.expr, env)

    # -- expressions -----------------------------------------------------
    def eval_expr(self, expr: Expr, env: Environment) -> Any:
        self.current_line = expr.line
        handler = self._EXPR_HANDLERS.get(type(expr))
        if handler is None:
            fail(expr.line, "I do not know how to work out this value yet.")
        return handler(expr, env)

    def eval_literal(self, expr: Literal, env: Environment) -> Any:
        return expr.value

    def eval_var(self, expr: Var, env: Environment) -> Any:
        target = env.get(expr.name, expr.line)
        # A zero-input function named where a value is expected is a call:
        # `show time_today` runs it. (A bare name as a whole statement
        # already did this in exec_exprstmt.)
        if isinstance(target, Function) and not target.params:
            return self.eval_call(Call(expr.name, [], expr.line), env)
        return target

    def eval_list(self, expr: ListLit, env: Environment) -> Any:
        return [self.eval_expr(item, env) for item in expr.items]

    def _need_number(self, value: Any, line: int, what: str) -> None:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            fail(line, f"I can only use {what} with numbers.")

    def eval_binop(self, expr: BinOp, env: Environment) -> Any:
        if expr.op == "AND":
            return is_truthy(self.eval_expr(expr.left, env)) and is_truthy(self.eval_expr(expr.right, env))
        if expr.op == "OR":
            return is_truthy(self.eval_expr(expr.left, env)) or is_truthy(self.eval_expr(expr.right, env))
        left = self.eval_expr(expr.left, env)
        right = self.eval_expr(expr.right, env)
        if expr.op == "PLUS":
            if isinstance(left, (int, float)) and isinstance(right, (int, float)) \
                    and not isinstance(left, bool) and not isinstance(right, bool):
                return left + right
            if isinstance(left, str) and isinstance(right, str):
                return left + right
            fail(expr.line, "I can only add numbers to numbers and text to text.")
        self._need_number(left, expr.line, '"-", "*", "/" and "%"')
        self._need_number(right, expr.line, '"-", "*", "/" and "%"')
        if expr.op == "MINUS":
            return left - right
        if expr.op == "STAR":
            return left * right
        if expr.op == "SLASH":
            if right == 0:
                fail(expr.line, "I cannot divide by zero.")
            return left / right
        if expr.op == "PERCENT":
            if right == 0:
                fail(expr.line, "I cannot divide by zero.")
            return left % right
        fail(expr.line, "I do not know how to do that arithmetic.")
        raise AssertionError("unreachable")

    def eval_unary(self, expr: UnaryOp, env: Environment) -> Any:
        value = self.eval_expr(expr.operand, env)
        if expr.op == "NOT":
            return not is_truthy(value)
        self._need_number(value, expr.line, '"-"')
        return -value

    def eval_compare(self, expr: Compare, env: Environment) -> Any:
        left = self.eval_expr(expr.left, env)
        right = self.eval_expr(expr.right, env)
        if expr.op == "EQ":
            return values_equal(left, right)
        if expr.op == "NEQ":
            return not values_equal(left, right)
        if expr.op == "CONTAINS":
            if isinstance(left, str) and isinstance(right, str):
                return right in left
            if isinstance(left, list):
                return any(values_equal(item, right) for item in left)
            fail(expr.line, '"contains" needs text with text, or a list.')
        self._need_number(left, expr.line, "comparisons like this")
        self._need_number(right, expr.line, "comparisons like this")
        if expr.op == "GT":
            return left > right
        if expr.op == "LT":
            return left < right
        if expr.op == "GTE":
            return left >= right
        if expr.op == "LTE":
            return left <= right
        fail(expr.line, "I do not know how to compare those.")
        raise AssertionError("unreachable")

    def _call_function(self, target: Function, arg_values: list[Any], line: int) -> Any:
        """Run a Jesun.Code function with already-evaluated arguments."""
        if self.depth >= MAX_CALL_DEPTH:
            fail(line, "the functions are calling each other too deep; I stopped before falling over.")
        call_env = Environment(target.closure)
        for param, value in zip(target.params, arg_values):
            call_env.set(param, value)
        self.depth += 1
        try:
            self.exec_block(target.body, call_env)
        except _Return as r:
            return r.value
        except JesunError as err:
            # A function loaded from a jpm package says which package broke.
            origin = getattr(target, "origin", None)
            tag = f'in the "{origin}" package: ' if origin else ""
            if tag and not err.message.startswith(tag):
                raise JesunError(err.line, tag + err.message)
            raise
        finally:
            self.depth -= 1
        return None

    def eval_call(self, expr: Call, env: Environment) -> Any:
        target = env.get(expr.name, expr.line)
        if not isinstance(target, Function):
            fail(expr.line, f'"{expr.name}" is not a function I can call.')
        if len(expr.args) != len(target.params):
            need = len(target.params)
            word = "input" if need == 1 else "inputs"
            fail(expr.line, f'"{expr.name}" needs {need} {word}, but you gave {len(expr.args)}.')
        arg_values = [self.eval_expr(arg, env) for arg in expr.args]
        return self._call_function(target, arg_values, expr.line)

    def eval_builtin(self, expr: Builtin, env: Environment) -> Any:
        value = self.eval_expr(expr.operand, env)
        if expr.kind == "LENGTH":
            if isinstance(value, (str, list)):
                return len(value)
            fail(expr.line, '"length of" needs text or a list.')
        if expr.kind == "FIRST":
            if not isinstance(value, list):
                fail(expr.line, '"first of" needs a list.')
            if not value:
                fail(expr.line, "there is no first of an empty list.")
            return value[0]
        if expr.kind == "LAST":
            if not isinstance(value, list):
                fail(expr.line, '"last of" needs a list.')
            if not value:
                fail(expr.line, "there is no last of an empty list.")
            return value[-1]
        if expr.kind == "UPPERCASE":
            if not isinstance(value, str):
                fail(expr.line, '"uppercase of" needs text.')
            return value.upper()
        if expr.kind == "LOWERCASE":
            if not isinstance(value, str):
                fail(expr.line, '"lowercase of" needs text.')
            return value.lower()
        if expr.kind == "SPLIT":
            if not isinstance(value, str):
                fail(expr.line, '"split of" needs text.')
            sep = self.eval_expr(expr.sep, env) if expr.sep is not None else None
            if not isinstance(sep, str) or sep == "":
                fail(expr.line, '"split of" needs a non-empty "by" text.')
            return value.split(sep)
        if expr.kind == "JOIN":
            if not isinstance(value, list):
                fail(expr.line, '"join of" needs a list.')
            sep = self.eval_expr(expr.sep, env) if expr.sep is not None else None
            if not isinstance(sep, str):
                fail(expr.line, '"join of" needs a "with" text.')
            for item in value:
                if not isinstance(item, str):
                    fail(expr.line, '"join of" needs a list of text.')
            return sep.join(value)
        if expr.kind == "TRIM":
            if not isinstance(value, str):
                fail(expr.line, '"trim of" needs text.')
            return value.strip()
        if expr.kind == "KEYS":
            if isinstance(value, Foreign) and isinstance(value.obj, dict):
                return to_jesun(list(value.obj.keys()))
            fail(expr.line, '"keys of" needs a python dictionary.')
        if expr.kind == "CHARACTERS":  # v1.0
            if not isinstance(value, str):
                fail(expr.line, '"characters of" needs text.')
            return list(value)
        if expr.kind == "TEXT":  # v1.0: exactly what `show` would print
            return show_text(value)
        if expr.kind == "KIND":  # v1.0
            return type_name(value)
        fail(expr.line, "I do not know that built-in.")
        raise AssertionError("unreachable")

    # -- phase 2: the Python bridge (spec 16) --------------------------------
    def _clean_error(self, err: Exception) -> str:
        import re
        text = str(err).strip().split("\n")[0][:200]
        text = re.sub(r"0x[0-9a-fA-F]+", "?", text)
        return text or "something went wrong"

    _INTERNALS_RE = re.compile(r"Traceback|File \"|^\w*Error:|0x[0-9a-fA-F]+")

    def _safe_detail(self, text: str) -> str:
        """First line of foreign stderr, or "" if it looks like internals."""
        first = (text or "").strip().split("\n")[0][:160]
        if not first or self._INTERNALS_RE.search(first):
            return ""
        return first

    def _installed_top_modules(self) -> list[str]:
        global _TOP_MODULES_CACHE
        if _TOP_MODULES_CACHE is None:
            import pkgutil
            try:
                _TOP_MODULES_CACHE = sorted({m.name for m in pkgutil.iter_modules()})
            except Exception:
                _TOP_MODULES_CACHE = []
        return _TOP_MODULES_CACHE

    def exec_import(self, stmt: Import, env: Environment) -> None:
        import importlib
        try:
            imported = importlib.import_module(stmt.module)
        except ModuleNotFoundError:
            top = stmt.module.split(".")[0]
            msg = f'I could not find the Python package "{stmt.module}".'
            msg += suggest(top, self._installed_top_modules())
            msg += f" If it is a pip package, install it first: pip install {top}"
            fail(stmt.line, msg)
        except Exception as err:
            fail(stmt.line, f'importing "{stmt.module}" failed: {self._clean_error(err)}')
        if stmt.alias is not None:
            env.set(stmt.alias, Foreign(imported))
        else:
            # Like Python's own `import a.b`: the top package gets the name.
            top = stmt.module.split(".")[0]
            env.set(top, Foreign(sys.modules.get(top, imported)))

    def eval_attr(self, expr: Attr, env: Environment) -> Any:
        obj = self.eval_expr(expr.obj, env)
        if isinstance(obj, Foreign):
            try:
                return to_jesun(getattr(obj.obj, expr.name))
            except AttributeError:
                fail(expr.line, f'the python "{_safe_type_name(obj.obj)}" has no "{expr.name}".')
            except Exception as err:
                fail(expr.line, f'reading "{expr.name}" failed: {self._clean_error(err)}')
        fail(expr.line, "only python values use dots; this "
             + f"is {type_name(obj)}, and dots are for the Python bridge.")

    def eval_foreign_call(self, expr: ForeignCall, env: Environment) -> Any:
        func = self.eval_expr(expr.func, env)
        if not isinstance(func, Foreign) or not callable(func.obj):
            fail(expr.line, "I can only call python functions with parentheses.")
        args = [to_python(self.eval_expr(a, env), a.line) for a in expr.args]
        kwargs = {k: to_python(self.eval_expr(v, env), v.line) for k, v in expr.kwargs}
        try:
            return to_jesun(func.obj(*args, **kwargs))
        except Exception as err:
            fail(expr.line, f"the python call failed: {self._clean_error(err)}")

    def _subscript_index(self, index: Any, length: int, line: int, what: str) -> int:
        if isinstance(index, bool) or not isinstance(index, (int, float)):
            fail(line, f"{what} needs a whole-number position in brackets.")
        if isinstance(index, float) and not index.is_integer():
            fail(line, f"{what} needs a whole-number position in brackets.")
        i = int(index)
        if i < 0:
            i += length
        if i < 0 or i >= length:
            fail(line, f"position {int(index)} is outside this {what} of {length}.")
        return i

    def eval_subscript(self, expr: Subscript, env: Environment) -> Any:
        obj = self.eval_expr(expr.obj, env)
        index = self.eval_expr(expr.index, env)
        if isinstance(obj, list):
            return obj[self._subscript_index(index, len(obj), expr.line, "a list")]
        if isinstance(obj, str):
            return obj[self._subscript_index(index, len(obj), expr.line, "text")]
        if isinstance(obj, Foreign):
            key = to_python(index, expr.index.line)
            try:
                return to_jesun(obj.obj[key])
            except (KeyError, IndexError, TypeError) as err:
                fail(expr.line, f"that lookup failed: {self._clean_error(err)}")
            except Exception as err:
                fail(expr.line, f"that lookup failed: {self._clean_error(err)}")
        fail(expr.line, f"I cannot look inside {type_name(obj)} with brackets.")

    # -- phase 2: minds and machines (spec 17) -------------------------------
    def _need_text(self, value: Any, line: int, what: str) -> str:
        if not isinstance(value, str):
            fail(line, f"{what} must be text.")
        return value

    # -- talking to AI ------------------------------------------------------
    def _ai_argv(self, line: int) -> list[str]:
        import os
        import shlex
        command = os.environ.get("JESUNCODE_AI_COMMAND", "").strip()
        if not command:
            fail(line, AI_NO_MIND)
        if os.name == "nt":
            # On Windows, shlex must not treat backslashes as escapes, or
            # a path like C:\tools\mind.py would come out mangled.
            # posix=False keeps quotes on the tokens, so strip the
            # double quotes back off (use double quotes on Windows).
            argv = [
                token[1:-1]
                if len(token) >= 2
                and token.startswith('"')
                and token.endswith('"')
                else token
                for token in shlex.split(command, posix=False)
            ]
        else:
            argv = shlex.split(command)
        if not argv:
            fail(line, AI_NO_MIND)
        return argv

    def exec_ask_ai(self, stmt: AskAi, env: Environment) -> None:
        prompt = self._need_text(self.eval_expr(stmt.prompt, env), stmt.line,
                                 "the question I ask the mind")
        argv = self._ai_argv(stmt.line)
        if stmt.tools:
            answer = self._ai_tool_loop(argv, prompt, stmt.tools,
                                        stmt.max_steps, stmt.line, env,
                                        stream=stmt.streaming)
        else:
            answer = self._ai_once(argv, prompt, stmt.line, stream=stmt.streaming)
        env.set(stmt.name, answer)

    # -- v0.2 agents ----------------------------------------------------------
    def _agent_names(self, env: Environment) -> list[str]:
        out: list[str] = []
        seen: Optional[Environment] = env
        while seen is not None:
            for name, value in seen.vars.items():
                if isinstance(value, Agent) and name not in out:
                    out.append(name)
            seen = seen.parent
        return out

    def _find_agent(self, name: str, line: int, env: Environment) -> Agent:
        seen: Optional[Environment] = env
        while seen is not None:
            if name in seen.vars:
                value = seen.vars[name]
                if isinstance(value, Agent):
                    return value
                kind = "a function" if isinstance(value, Function) else "not an agent"
                fail(line, f'"{name}" is {kind}, not an agent.')
            seen = seen.parent
        fail(line, f'I do not know an agent called "{name}".'
                   + suggest(name, self._agent_names(env)))

    def exec_agentdef(self, stmt: AgentDef, env: Environment) -> None:
        if stmt.name in stmt.tools:
            fail(stmt.line, f"{stmt.name} cannot list itself as a tool.")
        persona: Optional[str] = None
        if stmt.persona is not None:
            persona = self._need_text(self.eval_expr(stmt.persona, env),
                                      stmt.line, "the agent's persona")
        memory_file: Optional[str] = None
        if stmt.memory_file is not None:
            memory_file = self._need_text(self.eval_expr(stmt.memory_file, env),
                                          stmt.line, "the agent's memory file")
        agent = Agent(
            name=stmt.name,
            persona=persona,
            tools=list(stmt.tools),
            remember=stmt.remember,
            memory_file=memory_file,
            max_steps=stmt.max_steps,
            history=[],
            line=stmt.line,
        )
        if agent.remember == "always":
            self._load_agent_memory(agent, stmt.line)
        env.set(stmt.name, agent)

    # -- v0.3: memory that survives the run ---------------------------------
    def _memory_base(self) -> "Path":
        import os
        from pathlib import Path
        override = os.environ.get("JESUN_CODE_HOME", "").strip()
        if override:
            return Path(override)
        return Path.home() / ".jesun-code"

    def _default_memory_path(self, name: str) -> "Path":
        safe = "".join(c if (c.isalnum() or c in "-_") else "_" for c in name)
        return self._memory_base() / "memory" / f"{safe or 'agent'}.json"

    def _agent_memory_path(self, agent: Agent) -> "Path":
        from pathlib import Path
        if agent.memory_file:
            return Path(agent.memory_file)
        return self._default_memory_path(agent.name)

    def _load_agent_memory(self, agent: Agent, line: int) -> None:
        path = self._agent_memory_path(agent)
        try:
            raw = path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return
        except OSError:
            self.emit(f"Line {line}: saved memory for {agent.name} was unreadable, "
                      "starting fresh.")
            return
        try:
            import json
            data = json.loads(raw)
            if not isinstance(data, list):
                raise ValueError("memory is not a list")
            turns: list[tuple[str, str]] = []
            for item in data:
                if not isinstance(item, (list, tuple)) or len(item) != 2:
                    raise ValueError("bad turn")
                prompt_text, answer_text = item
                if not isinstance(prompt_text, str) or not isinstance(answer_text, str):
                    raise ValueError("bad turn")
                turns.append((prompt_text, answer_text))
        except Exception:
            self.emit(f"Line {line}: saved memory for {agent.name} was unreadable, "
                      "starting fresh.")
            return
        agent.history = turns

    def _save_agent_memory(self, agent: Agent, line: int) -> None:
        import json
        path = self._agent_memory_path(agent)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            turns = agent.history[-_MEMORY_TURNS_KEPT:]
            path.write_text(json.dumps(turns, ensure_ascii=False, indent=1),
                            encoding="utf-8")
        except Exception:
            self.emit(f"Line {line}: I could not save memory for {agent.name}.")

    def exec_forget(self, stmt: ForgetAgent, env: Environment) -> None:
        agent: Optional[Agent] = None
        seen: Optional[Environment] = env
        while seen is not None:
            value = seen.vars.get(stmt.name)
            if isinstance(value, Agent):
                agent = value
                break
            seen = seen.parent
        if agent is not None:
            agent.history = []
            path = self._agent_memory_path(agent)
        else:
            path = self._default_memory_path(stmt.name)
        try:
            path.unlink()
        except FileNotFoundError:
            self.emit(f"{stmt.name} has nothing to forget.")
            return
        except OSError:
            fail(stmt.line, f"I could not forget {stmt.name}.")
        self.emit(f"Memory of {stmt.name} cleared.")

    def _run_agent_ask(self, agent: Agent, prompt: str, line: int,
                       env: Environment, depth: int = 0,
                       stream: bool = False) -> str:
        # v0.6: the per-agent lock serializes asks to the same agent
        # (fleet threads), while different agents run side by side.
        with agent.lock:
            return self._run_agent_ask_locked(agent, prompt, line, env,
                                             depth, stream)

    def _run_agent_ask_locked(self, agent: Agent, prompt: str, line: int,
                              env: Environment, depth: int = 0,
                              stream: bool = False) -> str:
        argv = self._ai_argv(line)
        history = agent.history if agent.remember != "off" else None
        answer = self._ai_tool_loop(argv, prompt, agent.tools,
                                    agent.max_steps, line, env,
                                    persona=agent.persona, history=history,
                                    agent_name=agent.name,
                                    agent_depth=depth, stream=stream)
        if agent.remember != "off":
            agent.history.append((prompt, answer))
            if agent.remember == "always":
                self._save_agent_memory(agent, line)
        return answer

    def exec_ask_agent(self, stmt: AskAgent, env: Environment) -> None:
        agent = self._find_agent(stmt.agent_name, stmt.line, env)
        prompt = self._need_text(self.eval_expr(stmt.prompt, env), stmt.line,
                                 "the question I ask the agent")
        answer = self._run_agent_ask(agent, prompt, stmt.line, env,
                                     stream=stmt.streaming)
        env.set(stmt.name, answer)

    # -- v0.6: fleets (spec v0.6) ----------------------------------------------
    def _fleet_memory_path(self, stmt: FleetDef, env: Environment) -> "Path":
        from pathlib import Path
        raw = self._need_text(self.eval_expr(stmt.memory_file, env),
                              stmt.line, "the fleet's memory file")
        return Path(raw)

    def _fleet_load_memory(self, stmt: FleetDef, env: Environment
                           ) -> list[tuple[str, str, str]]:
        """Past (question, answer, agent) triples, or [] when none."""
        from pathlib import Path
        import json
        path = self._fleet_memory_path(stmt, env)
        try:
            raw = path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return []
        except OSError:
            self.emit(f"Line {stmt.line}: the fleet's saved memory was "
                      "unreadable, starting fresh.")
            return []
        try:
            data = json.loads(raw)
            if not isinstance(data, list):
                raise ValueError("memory is not a list")
            triples: list[tuple[str, str, str]] = []
            for item in data:
                if not isinstance(item, (list, tuple)) or len(item) != 3:
                    raise ValueError("bad triple")
                q, a, who = item
                if not all(isinstance(x, str) for x in (q, a, who)):
                    raise ValueError("bad triple")
                triples.append((q, a, who))
        except Exception:
            self.emit(f"Line {stmt.line}: the fleet's saved memory was "
                      "unreadable, starting fresh.")
            return []
        return triples

    def _fleet_save_memory(self, stmt: FleetDef, env: Environment,
                           triples: list[tuple[str, str, str]]) -> None:
        import json
        path = self._fleet_memory_path(stmt, env)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            kept = triples[-_MEMORY_TURNS_KEPT:]
            path.write_text(json.dumps(kept, ensure_ascii=False, indent=1),
                            encoding="utf-8")
        except Exception:
            self.emit(f"Line {stmt.line}: I could not save the fleet's memory.")

    @staticmethod
    def _fleet_memory_prefix(triples: list[tuple[str, str, str]]) -> str:
        lines = ["The fleet remembers:"]
        for q, a, who in triples:
            lines.append(f'- {who} was asked "{q}" and answered "{a}"')
        return "\n".join(lines) + "\n\n"

    def exec_fleetdef(self, stmt: FleetDef, env: Environment) -> None:
        if getattr(self._tl, "in_fleet_ask", False):
            fail(stmt.line, "a fleet cannot open inside another fleet's asks.")
        agents: dict[str, Agent] = {}
        for member in stmt.members:
            agents.setdefault(member, self._find_agent(member, stmt.line, env))
        # Prompts are evaluated up front, in the enclosing scope, in ask
        # order, before any thread starts.
        prompts = [self._need_text(self.eval_expr(ask.prompt, env), ask.line,
                                   "the question I ask the fleet member")
                   for ask in stmt.asks]
        shared = (self._fleet_load_memory(stmt, env)
                  if stmt.memory_file is not None else [])
        prefix = self._fleet_memory_prefix(shared) if shared else ""
        results: list[Optional[str]] = [None] * len(stmt.asks)
        errors: dict[int, JesunError] = {}

        def _worker(i: int) -> None:
            ask = stmt.asks[i]
            child = Environment(env)
            self._tl.in_fleet_ask = True
            try:
                results[i] = self._run_agent_ask(
                    agents[ask.agent_name], prefix + prompts[i],
                    ask.line, child)
            except JesunError as e:
                errors[i] = e
            except Exception:
                errors[i] = JesunError(
                    ask.line, "something went wrong inside the fleet and I "
                              "stopped instead of guessing.")
            finally:
                self._tl.in_fleet_ask = False

        threads = [threading.Thread(target=_worker, args=(i,), daemon=True)
                   for i in range(len(stmt.asks))]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        if errors:
            raise errors[min(errors)]
        answers = [r if r is not None else "" for r in results]
        if stmt.memory_file is not None:
            new = [(prompts[i], answers[i], ask.agent_name)
                   for i, ask in enumerate(stmt.asks)]
            self._fleet_save_memory(stmt, env, shared + new)
        env.set(stmt.name, list(answers))
        for i, ask in enumerate(stmt.asks):
            env.set(ask.name, answers[i])

    def _ai_once(self, argv: list[str], prompt: str, line: int,
                 stream: bool = False) -> str:
        import subprocess
        if stream:
            return self._ai_once_streaming(argv, prompt, line)
        try:
            proc = subprocess.run(argv, input=prompt, capture_output=True,
                                  text=True, timeout=AI_TIMEOUT)
        except FileNotFoundError:
            fail(line, "I could not run the mind command.")
        except subprocess.TimeoutExpired:
            fail(line, "the mind took too long to answer (over 60 seconds).")
        except Exception:
            fail(line, "I could not talk to the mind.")
        if proc.returncode != 0:
            first = self._safe_detail(proc.stderr or "")
            msg = "the mind exited with an error."
            if first:
                msg += f" It said: {first}"
            fail(line, msg)
        out = proc.stdout or ""
        if out.endswith("\n"):
            out = out[:-1]
        if out.endswith("\r"):
            out = out[:-1]
        return out

    def _ai_once_streaming(self, argv: list[str], prompt: str, line: int) -> str:
        """Run the mind, printing each chunk of stdout as it arrives."""
        import codecs
        import queue
        import subprocess
        import threading
        import time
        try:
            proc = subprocess.Popen(argv, stdin=subprocess.PIPE,
                                    stdout=subprocess.PIPE,
                                    stderr=subprocess.DEVNULL, text=True)
        except FileNotFoundError:
            fail(line, "I could not run the mind command.")
        except Exception:
            fail(line, "I could not talk to the mind.")
        chunks: list[str] = []
        try:
            assert proc.stdin is not None and proc.stdout is not None
            proc.stdin.write(prompt)
            proc.stdin.close()
            # A reader thread does the blocking reads. select() cannot wait
            # on a pipe on Windows (sockets only), so a thread plus a queue
            # is the portable way to learn about each chunk as it arrives.
            # read1 does a single raw read, so one queue item really means
            # "a chunk is here now". read() would block filling 4096 chars.
            raw_out = proc.stdout.buffer
            pending = queue.Queue()
            eof = object()

            def _reader() -> None:
                decoder = codecs.getincrementaldecoder("utf-8")()
                carry = ""
                while True:
                    data = raw_out.read1(4096)
                    if not data:
                        break
                    text = carry + decoder.decode(data)
                    # Match the non-streaming path, which reads in text
                    # mode with universal newlines: a mind printing "\n"
                    # on Windows really emits "\r\n" on the pipe. Hold a
                    # trailing "\r" back so a split "\r\n" still normalizes.
                    if text.endswith("\r"):
                        carry = "\r"
                        text = text[:-1]
                    else:
                        carry = ""
                    text = text.replace("\r\n", "\n").replace("\r", "\n")
                    if text:
                        pending.put(text)
                tail = carry + decoder.decode(b"", final=True)
                tail = tail.replace("\r\n", "\n").replace("\r", "\n")
                if tail:
                    pending.put(tail)
                pending.put(eof)

            reader = threading.Thread(target=_reader, daemon=True)
            reader.start()
            deadline = time.monotonic() + AI_TIMEOUT
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    proc.kill()
                    fail(line, "the mind took too long to answer (over 60 seconds).")
                try:
                    item = pending.get(timeout=remaining)
                except queue.Empty:
                    proc.kill()
                    fail(line, "the mind took too long to answer (over 60 seconds).")
                if item is eof:
                    break
                self.stdout.write(item)
                self.stdout.flush()
                chunks.append(item)
            proc.wait(timeout=5)
        except JesunError:
            raise
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
            fail(line, "I could not talk to the mind.")
        if proc.returncode != 0:
            fail(line, "the mind exited with an error.")
        out = "".join(chunks)
        if out.endswith("\n"):
            out = out[:-1]
        if out.endswith("\r"):
            out = out[:-1]
        return out

    def _parse_call_args(self, text: str, line: int) -> list[Any]:
        if not text.strip():
            return []
        values: list[Any] = []
        for part in _split_top_level(text, ","):
            part = part.strip()
            if not part:
                fail(line, "a tool call has an empty input.")
            try:
                parser = Parser(tokenize(part + "\n"))
                node = parser.parse_or()
                if parser.peek().type != "NEWLINE":
                    fail(line, f"I could not understand the tool input {part!r}.")
                values.append(self.eval_expr(node, self.global_env))
            except JesunError as err:
                fail(line, f"I could not understand the tool input {part!r}: {err.message}")
            except RecursionError:
                fail(line, TOO_DEEP)
        return values

    def _run_tool(self, name: str, arg_values: list[Any],
                  tools: list[str], line: int, env: Environment,
                  depth: int = 0) -> str:
        if name not in tools:
            return (f"RESULT of {name}: I only have these tools: "
                    f"{', '.join(tools)}. I do not know a tool called \"{name}\".")
        try:
            target = env.get(name, line)
        except JesunError:
            target = None
        if isinstance(target, Agent):
            # v0.3: agents calling agents.
            if len(arg_values) != 1 or not isinstance(arg_values[0], str):
                return (f"RESULT of {name}: I can only ask {name} one question "
                        "at a time, as text.")
            if depth + 1 > _MAX_AGENT_DEPTH:
                raise _AgentDepthExceeded(
                    line, "agents called agents too deep (3 levels max).")
            try:
                sub = self._run_agent_ask(target, arg_values[0], line, env,
                                          depth=depth + 1)
            except _AgentDepthExceeded:
                raise
            except JesunError as err:
                return f"RESULT of {name}: {err.message}"
            except Exception:
                return f"RESULT of {name}: something went wrong running the agent."
            return f"RESULT of {name}: {sub}"
        if not isinstance(target, Function):
            return f'RESULT of {name}: I do not know a tool called "{name}".'
        if len(arg_values) != len(target.params):
            need = len(target.params)
            word = "input" if need == 1 else "inputs"
            return (f"RESULT of {name}: \"{name}\" needs {need} {word}, "
                    f"but got {len(arg_values)}.")
        try:
            value = self._call_function(target, arg_values, line)
        except JesunError as err:
            return f"RESULT of {name}: {err.message}"
        except Exception:
            return f"RESULT of {name}: something went wrong running the tool."
        return f"RESULT of {name}: {show_text(value)}"

    def _ai_tool_loop(self, argv: list[str], prompt: str, tools: list[str],
                      max_steps: int, line: int, env: Environment,
                      persona: Optional[str] = None,
                      history: Optional[list[tuple[str, str]]] = None,
                      agent_name: Optional[str] = None,
                      agent_depth: int = 0, stream: bool = False) -> str:
        if persona:
            head = persona.rstrip() + "\n\n"
        else:
            head = "You are a helper inside Jesun.Code. "
        system = (
            head +
            "You can call tools by writing one per line like this:\n"
            "CALL: toolname(\"some text\", 2)\n"
            f"Available tools: {', '.join(tools)}\n"
            "Call no other tools. Anything you write outside CALL lines "
            "is your final answer to the human."
        )
        transcript = system
        if history:
            transcript += "\n\nEarlier in this conversation:"
            for old_prompt, old_answer in history:
                transcript += f"\nHuman: {old_prompt}\nMind: {old_answer}"
        transcript += "\n\nHuman: " + prompt
        for step in range(1, max_steps + 1):
            reply = self._ai_once(
                argv,
                transcript + f"\n\n(You have used {step} of {max_steps} steps.)",
                line,
                stream=stream,
            )
            calls: list[tuple[str, list[Any]]] = []
            answer_lines: list[str] = []
            for raw in reply.split("\n"):
                match = CALL_RE.match(raw.strip())
                if match:
                    calls.append((match.group(1),
                                  self._parse_call_args(match.group(2), line)))
                else:
                    answer_lines.append(raw)
            if not calls:
                return "\n".join(answer_lines).strip()
            results = [self._run_tool(name, args, tools, line, env,
                                        depth=agent_depth)
                       for name, args in calls]
            transcript += f"\n\nMind:\n{reply}\n\nResults:\n" + "\n".join(results)
        if agent_name:
            fail(line, f"{agent_name} used all {max_steps} steps without giving an answer.")
        fail(line,
             f"the mind used all {max_steps} steps without giving an answer.")

    # -- commanding terminals (tmux) -----------------------------------------
    def _tmux_path(self, line: int) -> str:
        import shutil
        path = shutil.which("tmux")
        if not path:
            fail(line, "tmux is not installed. Install it first: sudo apt install tmux")
        return path

    def _slug(self, name: str, line: int) -> str:
        import re
        slug = re.sub(r"[^A-Za-z0-9_-]", "_", name).strip("_-")
        if not slug:
            fail(line, "that terminal name has no usable characters.")
        return "jc_" + slug[:40]

    def _no_session(self, detail: str) -> bool:
        detail = detail.lower()
        return ("can't find session" in detail or "no server running" in detail
                or "failed to connect" in detail)

    def _tmux(self, line: int, *args: str) -> str:
        import subprocess
        path = self._tmux_path(line)
        try:
            proc = subprocess.run([path, *args], capture_output=True,
                                  text=True, timeout=TMUX_TIMEOUT)
        except subprocess.TimeoutExpired:
            fail(line, "tmux took too long to answer (over 10 seconds).")
        except FileNotFoundError:
            fail(line, "tmux is not installed. Install it first: sudo apt install tmux")
        except Exception:
            fail(line, "I could not talk to tmux.")
        if proc.returncode != 0:
            detail = (proc.stderr or proc.stdout or "").strip().split("\n")
            first = detail[0][:160] if detail and detail[0] else ""
            raise _TmuxFailed(first)
        return proc.stdout or ""

    def exec_term_open(self, stmt: TermOpen, env: Environment) -> None:
        name = self._need_text(self.eval_expr(stmt.name, env), stmt.line,
                               "the terminal name")
        slug = self._slug(name, stmt.line)
        try:
            self._tmux(stmt.line, "new-session", "-d", "-s", slug, "-x", "200", "-y", "50")
        except _TmuxFailed as err:
            if "duplicate session" in err.detail:
                fail(stmt.line, f'a terminal named "{name}" is already open.')
            fail(stmt.line, f'I could not open a terminal named "{name}".')

    def exec_term_send(self, stmt: TermSend, env: Environment) -> None:
        cmd = self._need_text(self.eval_expr(stmt.cmd, env), stmt.line,
                              "what I send to the terminal")
        name = self._need_text(self.eval_expr(stmt.name, env), stmt.line,
                               "the terminal name")
        slug = self._slug(name, stmt.line)
        try:
            self._tmux(stmt.line, "send-keys", "-t", slug, cmd, "Enter")
        except _TmuxFailed as err:
            if self._no_session(err.detail):
                fail(stmt.line, f'there is no terminal named "{name}".')
            fail(stmt.line, f'I could not send to the terminal named "{name}".')

    def exec_term_read(self, stmt: TermRead, env: Environment) -> None:
        name = self._need_text(self.eval_expr(stmt.name, env), stmt.line,
                               "the terminal name")
        slug = self._slug(name, stmt.line)
        try:
            out = self._tmux(stmt.line, "capture-pane", "-t", slug, "-p", "-S", "-200")
        except _TmuxFailed as err:
            if self._no_session(err.detail):
                fail(stmt.line, f'there is no terminal named "{name}".')
            fail(stmt.line, f'I could not read the terminal named "{name}".')
        env.set(stmt.target, out.rstrip())

    def eval_interp(self, expr: Interp, env: Environment) -> str:
        out: list[str] = []
        for kind, part in expr.parts:
            if kind == "text":
                out.append(part)
            else:
                out.append(show_text(self.eval_expr(part, env)))
        return "".join(out)

    # v0.4: file I/O. Paths resolve from the current folder and may not
    # escape it.
    def _safe_file_path(self, raw: Any, line: int, verb: str) -> "Path":
        from pathlib import Path
        text = raw if isinstance(raw, str) else show_text(raw)
        candidate = Path(text)
        base = Path.cwd()
        target = candidate if candidate.is_absolute() else base / candidate
        try:
            resolved = target.resolve()
        except (OSError, ValueError):
            fail(line, f'I cannot {verb} "{text}": that path does not work here.')
        try:
            resolved.relative_to(base.resolve())
        except ValueError:
            fail(line, f'I cannot {verb} "{text}": it leaves the current folder.')
        return resolved

    def exec_read_file(self, stmt: ReadFile, env: Environment) -> None:
        raw = self.eval_expr(stmt.path, env)
        shown = raw if isinstance(raw, str) else show_text(raw)
        path = self._safe_file_path(raw, stmt.line, "read")
        try:
            if path.is_dir():
                fail(stmt.line, f'"{shown}" is a folder, not a file.')
            text = path.read_text(encoding="utf-8", errors="replace")
        except FileNotFoundError:
            fail(stmt.line, f'I could not find the file "{shown}".')
        except (OSError, ValueError):
            fail(stmt.line, f'I could not read the file "{shown}".')
        env.set(stmt.name, text)

    def exec_write_file(self, stmt: WriteFile, env: Environment) -> None:
        raw = self.eval_expr(stmt.path, env)
        shown = raw if isinstance(raw, str) else show_text(raw)
        path = self._safe_file_path(raw, stmt.line, "write to")
        text = show_text(self.eval_expr(stmt.value, env))
        try:
            if path.is_dir():
                fail(stmt.line, f'"{shown}" is a folder, not a file.')
            if stmt.append:
                with open(path, "a", encoding="utf-8") as handle:
                    handle.write(text)
            else:
                path.write_text(text, encoding="utf-8")
        except FileNotFoundError:
            fail(stmt.line, f'I could not write "{shown}": its folder does not exist.')
        except (OSError, ValueError):
            fail(stmt.line, f'I could not write to "{shown}".')

    # v0.4: jpm, the package manager. Packages live in
    # ~/.jesun-code/packages/<host>/<user>/<pkg>/ (or JESUN_CODE_HOME).
    _JPM_SEGMENT = re.compile(r"^[A-Za-z0-9._-]+$")
    _JPM_TIMEOUT = 120

    def _jpm_home(self) -> "Path":
        import os
        from pathlib import Path
        override = os.environ.get("JESUN_CODE_HOME", "").strip()
        return Path(override).expanduser() if override else Path.home() / ".jesun-code"

    def _jpm_packages_dir(self) -> "Path":
        return self._jpm_home() / "packages"

    def _jpm_parse_address(self, text: str, line: int) -> tuple:
        parts = text.split("/")
        ok = (len(parts) == 3 and all(
            part and self._JPM_SEGMENT.match(part) and ".." not in part
            for part in parts))
        if not ok:
            fail(line, f'"{text}" is not a package address; write it like "github.com/user/pkg".')
        return parts[0], parts[1], parts[2]

    def _jpm_package_dir(self, host: str, user: str, pkg: str) -> "Path":
        return self._jpm_packages_dir() / host / user / pkg

    def _jpm_git(self) -> Optional[str]:
        import shutil
        return shutil.which("git")

    def exec_use_pkg(self, stmt: UsePkg, env: Environment) -> None:
        raw = self.eval_expr(stmt.address, env)
        text = raw if isinstance(raw, str) else show_text(raw)
        host, user, pkg = self._jpm_parse_address(text, stmt.line)
        if host != "github.com":
            fail(stmt.line, f'I can only fetch packages from github.com, not "{host}".')
        dest = self._jpm_package_dir(host, user, pkg)
        if dest.exists():
            self._jpm_check_clean(dest, user, pkg, stmt.line)
            return  # already installed: installing twice is a no-op
        self._jpm_clone(host, user, pkg, dest, stmt.line)

    def _jpm_check_clean(self, dest: "Path", user: str, pkg: str, line: int) -> None:
        import subprocess
        git = self._jpm_git()
        if git is None:
            return  # installed by hand, not by git: nothing to check
        try:
            done = subprocess.run(
                [git, "-C", str(dest), "status", "--porcelain"],
                timeout=30, capture_output=True, text=True)
        except (subprocess.SubprocessError, OSError):
            return  # not a git checkout or git misbehaving: leave it alone
        if done.returncode == 0 and done.stdout.strip():
            fail(line, f'the package "{user}/{pkg}" has local changes; '
                       "move them away before I fetch it again.")

    def _jpm_clone(self, host: str, user: str, pkg: str, dest: "Path", line: int) -> None:
        import shutil
        import subprocess
        git = self._jpm_git()
        if git is None:
            fail(line, "I need git to fetch packages, and I cannot find it.")
        dest.parent.mkdir(parents=True, exist_ok=True)
        url = f"https://{host}/{user}/{pkg}"
        try:
            subprocess.run([git, "clone", "--depth", "1", url, str(dest)],
                           check=True, timeout=self._JPM_TIMEOUT,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except (subprocess.SubprocessError, OSError):
            shutil.rmtree(dest, ignore_errors=True)
            fail(line, f'I could not fetch "{host}/{user}/{pkg}"; '
                       "check the address and your connection.")

    def _jpm_find(self, name: str) -> Optional["Path"]:
        base = self._jpm_packages_dir()
        if not base.is_dir():
            return None
        for host_dir in sorted(base.iterdir()):
            if not host_dir.is_dir():
                continue
            for user_dir in sorted(host_dir.iterdir()):
                if not user_dir.is_dir():
                    continue
                candidate = user_dir / name
                if candidate.is_dir():
                    return candidate
        return None

    def _jpm_main_file(self, dest: "Path", name: str, line: int) -> "Path":
        manifest = dest / "jpm.json"
        fname = f"{name}.jc"
        if manifest.is_file():
            try:
                import json
                data = json.loads(manifest.read_text(encoding="utf-8"))
                picked = data.get("main")
                if isinstance(picked, str) and picked.strip():
                    fname = picked.strip()
            except (OSError, ValueError):
                fail(line, f'the package "{name}" has a jpm.json I cannot read.')
        target = dest / fname
        try:
            resolved = target.resolve()
            resolved.relative_to(dest.resolve())
        except (OSError, ValueError):
            fail(line, f'the package "{name}" points outside its own folder; I will not load it.')
        if not resolved.is_file():
            fail(line, f'I fetched the package "{name}" but I cannot find its code file "{fname}".')
        return resolved

    def exec_bring_in(self, stmt: BringIn, env: Environment) -> None:
        raw = self.eval_expr(stmt.name, env)
        text = raw if isinstance(raw, str) else show_text(raw)
        if not text or text in (".", "..") or not self._JPM_SEGMENT.match(text):
            fail(stmt.line, f'"{text}" is not a package name; bring in a name like "time".')
        if text in self._jpm_loading:
            chain = self._jpm_loading + [text]
            fail(stmt.line, f'these packages bring each other in a circle: {", ".join(chain)}.')
        dest = self._jpm_find(text)
        if dest is None:
            fail(stmt.line, f'I have not fetched the package "{text}" yet; '
                            f'run use "github.com/user/{text}" first.')
        main = self._jpm_main_file(dest, text, stmt.line)
        self._jpm_loading.append(text)
        try:
            try:
                source = main.read_text(encoding="utf-8", errors="replace")
            except OSError:
                fail(stmt.line, f'I could not read the package "{text}".')
            program = None
            try:
                program = Parser(tokenize(source)).parse_program()
            except RecursionError:
                fail(stmt.line, f'in the "{text}" package: {TOO_DEEP}')
            before = set(env.vars)
            for sub in program:
                self.exec_stmt(sub, env)
            for name, value in env.vars.items():
                if name not in before and isinstance(value, Function):
                    value.origin = text
        except JesunError as err:
            # Package line numbers mean nothing to the user: say where it
            # broke (once; a package function that already said so is left).
            tag = f'in the "{text}" package: '
            if err.message.startswith(tag):
                raise
            raise JesunError(err.line, tag + err.message)
        finally:
            self._jpm_loading.pop()

    def exec_term_close(self, stmt: TermClose, env: Environment) -> None:
        name = self._need_text(self.eval_expr(stmt.name, env), stmt.line,
                               "the terminal name")
        slug = self._slug(name, stmt.line)
        try:
            self._tmux(stmt.line, "kill-session", "-t", slug)
        except _TmuxFailed as err:
            if self._no_session(err.detail):
                fail(stmt.line, f'there is no terminal named "{name}".')
            fail(stmt.line, f'I could not close the terminal named "{name}".')


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def run_source(source: str, interp: Interpreter) -> None:
    parser = Parser(tokenize(source))
    try:
        program = parser.parse_program()
    except RecursionError:
        raise JesunError(parser.last_line, TOO_DEEP)
    interp.run(program)


def execute(source: str, stdin_text: str = "") -> str:
    """Run source, return everything printed (output and errors). Test hook."""
    import io
    out = io.StringIO()
    interp = Interpreter(stdin=io.StringIO(stdin_text), stdout=out)
    try:
        run_source(source, interp)
    except JesunError as e:
        out.write(str(e) + "\n")
    return out.getvalue()


_INCOMPLETE_BLOCK = "I expected an indented block here."


def _last_line_opens_block(buffer: str) -> bool:
    """Does the buffer end with a line that starts a block?"""
    lines = [ln for ln in buffer.split("\n") if ln.strip()]
    if not lines:
        return False
    bangla = bool(_bangla_header_lineno("\n".join(lines)))
    comment_word = BANGLA_COMMENT if bangla else "note"
    s = _cut_comment(lines[-1], comment_word).strip()
    if bangla:
        # NB: \b is useless after Bangla vowel signs (regex sees them as
        # non-word chars), so block openers use explicit boundaries.
        if s == "নইলে" or s.startswith("নইলে "):
            return True
        if re.match(r"^যদি\s.*\sতাহলে$", s):
            return True
        return any(re.match(rf"^{kw}(?:\s|$)", s)
                   for kw in ("আবার", "জন্য", "জন্যে", "এজেন্ট", "দল"))
    if s == "otherwise" or s.startswith("otherwise "):
        return True
    if re.match(r"^if\b.*\bthen$", s):
        return True
    return any(re.match(rf"^{kw}\b", s) for kw in ("repeat", "for", "to", "agent", "fleet"))


def _buffer_ends_inside_block(buffer: str) -> bool:
    """Is the last typed line indented, i.e. still inside a block?"""
    lines = [ln for ln in buffer.split("\n") if ln.strip()]
    if not lines:
        return False
    return lines[-1][:1] in (" ", "\t")


def _exec_repl_stmt(interp: Interpreter, stmt: Stmt) -> Any:
    try:
        return interp.exec_stmt(stmt, interp.global_env)
    except _Return as r:
        print(JesunError(r.line, '"give back" only makes sense inside a function.'))
    except _Stop as s:
        print(JesunError(s.line, '"stop" only makes sense inside a loop.'))
    except _Skip as s:
        print(JesunError(s.line, '"skip" only makes sense inside a loop.'))
    return None


def _run_repl_program(interp: Interpreter, program: list[Stmt]) -> None:
    for stmt in program:
        value = _exec_repl_stmt(interp, stmt)
        if isinstance(stmt, ExprStmt) and value is not None:
            interp.emit(show_text(value))


def _run_repl_source(interp: Interpreter, source: str) -> None:
    try:
        _run_repl_program(interp, Parser(tokenize(source)).parse_program())
    except JesunError as e:
        print(e)
    except Exception:
        print("I hit something I did not expect and stopped instead of guessing.")


def repl() -> int:
    print(f"Jesun.Code v{VERSION}, speak human.")
    print("Type a line and I run it. Blocks keep going until an empty line.")
    interp = Interpreter()
    buffer = ""
    while True:
        try:
            text = input("... " if buffer else "jc> ")
        except EOFError:
            print()
            return 0
        except KeyboardInterrupt:
            print()
            buffer = ""
            continue
        if not text.strip():
            if not buffer:
                return 0
            source, buffer = buffer, ""
            _run_repl_source(interp, source)
            continue
        buffer += text + "\n"
        try:
            program = Parser(tokenize(buffer)).parse_program()
        except JesunError as e:
            if e.message == _INCOMPLETE_BLOCK and _last_line_opens_block(buffer):
                continue  # the block is still open; keep reading
            print(e)
            buffer = ""
        except Exception:
            # Never a traceback. The --debug flag re-raises for developers.
            print("I hit something I did not expect and stopped instead of guessing.")
            buffer = ""
        else:
            if _buffer_ends_inside_block(buffer):
                continue  # more block lines may follow; empty line runs
            buffer = ""
            try:
                _run_repl_program(interp, program)
            except JesunError as e:
                print(e)
            except Exception:
                print("I hit something I did not expect and stopped instead of guessing.")
    return 0


def main(argv: Optional[list[str]] = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    debug = False
    if "--debug" in args:
        debug = True
        args.remove("--debug")
    if args in (["--version"], ["-v"]):
        print(f"Jesun.Code v{VERSION}")
        return 0
    if not args:
        return repl()
    path = args[0]  # v1.0: words after the file become `arguments`
    extra = args[1:]
    try:
        with open(path, "r", encoding="utf-8") as handle:
            source = handle.read()
    except OSError:
        print(f'I could not open "{path}".')
        return 1
    interp = Interpreter()
    interp.global_env.set("arguments", list(extra))
    try:
        run_source(source, interp)
    except JesunError as e:
        print(e)
        return 1
    except KeyboardInterrupt:
        print("\nStopped.")
        return 130
    except Exception:
        if debug:
            raise
        print("I hit something I did not expect and stopped instead of guessing.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
