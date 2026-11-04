#!/usr/bin/env python3
"""Split a mod repository's README into static wiki source pages."""
from pathlib import Path
import html,json,re,sys,hashlib
from urllib.parse import urljoin,urlsplit
try:
    import markdown
    import markdown.extensions.toc
except ImportError:
    raise SystemExit('Install authoring dependencies: python3 -m pip install -r requirements-authoring.txt')

root=Path(__file__).resolve().parent
site=json.loads((root/'site.json').read_text())
repo=Path(site.get('source_dir','..'))
if not repo.is_absolute():repo=(root/repo).resolve()
readme=(repo/'README.md').read_text()
body=readme.split('\n---\n',1)[-1] if '\n---\n' in readme else readme
parts=re.split(r'^## (.+)\s*$',body,flags=re.M)
sections={parts[i].strip():parts[i+1].strip() for i in range(1,len(parts),2)}
intro=parts[0].strip()
assign=site.get('sections',{'overview':['Features'],'install':['Install'],'use':['Use','Controls'],'configure':['Configure','The pack'],'troubleshooting':['Troubleshooting','Limits'],'develop':['Develop','Build','License']})
names={'overview':'Overview','install':'Install','use':'Use','configure':'Configure','troubleshooting':'Troubleshooting','develop':'Develop','limits':'Limits','license':'License','recordings':'Recordings','streaming':'Streaming','uploader':'YouTube uploader'}
# Remove stale generated pages from a prior sync, but keep custom pages.
manifest=root/'.synced-pages.json'
old=json.loads(manifest.read_text()) if manifest.exists() else []
new=[]
hash_file=root/'.synced-content.json'
hashes=json.loads(hash_file.read_text()) if hash_file.exists() else {}
updated_hashes=dict(hashes)
protected=set()
for path in (root/'content').glob('*.html'):
 text=path.read_text()
 digest=hashlib.sha256(path.read_bytes()).hexdigest()
 if ('cmm-player' in text or 'cze-view' in text or 'cpc-chart' in text or 'osh-view' in text or 'data-wiki-preserve' in text or (path.stem in hashes and digest != hashes[path.stem])):
  protected.add(path.stem)
  print(f'Preserved authored page: {path.name}; edit it manually to incorporate README changes.')
def save_page(page, text):
 if page in protected: return
 path=root/'content'/f'{page}.html'
 path.write_text(text)
 updated_hashes[page]=hashlib.sha256(path.read_bytes()).hexdigest()
page_for_heading={}
for page,titles in assign.items():
 for title in titles:
  page_for_heading[markdown.extensions.toc.slugify(title,'-')]=page
  for subtitle in re.findall(r'^### (.+)$',sections.get(title,''),re.M):
   page_for_heading[markdown.extensions.toc.slugify(subtitle,'-')]=page
page_for_heading['settings']='configure' if 'Configure' in sections else 'uploader'

def render(source):
    output=markdown.markdown(source,extensions=['tables','fenced_code','toc','sane_lists'])
    # Make repository-relative references usable from a standalone Pages subpath.
    def link(match):
        attr,url=match.group(1),html.unescape(match.group(2))
        if url.startswith('#'):
            fragment=url[1:];page=page_for_heading.get(fragment)
            if page:url='./'+('index' if page=='overview' else page)+'.html#'+fragment
        elif not urlsplit(url).scheme and not url.startswith('//'):
            url=urljoin(site['repo']+'/blob/main/',url)
        return attr+'="'+html.escape(url,quote=True)+'"'
    output=re.sub(r'(href|src)="([^"]*)"',link,output)
    output=re.sub(r'<table>', '<div class="table-wrap"><table>',output).replace('</table>','</table></div>')
    return output

for page,titles in assign.items():
    chunks=['## '+title+'\n\n'+sections[title] for title in titles if title in sections]
    if page!='overview' and not chunks:continue
    title=site['name'] if page=='overview' else names.get(page,page.replace('-',' ').title())
    result='<h1>'+html.escape(title)+'</h1>\n'
    if page=='overview':
        result+='<p class="lead">'+html.escape(site['description'])+'</p>\n'+render(intro)+'\n'
        links=site.get('downloads',{})
        result+='<div class="actions">'
        for label,url in links.items():result+='<a href="'+html.escape(url,quote=True)+'">'+html.escape(label)+' ↗</a>'
        result+='</div>\n'
    if len(chunks)==1:
        # Keep the source's heading anchor without repeating the page title.
        source=chunks[0];heading=titles[0] if titles[0] in sections else next(t for t in titles if t in sections)
        source=source.split('\n',1)[1].lstrip()
        result+='<div class="prose" id="'+markdown.extensions.toc.slugify(heading,'-')+'">'+render(source)+'</div>'
    else:
        result+=render('\n\n'.join(chunks))
    save_page(page,result)
    new.append(page)
if (repo/'CHANGELOG.md').is_file():
    result='<h1>Changelog</h1>'+render(re.sub(r'^# Changelog\s*','',(repo/'CHANGELOG.md').read_text(),count=1))
    save_page('changelog',result);new.append('changelog')
else:
    save_page('changelog','<h1>Changelog</h1><p><a href="'+site['repo']+'/releases">Read release notes ↗</a></p>');new.append('changelog')
for page in old:
    if page not in new and page not in protected:
        for p in [root/'content'/f'{page}.html',root/'public'/f'{page}.html']:
            if p.exists():p.unlink()
new=list(dict.fromkeys(new+sorted(protected)))
hash_file.write_text(json.dumps(updated_hashes,indent=2)+'\n')
manifest.write_text(json.dumps(new,indent=2)+'\n')
(root/'SOURCE.md').write_text('# Documentation source\n\nPages are derived from the local repository README.md and CHANGELOG.md. site.json controls page grouping and download links. Run `python3 sync-from-readme.py` then `python3 build.py` to refresh them. Existing source documents are never changed.\n')
print(f'Synced {len(new)} pages for {site["name"]}')
