"""URL to file-path contract for the static export.

A static build has no backend, so every `/api/...` request the apps make is answered from
a file. This module decides which file. The same rule is written in TypeScript in
frontend/investigator/src/lib/static-api.ts; both are checked against
tests/static_key_vectors.json, which is the one place the rule is pinned.

Rule, for `/api/<path>?<query>`:
  route = <path> with "/" replaced by "__"
  no query            -> <route>/_.json
  otherwise           -> <route>/<slug>-<hash>.json
    canon = decoded pairs sorted by key then value, joined "k=v" with "&"
    slug  = canon with every character outside [A-Za-z0-9._=-] replaced by "_", cut to 48
    hash  = FNV-1a 32-bit over the UTF-8 bytes of canon, 8 lowercase hex digits
"""

from __future__ import annotations

import re
from urllib.parse import parse_qsl, urlsplit

_API_PREFIX = "/api/"
_UNSAFE = re.compile(r"[^A-Za-z0-9._=-]")
_SLUG_MAX = 48


def fnv1a32(data: bytes) -> str:
    """FNV-1a, 32-bit, as 8 lowercase hex digits."""
    h = 0x811C9DC5
    for byte in data:
        h ^= byte
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def static_path(url: str) -> str:
    """The export file for one request, relative to the scenario directory."""
    parts = urlsplit(url)
    route = parts.path[len(_API_PREFIX) :].strip("/")
    if not parts.path.startswith(_API_PREFIX) or not route:
        raise ValueError(f"not an /api/ request: {url!r}")
    route = route.replace("/", "__")
    pairs = sorted(parse_qsl(parts.query, keep_blank_values=True))
    if not pairs:
        return f"{route}/_.json"
    canon = "&".join(f"{key}={value}" for key, value in pairs)
    slug = _UNSAFE.sub("_", canon)[:_SLUG_MAX]
    return f"{route}/{slug}-{fnv1a32(canon.encode('utf-8'))}.json"
