"""jesun_build.py: v1.1 native. `jesun build program.jc` transpiles Jesun.Code
to C and compiles it with the system C compiler into a real native binary.

The transpiler walks the parser AST from jesun.py directly, so there is
one grammar, not two. Unsupported features (the Python bridge, AI minds,
agents, fleets, terminals, jpm) are rejected at compile time with
plain-English line-numbered errors.

Usage from the CLI: jesun build <file.jc> [-o <name>] [--keep-c]
"""

import shutil
import subprocess
from pathlib import Path

import jesun
from jesun import JesunError


class BuildError(JesunError):
    """A compile-time error. Same shape as interpreter errors."""


# ---------------------------------------------------------------------------
# The C runtime, embedded in every generated file. A tagged value type, a
# bump arena allocator, text/list helpers, and plain-English runtime errors.
# No interpreter, no VM, no Python. Like every compiled language, the output
# carries a small runtime of its own; what it never carries is a bundled
# interpreter.
# ---------------------------------------------------------------------------

C_RUNTIME = r"""
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <ctype.h>
#include <setjmp.h>
#include <stdarg.h>
#include <sys/stat.h>
#include <unistd.h>

/* ---------------- arena: programs allocate, never free ----------------
   Chunked: chunks are never moved or freed, so pointers into the arena
   stay valid for the life of the program. The OS reclaims it on exit. */
typedef struct JcChunk { struct JcChunk *next; size_t used, size; unsigned char data[]; } JcChunk;
#define JC_CHUNK_SIZE ((size_t)1 << 20)
static JcChunk *jc_chunks;
static void jc_arena_init(void) {
    jc_chunks = 0;
}
static void jc_new_chunk(size_t min_size) {
    size_t size = JC_CHUNK_SIZE;
    if (min_size > size) size = min_size;
    JcChunk *c = (JcChunk *)malloc(sizeof(JcChunk) + size);
    if (!c) { printf("Line 0: I ran out of memory.\n"); exit(1); }
    c->next = jc_chunks; c->used = 0; c->size = size; jc_chunks = c;
}
static void *jc_alloc(size_t n) {
    n = (n + 15) & ~(size_t)15;
    if (!jc_chunks || jc_chunks->used + n > jc_chunks->size) jc_new_chunk(n);
    JcChunk *c = jc_chunks;
    void *r = c->data + c->used;
    c->used += n;
    return r;
}
static char *jc_dup(const char *s, size_t n) {
    char *r = (char *)jc_alloc(n + 1);
    memcpy(r, s, n); r[n] = 0;
    return r;
}

/* ---------------- values ---------------- */
typedef enum { JC_NONE, JC_NUM, JC_STR, JC_BOOL, JC_LIST, JC_FUNC } JcTag;
typedef struct JcList { struct JcVal *items; size_t len, cap; } JcList;
typedef struct JcFrame JcFrame;  /* defined below; functions capture it */
typedef struct JcVal {
    JcTag tag;
    double num;
    const char *str;
    int boolean;
    JcList *list;
    int func;               /* JC_FUNC: index into the program's function table */
    const char *funcname;   /* JC_FUNC: original Jesun.Code name */
    int funcnparams;        /* JC_FUNC: parameter count */
    JcFrame *funcenv;       /* JC_FUNC: frame captured where it was defined */
} JcVal;

static JcVal jc_none(void) { JcVal v; v.tag = JC_NONE; v.num = 0; v.str = 0; v.boolean = 0; v.list = 0; return v; }
static JcVal jc_num(double n) { JcVal v = jc_none(); v.tag = JC_NUM; v.num = n; return v; }
static JcVal jc_cstr(const char *s) { JcVal v = jc_none(); v.tag = JC_STR; v.str = jc_dup(s, strlen(s)); return v; }
static JcVal jc_strn(const char *s, size_t n) { JcVal v = jc_none(); v.tag = JC_STR; v.str = jc_dup(s, n); return v; }
static JcVal jc_bool(int b) { JcVal v = jc_none(); v.tag = JC_BOOL; v.boolean = b ? 1 : 0; return v; }
static JcVal jc_list(void) {
    JcVal v = jc_none(); v.tag = JC_LIST;
    v.list = (JcList *)jc_alloc(sizeof(JcList));
    v.list->len = 0; v.list->cap = 0; v.list->items = 0;
    return v;
}

static void jc_fail(int line, const char *msg) {
    printf("Line %d: %s\n", line, msg);
    fflush(stdout);
    exit(1);
}

/* ---------------- loop control: stop/skip unwind dynamically ------------
   `stop` and `skip` propagate through function calls to the innermost
   enclosing loop, exactly like the interpreter's _Stop/_Skip. Each loop
   pushes a control record; stop longjmps out (1), skip longjmps back in
   (2). Counters live in the record (memory), so they survive longjmp. */
static int jc_depth;  /* tentative; defined in the scopes section below */
typedef struct { jmp_buf buf; long long idx; long long runs; int depth; } JcCtl;
static JcCtl jc_ctl_stack[4096];
static int jc_ctl_depth = 0;
static JcCtl *jc_ctl_push(int line) {
    JcCtl *c;
    if (jc_ctl_depth >= 4096) jc_fail(line, "the loops nest too deep; I stopped.");
    c = &jc_ctl_stack[jc_ctl_depth++];
    c->idx = 0; c->runs = 0; c->depth = jc_depth;
    return c;
}
static void jc_ctl_pop(void) { jc_ctl_depth--; }

static const char *jc_kind(JcVal v) {
    switch (v.tag) {
        case JC_NONE: return "nothing";
        case JC_BOOL: return "true/false";
        case JC_NUM: return "number";
        case JC_STR: return "text";
        case JC_LIST: return "list";
        case JC_FUNC: return "function";
    }
    return "value";
}

static int jc_truthy(JcVal v) {
    switch (v.tag) {
        case JC_NONE: return 0;
        case JC_BOOL: return v.boolean;
        case JC_NUM: return v.num != 0.0;
        case JC_STR: return v.str[0] != 0;
        case JC_LIST: return v.list->len != 0;
        case JC_FUNC: return 1;
    }
    return 0;
}

/* ---------------- UTF-8 code point helpers ---------------- */
static size_t jc_utf8_next(const char *s, size_t *i) {
    unsigned char c = (unsigned char)s[*i];
    size_t n = 1;
    if (c >= 0xF0) n = 4; else if (c >= 0xE0) n = 3; else if (c >= 0xC0) n = 2;
    *i += n;
    return n;
}
static size_t jc_utf8_len(const char *s) {
    size_t n = 0, i = 0;
    while (s[i]) { jc_utf8_next(s, &i); n++; }
    return n;
}
static size_t jc_utf8_off(const char *s, size_t idx) {
    size_t i = 0, n = 0;
    while (s[i] && n < idx) { jc_utf8_next(s, &i); n++; }
    return i;
}

/* ---------------- number printing: shortest round-trip, Python style ---- */
static void jc_format_num(double v, char *out) {
    if (v != v) { strcpy(out, "nan"); return; }
    if (isinf(v)) { strcpy(out, v < 0 ? "-inf" : "inf"); return; }
    if (v == 0.0) { strcpy(out, "0"); return; }
    if (v == floor(v)) {
        /* Whole-valued: the interpreter prints str(int(v)), the exact
           integer digits, so 1e300 prints all 301 digits, not "1e+300". */
        if (fabs(v) < 9007199254740992.0) {
            sprintf(out, "%lld", (long long)v);
            return;
        }
        snprintf(out, 512, "%.0f", v);
        return;
    }
    char buf[64], best[64];
    size_t bestlen = (size_t)-1;
    int found = 0;
    for (int p = 1; p <= 17; p++) {
        snprintf(buf, sizeof buf, "%.*g", p, v);
        double back = strtod(buf, 0);
        if (back == v && strlen(buf) < bestlen) { strcpy(best, buf); bestlen = strlen(buf); found = 1; }
    }
    if (!found) { snprintf(out, 64, "%.17g", v); return; }
    const char *q = best;
    int neg = 0;
    if (*q == '-') { neg = 1; q++; }
    char digits[64]; int nd = 0, frac = 0, seendot = 0;
    while (*q && *q != 'e' && *q != 'E') {
        if (*q == '.') seendot = 1;
        else { digits[nd++] = *q; if (seendot) frac++; }
        q++;
    }
    int e10 = 0;
    if (*q == 'e' || *q == 'E') e10 = atoi(q + 1);
    int lead = 0;
    while (lead < nd - 1 && digits[lead] == '0') lead++;
    int sig = nd - lead;
    while (sig > 1 && digits[lead + sig - 1] == '0') sig--;
    int decpt = e10 + (nd - lead - frac);
    char *o = out;
    if (neg) *o++ = '-';
    if (decpt > 16 || decpt <= -4) {
        *o++ = digits[lead];
        if (sig > 1) {
            *o++ = '.';
            for (int i = 1; i < sig; i++) *o++ = digits[lead + i];
        }
        int ex = decpt - 1;
        *o++ = 'e';
        *o++ = ex < 0 ? '-' : '+';
        if (ex < 0) ex = -ex;
        char eb[16]; sprintf(eb, "%d", ex);
        if (strlen(eb) < 2) *o++ = '0';
        strcpy(o, eb);
    } else if (decpt <= 0) {
        *o++ = '0'; *o++ = '.';
        for (int i = 0; i < -decpt; i++) *o++ = '0';
        for (int i = 0; i < sig; i++) *o++ = digits[lead + i];
        *o = 0;
    } else if (decpt >= sig) {
        for (int i = 0; i < sig; i++) *o++ = digits[lead + i];
        for (int i = 0; i < decpt - sig; i++) *o++ = '0';
        *o = 0;
    } else {
        for (int i = 0; i < decpt; i++) *o++ = digits[lead + i];
        *o++ = '.';
        for (int i = decpt; i < sig; i++) *o++ = digits[lead + i];
        *o = 0;
    }
}

/* ---------------- showing ---------------- */
typedef struct { char *p; size_t len, cap; } JcBuf;
static void jc_buf_put(JcBuf *b, const char *s, size_t n) {
    if (b->len + n + 1 > b->cap) {
        size_t ncap = b->cap ? b->cap * 2 : 64;
        while (b->len + n + 1 > ncap) ncap *= 2;
        b->p = (char *)realloc(b->p, ncap);
        if (!b->p) { printf("Line 0: I ran out of memory.\n"); exit(1); }
        b->cap = ncap;
    }
    memcpy(b->p + b->len, s, n);
    b->len += n;
    b->p[b->len] = 0;
}
static void jc_show_buf(JcVal v, JcBuf *b) {
    char tmp[512];
    size_t i;
    switch (v.tag) {
        case JC_NONE: jc_buf_put(b, "nothing", 7); break;
        case JC_BOOL:
            if (v.boolean) jc_buf_put(b, "true", 4);
            else jc_buf_put(b, "false", 5);
            break;
        case JC_NUM:
            jc_format_num(v.num, tmp);
            jc_buf_put(b, tmp, strlen(tmp));
            break;
        case JC_STR: jc_buf_put(b, v.str, strlen(v.str)); break;
        case JC_LIST:
            jc_buf_put(b, "[", 1);
            for (i = 0; i < v.list->len; i++) {
                if (i) jc_buf_put(b, ", ", 2);
                jc_show_buf(v.list->items[i], b);
            }
            jc_buf_put(b, "]", 1);
            break;
        case JC_FUNC: {
            const char *nm = v.funcname ? v.funcname : "?";
            jc_buf_put(b, "<function ", 10);
            jc_buf_put(b, nm, strlen(nm));
            jc_buf_put(b, ">", 1);
            break;
        }
    }
}
static char *jc_show_str(JcVal v) {
    JcBuf b; b.p = 0; b.len = 0; b.cap = 0;
    jc_show_buf(v, &b);
    return b.p ? b.p : (char *)"";
}
static void jc_show(JcVal v) {
    printf("%s\n", jc_show_str(v));
    fflush(stdout);
}

/* ---------------- equality ---------------- */
static int jc_equal(JcVal a, JcVal b) {
    size_t i;
    if (a.tag == JC_BOOL || b.tag == JC_BOOL)
        return a.tag == JC_BOOL && b.tag == JC_BOOL && a.boolean == b.boolean;
    if (a.tag != b.tag) return 0;
    switch (a.tag) {
        case JC_NONE: return 1;
        case JC_NUM: return a.num == b.num;
        case JC_STR: return strcmp(a.str, b.str) == 0;
        case JC_LIST:
            if (a.list->len != b.list->len) return 0;
            for (i = 0; i < a.list->len; i++)
                if (!jc_equal(a.list->items[i], b.list->items[i])) return 0;
            return 1;
        default: return 0;
    }
}

/* ---------------- arithmetic ---------------- */
static void jc_need_num(JcVal v, int line, const char *what) {
    if (v.tag == JC_BOOL || v.tag != JC_NUM) {
        char msg[256];
        snprintf(msg, sizeof msg, "I can only use %s with numbers.", what);
        jc_fail(line, msg);
    }
}
static JcVal jc_add(JcVal a, JcVal b, int line) {
    if (a.tag == JC_NUM && b.tag == JC_NUM) return jc_num(a.num + b.num);
    if (a.tag == JC_STR && b.tag == JC_STR) {
        size_t la = strlen(a.str), lb = strlen(b.str);
        char *r = (char *)jc_alloc(la + lb + 1);
        memcpy(r, a.str, la); memcpy(r + la, b.str, lb); r[la + lb] = 0;
        JcVal v = jc_none(); v.tag = JC_STR; v.str = r; return v;
    }
    jc_fail(line, "I can only add numbers to numbers and text to text.");
    return jc_none();
}
static JcVal jc_sub(JcVal a, JcVal b, int line) {
    jc_need_num(a, line, "\"-\", \"*\", \"/\" and \"%\"");
    jc_need_num(b, line, "\"-\", \"*\", \"/\" and \"%\"");
    return jc_num(a.num - b.num);
}
static JcVal jc_mul(JcVal a, JcVal b, int line) {
    jc_need_num(a, line, "\"-\", \"*\", \"/\" and \"%\"");
    jc_need_num(b, line, "\"-\", \"*\", \"/\" and \"%\"");
    return jc_num(a.num * b.num);
}
static JcVal jc_div(JcVal a, JcVal b, int line) {
    jc_need_num(a, line, "\"-\", \"*\", \"/\" and \"%\"");
    jc_need_num(b, line, "\"-\", \"*\", \"/\" and \"%\"");
    if (b.num == 0.0) jc_fail(line, "I cannot divide by zero.");
    return jc_num(a.num / b.num);
}
static JcVal jc_mod(JcVal a, JcVal b, int line) {
    jc_need_num(a, line, "\"-\", \"*\", \"/\" and \"%\"");
    jc_need_num(b, line, "\"-\", \"*\", \"/\" and \"%\"");
    if (b.num == 0.0) jc_fail(line, "I cannot divide by zero.");
    double r = fmod(a.num, b.num);
    if (r != 0.0 && ((r < 0) != (b.num < 0))) r += b.num;
    return jc_num(r);
}
static JcVal jc_neg(JcVal a, int line) {
    jc_need_num(a, line, "\"-\"");
    return jc_num(-a.num);
}
static JcVal jc_cmp(JcVal a, JcVal b, int line, int op) {
    jc_need_num(a, line, "comparisons like this");
    jc_need_num(b, line, "comparisons like this");
    int r = 0;
    if (op == 0) r = a.num > b.num;
    else if (op == 1) r = a.num < b.num;
    else if (op == 2) r = a.num >= b.num;
    else r = a.num <= b.num;
    return jc_bool(r);
}
static JcVal jc_contains(JcVal a, JcVal b, int line) {
    size_t i;
    if (a.tag == JC_STR && b.tag == JC_STR)
        return jc_bool(strstr(a.str, b.str) != 0);
    if (a.tag == JC_LIST) {
        for (i = 0; i < a.list->len; i++)
            if (jc_equal(a.list->items[i], b)) return jc_bool(1);
        return jc_bool(0);
    }
    jc_fail(line, "\"contains\" needs text with text, or a list.");
    return jc_none();
}
"""

