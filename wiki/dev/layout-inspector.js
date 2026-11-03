(() => {
  // A second guard in addition to exclusion from production assets.
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname)) return;
  if (document.querySelector('#layout-inspector')) return;
  const key='layout-guides';
  let enabled=localStorage.getItem(key)!=='off', selected=null, scheduled=false;
  const layer=document.createElement('div');layer.id='layout-inspector';
  layer.innerHTML=`<svg aria-hidden="true"></svg><div class="layout-tools"><button type="button" aria-pressed="true">Guides on</button><span>Red: gaps · Green: padding · Alt+G</span></div><output class="layout-readout"></output>`;
  document.body.append(layer);
  const svg=layer.querySelector('svg'),button=layer.querySelector('button'),readout=layer.querySelector('output');
  const style=document.createElement('style');style.textContent=`
  #layout-inspector{position:fixed;inset:0;z-index:9999;pointer-events:none;font:10px/1.6 'IBM Plex Mono',monospace;color:#c5c5c5}
  #layout-inspector svg{position:absolute;inset:0;width:100%;height:100%;overflow:hidden}
  #layout-inspector .layout-tools{position:absolute;right:16px;bottom:16px;display:flex;align-items:center;gap:12px;padding:8px 12px;background:#111e;border:1px solid #333;pointer-events:auto}
  #layout-inspector button{font:inherit;color:#ccc;border:1px solid #555;background:#111;padding:3px 8px;cursor:pointer}
  #layout-inspector .layout-readout{position:absolute;left:16px;bottom:16px;max-width:calc(100vw - 32px);padding:10px 14px;background:#101010f5;border:1px solid #454545;white-space:pre-line;pointer-events:none}
  #layout-inspector .layout-readout:empty{display:none}
  @media(max-width:760px){#layout-inspector .layout-readout{bottom:70px;font-size:9px}#layout-inspector .layout-tools span{display:none}}
  `;document.head.append(style);
  const ns='http://www.w3.org/2000/svg';
  function shape(type,attrs){const n=document.createElementNS(ns,type);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));svg.append(n);return n;}
  const round=n=>Math.round(n*10)/10;
  function visible(el){const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;}
  function draw(){scheduled=false;svg.replaceChildren();readout.textContent='';button.textContent=enabled?'Guides on':'Guides off';button.setAttribute('aria-pressed',String(enabled));if(!enabled)return;
    document.querySelectorAll('body *').forEach(el=>{
      if(layer.contains(el)||['SCRIPT','STYLE','LINK','SVG','PATH'].includes(el.tagName)||!visible(el))return;
      const r=el.getBoundingClientRect(),s=getComputedStyle(el);
      const rects=s.display==='inline'?[...el.getClientRects()]:[r];
      for(const box of rects)shape('rect',{x:box.x,y:box.y,width:box.width,height:box.height,rx:parseFloat(s.borderTopLeftRadius)||0,fill:'none',stroke:'#6c8cb5','stroke-opacity':'.25','stroke-width':'.5'});
    });
    // Measure actual rendered whitespace, including collapsed margins and flex gaps.
    const measurements=new Set();const labelRects=[];
    function measure(x1,y1,x2,y2,label,color='#b77777'){
      if(Math.max(y1,y2)<0||Math.min(y1,y2)>innerHeight||Math.max(x1,x2)<0||Math.min(x1,x2)>innerWidth)return;
      const id=[x1,y1,x2,y2].map(n=>n.toFixed(2)).join(',');if(measurements.has(id))return;measurements.add(id);
      shape('line',{x1,y1,x2,y2,stroke:color,'stroke-width':.8});
      const vertical=x1===x2;
      for(const [x,y] of [[x1,y1],[x2,y2]])shape('line',{x1:x-(vertical?4:0),y1:y-(vertical?0:4),x2:x+(vertical?4:0),y2:y+(vertical?0:4),stroke:color,'stroke-width':.8});
      const text=shape('text',{x:vertical?x1-6:(x1+x2)/2,y:vertical?(y1+y2)/2+3:y1-6,fill:color,'font-size':9,'font-family':'IBM Plex Mono,monospace','text-anchor':vertical?'end':'middle',stroke:'#000','stroke-width':3,'paint-order':'stroke'});text.textContent=label;
      const rect=text.getBBox();
      if(labelRects.some(b=>rect.x<b.x+b.width+4&&rect.x+rect.width+4>b.x&&rect.y<b.y+b.height+3&&rect.y+rect.height+3>b.y))text.remove();else labelRects.push(rect);
    }
    document.querySelectorAll('body *').forEach(parent=>{
      if(layer.contains(parent)||['SCRIPT','STYLE','SVG','PATH'].includes(parent.tagName)||!visible(parent))return;
      const children=[...parent.children].filter(el=>!layer.contains(el)&&visible(el)&&getComputedStyle(el).position!=='absolute'&&getComputedStyle(el).position!=='fixed');
      for(let i=1;i<children.length;i++){
        const parentDisplay=getComputedStyle(parent).display;
        if(!['flex','inline-flex','grid','inline-grid'].includes(parentDisplay)&&[children[i-1],children[i]].some(el=>['inline','contents'].includes(getComputedStyle(el).display)))continue;
        const a=children[i-1].getBoundingClientRect(),b=children[i].getBoundingClientRect();
        const vg=b.top-a.bottom,hg=b.left-a.right;
        if(vg>=3&&Math.min(a.right,b.right)>Math.max(a.left,b.left)){
          const x=Math.max(32,Math.min(a.left,b.left)-12);measure(x,a.bottom,x,b.top,`${round(vg)}px`);
        }else if(hg>=3&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)){
          const y=Math.max(20,Math.min(a.top,b.top)-9);measure(a.right,y,b.left,y,`${round(hg)}px`);
        }
      }
      const r=parent.getBoundingClientRect(),c=getComputedStyle(parent),pt=parseFloat(c.paddingTop)||0,pb=parseFloat(c.paddingBottom)||0,pl=parseFloat(c.paddingLeft)||0,pr=parseFloat(c.paddingRight)||0;
      if(pt>=8)measure(r.right-12,r.top,r.right-12,r.top+pt,`p ${round(pt)}`,'#7d9e88');
      if(pb>=8)measure(r.right-12,r.bottom-pb,r.right-12,r.bottom,`p ${round(pb)}`,'#7d9e88');
      if(pl>=8&&r.width>120)measure(r.left,r.top+12,r.left+pl,r.top+12,`p ${round(pl)}`,'#7d9e88');
      if(pr>=8&&r.width>120)measure(r.right-pr,r.top+12,r.right,r.top+12,`p ${round(pr)}`,'#7d9e88');
      const radius=parseFloat(c.borderTopLeftRadius)||0;
      if(radius>0){const t=shape('text',{x:r.left+4,y:r.top+12,fill:'#8faecc','font-size':9});t.textContent=`r ${radius}`;}
    });
    if(!selected||!selected.isConnected||!visible(selected))return;
    const r=selected.getBoundingClientRect(),s=getComputedStyle(selected);
    for(const x of [r.left,r.right])shape('line',{x1:x,y1:0,x2:x,y2:innerHeight,stroke:'#cc7373','stroke-opacity':'.65','stroke-width':'.75','stroke-dasharray':'3 3'});
    for(const y of [r.top,r.bottom])shape('line',{x1:0,y1:y,x2:innerWidth,y2:y,stroke:'#cc7373','stroke-opacity':'.65','stroke-width':'.75','stroke-dasharray':'3 3'});
    shape('rect',{x:r.x,y:r.y,width:r.width,height:r.height,fill:'none',stroke:'#97b9e3','stroke-width':1});
    const p=['Top','Right','Bottom','Left'].map(k=>parseFloat(s['padding'+k])||0);
    if(p.some(Boolean))shape('rect',{x:r.x+p[3],y:r.y+p[0],width:Math.max(0,r.width-p[1]-p[3]),height:Math.max(0,r.height-p[0]-p[2]),fill:'#7aa58a','fill-opacity':'.08',stroke:'#7aa58a','stroke-opacity':'.6','stroke-dasharray':'2 3','stroke-width':'.75'});
    for(const [x,y] of [[r.left,r.top],[r.right,r.top],[r.right,r.bottom],[r.left,r.bottom]])shape('rect',{x:x-2,y:y-2,width:4,height:4,fill:'#000',stroke:'#97b9e3','stroke-width':1});
    const label=shape('text',{x:Math.max(4,Math.min(r.left,innerWidth-160)),y:r.top>22?r.top-7:r.top+14,fill:'#aac1dd','font-size':10,'font-family':'IBM Plex Mono, monospace'});label.textContent=`${s.display==='inline'?'inline bounds':'border box'} ${round(r.width)} × ${round(r.height)} px`;
    const name=selected.tagName.toLowerCase()+(selected.id?'#'+selected.id: selected.classList.length?'.'+[...selected.classList].join('.'): '');
    readout.textContent=`${name}  |  ${round(r.width)} × ${round(r.height)} px  |  x ${round(r.x)}  y ${round(r.y)}\nPadding T/R/B/L: ${p.join(' / ')} px\nMargin T/R/B/L: ${['Top','Right','Bottom','Left'].map(k=>s['margin'+k]).join(' / ')}\nRadius TL/TR/BR/BL: ${['TopLeft','TopRight','BottomRight','BottomLeft'].map(k=>s['border'+k+'Radius']).join(' / ')}\nGap row/column: ${s.rowGap} / ${s.columnGap}  |  Font: ${s.fontSize} / ${s.lineHeight}\nDisplay: ${s.display} · Inline bounds describe font fragments, not line boxes or glyph ink.\nParent: ${selected.parentElement?selected.parentElement.tagName.toLowerCase():'none'} · Border-box measurements include padding; gaps include margins and line layout.`;
  }
  function queue(){if(!scheduled){scheduled=true;requestAnimationFrame(draw);}}
  button.addEventListener('click',()=>{enabled=!enabled;localStorage.setItem(key,enabled?'on':'off');queue();});
  document.addEventListener('keydown',e=>{if(e.altKey&&e.key.toLowerCase()==='g'){e.preventDefault();button.click();}});
  document.addEventListener('pointermove',e=>{if(!layer.contains(e.target)){selected=e.target;if(enabled)queue();}});
  window.addEventListener('resize',queue);window.addEventListener('scroll',queue,{passive:true});
  new MutationObserver(records=>{if(records.some(r=>!layer.contains(r.target)))queue();}).observe(document.body,{childList:true,subtree:true,attributes:true});
  document.fonts.ready.then(queue);queue();
})();
