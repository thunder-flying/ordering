#!/usr/bin/env python3
"""Validate production credentials without printing their values."""

from pathlib import Path
import re
import sys


def fail(message: str) -> None:
    raise SystemExit(f"ordering-env: {message}")


def read_values(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for number, raw in enumerate(path.read_text().splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            fail(f"invalid line {number}")
        key, value = line.split("=", 1)
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
            fail(f"invalid key on line {number}")
        if key in values:
            fail(f"duplicate key: {key}")
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key] = value
    return values


def validate(values: dict[str, str]) -> None:
    required = (
        "MYSQL_DATABASE",
        "MYSQL_USER",
        "MYSQL_PASSWORD",
        "MYSQL_ROOT_PASSWORD",
        "OPENID_HMAC_SECRET",
        "WECHAT_APP_ID",
        "WECHAT_APP_SECRET",
        "USER_SESSION_PEPPER",
        "ADMIN_USERNAME",
        "ADMIN_PASSWORD_HASH",
        "ADMIN_SESSION_SECRET",
    )
    for key in required:
        value = values.get(key, "")
        if not value or "replace" in value.lower():
            fail(f"{key} is missing or still a placeholder")
    for key in ("MYSQL_DATABASE", "MYSQL_USER", "ADMIN_USERNAME"):
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", values[key]):
            fail(f"{key} contains unsupported characters")
    for key in (
        "MYSQL_PASSWORD",
        "MYSQL_ROOT_PASSWORD",
        "OPENID_HMAC_SECRET",
        "USER_SESSION_PEPPER",
        "ADMIN_SESSION_SECRET",
    ):
        if not re.fullmatch(r"[0-9a-fA-F]{64,}", values[key]):
            fail(f"{key} must be at least 32 random bytes encoded as hex")
    if values["WECHAT_APP_ID"] != "wx0006792d6129b164":
        fail("WECHAT_APP_ID does not match this miniapp")
    if len(values["WECHAT_APP_SECRET"]) < 16:
        fail("WECHAT_APP_SECRET is too short")
    if not values["ADMIN_PASSWORD_HASH"].startswith("$argon2id$"):
        fail("ADMIN_PASSWORD_HASH must be Argon2id")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        fail("usage: validate_env.py /path/to/production.env")
    path = Path(sys.argv[1])
    if not path.is_file():
        fail("production environment file is missing")
    validate(read_values(path))
    print("ordering-env: validated")