C_RUNTIME2 = r"""
/* ---------------- lists ---------------- */
static void jc_list_push(JcVal listv, JcVal v) {
    JcList *l = listv.list;
    if (l->len == l->cap) {
        size_t ncap = l->cap ? l->cap * 2 : 4;
        JcVal *ni = (JcVal *)jc_alloc(ncap * sizeof(JcVal));
        if (l->items) memcpy(ni, l->items, l->len * sizeof(JcVal));
        l->items = ni; l->cap = ncap;
    }
    l->items[l->len++] = v;
}
static void jc_push(JcVal target, const char *name, JcVal v, int line) {
    if (target.tag != JC_LIST) {
        char msg[256];
        snprintf(msg, sizeof msg, "I can only push to a list, but \"%s\" holds %s.", name, jc_kind(target));
        jc_fail(line, msg);
    }
    jc_list_push(target, v);
}
/* The push target is looked up and checked BEFORE the pushed value is
   evaluated, exactly like the interpreter. */
static JcVal jc_push_target(JcVal target, const char *name, int line) {
    if (target.tag != JC_LIST) {
        char msg[256];
        snprintf(msg, sizeof msg, "I can only push to a list, but \"%s\" holds %s.", name, jc_kind(target));
        jc_fail(line, msg);
    }
    return target;
}
static JcVal jc_index(JcVal obj, JcVal idx, int line) {
    int is_list = obj.tag == JC_LIST;
    if (!is_list && obj.tag != JC_STR) {
        char msg[256];
        snprintf(msg, sizeof msg, "I cannot look inside %s with brackets.", jc_kind(obj));
        jc_fail(line, msg);
    }
    const char *what = is_list ? "a list" : "text";
    if (idx.tag == JC_BOOL || idx.tag != JC_NUM) {
        char msg[256];
        snprintf(msg, sizeof msg, "%s needs a whole-number position in brackets.", what);
        jc_fail(line, msg);
    }
    double d = idx.num;
    if (floor(d) != d) {
        char msg[256];
        snprintf(msg, sizeof msg, "%s needs a whole-number position in brackets.", what);
        jc_fail(line, msg);
    }
    long long i = (long long)d;
    size_t len = is_list ? obj.list->len : jc_utf8_len(obj.str);
    if (i < 0) i += (long long)len;
    if (i < 0 || i >= (long long)len) {
        char msg[256];
        /* The interpreter reports the original index, not the adjusted one. */
        snprintf(msg, sizeof msg, "position %lld is outside this %s of %zu.", (long long)d, what, len);
        jc_fail(line, msg);
    }
    if (is_list) return obj.list->items[(size_t)i];
    size_t off = jc_utf8_off(obj.str, (size_t)i);
    size_t nxt = off; jc_utf8_next(obj.str, &nxt);
    return jc_strn(obj.str + off, nxt - off);
}

/* ---------------- scopes: runtime frames like the interpreter's env ---- */
typedef struct { const char *name; JcVal val; } JcBind;
struct JcFrame { JcBind *binds; size_t len, cap; struct JcFrame *parent; };
static JcFrame *jc_frame_new(JcFrame *parent) {
    JcFrame *f = (JcFrame *)jc_alloc(sizeof(JcFrame));
    f->len = 0; f->cap = 0; f->binds = 0; f->parent = parent;
    return f;
}
static void jc_set(JcFrame *f, const char *name, JcVal v) {
    size_t i;
    for (i = 0; i < f->len; i++)
        if (strcmp(f->binds[i].name, name) == 0) { f->binds[i].val = v; return; }
    if (f->len == f->cap) {
        size_t ncap = f->cap ? f->cap * 2 : 8;
        JcBind *nb = (JcBind *)jc_alloc(ncap * sizeof(JcBind));
        if (f->binds) memcpy(nb, f->binds, f->len * sizeof(JcBind));
        f->binds = nb; f->cap = ncap;
    }
    f->binds[f->len].name = name;
    f->binds[f->len].val = v;
    f->len++;
}
static int jc_name_match(const char *cand, const char *want) {
    while (*cand && *want) {
        if (tolower((unsigned char)*cand) != tolower((unsigned char)*want)) return 0;
        cand++; want++;
    }
    return 1;
}
static const char *jc_close_match(const char *name, JcFrame *f);
static JcVal jc_get(JcFrame *f, const char *name, int line) {
    JcFrame *g; size_t i;
    for (g = f; g; g = g->parent)
        for (i = 0; i < g->len; i++)
            if (strcmp(g->binds[i].name, name) == 0) return g->binds[i].val;
    const char *best = 0;
    for (g = f; g && !best; g = g->parent)
        for (i = 0; i < g->len; i++) {
            const char *c = g->binds[i].name;
            if (strcmp(c, name) == 0) continue;
            if (jc_name_match(c, name) || jc_name_match(name, c)) { best = c; break; }
        }
    /* No prefix hit: the interpreter falls back to difflib's close match. */
    if (!best) best = jc_close_match(name, f);
    char msg[512];
    if (best) snprintf(msg, sizeof msg, "I do not know the word \"%s\". Did you mean \"%s\"?", name, best);
    else snprintf(msg, sizeof msg, "I do not know the word \"%s\".", name);
    jc_fail(line, msg);
    return jc_none();
}

/* ---------------- builtins ---------------- */
static JcVal jc_length(JcVal v, int line) {
    if (v.tag == JC_STR) return jc_num((double)jc_utf8_len(v.str));
    if (v.tag == JC_LIST) return jc_num((double)v.list->len);
    jc_fail(line, "\"length of\" needs text or a list.");
    return jc_none();
}
static JcVal jc_first(JcVal v, int line) {
    if (v.tag != JC_LIST) jc_fail(line, "\"first of\" needs a list.");
    if (!v.list->len) jc_fail(line, "there is no first of an empty list.");
    return v.list->items[0];
}
static JcVal jc_last(JcVal v, int line) {
    if (v.tag != JC_LIST) jc_fail(line, "\"last of\" needs a list.");
    if (!v.list->len) jc_fail(line, "there is no last of an empty list.");
    return v.list->items[v.list->len - 1];
}
static JcVal jc_case(JcVal v, int line, int upper) {
    size_t n, i;
    char *r;
    if (v.tag != JC_STR) jc_fail(line, upper ? "\"uppercase of\" needs text." : "\"lowercase of\" needs text.");
    n = strlen(v.str);
    r = jc_dup(v.str, n);
    for (i = 0; i < n; i++)
        r[i] = upper ? (char)toupper((unsigned char)r[i]) : (char)tolower((unsigned char)r[i]);
    { JcVal out = jc_none(); out.tag = JC_STR; out.str = r; return out; }
}
static JcVal jc_split(JcVal v, JcVal sepv, int line) {
    const char *s, *sep, *at, *found;
    size_t seplen;
    JcVal out;
    if (v.tag != JC_STR) jc_fail(line, "\"split of\" needs text.");
    if (sepv.tag != JC_STR || sepv.str[0] == 0) jc_fail(line, "\"split of\" needs a non-empty \"by\" text.");
    s = v.str; sep = sepv.str; seplen = strlen(sep);
    out = jc_list();
    at = s;
    while ((found = strstr(at, sep)) != 0) {
        jc_list_push(out, jc_strn(at, (size_t)(found - at)));
        at = found + seplen;
    }
    jc_list_push(out, jc_cstr(at));
    return out;
}
static JcVal jc_join(JcVal v, JcVal sepv, int line) {
    size_t i, total, seplen, pos;
    char *r;
    if (v.tag != JC_LIST) jc_fail(line, "\"join of\" needs a list.");
    if (sepv.tag != JC_STR) jc_fail(line, "\"join of\" needs a \"with\" text.");
    for (i = 0; i < v.list->len; i++)
        if (v.list->items[i].tag != JC_STR) jc_fail(line, "\"join of\" needs a list of text.");
    seplen = strlen(sepv.str);
    total = 0;
    for (i = 0; i < v.list->len; i++) {
        total += strlen(v.list->items[i].str);
        if (i) total += seplen;
    }
    r = (char *)jc_alloc(total + 1);
    pos = 0;
    for (i = 0; i < v.list->len; i++) {
        size_t n;
        if (i) { memcpy(r + pos, sepv.str, seplen); pos += seplen; }
        n = strlen(v.list->items[i].str);
        memcpy(r + pos, v.list->items[i].str, n); pos += n;
    }
    r[pos] = 0;
    { JcVal out = jc_none(); out.tag = JC_STR; out.str = r; return out; }
}
/* Unicode whitespace (the set Python's str.strip() removes): ASCII
   whitespace plus U+0085, U+00A0, U+1680, U+2000-U+200A, U+2028, U+2029,
   U+202F, U+205F, U+3000. Returns the char's byte length, or 0. */
static size_t jc_ws_len(const char *p) {
    unsigned char c = (unsigned char)p[0];
    if (c < 0x80) return (c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == '\v') ? 1 : 0;
    if (c == 0xC2 && ((unsigned char)p[1] == 0x85 || (unsigned char)p[1] == 0xA0)) return 2;
    if (c == 0xE1 && (unsigned char)p[1] == 0x9A && (unsigned char)p[2] == 0x80) return 3;
    if (c == 0xE2 && (unsigned char)p[1] == 0x80 &&
        (unsigned char)p[2] >= 0x80 && (unsigned char)p[2] <= 0x8A) return 3;
    if (c == 0xE2 && (unsigned char)p[1] == 0x80 && (unsigned char)p[2] == 0xAF) return 3;
    if (c == 0xE2 && (unsigned char)p[1] == 0x81 && (unsigned char)p[2] == 0x9F) return 3;
    if (c == 0xE3 && (unsigned char)p[1] == 0x80 && (unsigned char)p[2] == 0x80) return 3;
    return 0;
}
static int jc_is_ws_at(const char *p) { return jc_ws_len(p) != 0; }
static JcVal jc_trim(JcVal v, int line) {
    const char *s, *e, *start;
    size_t w;
    if (v.tag != JC_STR) jc_fail(line, "\"trim of\" needs text.");
    s = v.str;
    while (*s && (w = jc_ws_len(s)) != 0) s += w;
    start = s;
    e = v.str + strlen(v.str);
    while (e > start) {
        const char *q = e - 1;
        while (q > start && ((unsigned char)*q & 0xC0) == 0x80) q--;
        if (!jc_is_ws_at(q)) break;
        e = q;
    }
    return jc_strn(start, (size_t)(e - start));
}
static JcVal jc_characters(JcVal v, int line) {
    size_t i = 0;
    JcVal out;
    if (v.tag != JC_STR) jc_fail(line, "\"characters of\" needs text.");
    out = jc_list();
    while (v.str[i]) {
        size_t nxt = i; jc_utf8_next(v.str, &nxt);
        jc_list_push(out, jc_strn(v.str + i, nxt - i));
        i = nxt;
    }
    return out;
}
static JcVal jc_text_of(JcVal v) { return jc_cstr(jc_show_str(v)); }
static JcVal jc_kind_of(JcVal v) { return jc_cstr(jc_kind(v)); }

/* ---------------- files: same current-folder sandbox as the interpreter - */
static char *jc_safe_path(const char *text, int line, const char *verb) {
    const char *p = text;
    char cwd[4096], *abs;
    size_t n;
    while (*p) {
        const char *s;
        while (*p == '/') p++;
        s = p;
        while (*p && *p != '/') p++;
        if (p - s == 2 && s[0] == '.' && s[1] == '.') {
            char msg[512];
            snprintf(msg, sizeof msg, "I cannot %s \"%s\": it leaves the current folder.", verb, text);
            jc_fail(line, msg);
        }
    }
    if (!getcwd(cwd, sizeof cwd)) jc_fail(line, "I cannot work out the current folder.");
    n = strlen(cwd);
    if (text[0] == '/') {
        if (!(strncmp(text, cwd, n) == 0 && (text[n] == '/' || text[n] == 0))) {
            char msg[512];
            snprintf(msg, sizeof msg, "I cannot %s \"%s\": it leaves the current folder.", verb, text);
            jc_fail(line, msg);
        }
        abs = jc_dup(text, strlen(text));
    } else {
        abs = (char *)jc_alloc(n + 1 + strlen(text) + 1);
        sprintf(abs, "%s/%s", cwd, text);
    }
    return abs;
}
static JcVal jc_read_file(JcVal pathv, int line) {
    const char *text = pathv.tag == JC_STR ? pathv.str : jc_show_str(pathv);
    char *abs = jc_safe_path(text, line, "read");
    struct stat st;
    FILE *f;
    long size;
    char *buf;
    if (stat(abs, &st) == 0 && S_ISDIR(st.st_mode)) {
        char msg[512];
        snprintf(msg, sizeof msg, "\"%s\" is a folder, not a file.", text);
        jc_fail(line, msg);
    }
    f = fopen(abs, "rb");
    if (!f) {
        char msg[512];
        snprintf(msg, sizeof msg, "I could not find the file \"%s\".", text);
        jc_fail(line, msg);
    }
    fseek(f, 0, SEEK_END);
    size = ftell(f);
    fseek(f, 0, SEEK_SET);
    buf = (char *)jc_alloc((size_t)(size < 0 ? 0 : size) + 1);
    if (size > 0 && fread(buf, 1, (size_t)size, f) != (size_t)size) {
        char msg[512];
        snprintf(msg, sizeof msg, "I could not read the file \"%s\".", text);
        fclose(f);
        jc_fail(line, msg);
    }
    buf[size < 0 ? 0 : size] = 0;
    fclose(f);
    { JcVal v = jc_none(); v.tag = JC_STR; v.str = buf; return v; }
}
static void jc_write_file(JcVal value, JcVal pathv, int append, int line) {
    const char *text = pathv.tag == JC_STR ? pathv.str : jc_show_str(pathv);
    char *abs = jc_safe_path(text, line, "write to");
    struct stat st;
    FILE *f;
    const char *content = jc_show_str(value);
    if (stat(abs, &st) == 0 && S_ISDIR(st.st_mode)) {
        char msg[512];
        snprintf(msg, sizeof msg, "\"%s\" is a folder, not a file.", text);
        jc_fail(line, msg);
    }
    f = fopen(abs, append ? "ab" : "wb");
    if (!f) {
        char msg[512];
        snprintf(msg, sizeof msg, "I could not write \"%s\": its folder does not exist.", text);
        jc_fail(line, msg);
    }
    fwrite(content, 1, strlen(content), f);
    fclose(f);
}
/* The write path is safety-checked BEFORE the value is evaluated,
   exactly like the interpreter. jc_write_file checks again inside;
   the check is idempotent. */
static void jc_write_path_check(JcVal pathv, int line) {
    const char *text = pathv.tag == JC_STR ? pathv.str : jc_show_str(pathv);
    (void)jc_safe_path(text, line, "write to");
}

/* ---------------- asking ---------------- */
static JcVal jc_ask(JcVal promptv, int line) {
    size_t cap = 128, len = 0;
    char *buf;
    int c;
    if (promptv.tag != JC_STR) jc_fail(line, "the question I ask must be text.");
    printf("%s", promptv.str);
    fflush(stdout);
    buf = (char *)malloc(cap);
    if (!buf) jc_fail(0, "I ran out of memory.");
    while ((c = getchar()) != EOF && c != '\n') {
        if (len + 1 >= cap) {
            cap *= 2;
            buf = (char *)realloc(buf, cap);
            if (!buf) jc_fail(0, "I ran out of memory.");
        }
        buf[len++] = (char)c;
    }
    if (c == EOF && len == 0) { free(buf); jc_fail(line, "I asked a question, but the input ended."); }
    buf[len] = 0;
    { JcVal v = jc_strn(buf, len); free(buf); return v; }
}
static void jc_fail_with(JcVal v, int line) {
    if (v.tag != JC_STR) jc_fail(line, "\"fail with\" needs some text to say.");
    printf("%s\n", v.str);
    fflush(stdout);
    exit(1);
}
static long long jc_repeat_count(JcVal v, int line) {
    if (v.tag == JC_BOOL || v.tag != JC_NUM) jc_fail(line, "\"repeat\" needs a number of times.");
    if (floor(v.num) != v.num) jc_fail(line, "\"repeat\" needs a whole number of times.");
    if (v.num > 2000000.0) return 1000001;
    {
        long long c = (long long)v.num;
        if (c < 0) jc_fail(line, "\"repeat\" needs zero or more times.");
        return c;
    }
}
static int jc_depth = 0;
"""
# ---------------------------------------------------------------------------
# Runtime part 4: difflib close match, function values, dynamic calls.
# ---------------------------------------------------------------------------
C_RUNTIME4 = r"""
/* difflib.SequenceMatcher ratio, faithful enough to agree with Python on
   the best candidate. Only the argmax over one frame chain is needed. */
static double jc_seq_ratio(const char *a, const char *b) {
    size_t la = strlen(a), lb = strlen(b), matches = 0;
    size_t total = la + lb;
    if (total == 0) return 1.0;
    /* Matching blocks via find_longest_match, like difflib. */
    {
        typedef struct { size_t alo, ahi, blo, bhi; } Seg;
        Seg stack[256];
        int sp = 0;
        stack[sp++] = (Seg){0, la, 0, lb};
        while (sp > 0) {
            Seg s = stack[--sp];
            size_t alo = s.alo, ahi = s.ahi, blo = s.blo, bhi = s.bhi;
            size_t besti = alo, bestj = blo, bestsize = 0;
            size_t i2, j2, k;
            for (i2 = alo; i2 < ahi; i2++) {
                unsigned char c = (unsigned char)a[i2];
                for (j2 = blo; j2 < bhi; j2++) if ((unsigned char)b[j2] == c) {
                    k = 1;
                    while (i2 + k < ahi && j2 + k < bhi && a[i2 + k] == b[j2 + k]) k++;
                    if (k > bestsize) { besti = i2; bestj = j2; bestsize = k; }
                }
            }
            if (bestsize == 0) continue;
            matches += bestsize;
            if (sp + 2 < 256) {
                if (alo < besti && blo < bestj) stack[sp++] = (Seg){alo, besti, blo, bestj};
                if (besti + bestsize < ahi && bestj + bestsize < bhi)
                    stack[sp++] = (Seg){besti + bestsize, ahi, bestj + bestsize, bhi};
            }
        }
    }
    return (2.0 * (double)matches) / (double)total;
}

/* The interpreter's suggest(): best candidate with ratio > 0.6, first in
   innermost-first order wins ties (strict > keeps the earliest). */
static const char *jc_close_match(const char *name, JcFrame *f) {
    JcFrame *g; size_t i;
    const char *best = 0;
    double bestr = 0.6;
    for (g = f; g; g = g->parent)
        for (i = 0; i < g->len; i++) {
            const char *c = g->binds[i].name;
            double r;
            if (strcmp(c, name) == 0) continue;
            r = jc_seq_ratio(name, c);
            if (r > bestr) { bestr = r; best = c; }
        }
    return best;
}

/* ---------------- function values and dynamic calls ---------------- */
static JcVal jc_dispatch(int idx, JcFrame *jc_defenv, int jc_call_line, int argc, JcVal *argv);

static JcVal jc_funcval(int idx, const char *name, int nparams, JcFrame *env) {
    JcVal v = jc_none();
    v.tag = JC_FUNC; v.func = idx; v.funcname = name;
    v.funcnparams = nparams; v.funcenv = env;
    return v;
}

/* A variable that names a zero-parameter function calls it, like the
   interpreter's eval_var. Returns the value (or the function itself). */
static JcVal jc_var(JcVal v, int line) {
    if (v.tag == JC_FUNC && v.funcnparams == 0)
        return jc_dispatch(v.func, v.funcenv, line, 0, 0);
    return v;
}

/* A bare name as a statement: unknown word, or a call with 0 arguments. */
static void jc_stmt_var(JcFrame *f, const char *name, int line) {
    JcVal v = jc_get(f, name, line);
    if (v.tag == JC_FUNC) {
        if (v.funcnparams != 0) {
            char m[256];
            snprintf(m, sizeof m, "\"%s\" needs %d %s, but you gave 0.",
                     name, v.funcnparams, v.funcnparams == 1 ? "input" : "inputs");
            jc_fail(line, m);
        }
        jc_dispatch(v.func, v.funcenv, line, 0, 0);
    }
}

/* A call expression with a dynamic target. The target is looked up and
   checked BEFORE the arguments are evaluated, exactly like the
   interpreter: `nosuchfn with (1 / 0)` reports the bad name, not the
   division. */
static JcVal jc_call_target(JcVal target, const char *name, int line, int argc) {
    if (target.tag != JC_FUNC) {
        char m[256];
        snprintf(m, sizeof m, "\"%s\" is not a function I can call.", name);
        jc_fail(line, m);
    }
    if (argc != target.funcnparams) {
        char m[256];
        snprintf(m, sizeof m, "\"%s\" needs %d %s, but you gave %d.", name,
                 target.funcnparams, target.funcnparams == 1 ? "input" : "inputs", argc);
        jc_fail(line, m);
    }
    return target;
}
/* Runs an already-checked call target with evaluated arguments. */
static JcVal jc_call_run(JcVal target, int line, int argc, ...) {
    JcVal *argv = 0;
    JcVal out;
    va_list ap;
    int i;
    if (argc > 0) {
        argv = (JcVal *)malloc((size_t)argc * sizeof(JcVal));
        if (!argv) jc_fail(line, "I ran out of memory.");
        va_start(ap, argc);
        for (i = 0; i < argc; i++) argv[i] = va_arg(ap, JcVal);
        va_end(ap);
    }
    out = jc_dispatch(target.func, target.funcenv, line, argc, argv);
    free(argv);
    return out;
}
"""
C_RUNTIME3 = r"""
#include <stdarg.h>
/* ---------------- small extras ---------------- */
static JcVal jc_concat(JcVal a, JcVal b) {
    size_t la = strlen(a.str), lb = strlen(b.str);
    char *r = (char *)jc_alloc(la + lb + 1);
    memcpy(r, a.str, la); memcpy(r + la, b.str, lb); r[la + lb] = 0;
    { JcVal v = jc_none(); v.tag = JC_STR; v.str = r; return v; }
}
static JcVal jc_listn(int n, ...) {
    va_list ap;
    int i;
    JcVal out = jc_list();
    va_start(ap, n);
    for (i = 0; i < n; i++) jc_list_push(out, va_arg(ap, JcVal));
    va_end(ap);
    return out;
}
"""


