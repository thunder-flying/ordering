import json
import os
from pathlib import Path
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
TEST_ENV = {
    "APP_IMAGE": "ghcr.io/example/ordering-server:" + "a" * 40,
    "TOOLING_IMAGE": "ghcr.io/example/ordering-tooling:" + "a" * 40,
    "MYSQL_PASSWORD": "test-app-password",
    "MYSQL_ROOT_PASSWORD": "test-root-password",
    "OPENID_HMAC_SECRET": "x" * 32,
    "WECHAT_APP_SECRET": "test-wechat-secret",
    "USER_SESSION_PEPPER": "x" * 32,
    "ADMIN_PASSWORD_HASH": "test-argon-hash",
    "ADMIN_SESSION_SECRET": "x" * 32,
    "WECHAT_APP_ID": "wx0006792d6129b164",
    "ACME_EMAIL": "test@example.com",
}


def render_compose(path: Path) -> dict:
    if not path.is_file():
        raise AssertionError(f"missing Compose file: {path}")
    result = subprocess.run(
        ["docker", "compose", "--profile", "*", "-f", str(path), "config", "--format", "json"],
        cwd=ROOT,
        env={**os.environ, **TEST_ENV},
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        raise AssertionError(result.stderr)
    return json.loads(result.stdout)


class ConfigPolicyTest(unittest.TestCase):
    def test_project_services_keep_database_and_app_private(self):
        config = render_compose(ROOT / "compose.yaml")
        services = config["services"]
        self.assertEqual(set(services), {"mysql", "server", "tooling", "nginx"})
        self.assertFalse(services["mysql"].get("ports"))
        self.assertFalse(services["server"].get("ports"))
        self.assertTrue(services["mysql"].get("healthcheck"))
        self.assertTrue(services["server"].get("healthcheck"))
        self.assertTrue(services["mysql"].get("volumes"))
        self.assertTrue(services["server"].get("volumes"))
        self.assertTrue(services["server"]["read_only"])
        self.assertTrue(config["networks"]["internal"]["internal"])

        published = services["nginx"]["ports"]
        self.assertEqual(len(published), 1)
        self.assertEqual(published[0]["host_ip"], "127.0.0.1")
        self.assertEqual(int(published[0]["published"]), 18080)
        self.assertEqual(int(published[0]["target"]), 8080)

    def test_edge_is_the_only_public_listener_and_keeps_certificates(self):
        config = render_compose(ROOT / "edge" / "compose.yaml")
        caddy = config["services"]["caddy"]
        self.assertEqual(caddy["network_mode"], "host")
        self.assertFalse(caddy.get("ports"))
        targets = {volume["target"] for volume in caddy["volumes"]}
        self.assertTrue({"/data", "/config", "/etc/caddy/Caddyfile", "/etc/caddy/sites"} <= targets)
        caddyfile = (ROOT / "edge" / "Caddyfile").read_text()
        site = (ROOT / "edge" / "sites" / "ordering.caddy").read_text()
        self.assertIn("import sites/*.caddy", caddyfile)
        self.assertIn("ordering.guziyi.cn", site)
        self.assertIn("reverse_proxy 127.0.0.1:18080", site)
        self.assertIn("header_up X-Real-IP {remote_host}", site)

    def test_project_proxy_retains_rate_and_upload_limits(self):
        path = ROOT / "nginx" / "default.conf.template"
        self.assertTrue(path.is_file(), f"missing Nginx file: {path}")
        nginx = path.read_text()
        self.assertIn("limit_req_zone $http_x_real_ip", nginx)
        self.assertIn("proxy_set_header X-Real-IP $http_x_real_ip", nginx)
        self.assertIn("client_max_body_size 3m", nginx)
        self.assertIn("client_max_body_size 6m", nginx)
        self.assertNotIn("ssl_certificate", nginx)


if __name__ == "__main__":
    unittest.main()
