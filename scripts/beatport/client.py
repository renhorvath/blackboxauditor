#!/usr/bin/env python3
"""Beatport API v4 client — OAuth token + catalog requests."""

from __future__ import annotations

import http.cookiejar
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

API_BASE = "https://api.beatport.com/v4"
TOKEN_URL = f"{API_BASE}/auth/o/token/"
REDIRECT_URI = f"{API_BASE}/auth/o/post-message/"
DOCS_URL = f"{API_BASE}/docs/"
DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "application/json",
    "Origin": "https://api.beatport.com",
    "Referer": "https://api.beatport.com/v4/docs/",
}

_PLACEHOLDER = frozenset({"", "...", "your_client_id", "your_beatport_login_email"})


def load_env(root: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for name in (".env.local", ".env"):
        p = root / name
        if not p.exists():
            continue
        for line in p.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            v = v.split("#", 1)[0].strip().strip('"').strip("'")
            env[k.strip()] = v
    return env


def _clean_client_id(value: str) -> str:
    v = (value or "").strip()
    return "" if v.lower() in _PLACEHOLDER else v


def fetch_public_client_id() -> str:
    """Beatport Swagger UI client_id — NOT from Beatportal registration."""
    html = urllib.request.urlopen(DOCS_URL, timeout=60).read().decode("utf-8", errors="replace")
    scripts = re.findall(r'src="(/static/btprt/[^"]+\.js)"', html)
    for script_path in scripts:
        js = urllib.request.urlopen(f"https://api.beatport.com{script_path}", timeout=60).read().decode(
            "utf-8", errors="replace"
        )
        matches = re.findall(r"API_CLIENT_ID: '([^']+)'", js)
        if matches:
            return matches[0]
    raise RuntimeError("Could not scrape API_CLIENT_ID from Beatport docs")


def _form_post(
    url: str,
    fields: dict[str, str],
    headers: dict[str, str] | None = None,
    opener: urllib.request.OpenerDirector | None = None,
) -> dict[str, Any]:
    data = urllib.parse.urlencode(fields).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded", **(headers or {})},
    )
    fn = opener.open if opener else urllib.request.urlopen
    with fn(req, timeout=60) as resp:
        raw = resp.read()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        text = raw.decode(errors="replace")
        raise RuntimeError(f"Non-JSON response from {url}: {text[:500]}") from None


def _session_opener(*, follow_redirects: bool = True) -> urllib.request.OpenerDirector:
    jar = http.cookiejar.CookieJar()
    handlers: list[Any] = [urllib.request.HTTPCookieProcessor(jar)]
    if not follow_redirects:

        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None

        handlers.append(NoRedirect())
    return urllib.request.build_opener(*handlers)


def authorize_with_password(client_id: str, username: str, password: str) -> dict[str, Any]:
    """
    Beatport v4 auth (beets-beatport4 flow):
    1. POST /auth/login/ (session cookie)
    2. GET /auth/o/authorize/ → auth code in Location header
    3. POST /auth/o/token/ → access_token
    """
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    login_req = urllib.request.Request(
        f"{API_BASE}/auth/login/",
        data=json.dumps({"username": username, "password": password}).encode(),
        method="POST",
        headers={"Content-Type": "application/json", **DEFAULT_HEADERS},
    )
    try:
        with opener.open(login_req, timeout=60) as resp:
            login_body = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace").strip()
        if e.code == 403 and "Incorrect username or password" in body:
            raise RuntimeError(
                "Beatport login rejected (incorrect username or password).\n"
                "Use your Beatport store login email as BEATPORT_USERNAME (not Beatportal OAuth app creds)."
            ) from e
        raise RuntimeError(f"Beatport login HTTP {e.code}: {body[:300]}") from e

    if "username" not in login_body or "email" not in login_body:
        raise RuntimeError(f"Beatport login failed: {login_body}")

    auth_qs = urllib.parse.urlencode(
        {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": REDIRECT_URI,
        }
    )
    auth_req = urllib.request.Request(
        f"{API_BASE}/auth/o/authorize/?{auth_qs}",
        method="GET",
        headers={"Accept": "text/html,application/json", **DEFAULT_HEADERS},
    )

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    auth_opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar),
        NoRedirect(),
    )

    auth_code: str | None = None
    try:
        with auth_opener.open(auth_req, timeout=60) as resp:
            html = resp.read().decode(errors="replace")
            code_match = re.search(r"[?&]code=([^&\"'\s]+)", html)
            if code_match:
                auth_code = urllib.parse.unquote(code_match.group(1))
    except urllib.error.HTTPError as e:
        if e.code not in (301, 302, 303, 307, 308):
            body = e.read().decode(errors="replace")
            if "invalid_request" in body or "Invalid client_id" in body:
                raise RuntimeError(
                    "Invalid client_id — use the public ID from Beatport docs, not Beatportal registration.\n"
                    "Leave BEATPORT_CLIENT_ID empty to auto-fetch, or run:\n"
                    "  python3 scripts/beatport/fetch_client_id.py"
                ) from e
            raise RuntimeError(f"Authorize failed HTTP {e.code}: {body[:500]}") from e
        location = e.headers.get("Location") or ""
        parsed = urllib.parse.urlparse(location)
        code_list = urllib.parse.parse_qs(parsed.query).get("code")
        if code_list:
            auth_code = code_list[0]

    if not auth_code:
        raise RuntimeError("No authorization code from Beatport OAuth authorize step")

    token_qs = urllib.parse.urlencode(
        {
            "code": auth_code,
            "grant_type": "authorization_code",
            "redirect_uri": REDIRECT_URI,
            "client_id": client_id,
        }
    )
    token_req = urllib.request.Request(
        f"{TOKEN_URL}?{token_qs}",
        data=b"",
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded", **DEFAULT_HEADERS},
    )
    with opener.open(token_req, timeout=60) as resp:
        return json.loads(resp.read())