# ---------------------------------------------------------------------------
# Transpiler: Jesun.Code AST -> C
# ---------------------------------------------------------------------------

def _c_string(value: str) -> str:
    """A Python string as a safe C string literal (UTF-8, hex escapes)."""
    parts = []
    for byte in value.encode("utf-8"):
        if 32 <= byte < 127 and byte not in (34, 92):
            parts.append(chr(byte))
        else:
            parts.append("\\x%02x" % byte)
    return '"' + "".join(parts) + '"'


# Node types the transpiler refuses, with the exact plain-English reason.
def _unsupported_reason(node: object) -> str | None:
    J = jesun
    if isinstance(node, J.AskAi):
        return '"ask ai" needs a mind to talk to; native builds cannot use it yet.'
    if isinstance(node, (J.AgentDef, J.AskAgent, J.ForgetAgent)):
        return 'agents need a mind to talk to; native builds cannot use them yet.'
    if isinstance(node, (J.FleetDef, J.FleetAsk)):
        return 'fleets need minds to talk to; native builds cannot use them yet.'
    if isinstance(node, (J.TermOpen, J.TermSend, J.TermRead, J.TermClose)):
        return 'terminal control needs tmux; native builds cannot use it yet.'
    if isinstance(node, J.Import):
        return '"import from python" uses the python bridge; native builds cannot use it yet.'
    if isinstance(node, J.UsePkg):
        return '"use" downloads a package from the network; native builds cannot do that yet.'
    if isinstance(node, J.BringIn):
        return '"bring in" loads a package; native builds cannot do that yet.'
    if isinstance(node, (J.Attr, J.ForeignCall)):
        return 'python values cannot cross into native builds yet.'
    if isinstance(node, J.Builtin) and node.kind == "KEYS":
        return '"keys of" needs a python dictionary; native builds cannot use the python bridge.'
    return None


