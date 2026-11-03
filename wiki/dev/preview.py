#!/usr/bin/env python3
"""Serve a static site on loopback and inject local layout inspection."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--root', type=Path, default=Path('public'))
parser.add_argument('--port', type=int, default=8000)
args = parser.parse_args()
root = args.root.resolve()
addon = Path(__file__).with_name('layout-inspector.js')
if not root.is_dir():
    parser.error(f'No directory: {root}')

class Preview(SimpleHTTPRequestHandler):
    def do_GET(self):
        if urlsplit(self.path).path == '/__dev__/layout-inspector.js':
            data = addon.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'text/javascript; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        path = Path(self.translate_path(self.path))
        if path.is_dir():
            path = path / 'index.html'
        if path.is_file() and path.suffix == '.html':
            page = path.read_text()
            tag = '<script src="/__dev__/layout-inspector.js" defer></script>'
            page = page.replace('</head>', tag + '</head>') if '</head>' in page else tag + page
            data = page.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()

print(f'Development preview: http://localhost:{args.port}', flush=True)
ThreadingHTTPServer(('127.0.0.1', args.port), partial(Preview, directory=str(root))).serve_forever()
