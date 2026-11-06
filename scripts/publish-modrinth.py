#!/usr/bin/env python3
"""Create the Modrinth project and version from MODRINTH.md, and keep the listing body in sync.

Creates the project as a draft if the slug isn't taken yet (with the icon and the listing
body from MODRINTH.md); otherwise updates its summary and body from MODRINTH.md. Then uploads
the built jar, at the version in gradle.properties, if that version isn't there yet: as a draft
while the project is a draft, else listed. Submitting the project for review is done by hand.

Usage: MODRINTH_API_KEY=... python3 scripts/publish-modrinth.py [--dry-run]
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

API = "https://api.modrinth.com/v2"
USER_AGENT = "simply-sunny/cue-my-music-downloads (github.com/simply-sunny/cue-my-music-downloads)"
ROOT = Path(__file__).resolve().parent.parent
VERSION = re.search(r"^mod_version=(.+)$", (ROOT / "gradle.properties").read_text(), re.M).group(1).strip()
SLUG = "cue-my-music-downloads"

# jar suffix -> (label, Minecraft versions)
JARS = {
    "26.3": ("26.3", ["26.3"]),
}
LOADERS = ["fabric", "quilt"]
DEPENDENCIES = [
    {"project_id": "dCISwMOO", "dependency_type": "required"},  # Cue My Music
    {"project_id": "P7dR8mSH", "dependency_type": "required"},  # Fabric API
]


def request(method, path, data=None, content_type=None, api=API):
    req = urllib.request.Request(api + path, data=data, method=method)
    req.add_header("Authorization", os.environ["MODRINTH_API_KEY"])
    req.add_header("User-Agent", USER_AGENT)
    if content_type:
        req.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        sys.exit(f"{method} {path} -> {e.code}: {e.read().decode()}")


def multipart(data, files):
    boundary = uuid.uuid4().hex
    parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="data"\r\n'
             f"Content-Type: application/json\r\n\r\n{json.dumps(data)}\r\n".encode()]
    for name, (path, mime) in files.items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{path.name}"\r\n'
                     f"Content-Type: {mime}\r\n\r\n".encode())
        parts.append(path.read_bytes())
        parts.append(b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def sheet():
    """Project settings table and listing body from MODRINTH.md."""
    text = (ROOT / "MODRINTH.md").read_text()
    head, body = text.split("\n---\n", 1)
    fields = dict(re.findall(r"^\| ([^|]+?) \| (.+?) \|$", head, re.M))
    return fields, body.strip()


def changelog():
    text = (ROOT / "CHANGELOG.md").read_text()
    match = re.search(rf"^## (?:\[{re.escape(VERSION)}\]|{re.escape(VERSION)}\b)[^\n]*\n(.*?)(?=^## |\Z)", text, re.S | re.M)
    return match.group(1).strip()


def main():
    dry_run = "--dry-run" in sys.argv
    fields, body = sheet()
    summary = fields["Summary"]
    categories = re.findall(r"`([^`]+)`", fields["Featured categories"])
    icon = ROOT / "src/main/resources/assets/cuemymusic_downloads/icon.png"

    project = request("GET", f"/project/{SLUG}")
    if project is None:
        data = {
            "slug": SLUG,
            "title": "Cue My Music: Downloads",
            "description": summary,
            "body": body,
            "categories": categories,
            "client_side": "required",
            "server_side": "unsupported",
            "project_type": "mod",
            "license_id": "MIT",
            "source_url": "https://github.com/simply-sunny/cue-my-music-downloads",
            "issues_url": "https://github.com/simply-sunny/cue-my-music-downloads/issues",
            "wiki_url": "https://github.com/simply-sunny/cue-my-music-downloads#use",
            "is_draft": True,
            "initial_versions": [],
        }
        if dry_run:
            print("would create draft project", json.dumps({**data, "body": f"<{len(body)} chars>"}))
            return
        payload, content_type = multipart(data, {"icon": (icon, "image/png")})
        project = request("POST", "/project", payload, content_type)
        print(f"created draft project {project['id']} ({project['slug']})")
    else:
        print(f"project {project['id']} exists, status {project['status']}")
        if dry_run:
            print(f"would update summary and body (<{len(body)} chars>)")
        else:
            request("PATCH", f"/project/{project['id']}", json.dumps({"description": summary, "body": body}).encode(),
                    "application/json")
            print("updated summary and body")

    # Draft versions aren't listed by the API, so the ones already uploaded are the IDs recorded in MODRINTH.md.
    existing = {v["name"] for v in request("GET", f"/project/{project['id']}/version") or []}
    recorded = dict(re.findall(r"^\| `([^`]+\.jar)` \| `([A-Za-z0-9]{8})` \|$", (ROOT / "MODRINTH.md").read_text(), re.M))
    notes = changelog()
    for suffix, (label, game_versions) in JARS.items():
        name = f"Cue My Music: Downloads {VERSION} ({label})"
        jar = ROOT / "build" / "libs" / f"cue-my-music-downloads-{suffix}-{VERSION}.jar"
        draft = recorded.get(jar.name)
        if name in existing or (draft and request("GET", f"/version/{draft}")):
            print(f"{name} already uploaded")
            continue
        if not jar.is_file():
            sys.exit(f"missing {jar}, run ./gradlew build")
        data = {
            "project_id": project["id"],
            "name": name,
            "version_number": VERSION,
            "changelog": notes,
            "dependencies": DEPENDENCIES,
            "game_versions": game_versions,
            "version_type": "release",
            "loaders": LOADERS,
            "featured": True,
            "status": "draft" if project["status"] == "draft" else "listed",
            "file_parts": ["file"],
            "primary_file": "file",
        }
        if dry_run:
            print("would upload", jar.name, json.dumps({**data, "changelog": f"<{len(notes)} chars>"}))
            continue
        payload, content_type = multipart(data, {"file": (jar, "application/java-archive")})
        version = request("POST", "/version", payload, content_type)
        # Client or server side is set per version, and only through v3.
        request("PATCH", f"/version/{version['id']}", json.dumps({"environment": "client_only"}).encode(),
                "application/json", api=API.replace("/v2", "/v3"))
        print(f"{jar.name} -> version {version['id']}; add it to the version table in MODRINTH.md")


if __name__ == "__main__":
    main()