_STMT_TYPES = (
    jesun.Show, jesun.Assign, jesun.Ask, jesun.If, jesun.RepeatCount,
    jesun.RepeatWhile, jesun.ForEach, jesun.FuncDef, jesun.GiveBack,
    jesun.Stop, jesun.Skip, jesun.ExprStmt, jesun.Push, jesun.Fail,
    jesun.ReadFile, jesun.WriteFile,
)
_EXPR_TYPES = (
    jesun.BinOp, jesun.UnaryOp, jesun.Compare, jesun.Literal, jesun.Var,
    jesun.ListLit, jesun.Call, jesun.Builtin, jesun.Subscript, jesun.Interp,
)


def _walk(node: object):
    """Yield every AST node in the tree."""
    seen = set()

    def rec(n: object):
        if n is None or id(n) in seen:
            return
        if isinstance(n, (list, tuple)):
            for item in n:
                yield from rec(item)
            return
        if not hasattr(n, "__dict__") and not hasattr(n, "__dataclass_fields__"):
            return
        seen.add(id(n))
        yield n
        fields = getattr(n, "__dataclass_fields__", None)
        if fields:
            for fname in fields:
                yield from rec(getattr(n, fname, None))
        elif hasattr(n, "__dict__"):
            for value in vars(n).values():
                yield from rec(value)

    yield from rec(node)