def obtain_token(env: dict[str, str], token_path: Path) -> str:
    """Return a valid access token; refresh or re-auth as needed."""
    client_id = _clean_client_id(env.get("BEATPORT_CLIENT_ID", ""))
    username = env.get("BEATPORT_USERNAME", "").strip()
    password = env.get("BEATPORT_PASSWORD", "").strip()

    cached: dict[str, Any] | None = None
    if token_path.exists():
        try:
            cached = json.loads(token_path.read_text())
        except json.JSONDecodeError:
            cached = None

    if cached and cached.get("access_token"):
        expires_at = float(cached.get("expires_at") or 0)
        if time.time() < expires_at - 120:
            return str(cached["access_token"])
        refresh = str(cached.get("refresh_token") or "").strip()
        cid = str(cached.get("client_id") or client_id or "").strip()
        if refresh and cid:
            try:
                body = _form_post(
                    TOKEN_URL,
                    {
                        "client_id": cid,
                        "grant_type": "refresh_token",
                        "refresh_token": refresh,
                    },
                    headers={"Authorization": f"Bearer {cached['access_token']}"},
                )
                body["client_id"] = cid
                return _save_token(token_path, body)
            except (urllib.error.HTTPError, RuntimeError):
                pass

    if not client_id:
        client_id = fetch_public_client_id()

    if username and password:
        body = authorize_with_password(client_id, username, password)
        body["client_id"] = client_id
        return _save_token(token_path, body)

    raise SystemExit(
        "Beatport auth sikertelen.\n\n"
        "A Beatportal regisztráció NEM ad saját client_id-t ehhez a flow-hoz.\n"
        "Használd a Beatport docs publikus client_id-jét (auto-fetch) + Beatport login:\n\n"
        "  BEATPORT_USERNAME=your_beatport_email\n"
        "  BEATPORT_PASSWORD=your_beatport_password\n"
        "  # BEATPORT_CLIENT_ID=   ← hagyd üresen (auto)\n\n"
        "Vagy másold ki a tokent a böngésző Network tabból (docs → Login → token response).\n"
        "Majd: python3 scripts/beatport/auth_test.py"
    )


def _save_token(token_path: Path, body: dict[str, Any]) -> str:
    token = str(body.get("access_token") or "")
    if not token:
        raise SystemExit(f"Token válasz access_token nélkül: {body}")
    expires_in = int(body.get("expires_in") or 3600)
    payload = {
        "access_token": token,
        "refresh_token": body.get("refresh_token"),
        "expires_at": time.time() + expires_in,
        "token_type": body.get("token_type", "Bearer"),
        "client_id": body.get("client_id"),
    }
    token_path.parent.mkdir(parents=True, exist_ok=True)
    token_path.write_text(json.dumps(payload, indent=2))
    return token


class BeatportClient:
    def __init__(self, access_token: str, delay_s: float = 0.35) -> None:
        self.access_token = access_token
        self.delay_s = delay_s
        self._last_req = 0.0

    def _throttle(self) -> None:
        elapsed = time.time() - self._last_req
        if elapsed < self.delay_s:
            time.sleep(self.delay_s - elapsed)
        self._last_req = time.time()

    def get_json(self, path: str, params: dict[str, str | int] | None = None) -> Any:
        self._throttle()
        url = path if path.startswith("http") else f"{API_BASE}{path}"
        if params:
            qs = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
            url = f"{url}?{qs}"
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {self.access_token}",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            raise RuntimeError(f"Beatport HTTP {e.code} {url}: {body[:500]}") from e

    def paginate(self, path: str, params: dict[str, str | int] | None = None) -> list[Any]:
        """Follow `next` links or page/per_page pagination."""
        items: list[Any] = []
        url: str | None = path if path.startswith("http") else f"{API_BASE}{path}"
        first = True
        while url:
            if first:
                data = self.get_json(url, params)
                first = False
            else:
                data = self.get_json(url)
            if isinstance(data, dict):
                batch = data.get("results") or data.get("data")
                if batch is None:
                    for key in ("tracks", "artists", "releases"):
                        nested = data.get(key)
                        if isinstance(nested, dict) and nested.get("data"):
                            batch = nested["data"]
                            break
                if batch:
                    items.extend(batch)
                url = data.get("next")
            else:
                break
        return items

    def search(self, query: str, entity_type: str, per_page: int = 100) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        page = 1
        while True:
            data = self.get_json(
                "/catalog/search/",
                {"q": query, "type": entity_type, "page": page, "per_page": per_page},
            )
            bucket = data.get(entity_type)
            if isinstance(bucket, dict):
                batch = bucket.get("data") or bucket.get("results") or []
            elif isinstance(bucket, list):
                batch = bucket
            else:
                batch = []
            if not batch:
                break
            out.extend(batch)
            has_next = isinstance(bucket, dict) and bucket.get("next")
            if not has_next and len(batch) < per_page:
                break
            page += 1
            if page > 50:
                break
        return out

    def get_track(self, track_id: int) -> dict[str, Any]:
        return self.get_json(f"/catalog/tracks/{track_id}/")
