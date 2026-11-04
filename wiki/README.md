# Cue My Music: Downloads wiki

Static GitHub Pages documentation. Edit content/*.html and run `python3 build.py` from this directory. The source pages are generated initially from the repository's current README and changelog. Normal builds need only Python 3.

To refresh from repository documentation, install requirements-authoring.txt in a virtual environment, run `python3 sync-from-readme.py`, review the content changes, then run `python3 build.py`. site.json controls the description, download URLs, and page grouping. Sync never edits the repository README or changelog.

Preview from this directory with `python3 dev/preview.py --root public --port 8000`. Guides are development-only. Publish only public/.

The root .github/workflows/wiki.yml builds and checks this wiki, then uploads wiki/public to GitHub Pages. Select GitHub Actions in repository Settings → Pages when ready. Nothing is published until that workflow runs.

The shared style uses an 8px spacing scale and self-hosted IBM Plex. Only the public directory is a deployment artifact. See dev/README.md for inspection controls and limitations.

README refresh preserves pages with demo mounts, data-wiki-preserve annotations, or changes since the last import. It reports each preserved page; update those pages manually from the source. .synced-content.json tracks imported content; .generated-pages.json tracks build-owned HTML so removing a source page also removes its old output.
