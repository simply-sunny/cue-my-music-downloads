from pathlib import Path
import html,json,re
root=Path(__file__).resolve().parent
site=json.loads((root/'site.json').read_text())
order=site.get('page_order',['overview','install','use','recordings','streaming','uploader','configure','troubleshooting','limits','changelog','develop','license'])
pages=sorted((root/'content').glob('*.html'),key=lambda p:order.index(p.stem) if p.stem in order else len(order))
items=[(p.stem,p.read_text()) for p in pages]
labels={key:re.search(r'<h1>(.*?)</h1>',body).group(1) for key,body in items}
for key,body in items:
 nav=''.join('<a href="./'+('index' if k=='overview' else k)+'.html"'+(' aria-current="page"' if k==key else '')+'>'+('Overview' if k=='overview' else label)+'</a>' for k,label in labels.items())
 page='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#000000"><meta name="description" content="'+html.escape(site['description'],quote=True)+'"><title>'+html.escape(('Overview' if key=='overview' else labels[key])+' · '+site['name'])+'</title><link rel="stylesheet" href="./assets/base.css"><link rel="stylesheet" href="./assets/style.css"><script src="./assets/site.js" defer></script></head><body><a class="skip" href="#main">Skip to content</a><header class="site-header shell"><a class="brand" href="./index.html">'+html.escape(site['name'])+'</a><nav aria-label="Project"><a href="'+site['repo']+'">Source ↗</a><a href="'+site['repo']+'/releases">Releases ↗</a></nav></header><div class="wiki shell"><aside class="sidebar"><label for="search">Find a page</label><input id="search" type="search" placeholder="Search documentation"><nav aria-label="Documentation">'+nav+'</nav><span class="meta" id="search-status" role="status"></span></aside><main class="wiki-main" id="main" tabindex="-1"><p class="breadcrumb meta">Documentation / '+('Overview' if key=='overview' else labels[key])+'</p><article class="prose">'+body+'</article><footer class="site-footer"><span>'+html.escape(site['name'])+'</span><a href="'+site['repo']+'/blob/main/README.md">Project documentation ↗</a></footer></main></div></body></html>'
 (root/'public'/('index.html' if key=='overview' else key+'.html')).write_text(page)
index=[{'key':k,'title':'Overview' if k=='overview' else labels[k],'text':re.sub('<[^>]+>',' ',body),'url':('index' if k=='overview' else k)+'.html'} for k,body in items]
(root/'public/assets/search.json').write_text(json.dumps(index))
