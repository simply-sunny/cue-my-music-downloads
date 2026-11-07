from pathlib import Path
import html,json,re
root=Path(__file__).resolve().parent
site=json.loads((root/'site.json').read_text())
owner,repo=site['repo'].rstrip('/').split('/')[-2:]
pages_url=f'https://{owner}.github.io/{repo}/'
order=site.get('page_order',['overview','install','use','recordings','streaming','uploader','configure','troubleshooting','limits','roadmap','changelog','develop','license'])
pages=sorted((root/'content').glob('*.html'),key=lambda p:order.index(p.stem) if p.stem in order else len(order))
stores=site.get('downloads',{})
links=['<a href="'+html.escape(url,quote=True)+'">'+html.escape(name)+'</a>' for name,url in stores.items()]
stores_text=' or '.join(filter(None,[', '.join(links[:-1]),*links[-1:]]))
actions=''.join('<a href="'+html.escape(url,quote=True)+'">'+html.escape(name)+' ↗</a>' for name,url in stores.items())
coming=site.get('coming',{})
spin='<i class="soon__spin" aria-hidden="true"></i>'
badge=lambda review,text:'<span class="soon" tabindex="0" data-review="'+html.escape(review,quote=True)+'">'+spin+html.escape(text)+'</span>'
soon=badge(','.join(s+'='+d for s,d in coming.items()),'Coming soon to '+' + '.join(coming)) if coming else ''
review=''.join('<li>'+badge(s+'='+d,s+' review')+'</li>' for s,d in coming.items())
actions+=soon
items=[(p.stem,p.read_text().replace('{{stores}}',stores_text).replace('{{actions}}',actions).replace(' {{coming}}',' '+soon if coming else '').replace('{{review}}',review).replace('{{repo}}',owner+'/'+repo)) for p in pages]
labels={key:re.search(r'<h1>(.*?)</h1>',body).group(1) for key,body in items}
output_manifest = root / '.generated-pages.json'
previous = json.loads(output_manifest.read_text()) if output_manifest.exists() else [p.name for p in (root/'public').glob('*.html') if '<main class="wiki-main"' in p.read_text()]
current = [('index' if key == 'overview' else key) + '.html' for key, _ in items]
for filename in previous:
 if filename not in current and Path(filename).name == filename:
  stale = root / 'public' / filename
  if stale.exists(): stale.unlink()
for key,body in items:
 nav=''.join('<a href="./'+('index' if k=='overview' else k)+'.html"'+(' aria-current="page"' if k==key else '')+'>'+('Overview' if k=='overview' else label)+'</a>' for k,label in labels.items())
 demo=''.join('<link rel="stylesheet" href="./assets/'+d+'.css"><script type="module" src="./assets/'+d+'.js"></script>' for cls,d in (('class="cmm-player"','player/player'),('class="cze-view"','view/view'),('class="screen"','screen/screen')) if cls in body)
 head='<link rel="icon" type="image/png" href="./assets/icon.png"><meta property="og:type" content="website"><meta property="og:title" content="'+html.escape(site['name'],quote=True)+'"><meta property="og:description" content="'+html.escape(site['description'],quote=True)+'"><meta property="og:image" content="'+pages_url+'assets/icon.png">' if (root/'public/assets/icon.png').exists() else ''
 page='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#000000"><link rel="preload" href="./assets/fonts/ibm-plex-sans-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin><meta name="description" content="'+html.escape(site['description'],quote=True)+'">'+head+'<title>'+html.escape(('Overview' if key=='overview' else labels[key])+' · '+site['name'])+'</title><link rel="stylesheet" href="./assets/base.css"><link rel="stylesheet" href="./assets/style.css"><script src="./assets/site.js" defer></script>'+demo+'</head><body><a class="skip" href="#main">Skip to content</a><header class="site-header shell"><a class="brand" href="./index.html">'+html.escape(site['name'])+'</a><nav aria-label="Project"><a href="'+site['repo']+'">Source ↗</a><a href="'+site['repo']+'/releases">Releases ↗</a></nav></header><div class="wiki shell"><aside class="sidebar"><input id="search" type="search" placeholder="Search" aria-label="Search"><nav aria-label="Documentation">'+nav+'</nav><span class="meta" id="search-status" role="status"></span></aside><main class="wiki-main" id="main" tabindex="-1"><article class="prose">'+body+'</article><footer class="site-footer"><span>'+html.escape(site['name'])+'</span><a href="'+site['repo']+'/issues">Report an issue ↗</a></footer></main></div></body></html>'
 (root/'public'/('index.html' if key=='overview' else key+'.html')).write_text(page)
not_found='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#000000"><meta name="robots" content="noindex"><title>Page not found · '+html.escape(site['name'])+'</title><link rel="stylesheet" href="/'+repo+'/assets/base.css"><link rel="stylesheet" href="/'+repo+'/assets/style.css"></head><body><header class="site-header shell"><a class="brand" href="/'+repo+'/">'+html.escape(site['name'])+'</a></header><main class="shell prose"><h1>Page not found</h1><p>Check the address, or go to the <a href="/'+repo+'/">overview</a>.</p></main></body></html>'
(root/'public/404.html').write_text(not_found)
index=[{'key':k,'title':'Overview' if k=='overview' else labels[k],'text':html.unescape(re.sub('<[^>]+>',' ',re.sub('<noscript>.*?</noscript>|<!--.*?-->','',body,flags=re.S))),'url':('index' if k=='overview' else k)+'.html'} for k,body in items]
(root/'public/assets/search.json').write_text(json.dumps(index))

output_manifest.write_text(json.dumps(current,indent=2)+'\n')
