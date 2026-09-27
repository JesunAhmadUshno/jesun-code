"""v1.3 frontend milestone: differential tests for the html/template/js packages.

Every case runs through the bootstrap interpreter AND the self-hosted
Jesun.Code walker; the outputs must match byte for byte. Pure packages,
no imports, no bridge.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from selfhost_harness import InlineSandbox  # noqa: E402


def run_case(src):
    box = InlineSandbox()
    try:
        boot, selfhost = box.run(src)
    finally:
        box.close()
    return boot, selfhost


class FrontendTest(unittest.TestCase):
    def check(self, src, expected):
        boot, selfhost = run_case(src)
        self.assertEqual(
            selfhost, boot,
            f"differ:\nbootstrap={boot!r}\nselfhost={selfhost!r}",
        )
        self.assertEqual(boot[1], expected)

    # ---------- html ----------

    def test_escape_html_order(self):
        self.check(
            'bring in "html"\n'
            'show escape_html with "a&<b>\\"c\\""\n',
            "a&amp;&lt;b&gt;&quot;c&quot;\n",
        )

    def test_escape_html_needs_text(self):
        self.check(
            'bring in "html"\n'
            'r is attempt escape_html with 5\n'
            'show r["ok"]\n'
            'show r["error"]\n',
            "false\n"
            'Line 0: in the "html" package: '
            "escape_html needs text, but this is a number.\n",
        )

    def test_attrs_escape(self):
        self.check(
            'bring in "html"\n'
            'show element with "a" and {"href": "/x?y=1&z=2"} and "go"\n',
            '<a href="/x?y=1&amp;z=2">go</a>\n',
        )

    def test_attrs_needs_table(self):
        self.check(
            'bring in "html"\n'
            'r is attempt element with "div" and "nope" and "x"\n'
            'show r["error"]\n',
            'Line 0: in the "html" package: '
            'the attributes have to be a table, but this is a text.\n',
        )

    def test_element_children(self):
        self.check(
            'bring in "html"\n'
            'show element with "nav" and nothing and [(link_to with "/a" and "A"), (link_to with "/b" and "B")]\n',
            '<nav><a href="/a">A</a><a href="/b">B</a></nav>\n',
        )

    def test_element_children_must_be_text(self):
        self.check(
            'bring in "html"\n'
            'r is attempt element with "div" and nothing and 5\n'
            'show r["error"]\n',
            'Line 0: in the "html" package: '
            "element children have to be text or a list of text, "
            "but this is a number.\n",
        )

    def test_element_bad_tag(self):
        self.check(
            'bring in "html"\n'
            'r is attempt element with "9lives" and nothing and "x"\n'
            'show r["error"]\n',
            'Line 0: in the "html" package: '
            '"9lives" is not a valid HTML tag name.\n',
        )

    def test_void_and_image(self):
        self.check(
            'bring in "html"\n'
            'show void_element with "br" and nothing\n'
            'show image with "a.png" and "A <b>"\n',
            "<br>\n"
            '<img src="a.png" alt="A &lt;b&gt;">\n',
        )

    def test_headings_paragraph(self):
        self.check(
            'bring in "html"\n'
            'show heading with 1 and "Title"\n'
            'show heading with 6 and "tiny"\n'
            'show paragraph with "Body <text>."\n',
            "<h1>Title</h1>\n"
            "<h6>tiny</h6>\n"
            "<p>Body &lt;text&gt;.</p>\n",
        )

    def test_heading_level_errors(self):
        self.check(
            'bring in "html"\n'
            'r is attempt heading with 7 and "x"\n'
            'show r["error"]\n'
            'r is attempt heading with 2.5 and "x"\n'
            'show r["error"]\n',
            'Line 0: in the "html" package: '
            "a heading level has to be a whole number from 1 to 6.\n"
            'Line 0: in the "html" package: '
            "a heading level has to be a whole number from 1 to 6.\n",
        )

    def test_lists_button_input_form(self):
        self.check(
            'bring in "html"\n'
            'show unordered_list with ["a", "b<c"]\n'
            'show ordered_list with ["one"]\n'
            'show button with "Go"\n'
            'show form with "/go" and "post" and (input_field with "q" and "text")\n',
            "<ul><li>a</li><li>b&lt;c</li></ul>\n"
            "<ol><li>one</li></ol>\n"
            "<button>Go</button>\n"
            '<form action="/go" method="post"><input type="text" name="q"></form>\n',
        )

    def test_table_shapes_values(self):
        self.check(
            'bring in "html"\n'
            'show data_table with ["n"] and [["a", 1], ["<b>", nothing]]\n',
            "<table><thead><tr><th>n</th></tr></thead><tbody>"
            "<tr><td>a</td><td>1</td></tr>"
            "<tr><td>&lt;b&gt;</td><td></td></tr>"
            "</tbody></table>\n",
        )

    def test_style_block(self):
        self.check(
            'bring in "html"\n'
            'show style_block with "body {{ color: red; }}"\n',
            "<style>\nbody { color: red; }\n</style>\n",
        )

    def test_page(self):
        self.check(
            'bring in "html"\n'
            'show page with "T <t>" and (paragraph with "Hi.")\n',
            "<!DOCTYPE html>\n<html>\n<head>\n"
            '<meta charset="utf-8">\n'
            "<title>T &lt;t&gt;</title>\n"
            "</head>\n<body>\n"
            "<p>Hi.</p>\n"
            "</body>\n</html>\n"
            "\n",
        )

    # ---------- template ----------

    def test_placeholder_and_escape(self):
        self.check(
            'bring in "template"\n'
            'show render_template with "Hi {{{{name}}}}!" and {"name": "<b>"}\n',
            "Hi &lt;b&gt;!\n",
        )

    def test_missing_and_dotted(self):
        self.check(
            'bring in "template"\n'
            'show render_template with "[{{{{gone}}}}][{{{{t.task}}}}]" and {"t": {"task": "done"}}\n',
            "[][done]\n",
        )

    def test_value_must_be_simple(self):
        self.check(
            'bring in "template"\n'
            'r is attempt render_template with "{{{{t}}}}" and {"t": {"a": 1}}\n'
            'show r["error"]\n',
            'Line 0: in the "template" package: '
            'I cannot put a table into "{{t}}". '
            "Use text, numbers, true/false, or nothing.\n",
        )

    def test_for_loop(self):
        self.check(
            'bring in "template"\n'
            'show render_template with "{{% for t in todos %}}{{{{t}}}};{{% endfor %}}" and {"todos": ["a", "b"]}\n',
            "a;b;\n",
        )

    def test_for_empty_and_missing(self):
        self.check(
            'bring in "template"\n'
            'show render_template with "x{{% for t in xs %}}y{{% endfor %}}z" and {"xs": []}\n'
            'show render_template with "x{{% for t in gone %}}y{{% endfor %}}z" and {}\n',
            "xz\nxz\n",
        )

    def test_for_needs_list(self):
        self.check(
            'bring in "template"\n'
            'r is attempt render_template with "{{% for t in todos %}}x{{% endfor %}}" and {"todos": "nope"}\n'
            'show r["error"]\n',
            'Line 0: in the "template" package: '
            '"{% for %}" needs a list, but "todos" is a text.\n',
        )

    def test_nested_loops(self):
        self.check(
            'bring in "template"\n'
            'show render_template with "{{% for r in rows %}}({{% for c in r %}}{{{{c}}}} {{% endfor %}}){{% endfor %}}" and {"rows": [[1, 2], [3]]}\n',
            "(1 2 )(3 )\n",
        )

    def test_if_else(self):
        self.check(
            'bring in "template"\n'
            'show render_template with "{{% if name %}}hi {{{{name}}}}{{% else %}}bye{{% endif %}}" and {"name": "Jo"}\n'
            'show render_template with "{{% if name %}}hi{{% else %}}bye{{% endif %}}" and {"name": ""}\n'
            'show render_template with "{{% if gone %}}hi{{% endif %}}" and {}\n',
            "hi Jo\nbye\n\n",
        )

    def test_if_inside_for(self):
        self.check(
            'bring in "template"\n'
            'show render_template with "<h1>{{{{title}}}}</h1><ul>{{% for t in todos %}}<li>{{{{t.task}}}}{{% if t.done %}} (done){{% endif %}}</li>{{% endfor %}}</ul>" and {"title": "Todos <3", "todos": [{"task": "Buy milk", "done": true}, {"task": "Ship v1.3", "done": false}]}\n',
            "<h1>Todos &lt;3</h1><ul><li>Buy milk (done)</li><li>Ship v1.3</li></ul>\n",
        )

    def test_unclosed_placeholder(self):
        self.check(
            'bring in "template"\n'
            'r is attempt render_template with "hi {{{{name}}" and {"name": "x"}\n'
            'show r["error"]\n',
            'Line 0: in the "template" package: '
            '"{{" at character 3 is never closed.\n',
        )

    def test_unknown_tag(self):
        self.check(
            'bring in "template"\n'
            'r is attempt render_template with "{{% while %}}hi" and {}\n'
            'show r["error"]\n',
            'Line 0: in the "template" package: '
            'I do not know the tag "{% while %}" (character 0).\n',
        )

    def test_stray_endfor(self):
        self.check(
            'bring in "template"\n'
            'r is attempt render_template with "hi {{% endfor %}}" and {}\n'
            'show r["error"]\n',
            'Line 0: in the "template" package: '
            '"{% endfor %}" has no "{% for %}" (character 3).\n',
        )

    def test_unclosed_for(self):
        self.check(
            'bring in "template"\n'
            'r is attempt render_template with "{{% for t in xs %}}hi" and {"xs": [1]}\n'
            'show r["error"]\n',
            'Line 0: in the "template" package: '
            '"{% for %}" that starts at character 0 is never closed.\n',
        )

    def test_render_file(self):
        self.check(
            'bring in "template"\n'
            'write "Hi {{{{name}}}}!" to file "tpl_test.txt"\n'
            'show render_file with "tpl_test.txt" and {"name": "<b>"}\n',
            "Hi &lt;b&gt;!\n",
        )


    # ---------- js ----------

    def test_js_string_escapes(self):
        self.check(
            'bring in "js"\n'
            'show js_string with "say \\"hi\\" <bye>"\n',
            '"say \\"hi\\" \\x3cbye>"\n',
        )

    def test_js_string_script_breakout(self):
        self.check(
            'bring in "js"\n'
            'show js_string with "</script><script>alert(1)</script>"\n',
            '"\\x3c/script>\\x3cscript>alert(1)\\x3c/script>"\n',
        )

    def test_js_string_needs_text(self):
        self.check(
            'bring in "js"\n'
            'r is attempt js_string with 7\n'
            'show r["error"]\n',
            'Line 0: in the "js" package: '
            "js_string needs text, but this is a number.\n",
        )

    def test_js_value_all_kinds(self):
        self.check(
            'bring in "js"\n'
            'show js_value with {"name": "Jesun <3", "n": 3, "ok": true, "nil": nothing, "xs": [1, "a"]}\n',
            '{"name": "Jesun \\x3c3", "n": 3, "ok": true, "nil": null, "xs": [1, "a"]}\n',
        )

    def test_js_value_refuses_function(self):
        self.check(
            'bring in "js"\n'
            'to f with x\n'
            '    give back x\n'
            'r is attempt js_value with f\n'
            'show r["error"]\n',
            'Line 0: in the "js" package: '
            "I cannot turn a function into JavaScript.\n",
        )

    def test_js_value_too_deep(self):
        self.check(
            'bring in "js"\n'
            'deep is 0\n'
            'repeat 7 times\n'
            '    deep is [deep]\n'
            'r is attempt js_value with deep\n'
            'show r["error"]\n',
            'Line 0: in the "js" package: '
            "that value nests too deep to turn into JavaScript.\n",
        )

    def test_script_tag(self):
        self.check(
            'bring in "js"\n'
            'show script_tag with "alert(1);"\n',
            "<script>\nalert(1);\n</script>\n",
        )

    def test_dom_ready(self):
        self.check(
            'bring in "js"\n'
            'show dom_ready with "init();"\n',
            'document.addEventListener("DOMContentLoaded", function() {\n'
            "init();\n"
            "});\n",
        )

    def test_on_event(self):
        self.check(
            'bring in "js"\n'
            'show on_event with "click" and "go" and "go();"\n',
            'document.getElementById("go").addEventListener("click", function() {\n'
            "go();\n"
            "});\n",
        )

    def test_js_fetch(self):
        self.check(
            'bring in "js"\n'
            'show js_fetch with "/api/todos" and "POST" and "JSON.stringify({{task: task}})"\n',
            'fetch("/api/todos", {method: "POST", headers: {"Content-Type": "application/json"}, '
            "body: JSON.stringify({task: task})})\n",
        )


if __name__ == "__main__":
    unittest.main()
