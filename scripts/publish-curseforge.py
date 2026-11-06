#!/usr/bin/env python3
"""Upload the built jars, at the version in gradle.properties, to CurseForge, mirroring the Modrinth release in MODRINTH.md.

CurseForge projects can't be created through the API: create it by hand from CURSEFORGE.md
first. An upload goes to CurseForge's review and is published when approved, so only run
this without --dry-run when you mean to release.

Usage: CURSEFORGE_API_KEY=... python3 scripts/publish-curseforge.py <project-id> [--dry-run]
"""
import json
import os
import re
import sys
import urllib.request
import uuid
from pathlib import Path

API = "https://minecraft.curseforge.com/api"
ROOT = Path(__file__).resolve().parent.parent
VERSION = re.search(r"^mod_version=(.+)$", (ROOT / "gradle.properties").read_text(), re.M).group(1).strip()

# jar suffix -> (display range, Minecraft versions, Java version)
JARS = {
    "26.3": ("26.3", ["26.3"], "Java 25"),
}
LOADERS_AND_ENV = ["Fabric", "Quilt", "Client"]
RELATIONS = [
    {"slug": "cue-my-music", "type": "requiredDependency"},
    {"slug": "fabric-api", "type": "requiredDependency"},
]


def request(path, data=None, content_type=None):
    req = urllib.request.Request(API + path, data=data)
    req.add_header("X-Api-Token", os.environ["CURSEFORGE_API_KEY"])
    if content_type:
        req.add_header("Content-Type", content_type)
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def version_ids():
    """Map names to IDs, preferring Minecraft version types over the untyped/addon duplicates."""
    types = {t["id"]: t["slug"] for t in request("/game/version-types")}
    ids = {}
    for v in request("/game/versions"):
        slug = types.get(v["gameVersionTypeID"], "")
        if slug.startswith("minecraft-") or slug in ("modloader", "environment", "java"):
            ids.setdefault(v["name"], v["id"])
    return ids


def changelog():
    text = (ROOT / "CHANGELOG.md").read_text()
    match = re.search(rf"^## (?:\[{re.escape(VERSION)}\]|{re.escape(VERSION)}\b)[^\n]*\n(.*?)(?=^## |\Z)", text, re.S | re.M)
    return match.group(1).strip()


def multipart(fields, file_path):
    boundary = uuid.uuid4().hex
    parts = []
    for name, value in fields.items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    parts.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{file_path.name}"\r\n'
        f"Content-Type: application/java-archive\r\n\r\n".encode()
    )
    parts.append(file_path.read_bytes())
    parts.append(f"\r\n--{boundary}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def main():
    if len(sys.argv) < 2 or sys.argv[1].startswith("-"):
        sys.exit(__doc__)
    project_id = sys.argv[1]
    dry_run = "--dry-run" in sys.argv
    ids = version_ids()
    notes = changelog()

    for suffix, (label, mc_versions, java) in JARS.items():
        jar = ROOT / "build" / "libs" / f"cue-my-music-downloads-{suffix}-{VERSION}.jar"
        if not jar.is_file():
            sys.exit(f"missing {jar}")
        names = mc_versions + LOADERS_AND_ENV + [java]
        missing = [n for n in names if n not in ids]
        if missing:
            sys.exit(f"CurseForge has no version tag for {missing}")
        metadata = {
            "changelog": notes,
            "changelogType": "markdown",
            "displayName": f"Cue My Music: Downloads {VERSION} ({label})",
            "gameVersions": [ids[n] for n in names],
            "releaseType": "release",
            "relations": {"projects": RELATIONS},
        }
        if dry_run:
            print(jar.name, json.dumps({**metadata, "changelog": f"<{len(notes)} chars>"}))
            continue
        body, content_type = multipart({"metadata": json.dumps(metadata)}, jar)
        result = request(f"/projects/{project_id}/upload-file", body, content_type)
        print(f"{jar.name} -> file {result['id']}")


if __name__ == "__main__":
    main()
