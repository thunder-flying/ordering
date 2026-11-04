from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "validate_env.py"


class EnvPolicyTest(unittest.TestCase):
    def run_validator(self, content: str):
        self.assertTrue(SCRIPT.is_file(), f"missing env validator: {SCRIPT}")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "production.env"
            path.write_text(content)
            path.chmod(0o600)
            return subprocess.run(
                ["python3", str(SCRIPT), str(path)],
                text=True,
                capture_output=True,
            )

    def test_rejects_example_credentials(self):
        result = self.run_validator((ROOT / "env.example").read_text())
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("replace-with-real-secret", result.stderr)

    def test_accepts_production_shaped_credentials_without_printing_them(self):
        content = "\n".join(
            [
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
            ]
        )
        result = self.run_validator(content)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("saltsalt", result.stdout + result.stderr)
        self.assertNotIn("d" * 32, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
