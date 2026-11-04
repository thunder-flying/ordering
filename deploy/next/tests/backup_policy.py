import gzip
import hashlib
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "backup.sh"


class BackupPolicyTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)
        self.root = self.path / "ordering"
        (self.root / "deploy" / "next").mkdir(parents=True)
        (self.root / "deploy" / "next" / "compose.yaml").write_text("name: ordering\nservices: {}\n")
        self.env_file = self.path / "production.env"
        self.env_file.write_text("APP_IMAGE=test\nTOOLING_IMAGE=test\n")
        self.env_file.chmod(0o600)
        self.backups = self.path / "backups"
        self.bin_dir = self.path / "bin"
        self.bin_dir.mkdir()
        docker = self.bin_dir / "docker"
        docker.write_text(
            "#!/usr/bin/env python3\n"
            "import os, pathlib, sys, tarfile\n"
            "args = sys.argv[1:]\n"
            "if 'exec' in args:\n"
            "    if os.environ.get('TEST_DUMP_FAIL') == '1': sys.exit(1)\n"
            "    print('CREATE TABLE example (id INT);')\n"
            "elif 'run' in args:\n"
            "    volumes = [args[i+1] for i, value in enumerate(args[:-1]) if value == '-v']\n"
            "    output = next(value.split(':/backup')[0] for value in volumes if value.endswith(':/backup'))\n"
            "    with tarfile.open(pathlib.Path(output) / 'uploads.tar.gz', 'w:gz') as archive:\n"
            "        item = pathlib.Path(os.environ['TEST_UPLOAD_FILE'])\n"
            "        archive.add(item, arcname='dishes/test.jpg')\n"
        )
        docker.chmod(0o755)
        self.upload = self.path / "test.jpg"
        self.upload.write_bytes(b"sample-image-bytes")

    def run_backup(self, **extra_env):
        self.assertTrue(SCRIPT.is_file(), f"missing backup script: {SCRIPT}")
        env = {
            **os.environ,
            "PATH": f"{self.bin_dir}:{os.environ['PATH']}",
            "ORDERING_ROOT": str(self.root),
            "ORDERING_ENV_FILE": str(self.env_file),
            "ORDERING_BACKUP_ROOT": str(self.backups),
            "TEST_UPLOAD_FILE": str(self.upload),
            **extra_env,
        }
        return subprocess.run(["bash", str(SCRIPT)], text=True, capture_output=True, env=env)

    def test_creates_integrity_checked_database_and_upload_backup(self):
        result = self.run_backup()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        snapshots = list(self.backups.iterdir())
        self.assertEqual(len(snapshots), 1)
        snapshot = snapshots[0]
        with gzip.open(snapshot / "database.sql.gz", "rt") as stream:
            self.assertIn("CREATE TABLE example", stream.read())
        with tarfile.open(snapshot / "uploads.tar.gz", "r:gz") as archive:
            self.assertIn("dishes/test.jpg", archive.getnames())
        for line in (snapshot / "SHA256SUMS").read_text().splitlines():
            digest, filename = line.split(maxsplit=1)
            self.assertEqual(hashlib.sha256((snapshot / filename).read_bytes()).hexdigest(), digest)

    def test_failed_dump_does_not_publish_a_snapshot(self):
        result = self.run_backup(TEST_DUMP_FAIL="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.backups.exists() and any(self.backups.iterdir()))


if __name__ == "__main__":
    unittest.main()
