"""Exercise the production sealing tail on a disposable local filesystem; no build."""
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'prepare-release.sh'

class SealingTest(unittest.TestCase):
    def setUp(self):
        if os.geteuid() == 0:
            self.skipTest('Permission regression must run as an ordinary user')
        self.tmp = tempfile.TemporaryDirectory(prefix='cvp-sealing-')
        self.root = Path(self.tmp.name)
        self.stage = self.root / 'staging' / 'candidate'
        self.release = self.root / 'releases' / 'candidate'
        self.stage.mkdir(parents=True)
        self.release.parent.mkdir()
        (self.stage / 'nested').mkdir()
        (self.stage / 'nested' / 'run').write_text('fixture')
        (self.stage / 'nested' / 'run').chmod(0o755)
        self.cache = self.root / 'cache'
        self.cache.mkdir()
        (self.stage / 'cache').symlink_to(self.cache)
        (self.root / 'current').symlink_to('unchanged-current')
        (self.root / 'previous').symlink_to('unchanged-rollback')

    def tearDown(self):
        if not hasattr(self, 'tmp'):
            return
        for root, dirs, files in os.walk(self.root):
            os.chmod(root, 0o700)
            for name in files:
                p = Path(root) / name
                if not p.is_symlink():
                    p.chmod(0o600)
        self.tmp.cleanup()

    def run_tail(self, validation='return 0'):
        source = SCRIPT.read_text()
        handler = re.search(r'preserve_failed_stage\(\) \{.*?\n\}', source, re.S).group()
        tail = source[source.index('# Preserve executable bits'):]
        program = 'set -euo pipefail\n' + handler + '\ntrap preserve_failed_stage ERR\n'
        program += 'validate_release() { ' + validation + '; }\n' + tail
        env = {**os.environ, 'STAGING_DIR': str(self.stage), 'RELEASE_DIR': str(self.release),
               'RELEASE_ID': 'candidate', 'REQUESTED_SHA': 'f' * 40}
        return subprocess.run(['/bin/bash', '-c', program], env=env, capture_output=True, text=True)

    def test_move_succeeds_and_final_tree_is_immutable(self):
        result = self.run_tail()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.stage.exists())
        for p in [self.release, self.release / 'nested', self.release / 'nested/run']:
            self.assertEqual(stat.S_IMODE(p.stat().st_mode) & 0o222, 0, str(p))
        self.assertEqual((self.release / 'nested/run').read_text(), 'fixture')
        self.assertTrue((self.release / 'nested/run').stat().st_mode & stat.S_IXUSR)
        self.assertTrue(self.cache.stat().st_mode & stat.S_IWUSR)
        self.assertEqual(os.readlink(self.release / 'cache'), str(self.cache))
        self.assertEqual(os.readlink(self.root / 'current'), 'unchanged-current')
        self.assertEqual(os.readlink(self.root / 'previous'), 'unchanged-rollback')

    def test_failed_move_preserves_stage_and_reports_it(self):
        self.release.parent.chmod(0o555)
        result = self.run_tail()
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(self.stage.exists())
        self.assertFalse(self.release.exists())
        self.assertIn(str(self.stage), result.stderr)
        self.assertNotIn('PASS:', result.stdout)

    def test_post_move_validation_failure_preserves_and_reports_release(self):
        result = self.run_tail('exit 1')
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(self.release.exists(), result.stderr)
        self.assertIn(str(self.release), result.stderr)
        self.assertNotIn('PASS:', result.stdout)
        self.assertEqual(stat.S_IMODE(self.release.stat().st_mode) & 0o222, 0)

if __name__ == '__main__':
    unittest.main()