class _Ctx:
    def __init__(self, in_function: bool, loop_depth: int, frame: str):
        self.in_function = in_function
        self.loop_depth = loop_depth
        self.frame = frame


class Transpiler:
    def __init__(self) -> None:
        self.func_list: list[object] = []
        self.func_ids: dict[int, int] = {}
        self.fn_protos: list[str] = []
        self.fn_code: list[str] = []
        self.dispatch_code: list[str] = []
        self._uid = 0

    def _next(self, stem: str) -> str:
        self._uid += 1
        return f"jc_{stem}_{self._uid}"

    # -- driver ---------------------------------------------------------
    def transpile(self, source: str) -> str:
        try:
            program = jesun.Parser(jesun.tokenize(source)).parse_program()
        except RecursionError:
            raise BuildError(0, "the program nests too deep for me to read.")
        # JesunError from the parser (syntax errors) propagates with its line.
        self._collect_functions(program)
        self._reject_unsupported(program)
        for idx, fdef in enumerate(self.func_list):
            self._emit_function(idx, fdef)
        self._emit_dispatcher()
        body: list[str] = []
        ctx = _Ctx(in_function=False, loop_depth=0, frame="jc_f")
        for stmt in program:
            self._emit_stmt(stmt, body, ctx)
        parts = [
            "/* Generated by `jesun build`: Jesun.Code v1.1 native. */",
            C_RUNTIME, C_RUNTIME2, C_RUNTIME4, C_RUNTIME3,
            "\n".join(self.fn_protos),
            "\n".join(self.fn_code),
            "\n".join(self.dispatch_code),
            "int main(int argc, char **argv) {",
            "    jc_arena_init();",
            "    int jc_line = 0;",
            "    JcFrame *jc_f = jc_frame_new(0);",
            "    JcVal jc_argv = jc_list();",
            "    for (int i = 1; i < argc; i++) jc_list_push(jc_argv, jc_cstr(argv[i]));",
            '    jc_set(jc_f, "arguments", jc_argv);',
        ]
        parts.extend("    " + line for line in body)
        parts.append("    return 0;")
        parts.append("}")
        return "\n".join(parts) + "\n"

    def _collect_functions(self, program: list) -> None:
        # Every function definition, nested or not, gets its own index in
        # walk order. Like the interpreter, a definition binds a function
        # value capturing the frame where it was defined.
        for node in _walk(program):
            if isinstance(node, jesun.FuncDef) and id(node) not in self.func_ids:
                self.func_ids[id(node)] = len(self.func_list)
                self.func_list.append(node)
        for idx, fdef in enumerate(self.func_list):
            params = ", ".join(f"JcVal jc_a{i}" for i in range(len(fdef.params)))
            tail = f", {params}" if params else ""
            self.fn_protos.append(
                f"static JcVal jc_fn_{idx}(JcFrame *jc_defenv, int jc_call_line{tail});"
            )

    def _emit_dispatcher(self) -> None:
        self.dispatch_code.append(
            "static JcVal jc_dispatch(int idx, JcFrame *jc_defenv, int jc_call_line, int argc, JcVal *argv) {"
        )
        self.dispatch_code.append("    (void)argc;")
        self.dispatch_code.append("    switch (idx) {")
        for idx, fdef in enumerate(self.func_list):
            args = ", ".join(f"argv[{i}]" for i in range(len(fdef.params)))
            tail = f", {args}" if args else ""
            self.dispatch_code.append(f"    case {idx}: return jc_fn_{idx}(jc_defenv, jc_call_line{tail});")
        self.dispatch_code.append("    }")
        self.dispatch_code.append('    jc_fail(jc_call_line, "I lost track of that function.");')
        self.dispatch_code.append("    return jc_none();")
        self.dispatch_code.append("}")

    def _reject_unsupported(self, program: list) -> None:
        for node in _walk(program):
            reason = _unsupported_reason(node)
            if reason is not None:
                raise BuildError(getattr(node, "line", 0), reason)
        # Unknown node types: anything not in the supported sets.
        for node in _walk(program):
            if isinstance(node, _STMT_TYPES + _EXPR_TYPES + (jesun.FuncDef,)):
                continue
            if isinstance(node, tuple):
                continue
            raise BuildError(
                getattr(node, "line", 0),
                "I do not know how to build this natively yet.",
            )

    # -- statements -----------------------------------------------------
    def _emit_block(self, stmts: list, out: list[str], ctx: _Ctx) -> None:
        for stmt in stmts:
            self._emit_stmt(stmt, out, ctx)

    def _emit_stmt(self, stmt: object, out: list[str], ctx: _Ctx) -> None:
        # Evaluation order matches the interpreter exactly. Every
        # composite expression is split by _expr into (pre, cexpr): pre
        # is C statements that run first, in order, and cexpr is a
        # side-effect-free JcVal expression over the temps pre made.
        # (C does not sequence function arguments, so nesting calls
        # directly would evaluate sub-expressions in an unspecified
        # order and could report the wrong error first.)
        J = jesun
        line = getattr(stmt, "line", 0)
        frame = ctx.frame
        if isinstance(stmt, J.Show):
            pre, ce = self._expr(stmt.expr, ctx)
            out.append(f"jc_line = {line};")
            out.extend(pre)
            out.append(f"jc_show({ce});")
        elif isinstance(stmt, J.Assign):
            pre, ce = self._expr(stmt.expr, ctx)
            out.append(f"jc_line = {line};")
            out.extend(pre)
            out.append(f'jc_set({frame}, "{stmt.name}", {ce});')
        elif isinstance(stmt, J.Ask):
            pre, ce = self._expr(stmt.prompt, ctx)
            t = self._next("v")
            out.append(f"jc_line = {line};")
            out.extend(pre)
            out.append(f"JcVal {t} = {ce};")
            out.append(f'jc_set({frame}, "{stmt.name}", jc_ask({t}, jc_line));')
        elif isinstance(stmt, J.If):
            # Nested if/else (not else-if): each condition's
            # pre-statements run only when the earlier branches failed,
            # exactly like the interpreter.
            out.append(f"jc_line = {line};")
            branches = list(stmt.branches)

            def emit_branch(i: int) -> None:
                if i < len(branches):
                    cond, body = branches[i]
                    pre, cc = self._expr(cond, ctx)
                    out.extend(pre)
                    out.append(f"if (jc_truthy({cc})) {{")
                    self._emit_block(body, out, ctx)
                    out.append("} else {")
                    emit_branch(i + 1)
                    out.append("}")
                else:
                    self._emit_block(stmt.else_body, out, ctx)

            emit_branch(0)
        elif isinstance(stmt, J.RepeatCount):
            n, c, j = self._next("n"), self._next("c"), self._next("j")
            inner = _Ctx(ctx.in_function, ctx.loop_depth + 1, frame)
            pre, ce = self._expr(stmt.count, ctx)
            out.append(f"jc_line = {line};")
            out.extend(pre)
            out.append("{")
            out.append(f"    int jc_l_{c} = {line};")
            out.append(f"    long long {n} = jc_repeat_count({ce}, jc_l_{c});")
            out.append(f"    JcCtl *{c} = jc_ctl_push(jc_l_{c});")
            out.append(f"    int {j} = setjmp({c}->buf);")
            out.append(f"    if ({j} != 1) {{")
            out.append(f"        while ({c}->idx < {n}) {{")
            out.append(f"            {c}->idx++;")
            out.append(f'            if ({c}->idx > 1000000) jc_fail(jc_l_{c}, "this loop ran a million times; I stopped it.");')
            sub: list[str] = []
            self._emit_block(stmt.body, sub, inner)
            out.extend("            " + s for s in sub)
            out.append("        }")
            out.append("    }")
            # stop may have unwound function frames: restore the call depth
            # the loop saw, like the interpreter's try/finally.
            out.append(f"    jc_depth = {c}->depth;")
            out.append("    jc_ctl_pop();")
            out.append("}")
        elif isinstance(stmt, J.RepeatWhile):
            c, j = self._next("c"), self._next("j")
            inner = _Ctx(ctx.in_function, ctx.loop_depth + 1, frame)
            pre_c, cc = self._expr(stmt.cond, ctx)
            out.append(f"jc_line = {line};")
            out.append("{")
            out.append(f"    int jc_l_{c} = {line};")
            out.append(f"    JcCtl *{c} = jc_ctl_push(jc_l_{c});")
            out.append(f"    int {j} = setjmp({c}->buf);")
            out.append(f"    if ({j} != 1) {{")
            out.append("        for (;;) {")
            # The condition (and its pre-statements) re-runs every
            # iteration, like the interpreter. The line is reset first:
            # the body may have moved jc_line elsewhere.
            out.append(f"            jc_line = jc_l_{c};")
            for s in pre_c:
                out.append("            " + s)
            out.append(f"            if (!jc_truthy({cc})) break;")
            out.append(f"            if (++{c}->runs > 1000000) jc_fail(jc_l_{c}, \"this loop ran a million times; I stopped it.\");")
            sub = []
            self._emit_block(stmt.body, sub, inner)
            out.extend("            " + s for s in sub)
            out.append("        }")
            out.append("    }")
            # stop may have unwound function frames: restore the call depth
            # the loop saw, like the interpreter's try/finally.
            out.append(f"    jc_depth = {c}->depth;")
            out.append("    jc_ctl_pop();")
            out.append("}")
        elif isinstance(stmt, J.ForEach):
            it, c, j = self._next("it"), self._next("c"), self._next("j")
            inner = _Ctx(ctx.in_function, ctx.loop_depth + 1, frame)
            pre, ce = self._expr(stmt.iterable, ctx)
            out.append(f"jc_line = {line};")
            out.extend(pre)
            out.append("{")
            out.append(f"    JcVal {it} = {ce};")
            out.append(f"    int jc_l_{c} = {line};")
            out.append(f'    if ({it}.tag != JC_LIST) jc_fail(jc_l_{c}, "I can only loop over a list.");')
            out.append(f"    JcCtl *{c} = jc_ctl_push(jc_l_{c});")
            out.append(f"    int {j} = setjmp({c}->buf);")
            out.append(f"    if ({j} != 1) {{")
            out.append(f"        while ({c}->idx < (long long){it}.list->len) {{")
            out.append(f'            jc_set({frame}, "{stmt.var}", {it}.list->items[{c}->idx]);')
            out.append(f"            {c}->idx++;")
            sub = []
            self._emit_block(stmt.body, sub, inner)
            out.extend("            " + s for s in sub)
            out.append("        }")
            out.append("    }")
            # stop may have unwound function frames: restore the call depth
            # the loop saw, like the interpreter's try/finally.
            out.append(f"    jc_depth = {c}->depth;")
            out.append("    jc_ctl_pop();")
            out.append("}")
        elif isinstance(stmt, J.GiveBack):
            if not ctx.in_function:
                raise BuildError(line, '"give back" only makes sense inside a function.')
            # Depth is decremented AFTER the value is computed, so a
            # recursive call inside the returned expression still counts.
            # The loop-control depth is restored too: a `give back`
            # inside a loop abandons the loop, and its control entry must
            # not stay live, or a later `stop` would longjmp into a dead
            # frame.
            pre, ce = self._expr(stmt.expr, ctx)
            ret = self._next("ret")
            out.append(f"jc_line = {line};")
            out.extend(pre)
            out.append(f"{{ JcVal {ret} = {ce}; jc_ctl_depth = jc_ctl_saved; --jc_depth; return {ret}; }}")
        elif isinstance(stmt, J.Stop):
            # Dynamic: unwinds to the innermost enclosing loop, even through
            # function calls, exactly like the interpreter. Outside a loop
            # it fails at runtime with the interpreter's message.
            out.append(f"jc_line = {line};")
            out.append("if (jc_ctl_depth == 0) jc_fail(jc_line, \"\\\"stop\\\" only makes sense inside a loop.\");")
            out.append("longjmp(jc_ctl_stack[jc_ctl_depth - 1].buf, 1);")
        elif isinstance(stmt, J.Skip):
            out.append(f"jc_line = {line};")
            out.append("if (jc_ctl_depth == 0) jc_fail(jc_line, \"\\\"skip\\\" only makes sense inside a loop.\");")
            out.append("longjmp(jc_ctl_stack[jc_ctl_depth - 1].buf, 2);")
        elif isinstance(stmt, J.ExprStmt):
            out.append(f"jc_line = {line};")
            if isinstance(stmt.expr, J.Var):
                # A bare name: unknown word, a call, or an arity error,
                # like the interpreter's expression-statement rule.
                out.append(f'jc_stmt_var({frame}, "{stmt.expr.name}", jc_line);')
            else:
                pre, ce = self._expr(stmt.expr, ctx)
                out.extend(pre)
                out.append(f"(void){ce};")
        elif isinstance(stmt, J.FuncDef):
            # Binds a function value capturing the current frame, so nested
            # definitions close over their definition site like the interpreter.
            idx = self.func_ids[id(stmt)]
            out.append(f"jc_line = {line};")
            out.append(
                f'jc_set({frame}, "{stmt.name}", '
                f"jc_funcval({idx}, \"{stmt.name}\", {len(stmt.params)}, {frame}));"
            )
        elif isinstance(stmt, J.Push):
            # The interpreter looks the target up and checks it BEFORE
            # evaluating the pushed value; keep that order.
            t_target, t_val = self._next("v"), self._next("v")
            pre_v, cv = self._expr(stmt.expr, ctx)
            out.append(f"jc_line = {line};")
            out.append(f'JcVal {t_target} = jc_push_target(jc_get({frame}, "{stmt.name}", jc_line), "{stmt.name}", jc_line);')
            out.extend(pre_v)
            out.append(f"JcVal {t_val} = {cv};")
            out.append(f'jc_push({t_target}, "{stmt.name}", {t_val}, jc_line);')
        elif isinstance(stmt, J.Fail):
            pre, ce = self._expr(stmt.expr, ctx)
            out.append(f"jc_line = {line};")
            out.extend(pre)
            out.append(f"jc_fail_with({ce}, jc_line);")
        elif isinstance(stmt, J.ReadFile):
            pre, ce = self._expr(stmt.path, ctx)
            t = self._next("v")
            out.append(f"jc_line = {line};")
            out.extend(pre)
            out.append(f"JcVal {t} = {ce};")
            out.append(f'jc_set({frame}, "{stmt.name}", jc_read_file({t}, jc_line));')
        elif isinstance(stmt, J.WriteFile):
            # The interpreter evaluates the path, safety-checks it, and
            # only then evaluates the value; keep that order.
            pre_p, cp = self._expr(stmt.path, ctx)
            pre_v, cv = self._expr(stmt.value, ctx)
            t_p, t_v = self._next("v"), self._next("v")
            out.append(f"jc_line = {line};")
            out.extend(pre_p)
            out.append(f"JcVal {t_p} = {cp};")
            out.append(f"jc_write_path_check({t_p}, jc_line);")
            out.extend(pre_v)
            out.append(f"JcVal {t_v} = {cv};")
            out.append(f"jc_write_file({t_v}, {t_p}, {1 if stmt.append else 0}, jc_line);")
        else:
            raise BuildError(line, "I do not know how to build this natively yet.")


    def _emit_function(self, idx: int, fdef: object) -> None:
        params = ", ".join(f"JcVal jc_a{i}" for i in range(len(fdef.params)))
        tail = f", {params}" if params else ""
        self.fn_code.append(f"static JcVal jc_fn_{idx}(JcFrame *jc_defenv, int jc_call_line{tail}) {{")
        self.fn_code.append(
            '    if (++jc_depth > 100) jc_fail(jc_call_line, '
            '"the functions are calling each other too deep; I stopped before falling over.");'
        )
        self.fn_code.append("    int jc_line = 0;")
        # A `give back` inside a loop abandons the loop without popping
        # its control entry. Restore the loop-control depth on every
        # return, or a later `stop` would longjmp into a dead frame.
        self.fn_code.append("    int jc_ctl_saved = jc_ctl_depth;")
        # Lexical scope: the frame captured where this function was defined.
        self.fn_code.append("    JcFrame *jc_f = jc_frame_new(jc_defenv);")
        for i, pname in enumerate(fdef.params):
            self.fn_code.append(f'    jc_set(jc_f, "{pname}", jc_a{i});')
        ctx = _Ctx(in_function=True, loop_depth=0, frame="jc_f")
        body: list[str] = []
        self._emit_block(fdef.body, body, ctx)
        for bl in body:
            self.fn_code.append("    " + bl)
        self.fn_code.append("    jc_ctl_depth = jc_ctl_saved;")
        self.fn_code.append("    --jc_depth;")
        self.fn_code.append("    return jc_none();")
        self.fn_code.append("}")


    # -- expressions ----------------------------------------------------
    # _expr returns (pre, cexpr). pre: C statements to run first, in
    # order. cexpr: a side-effect-free JcVal expression over the temps
    # pre made. This keeps evaluation order (and error precedence)
    # identical to the interpreter: left to right, conditions before
    # bodies, targets before arguments.
    def _expr(self, expr: object, ctx: _Ctx) -> tuple[list[str], str]:
        J = jesun
        frame = ctx.frame
        if isinstance(expr, J.Literal):
            v = expr.value
            if isinstance(v, bool):
                return [], f"jc_bool({1 if v else 0})"
            if v is None:
                return [], "jc_none()"
            if isinstance(v, int):
                # A C integer literal overflows past 2**63 (1e20 becomes
                # 1e20 mod 2**64), so big ints go out as double literals.
                # 1e20 is exactly representable as a double, and the
                # printer renders whole-valued doubles as full digits.
                if -(2**63) <= v <= 2**63 - 1:
                    return [], f"jc_num({v})"
                return [], f"jc_num({float(v)!r})"
            if isinstance(v, float):
                return [], f"jc_num({v!r})"
            if isinstance(v, str):
                return [], f"jc_cstr({_c_string(v)})"
            raise BuildError(expr.line, "I do not know how to build this value natively yet.")
        if isinstance(expr, J.Var):
            # A variable naming a zero-parameter function calls it, like
            # the interpreter's eval_var. The call is a side effect, so it
            # lives in pre, sequenced like everything else.
            t = self._next("v")
            return [f'JcVal {t} = jc_var(jc_get({frame}, "{expr.name}", jc_line), jc_line);'], t
        if isinstance(expr, J.BinOp):
            return self._binop(expr, ctx)
        if isinstance(expr, J.UnaryOp):
            pre, a = self._expr(expr.operand, ctx)
            t = self._next("v")
            pre = pre + [f"JcVal {t} = {a};"]
            if expr.op == "MINUS":
                return pre, f"jc_neg({t}, jc_line)"
            if expr.op == "NOT":
                return pre, f"jc_bool(!jc_truthy({t}))"
            raise BuildError(expr.line, "I do not know how to build this natively yet.")
        if isinstance(expr, J.Compare):
            pre1, a = self._expr(expr.left, ctx)
            pre2, b = self._expr(expr.right, ctx)
            t1, t2 = self._next("v"), self._next("v")
            pre = pre1 + [f"JcVal {t1} = {a};"] + pre2 + [f"JcVal {t2} = {b};"]
            op = expr.op
            if op == "EQ":
                return pre, f"jc_bool(jc_equal({t1}, {t2}))"
            if op == "NEQ":
                return pre, f"jc_bool(!jc_equal({t1}, {t2}))"
            if op == "GT":
                return pre, f"jc_cmp({t1}, {t2}, jc_line, 0)"
            if op == "LT":
                return pre, f"jc_cmp({t1}, {t2}, jc_line, 1)"
            if op == "GTE":
                return pre, f"jc_cmp({t1}, {t2}, jc_line, 2)"
            if op == "LTE":
                return pre, f"jc_cmp({t1}, {t2}, jc_line, 3)"
            if op == "CONTAINS":
                return pre, f"jc_contains({t1}, {t2}, jc_line)"
            raise BuildError(expr.line, "I do not know how to build this natively yet.")
        if isinstance(expr, J.ListLit):
            pre: list[str] = []
            temps = []
            for item in expr.items:
                pi, ci = self._expr(item, ctx)
                t = self._next("v")
                pre.extend(pi)
                pre.append(f"JcVal {t} = {ci};")
                temps.append(t)
            return pre, f"jc_listn({len(temps)}{', ' + ', '.join(temps) if temps else ''})"
        if isinstance(expr, J.Call):
            # The interpreter looks the target up and checks it BEFORE
            # evaluating the arguments; keep that order.
            tf = self._next("v")
            pre = [
                f'JcVal {tf} = jc_call_target(jc_get({frame}, "{expr.name}", {expr.line}), '
                f'"{expr.name}", {expr.line}, {len(expr.args)});'
            ]
            temps = []
            for arg in expr.args:
                pa, ca = self._expr(arg, ctx)
                t = self._next("v")
                pre.extend(pa)
                pre.append(f"JcVal {t} = {ca};")
                temps.append(t)
            tr = self._next("v")
            tail = "".join(f", {t}" for t in temps)
            pre.append(f"JcVal {tr} = jc_call_run({tf}, {expr.line}, {len(temps)}{tail});")
            return pre, tr
        if isinstance(expr, J.Builtin):
            return self._builtin(expr, ctx)
        if isinstance(expr, J.Subscript):
            pre1, a = self._expr(expr.obj, ctx)
            pre2, b = self._expr(expr.index, ctx)
            t1, t2 = self._next("v"), self._next("v")
            pre = pre1 + [f"JcVal {t1} = {a};"] + pre2 + [f"JcVal {t2} = {b};"]
            return pre, f"jc_index({t1}, {t2}, jc_line)"
        if isinstance(expr, J.Interp):
            pre = []
            temps = []
            for kind, part in expr.parts:
                if kind == "text":
                    t = self._next("v")
                    pre.append(f"JcVal {t} = jc_cstr({_c_string(part)});")
                else:
                    pp, cp = self._expr(part, ctx)
                    t = self._next("v")
                    pre.extend(pp)
                    pre.append(f"JcVal {t} = jc_text_of({cp});")
                temps.append(t)
            if not temps:
                return [], 'jc_cstr("")'
            out = temps[0]
            for t in temps[1:]:
                out = f"jc_concat({out}, {t})"
            return pre, out
        raise BuildError(
            getattr(expr, "line", 0), "I do not know how to build this natively yet."
        )

    def _binop(self, expr: object, ctx: _Ctx) -> tuple[list[str], str]:
        J = jesun
        op = expr.op
        pre1, a = self._expr(expr.left, ctx)
        t1 = self._next("v")
        pre = pre1 + [f"JcVal {t1} = {a};"]
        if op in ("AND", "OR"):
            # Short-circuit like the interpreter: the right side (and
            # its pre-statements) runs only when the left side decides
            # it. The right side's temps live inside the branch; only
            # the int result escapes it.
            pre2, b = self._expr(expr.right, ctx)
            t2, r = self._next("v"), self._next("r")
            pre = pre + [f"int {r} = jc_truthy({t1});"]
            inner = pre2 + [f"JcVal {t2} = {b};", f"{r} = jc_truthy({t2});"]
            if op == "AND":
                pre.append(f"if ({r}) {{")
            else:
                pre.append(f"if (!{r}) {{")
            pre.extend("    " + s for s in inner)
            pre.append("}")
            return pre, f"jc_bool({r})"
        pre2, b = self._expr(expr.right, ctx)
        t2 = self._next("v")
        pre = pre + pre2 + [f"JcVal {t2} = {b};"]
        if op == "PLUS":
            return pre, f"jc_add({t1}, {t2}, jc_line)"
        if op == "MINUS":
            return pre, f"jc_sub({t1}, {t2}, jc_line)"
        if op == "STAR":
            return pre, f"jc_mul({t1}, {t2}, jc_line)"
        if op == "SLASH":
            return pre, f"jc_div({t1}, {t2}, jc_line)"
        if op == "PERCENT":
            return pre, f"jc_mod({t1}, {t2}, jc_line)"
        raise BuildError(expr.line, "I do not know how to build this natively yet.")

    def _builtin(self, expr: object, ctx: _Ctx) -> tuple[list[str], str]:
        kind = expr.kind
        pre, val = self._expr(expr.operand, ctx)
        t = self._next("v")
        pre = pre + [f"JcVal {t} = {val};"]
        if kind in ("SPLIT", "JOIN"):
            # The separator is evaluated AFTER the operand, like the
            # interpreter.
            pre_s, cs = self._expr(expr.sep, ctx) if expr.sep is not None else ([], "jc_none()")
            ts = self._next("v")
            pre = pre + pre_s + [f"JcVal {ts} = {cs};"]
        if kind == "LENGTH":
            return pre, f"jc_length({t}, jc_line)"
        if kind == "FIRST":
            return pre, f"jc_first({t}, jc_line)"
        if kind == "LAST":
            return pre, f"jc_last({t}, jc_line)"
        if kind == "UPPERCASE":
            return pre, f"jc_case({t}, jc_line, 1)"
        if kind == "LOWERCASE":
            return pre, f"jc_case({t}, jc_line, 0)"
        if kind == "SPLIT":
            return pre, f"jc_split({t}, {ts}, jc_line)"
        if kind == "JOIN":
            return pre, f"jc_join({t}, {ts}, jc_line)"
        if kind == "TRIM":
            return pre, f"jc_trim({t}, jc_line)"
        if kind == "CHARACTERS":
            return pre, f"jc_characters({t}, jc_line)"
        if kind == "TEXT":
            return pre, f"jc_text_of({t})"
        if kind == "KIND":
            return pre, f"jc_kind_of({t})"
        raise BuildError(expr.line, "I do not know how to build this natively yet.")



