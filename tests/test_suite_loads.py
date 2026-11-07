"""Every test module must import, or `python -m unittest discover -s tests`
(the CI step and the release gate) exits non-zero before running anything
useful. A module missing an optional dependency must skip, not error."""

import os
import unittest

TESTS = os.path.dirname(os.path.abspath(__file__))


class SuiteLoads(unittest.TestCase):
    def test_every_module_imports_or_skips(self):
        suite = unittest.TestLoader().discover(TESTS, top_level_dir=TESTS)

        def walk(s):
            for item in s:
                if isinstance(item, unittest.TestSuite):
                    yield from walk(item)
                else:
                    yield item

        failed = [t.id().rsplit(".", 1)[1] for t in walk(suite)
                  if t.id().startswith("unittest.loader._FailedTest.")]
        self.assertEqual(failed, [], f"modules failed to import: {failed}")


if __name__ == "__main__":
    unittest.main()
