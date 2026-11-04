import os
import shutil
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "release.sh"
NEW_SHA = "a" * 40
OLD_SHA = "b" * 40
NEW_APP = f"ghcr.io/thunder-flying/ordering-server:{NEW_SHA}"
NEW_TOOL = f"ghcr.io/thunder-flying/ordering-tooling:{NEW_SHA}"
OLD_APP = f"ghcr.io/thunder-flying/ordering-server:{OLD_SHA}"
OLD_TOOL = f"ghcr.io/thunder-flying/ordering-tooling:{OLD_SHA}"


class ReleasePolicyTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)
        self.root = self.path / "ordering"
        script_dir = self.root / "deploy" / "next" / "scripts"
        script_dir.mkdir(parents=True)
        (self.root / "deploy" / "next" / "compose.yaml").write_text("name: ordering\nservices: {}\n")
        (script_dir / "backup.sh").write_text("#!/bin/sh\nexit 0\n")
        shutil.copyfile(ROOT / "scripts" / "validate_env.py", script_dir / "validate_env.py")
        self.env_file = self.path / "production.env"
        self.env_file.write_text("\n".join([
            f"APP_IMAGE={OLD_APP}",
            f"TOOLING_IMAGE={OLD_TOOL}",
            "MYSQL_DATABASE=ordering",
            "MYSQL_USER=ordering_app",
            "MYSQL_PASSWORD=" + "a" * 64,
            "MYSQL_ROOT_PASSWORD=" + "b" * 64,
            "OPENID_HMAC_SECRET=" + "c" * 64,
            "WECHAT_APP_ID=wx0006792d6129b164",
            "WECHAT_APP_SECRET=" + "d" * 32,
            "USER_SESSION_PEPPER=" + "e" * 64,
            "ADMIN_USERNAME=admin",
            "ADMIN_PASSWORD_HASH='$argon2id$v=19$m=19456,t=2,p=1$saltsalt$hashhash'",
            "ADMIN_SESSION_SECRET=" + "f" * 64,
            "",
        ]))
        self.env_file.chmod(0o600)
        self.bin_dir = self.path / "bin"
        self.bin_dir.mkdir()
        self.log = self.path / "docker.log"
        docker = self.bin_dir / "docker"
        docker.write_text(
            "#!/bin/sh\n"
            "printf '%s\\n' \"$*\" >> \"$TEST_DOCKER_LOG\"\n"
            "case \"$1\" in\n"
            "  login) cat >/dev/null; exit 0;;\n"
            "  pull) exit 0;;\n"
            "  inspect) echo \"$TEST_OLD_APP\"; exit 0;;\n"
            "  compose)\n"
            "    case \" $* \" in\n"
            "      *' ps -q server'*) echo old-container;;\n"
            "      *' up -d --no-build --no-deps server'*)\n"
            "        if [ \"$TEST_FAIL_NEW_UP\" = 1 ] && ! grep -q \"$TEST_OLD_APP\" \"$TEST_DOCKER_LOG\"; then exit 1; fi;;\n"
            "    esac;;\n"
            "esac\n"
            "exit 0\n"
        )
        docker.chmod(0o755)
        curl = self.bin_dir / "curl"
        curl.write_text("#!/bin/sh\nexit \"${TEST_CURL_STATUS:-0}\"\n")
        curl.chmod(0o755)

    def run_release(self, app=NEW_APP, tool=NEW_TOOL, **extra_env):
        self.assertTrue(SCRIPT.is_file(), f"missing release script: {SCRIPT}")
        env = {
            **os.environ,
            "PATH": f"{self.bin_dir}:{os.environ['PATH']}",
            "ORDERING_ROOT": str(self.root),
            "ORDERING_ENV_FILE": str(self.env_file),
            "TEST_DOCKER_LOG": str(self.log),
            "TEST_OLD_APP": OLD_APP,
            **extra_env,
        }
        return subprocess.run(
            ["bash", str(SCRIPT), app, tool, "example"],
            input="test-registry-token",
            text=True,
            capture_output=True,
            env=env,
        )

    def test_rejects_non_sha_images_before_docker_login(self):
        result = self.run_release(app="ghcr.io/thunder-flying/ordering-server:latest")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.log.exists())

    def test_rejects_mismatched_image_namespaces(self):
        result = self.run_release(tool=f"ghcr.io/other/ordering-tooling:{NEW_SHA}")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.log.exists())

    def test_rejects_placeholder_credentials_before_registry_login(self):
        self.env_file.write_text(self.env_file.read_text().replace("d" * 32, "replace-with-real-secret"))
        result = self.run_release()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.log.exists())

    def test_health_failure_restores_previous_application_image(self):
        result = self.run_release(TEST_CURL_STATUS="22")
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(f"APP_IMAGE={OLD_APP}", self.env_file.read_text())
        calls = self.log.read_text()
        self.assertGreaterEqual(calls.count("up -d --no-build --no-deps server"), 2)
        self.assertIn("rollback", result.stderr.lower())


if __name__ == "__main__":
    unittest.main()
