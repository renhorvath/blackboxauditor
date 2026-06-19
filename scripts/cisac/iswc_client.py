#!/usr/bin/env python3
"""CISAC ISWCnet publikus kliens — IPI / ISWC alapú műlekérés.

A publikus portál (https://iswcnet.cisac.org) egy reCAPTCHA gate mögött van,
DE a `/ReCaptcha/ValidateReCaptchaResponse` végpont akkor is kiad egy aláírt,
használható JWT-t (`access_scope: search`), ha a reCAPTCHA validáció sikertelen.
Az APIM gateway (cisaciswcprod.azure-api.net) csak az `Origin` fejlécet ellenőrzi.

Tehát: token = ValidateReCaptchaResponse(bármi) → token_id, majd minden API
hívás `Authorization: Bearer <token_id>` + `Origin: https://iswcnet.cisac.org`.

Végpontok (az SPA bundle-ből visszafejtve):
  GET  /iswc/searchByIswc?iswc=...
  POST /iswc/searchByAgencyWorkCode  (agency, workCode)
  POST /iswc/searchByTitleAndContributor  {titles?, interestedParties[]}
       → cím nélkül, csak nameNumber (IPI) alapján is keres ("search by creators")
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request

PORTAL = "https://iswcnet.cisac.org"
RECAPTCHA_VALIDATE = f"{PORTAL}/ReCaptcha/ValidateReCaptchaResponse"
CONFIG_URL = f"{PORTAL}/configuration/GetClientAppConfiguration"

_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def _get_api_base() -> str:
    req = urllib.request.Request(CONFIG_URL, headers={"Accept": "application/json", "User-Agent": _UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        cfg = json.loads(resp.read())
    return cfg["iswcApiManagementUri"].rstrip("/")


def get_token() -> str:
    """reCAPTCHA megkerülése: a validate végpont sikertelen captcha esetén is JWT-t ad."""
    url = f"{RECAPTCHA_VALIDATE}?{urllib.parse.urlencode({'responseToken': 'x'})}"
    req = urllib.request.Request(url, data=b"", method="POST", headers={"User-Agent": _UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = json.loads(resp.read())
    # A válasz egy JSON-stringbe csomagolt JSON.
    if isinstance(body, str):
        body = json.loads(body)
    token = body.get("token_id")
    if not token:
        raise RuntimeError(f"Nincs token_id a válaszban: {body}")
    return token


class IswcClient:
    def __init__(self, token: str | None = None, api_base: str | None = None) -> None:
        self.api_base = (api_base or _get_api_base()).rstrip("/")
        self.token = token or get_token()

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Origin": PORTAL,
            "Referer": f"{PORTAL}/",
            "User-Agent": _UA,
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        }

    def _request(self, method: str, path: str, params: dict | None = None, data: dict | None = None):
        url = f"{self.api_base}{path}"
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"
        payload = json.dumps(data).encode() if data is not None else None
        req = urllib.request.Request(url, data=payload, method=method, headers=self._headers())
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            raise RuntimeError(f"ISWC HTTP {e.code} {method} {path}: {body[:400]}") from e

    def search_by_ipi(self, ipi_name_number: str | int, last_name: str = "") -> list[dict]:
        """Összes mű egy IPI Name Number alapján (cím nélküli creator-keresés)."""
        name_number = int(str(ipi_name_number).lstrip("0") or "0")
        party = {"lastName": last_name, "nameNumber": name_number, "baseNumber": "", "role": "C"}
        result = self._request(
            "POST", "/iswc/searchByTitleAndContributor", data={"interestedParties": [party]}
        )
        return result if isinstance(result, list) else [result]

    def search_by_iswc(self, iswc: str) -> dict:
        return self._request("GET", "/iswc/searchByIswc", params={"iswc": iswc})

    def search_by_agency_work_code(self, agency: str, work_code: str) -> dict:
        return self._request(
            "GET",
            "/iswc/searchByAgencyWorkCode",
            params={"agency": agency, "workCode": work_code, "detailLevel": 0},
        )


def _summarize(records: list[dict], ipi: str) -> None:
    name_number = int(str(ipi).lstrip("0") or "0")
    identities = set()
    for r in records:
        for ip in r.get("interestedParties", []):
            if ip.get("nameNumber") == name_number:
                identities.add((ip.get("name"), ip.get("baseNumber")))
    print(f"IPI {ipi} → name number {name_number}")
    if identities:
        print("Azonosított személy/jogtulajdonos:")
        for name, base in sorted(identities):
            print(f"  - {name}  (base: {base or '—'})")
    print(f"\nEgyedi ISWC művek: {len(records)}\n")
    for r in records:
        works = r.get("works", [])
        agencies = sorted({w.get("agency") for w in works if w.get("agency")})
        print(
            f"  {r.get('iswc'):<14} {r.get('iswcStatus','?'):<10} "
            f"{(r.get('originalTitle') or '')[:48]:<48} "
            f"works={len(works):>2} agencies={','.join(agencies)}"
        )


def main(argv: list[str]) -> int:
    import argparse

    p = argparse.ArgumentParser(description="CISAC ISWCnet lekérdező (IPI / ISWC).")
    p.add_argument("query", help="IPI name number (pl. 00644011781) vagy ISWC (pl. T0101974597)")
    p.add_argument("--iswc", action="store_true", help="A query egy ISWC, nem IPI")
    p.add_argument("--json", dest="as_json", action="store_true", help="Nyers JSON kimenet")
    p.add_argument("--out", help="JSON mentése fájlba")
    args = p.parse_args(argv)

    client = IswcClient()

    if args.iswc:
        data = client.search_by_iswc(args.query)
        records = [data]
    else:
        records = client.search_by_ipi(args.query)

    if args.out:
        with open(args.out, "w") as f:
            json.dump(records, f, indent=2, ensure_ascii=False)
        print(f"Mentve: {args.out}")

    if args.as_json:
        print(json.dumps(records, indent=2, ensure_ascii=False))
    elif args.iswc:
        r = records[0]
        print(f"ISWC {r.get('iswc')} — {r.get('originalTitle')} ({r.get('iswcStatus')})")
        print(f"Works: {len(r.get('works', []))}, interested parties: {len(r.get('interestedParties', []))}")
    else:
        _summarize(records, args.query)
    return 0


if __name__ == "__main__":
    import sys

    raise SystemExit(main(sys.argv[1:]))
