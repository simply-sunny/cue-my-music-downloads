#!/usr/bin/env python3
"""Fail if the deploy directory contains development inspector code."""
from pathlib import Path
import sys
root = Path(sys.argv[1] if len(sys.argv)>1 else 'public')
if not root.is_dir():
    raise SystemExit(f'Missing production directory: {root}')
markers = (b'layout-inspector', b'assets/layout.js', b'__dev__/', b'layout-guides')
failures = []
for path in root.rglob('*'):
    if path.is_file() and (path.name in {'layout.js', 'layout-inspector.js', 'preview.py'} or any(m in path.read_bytes() for m in markers)):
        failures.append(str(path))
if failures:
    raise SystemExit('Development inspector found in production assets:\n'+'\n'.join(failures))
print(f'Production assets clean: {root}')
