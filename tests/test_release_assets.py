"""The installers download release assets by name; the release workflow
must build every name they can ask for, or that platform's install 404s."""

import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return f.read()


class ReleaseAssets(unittest.TestCase):
    def test_every_installer_asset_is_built(self):
        built = set(re.findall(r"^\s*asset:\s*(\S+)\s*$",
                               read(".github", "workflows", "release.yml"),
                               re.M))
        sh = read("scripts", "install.sh")
        platforms = re.findall(r'PLATFORM="(\w+)"', sh)
        bits = set(re.findall(r'BITS="(\w+)"', sh))
        wanted = {f"jesun-{p}-{b}" for p in platforms for b in bits}
        # install.sh sends Intel Macs to the arm64 build (Rosetta).
        wanted.discard("jesun-macos-x64")
        wanted |= set(re.findall(r'\$Asset\s*=\s*"([^"]+)"',
                                 read("scripts", "install.ps1")))
        self.assertEqual(sorted(wanted - built), [],
                         "installers ask for assets the release never builds")


if __name__ == "__main__":
    unittest.main()
