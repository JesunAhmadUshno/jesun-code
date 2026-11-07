# Jesun.Code core grammar (v0.1 subset, EBNF)

Extracted by reading the recursive-descent `Parser` in `jesun.py`
(`parse_statement` down to `parse_primary`) at v2.0.0. It covers the v0.1
core only: variables, `show`, `ask`, decisions, loops, functions, lists.
Later statements (agents, fleets, files, packages, tables, the Python
bridge, terminals) are left out; the per-version specs in `docs/` remain
the reference for them. Where this file and the parser disagree, the
parser wins and this file is wrong.

The lexer turns indentation into `INDENT` / `DEDENT` tokens, like Python,
and `note` starts a comment to the end of the line.

```ebnf
program     = { statement } EOF ;
block       = INDENT statement { statement } DEDENT ;

statement   = show | ask | if | repeat | foreach | funcdef | giveback
            | "stop" NL | "skip" NL | assign | expr NL ;

show        = "show" expr NL ;
ask         = "ask" expr "giving" NAME NL ;
assign      = NAME "is" expr NL ;            (* chosen when NAME is followed by "is" *)
if          = "if" expr "then" NL block
              { "otherwise" "if" expr "then" NL block }
              [ "otherwise" NL block ] ;
repeat      = "repeat" "while" expr NL block
            | "repeat" expr "times" NL block ;
foreach     = "for" "each" NAME "in" expr NL block ;
funcdef     = "to" NAME [ "with" NAME { "and" NAME } ] NL block ;
giveback    = "give" "back" expr NL ;

expr        = and_expr { "or" and_expr } ;
and_expr    = not_expr { "and" not_expr } ;
not_expr    = "not" not_expr | comparison ;
comparison  = additive { compare_op additive } ;
compare_op  = "is" "not" | "is" "greater" "than" | "is" "less" "than"
            | "is" "at" "least" | "is" "at" "most" | "is" | "contains" ;
additive    = term { ( "+" | "-" ) term } ;
term        = unary { ( "*" | "/" | "%" ) unary } ;
unary       = "-" unary | primary ;

primary     = NUMBER | STRING | "true" | "false" | "nothing"
            | "(" expr ")"
            | "[" [ expr { "," expr } ] "]"
            | builtin
            | NAME "with" not_expr { "and" not_expr }   (* function call *)
            | NAME ;
builtin     = ( "first" | "last" | "length" | "uppercase" | "lowercase"
              | "trim" | "keys" ) "of" unary
            | "split" "of" operand "by" unary
            | "join" "of" operand "with" unary ;
```

## Ambiguities the English surface creates

These are resolved by the parser's choices, not by the grammar alone:

1. **`is` means two things.** At the start of a statement, `NAME is ...`
   is assignment (`parse_statement` checks the next token). Inside an
   expression, `is` is equality. So `x is 3` assigns, while
   `show x is 3` prints `true` or `false`.
2. **`and` in a call.** Arguments are parsed one level below `and`
   (`not_expr`), so `add with a and b` is a call with two arguments, never
   `add with (a and b)`. To pass a logical `and` as one argument, use
   parentheses: `check with (a and b)`.
3. **Calls swallow the rest of the line.** `f with x + 1` passes `x + 1`.
   Use parentheses to combine call results: `(fib with (n - 1)) + (fib with (n - 2))`.
4. **`split` and `join` operands** take no call sugar, because the
   `by` / `with` that follows belongs to the built-in.

No ambiguity analysis beyond these hand-found cases has been done; a
generated parser from this EBNF (for example with a PEG tool) and a
differential run against `jesun.py` would be the way to check it.