def transpile_source(source: str) -> str:
    """Transpile Jesun.Code source to C. Raises JesunError/BuildError."""
    return Transpiler().transpile(source)


# ---------------------------------------------------------------------------
# Build driver: transpile -> cc -> native binary
# ---------------------------------------------------------------------------

def build_file(src_path: str, out_path: str | None = None, keep_c: bool = False) -> int:
    src = Path(src_path)
    try:
        source = src.read_text(encoding="utf-8")
    except OSError:
        print(f'I could not open "{src_path}".')
        return 1
    try:
        code = transpile_source(source)
    except JesunError as err:
        print(err)
        return 1
    out = Path(out_path) if out_path else Path(src.stem if src.suffix else src.name)
    cc = shutil.which("cc")
    if cc is None:
        print(
            f'I could not build "{src_path}": I need a C compiler named "cc", '
            "and I could not find one."
        )
        return 1
    c_path = out.parent / (out.name + ".c")
    try:
        c_path.write_text(code, encoding="utf-8")
    except OSError:
        print(f'I could not write the C file for "{src_path}".')
        return 1
    try:
        proc = subprocess.run(
            [cc, "-O2", "-o", str(out), str(c_path), "-lm"],
            capture_output=True, text=True, timeout=180,
        )
    except subprocess.TimeoutExpired:
        print(f'I could not build "{src_path}": the C compiler took too long.')
        return 1
    except OSError:
        print(f'I could not build "{src_path}": the C compiler would not run.')
        return 1
    if proc.returncode != 0:
        print(f'I could not build "{src_path}": the C compiler reported an error.')
        return 1
    if not keep_c:
        try:
            c_path.unlink()
        except OSError:
            pass
    print(f"Built {out} from {src_path}.")
    return 0


def build_command(argv: list[str]) -> int:
    """CLI entry: jesun build <file.jc> [-o <name>] [--keep-c]."""
    src = None
    out = None
    keep_c = False
    i = 0
    usage = "Usage: jesun build <file.jc> [-o <name>] [--keep-c]"
    while i < len(argv):
        arg = argv[i]
        if arg == "-o" and i + 1 < len(argv):
            out = argv[i + 1]
            i += 2
        elif arg == "--keep-c":
            keep_c = True
            i += 1
        elif src is None and not arg.startswith("-"):
            src = arg
            i += 1
        else:
            print(f'I did not understand "{arg}". {usage}')
            return 1
    if src is None:
        print(usage)
        return 1
    return build_file(src, out, keep_c)
