/* HeatConnect · Visite technique · application cliente (téléphone, iPad, bureau) */
(function(){
'use strict';
const {S,ORDER,TAGL,esc,isEmpty,fmtDate,uid,ensure,holderPhotos,stripPending,checklist,score,secState,photoFiles,rapportHTML,resumeTexte}=window.HC;
const $=(s,r=document)=>r.querySelector(s);
const el=(tag,attrs={},...kids)=>{const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==='class')e.className=v;else if(k==='html')e.innerHTML=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(v!==false&&v!=null)e.setAttribute(k,v===true?'':v);}for(const k of kids.flat()){if(k==null)continue;e.append(k.nodeType?k:document.createTextNode(k));}return e;};
const ME=window.HC_USER||{};

/* ---------- API ---------- */
async function api(path,opts={}){
  const init={method:opts.method||'GET',headers:{}};
  if(opts.body instanceof FormData)init.body=opts.body;else if(opts.body!==undefined){init.headers['Content-Type']='application/json';init.body=JSON.stringify(opts.body);}
  const r=await fetch(path,init);
  if(r.status===401){location.href='/api/auth/signin';throw new Error('Session expirée');}
  const ct=r.headers.get('content-type')||'';
  const data=ct.includes('application/json')?await r.json():await r.text();
  if(!r.ok){const e=new Error((data&&data.error)||('Erreur '+r.status));e.status=r.status;e.data=data;throw e;}
  return data;
}

/* ---------- État ---------- */
let visites=[],cur=null,curSec='bat';
let dirty=false,saving=false,saveTimer=null,busy=false;
const toastEl=$('#toast');let toastT;
function toast(m,ms=2800){toastEl.textContent=m;toastEl.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('show'),ms);}
function setStatus(t,err){const s=$('#status');s.textContent=t;s.classList.toggle('err',!!err);}

/* ---------- Persistance ---------- */
function touch(){if(!cur)return;cur.maj=Date.now();dirty=true;setStatus('Modifié…');clearTimeout(saveTimer);saveTimer=setTimeout(flush,900);try{localStorage.setItem('hc_draft_'+cur.id,JSON.stringify(stripPending(cur)));}catch(e){}}
async function flush(){
  clearTimeout(saveTimer);saveTimer=null;
  if(!cur||saving||!dirty)return;
  saving=true;dirty=false;const snap=stripPending(cur);setStatus('Enregistrement…');let ok=false;
  try{await api('/api/visites/'+snap.id,{method:'PUT',body:snap});setStatus('Enregistré ✓');ok=true;try{localStorage.removeItem('hc_draft_'+snap.id);}catch(e){}}
  catch(e){dirty=true;setStatus(navigator.onLine?'Non enregistré, nouvel essai…':'Hors ligne, brouillon gardé',true);saveTimer=setTimeout(flush,8000);}
  finally{saving=false;if(ok&&dirty)saveTimer=setTimeout(flush,300);}
}
window.addEventListener('online',()=>{if(dirty)flush();});
window.addEventListener('beforeunload',()=>{if(dirty)flush();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&dirty){clearTimeout(saveTimer);saveTimer=null;flush();}});

/* ---------- Routage ---------- */
function route(){const h=location.hash.replace('#','');if(h.startsWith('v-')){openVisite(h.slice(2));}else{showListe();}}
window.addEventListener('hashchange',route);
function go(h){if(location.hash!=='#'+h)location.hash=h;else route();}

async function showListe(){
  cur=null;$('#vue-visite').hidden=true;$('#vue-liste').hidden=false;$('#bnav').hidden=true;$('#btn-retour').hidden=true;$('#brand').hidden=false;$('#top-title').textContent='';setStatus('');
  renderListe();window.scrollTo(0,0);
  try{visites=await api('/api/visites');$('#offline-note').hidden=true;renderListe();}
  catch(e){$('#offline-note').hidden=false;$('#offline-note').textContent='Impossible de lire les visites dans le Drive : '+(e.message||'erreur réseau')+'. Vérifiez la connexion et rechargez.';}
}
function renderListe(){
  const list=$('#vlist');list.innerHTML='';$('#vempty').hidden=visites.length>0;
  for(const v of visites){
    list.append(el('button',{class:'vcard',onclick:()=>go('v-'+v.id)},
      el('div',{class:'n'},v.nom||'Bâtiment sans nom'),
      el('div',{class:'a'},v.adresse||'Adresse à compléter'),
      v.dealName?el('div',{class:'crm'},'CRM : '+v.dealName):null,
      el('div',{class:'m'},el('span',{class:'mono'},fmtDate(v.maj)),el('div',{class:'bar'},el('i',{style:'width:'+(v.pct||0)+'%'})),el('span',{class:'mono'},(v.pct||0)+' %'))));}
}

async function openVisite(id){
  $('#vue-liste').hidden=true;$('#vue-visite').hidden=false;$('#bnav').hidden=false;$('#btn-retour').hidden=false;$('#brand').hidden=true;
  $('#sec').innerHTML='';$('#strip').innerHTML='';$('#top-title').textContent='Chargement…';setStatus('');
  let v=null;
  try{v=ensure(await api('/api/visites/'+id));}
  catch(e){try{const d=localStorage.getItem('hc_draft_'+id);if(d)v=ensure(JSON.parse(d));}catch(x){}
    if(!v){toast('Visite introuvable : '+(e.message||''));go('accueil');return;}}
  let draft=null;try{const d=localStorage.getItem('hc_draft_'+id);if(d)draft=JSON.parse(d);}catch(e){}
  if(draft&&draft.maj>v.maj){v=ensure(draft);dirty=true;saveTimer=setTimeout(flush,500);toast('Brouillon local plus récent repris.');}
  cur=v;try{localStorage.setItem('hc_last',id);}catch(e){}
  setStatus(dirty?'Modifié…':'Enregistré ✓');
  renderSection();window.scrollTo(0,0);
  if(v.crm&&v.crm.dealId&&!v.sources.length&&!v._prefillSkipped){runPrefill('auto');}
}

/* ---------- Rendu ---------- */
function renderStrip(){
  const st=$('#strip');st.innerHTML='';
  for(const sid of ORDER){const b=el('button',{class:sid===curSec?'on':'',onclick:()=>{curSec=sid;renderSection();window.scrollTo(0,0);}});
    if(sid==='rap'){b.append(el('span',{class:'num'},'■'),' Rapport');}
    else{b.append(el('span',{class:'dot '+secState(cur,sid)}),el('span',{class:'num'},S[sid].num),' '+S[sid].titre);}
    st.append(b);}
  const on=st.querySelector('.on');if(on)on.scrollIntoView({inline:'center',block:'nearest'});
}
function renderSection(){
  if(!cur)return;$('#top-title').textContent=cur.bat.nom||(cur.crm&&cur.crm.dealName)||'Nouvelle visite';
  renderStrip();const root=$('#sec');root.innerHTML='';
  const i=ORDER.indexOf(curSec);$('#btn-prev').disabled=i===0;$('#btn-next').textContent=i===ORDER.length-1?'Terminer':'Suivant ›';
  if(busy)root.append(el('div',{class:'progress',id:'prefill-progress'},el('span',{class:'spin'}),' '+busy));
  if(curSec==='rap'){renderRapport(root);return;}
  const sec=S[curSec],d=cur[curSec];
  root.append(el('div',{class:'sec-h'},el('div',{class:'eyebrow'},'Section '+sec.num),el('h2',{},sec.titre),el('p',{},sec.sous)));
  if(curSec==='bat')root.append(renderCrmBar());
  if(curSec==='ene')root.append(renderDocs());
  const g=el('div',{class:'group'});root.append(g);
  for(const f of sec.champs){
    if(f.h){g.append(el('div',{class:'sub'},el('h3',{},f.h),f.hint?el('p',{},f.hint):null));continue;}
    if(f.info){g.append(el('div',{class:'info',html:f.info}));continue;}
    if(f.showIf&&!f.showIf(cur))continue;
    if(f.t==='liste'){g.append(renderListe_(d,f,sec));continue;}
    g.append(renderField(d,f,{sec:curSec}));
  }
  const ph=sec.photos.filter(p=>!p.showIf||p.showIf(cur));
  if(ph.length){g.append(el('div',{class:'sub'},el('h3',{},'Photos de la section')));const pw=el('div',{class:'photos'});for(const p of ph)pw.append(renderPhotoGroup(d,p,{sec:curSec,prefix:sec.prefix,pk:curSec+'_'+p.k}));g.append(pw);}
}
function renderCrmBar(){
  const c=cur.crm;
  if(!c||!c.dealId){return el('div',{class:'crmbar'},el('span',{},'Aucune opportunité CRM liée.'),el('button',{class:'btn sm',onclick:()=>pickDeal(async deal=>{busy='Liaison à l’opportunité…';renderSection();try{cur=ensure(await api('/api/visites/'+cur.id+'/link',{method:'POST',body:{dealId:deal.id,visite:stripPending(cur)}}));busy=false;renderSection();runPrefill('manual');}catch(e){busy=false;renderSection();toast('Liaison échouée : '+e.message,4000);}})},'Lier une opportunité'));}
  const bar=el('div',{class:'crmbar'},
    el('span',{},el('b',{},c.dealName||'Opportunité'),c.stage?' · '+c.stage:''),
    c.url?el('a',{href:c.url,target:'_blank',rel:'noopener'},'Ouvrir dans Zoho ↗'):null,
    cur._drive&&cur._drive.folderId?el('a',{href:'https://drive.google.com/drive/folders/'+cur._drive.folderId,target:'_blank',rel:'noopener'},'Dossier Drive ↗'):null,
    el('button',{class:'btn sm',disabled:!!busy,onclick:()=>runPrefill('manual')},cur.sources.length?'↻ Mettre à jour depuis le CRM, le Drive et les courriels':'✨ Préremplir depuis le CRM, le Drive et les courriels'));
  if(cur.sources.length)bar.append(el('span',{class:'src',style:'flex-basis:100%'},'Dernier préremplissage : '+cur.sources[cur.sources.length-1]));
  return bar;
}
function renderDocs(){
  const box=el('div',{class:'panel',style:'margin-bottom:14px'});
  box.append(el('h3',{},'Documents du Drive de l’opportunité'),el('p',{},'Les factures d’énergie déposées dans le dossier Drive sont lues automatiquement et ajoutées aux factures ci-dessous. Déposez les PDF dans le dossier, puis synchronisez.'));
  const docs=cur.docs||[];
  if(!docs.length)box.append(el('p',{class:'hint'},cur._drive&&cur._drive.folderId?'Aucun document trouvé pour l’instant.':'Aucun dossier Drive lié à cette visite.'));
  else{const dl=el('div',{class:'docs'});for(const d of docs){dl.append(el('div',{class:'doc'},el('span',{class:'n'},d.name),d.analyse==='facture'?el('span',{class:'pill ai'},'Facture lue'):(d.analyse==='document'?el('span',{class:'pill'},'Lu'):el('span',{class:'pill'},'Non analysé')),el('a',{href:'https://drive.google.com/file/d/'+d.id+'/view',target:'_blank',rel:'noopener'},'Ouvrir ↗')));}box.append(dl);}
  box.append(el('div',{class:'actions',style:'margin-top:10px'},el('button',{class:'btn sm',disabled:!!busy||!(cur._drive&&cur._drive.folderId),onclick:()=>runDriveSync()},'↻ Synchroniser le Drive (factures)')));
  return box;
}
async function runPrefill(mode){
  if(busy||!cur||!cur.crm||!cur.crm.dealId)return;
  if(dirty){clearTimeout(saveTimer);await flush();}
  busy='Préremplissage en cours : lecture du CRM, des notes, du Drive et des courriels. Cela prend une à trois minutes.';renderSection();
  const id=cur.id;
  try{const v=await api('/api/visites/'+id+'/prefill',{method:'POST',body:{fileId:cur._drive&&cur._drive.fileId}});
    if(cur&&cur.id===id){cur=ensure(v);busy=false;renderSection();toast('Préremplissage terminé. Les champs en mauve viennent du CRM, du Drive ou des courriels : vérifiez-les.',5000);}}
  catch(e){if(cur&&cur.id===id){cur._prefillSkipped=true;busy=false;renderSection();}toast('Préremplissage échoué : '+(e.message||'erreur'),6000);}
}
async function runDriveSync(){
  if(busy||!cur)return;if(dirty){clearTimeout(saveTimer);await flush();}
  busy='Lecture des documents du Drive…';renderSection();const id=cur.id;
  try{const v=await api('/api/visites/'+id+'/drive-sync',{method:'POST',body:{fileId:cur._drive&&cur._drive.fileId}});if(cur&&cur.id===id){cur=ensure(v);busy=false;renderSection();toast('Drive synchronisé.');}}
  catch(e){if(cur&&cur.id===id){busy=false;renderSection();}toast('Synchronisation échouée : '+(e.message||'erreur'),5000);}
}
function renderField(obj,f,ctx){
  const wrap=el('div',{class:'f'+(f.full?' full':'')});
  const lab=el('div',{class:'fl'},f.l);if(f.tag)lab.append(el('span',{class:'tag '+f.tag},TAGL[f.tag]));
  const aiK=obj._ai&&obj._ai[f.k];
  if(aiK)lab.append(el('span',{class:'tag ai',title:(obj._src&&obj._src[f.k])||''},aiK==='prefill'?'Prérempli':'Lu par Claude'));
  wrap.append(lab);
  const val=obj[f.k];const miss=f.tag==='obl'&&isEmpty(val);
  const id='f_'+(ctx.item||ctx.sec)+'_'+f.k;
  const clearAi=()=>{if(obj._ai){delete obj._ai[f.k];lab.querySelector('.tag.ai')?.remove();}};
  if(f.t==='select'){
    const s=el('select',{class:'inp'+(miss?' miss':'')+(aiK?' ai':''),id});s.append(el('option',{value:''},'— Choisir —'));
    for(const o of f.opts)s.append(el('option',{value:o,selected:val===o},o));
    if(val&&!f.opts.includes(val))s.append(el('option',{value:val,selected:true},val));
    s.addEventListener('change',()=>{obj[f.k]=s.value;clearAi();touch();renderSection();});wrap.append(s);
  }else if(f.t==='bool'){
    const seg=el('div',{class:'seg'+(miss?' miss':'')});
    for(const o of ['Oui','Non']){seg.append(el('button',{type:'button',class:val===o?'on':'',onclick:()=>{obj[f.k]=o;clearAi();touch();renderSection();}},o));}
    wrap.append(seg);
  }else if(f.t==='multi'){
    const ch=el('div',{class:'chips'});const cv=Array.isArray(val)?val:[];
    for(const o of f.opts){ch.append(el('button',{type:'button',class:cv.includes(o)?'on':'',onclick:(e)=>{const a=Array.isArray(obj[f.k])?obj[f.k].slice():[];const ix=a.indexOf(o);if(ix>=0)a.splice(ix,1);else a.push(o);obj[f.k]=a;e.currentTarget.classList.toggle('on');clearAi();touch();}},o));}
    wrap.append(ch);
  }else if(f.t==='textarea'){
    const t=el('textarea',{class:'inp'+(aiK?' ai':''),id,rows:3});t.value=val??'';t.addEventListener('input',()=>{obj[f.k]=t.value;t.classList.remove('ai');clearAi();touch();});wrap.append(t);
  }else{
    const inp=el('input',{class:'inp'+(miss?' miss':'')+(aiK?' ai':''),id,type:f.t==='number'?'text':f.t,inputmode:f.t==='number'?'decimal':(f.t==='tel'?'tel':(f.t==='email'?'email':null)),autocomplete:f.ac||'off',placeholder:f.ph||''});
    inp.value=val??'';
    inp.addEventListener('input',()=>{let x=inp.value;if(f.t==='number'){const n=parseFloat(String(x).replace(/\s/g,'').replace(',','.'));x=x.trim()===''?'':(isNaN(n)?x:n);}obj[f.k]=x;inp.classList.remove('ai');clearAi();inp.classList.toggle('miss',f.tag==='obl'&&isEmpty(x));touch();});
    const unit=f.unit||(f.unitFrom?(obj[f.unitFrom]||''):'');
    if(unit)wrap.append(el('div',{class:'unit'},inp,el('span',{},unit)));else wrap.append(inp);
  }
  if(f.hint)wrap.append(el('span',{class:'hint'},f.hint));
  if(aiK&&obj._src&&obj._src[f.k])wrap.append(el('span',{class:'src'},'Source : '+obj._src[f.k]));
  return wrap;
}
function renderListe_(d,f,sec){
  const box=el('div',{class:'liste'});
  box.append(el('div',{class:'sub'},el('h3',{},f.l),f.hint?el('p',{},f.hint):null));
  d[f.k].forEach((it,i)=>{
    const card=el('div',{class:'card'});
    card.append(el('div',{class:'ch'},el('h4',{},f.sing+' '+(i+1)),el('button',{class:'xbtn',onclick:()=>confirmBox('Supprimer '+f.sing.toLowerCase()+' '+(i+1)+' ?','Les photos associées resteront dans le Drive.',()=>{d[f.k].splice(i,1);touch();renderSection();})},'Supprimer')));
    const grid=el('div',{class:'grid'});for(const c of f.champs)grid.append(renderField(it,c,{sec:curSec,item:it.id}));card.append(grid);
    const pw=el('div',{class:'photos'});for(const p of f.photos)pw.append(renderPhotoGroup(it,p,{sec:curSec,prefix:f.prefix,n:i+1,list:f,item:it,pk:it.id+'_'+p.k}));card.append(pw);
    if(f.ai==='plaque'){const pl=holderPhotos(it).filter(p=>p.k==='plaque');if(pl.length)card.append(el('div',{style:'margin-top:10px'},el('button',{class:'btn sm',onclick:async()=>{const b=await fetchBlob(pl[pl.length-1].id);if(b)runAI('plaque',it,b,{list:f,item:it,pk:it.id+'_plaque'});else toast('Photo inaccessible pour la relecture.');}},'↻ Relire la plaque avec Claude')));}
    box.append(card);
  });
  box.append(el('button',{class:'addbtn',onclick:()=>{const it={id:uid(),_photos:[],_ai:{},_src:{}};for(const c of f.champs)if(c.def!=null)it[c.k]=c.def;d[f.k].push(it);touch();renderSection();setTimeout(()=>{const cards=$('#sec').querySelectorAll('.card');cards[cards.length-1]?.scrollIntoView({behavior:'smooth',block:'start'});},50);}},'+ Ajouter : '+f.sing));
  return box;
}
function photoSrc(ph){return '/api/photos/'+ph.id;}
function renderPhotoGroup(h,p,ctx){
  const g=el('div',{class:'pg','data-pk':ctx.pk||''});
  const lab=el('div',{class:'fl'},p.l);if(p.tag)lab.append(el('span',{class:'tag '+p.tag},TAGL[p.tag]));
  if(p.ai)lab.append(el('span',{class:'tag ai'},'Lecture auto'));
  g.append(lab);
  const th=el('div',{class:'thumbs'});
  const mine=(h._photos||[]).filter(x=>x.k===p.k);
  mine.forEach((ph,i)=>{const b=el('button',{class:'thumb'+(ph.pending?' pending':''),type:'button',onclick:()=>{if(!ph.pending)viewer(h,ph,p)}});
    b.append(el('img',{alt:p.l+' '+(i+1),loading:'lazy',src:ph.pending?ph.url:photoSrc(ph)}),el('span',{class:'no'},String(i+1)));th.append(b);});
  g.append(th);
  const btns=el('div',{class:'pbtns'});const can=!p.multi&&mine.length>0;
  const mk=(lbl,capture)=>el('button',{class:'btn sm'+(capture?' primary':''),type:'button',onclick:()=>pick(h,p,ctx,capture)},lbl);
  btns.append(mk(can?'📷 Reprendre':'📷 Photo',true),mk('Importer',false));
  g.append(btns);
  const st=el('div',{class:'aistat'});st.hidden=true;g.append(st);
  return g;
}
function pick(h,p,ctx,capture){
  if(!cur._drive||!cur._drive.photosFolderId){toast('Aucun dossier Drive pour ranger les photos.');return;}
  const inp=el('input',{type:'file',accept:'image/*'});if(capture)inp.setAttribute('capture','environment');if(p.multi&&!capture)inp.multiple=true;
  inp.style.display='none';document.body.append(inp);
  inp.addEventListener('change',async()=>{const files=Array.from(inp.files||[]);inp.remove();for(const f of files)await addPhoto(h,p,ctx,f);});
  inp.click();
}
function photoName(h,p,ctx){const n=holderPhotos(h).filter(x=>x.k===p.k).length+1;const base=ctx.prefix||'Photo';return `${base}${ctx.n?'_'+ctx.n:''}_${p.k}${(p.multi||n>1)?'_'+n:''}_${Date.now().toString(36).slice(-4)}.jpg`;}
async function addPhoto(h,p,ctx,file){
  let blob;try{blob=await resizeImage(file);}catch(e){toast('Photo illisible : '+(e.message||'format non pris en charge'));return;}
  if(!p.multi){const old=h._photos.filter(x=>x.k===p.k&&!x.pending);for(const o of old)h._photos.splice(h._photos.indexOf(o),1);}
  const tmp={pending:true,k:p.k,url:URL.createObjectURL(blob)};h._photos.push(tmp);renderSection();
  try{const fd=new FormData();fd.append('file',blob,photoName(h,p,ctx));fd.append('folderId',cur._drive.photosFolderId);fd.append('vid',cur.id);
    const up=await api('/api/photos',{method:'POST',body:fd});
    const ix=h._photos.indexOf(tmp);const rec={id:up.id,k:p.k,ts:Date.now(),name:up.name};if(ix>=0)h._photos[ix]=rec;else h._photos.push(rec);
    URL.revokeObjectURL(tmp.url);touch();renderSection();
    if(p.ai)runAI(p.ai,h,blob,ctx);
  }catch(e){const ix=h._photos.indexOf(tmp);if(ix>=0)h._photos.splice(ix,1);renderSection();toast('Téléversement échoué : '+(e.message||'réessayez'),4500);}
}
function resizeImage(file){
  return new Promise((res,rej)=>{const url=URL.createObjectURL(file);const img=new Image();
    img.onload=()=>{const MAX=2000;let w=img.naturalWidth,h=img.naturalHeight;if(!w||!h){URL.revokeObjectURL(url);return rej(new Error('dimensions inconnues'));}
      const r=Math.min(1,MAX/Math.max(w,h));const cw=Math.round(w*r),ch=Math.round(h*r);const c=document.createElement('canvas');c.width=cw;c.height=ch;c.getContext('2d').drawImage(img,0,0,cw,ch);URL.revokeObjectURL(url);
      c.toBlob(b=>b?res(b):rej(new Error('encodage impossible')),'image/jpeg',0.86);};
    img.onerror=()=>{URL.revokeObjectURL(url);if(/image\/(jpeg|png|webp)/.test(file.type))res(file);else rej(new Error('format non pris en charge (HEIC ?). Réglez l’appareil photo sur « Le plus compatible »'));};
    img.src=url;});
}
async function fetchBlob(id){try{const r=await fetch(photoSrc({id}));if(!r.ok)return null;return await r.blob();}catch(e){return null;}}

/* ---------- Visionneuse, confirmation, choix d'opportunité ---------- */
function modal(){const m=$('#modal');m.innerHTML='';m.hidden=false;m.onclick=e=>{if(e.target===m)m.hidden=true;};return m;}
function viewer(h,ph,p){
  const m=modal();const box=el('div',{class:'box'});
  box.append(el('h3',{},p.l),el('img',{class:'big',src:photoSrc(ph),alt:p.l}));
  const leg=el('input',{class:'inp',placeholder:'Légende ou remarque (facultatif)',id:'leg_'+ph.id});leg.value=ph.legende||'';leg.addEventListener('input',()=>{ph.legende=leg.value;touch();});
  box.append(leg,el('div',{class:'row'},
    el('a',{class:'btn',href:'https://drive.google.com/file/d/'+ph.id+'/view',target:'_blank',rel:'noopener'},'Ouvrir dans Drive ↗'),
    el('button',{class:'btn danger',onclick:()=>{confirmBox('Supprimer cette photo ?','Elle sera mise à la corbeille du Drive.',async()=>{const ix=h._photos.indexOf(ph);if(ix>=0)h._photos.splice(ix,1);touch();renderSection();try{await api('/api/photos/'+ph.id,{method:'DELETE'});}catch(e){}});}},'Supprimer'),
    el('button',{class:'btn primary',onclick:()=>{m.hidden=true;}},'Fermer')));
  m.append(box);
}
function confirmBox(title,text,onYes){
  const m=modal();
  m.append(el('div',{class:'box'},el('h3',{},title),el('p',{style:'color:var(--muted);margin:0'},text),
    el('div',{class:'row'},el('button',{class:'btn',onclick:()=>{m.hidden=true;}},'Annuler'),el('button',{class:'btn danger',onclick:()=>{m.hidden=true;onYes();}},'Confirmer'))));
}
function pickDeal(onPick,allowNone){
  const m=modal();const box=el('div',{class:'box'});
  box.append(el('h3',{},'Choisir l’opportunité Zoho CRM'),el('p',{style:'color:var(--muted);margin:0 0 8px;font-size:14px'},'Le dossier Drive de l’opportunité, les notes du CRM et les courriels serviront à préremplir la visite.'));
  const q=el('input',{class:'inp search',placeholder:'Nom du client, du bâtiment ou de l’opportunité…',id:'deal_q',autocomplete:'off'});
  const list=el('div',{class:'deals'});let t;let selected=null;
  const load=async()=>{list.innerHTML='';list.append(el('p',{class:'hint'},'Recherche…'));
    try{const deals=await api('/api/deals?q='+encodeURIComponent(q.value.trim()));list.innerHTML='';if(!deals.length)list.append(el('p',{class:'hint'},'Aucune opportunité trouvée.'));
      for(const d of deals){const b=el('button',{class:'deal',type:'button',onclick:()=>{selected=d;for(const x of list.children)x.classList.remove('on');b.classList.add('on');ok.disabled=false;}},el('b',{},d.name),el('span',{},[d.account,d.contact,d.stage].filter(Boolean).join(' · ')));list.append(b);}}
    catch(e){list.innerHTML='';list.append(el('p',{class:'hint'},'CRM inaccessible : '+(e.message||'')));}};
  q.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(load,350);});
  const ok=el('button',{class:'btn accent',disabled:true,onclick:()=>{m.hidden=true;onPick(selected);}},'Créer la visite');
  const row=el('div',{class:'row'},el('button',{class:'btn',onclick:()=>{m.hidden=true;}},'Annuler'));
  if(allowNone)row.append(el('button',{class:'btn',onclick:()=>{m.hidden=true;onPick(null);}},'Sans opportunité'));
  row.append(ok);
  box.append(q,list,row);m.append(box);load();setTimeout(()=>q.focus(),50);
}

/* ---------- Lecture par Claude ---------- */
async function runAI(kind,target,blob,ctx){
  const stat=()=>$('#sec').querySelector('[data-pk="'+(ctx.pk||'')+'"] .aistat');
  const show=(t,err,done)=>{const s=stat();if(!s)return;s.hidden=false;s.classList.toggle('err',!!err);s.innerHTML='';if(!err&&!done)s.append(el('span',{class:'spin'}));s.append(' '+t);};
  show('Claude lit la photo…');
  const fields=kind==='plaque'?ctx.list.champs.filter(c=>c.ai):(kind==='facture'?S.ene.champs.find(c=>c.k==='factures').champs:S.esp.champs.filter(c=>c.ai));
  const spec={kind,sing:ctx.list?ctx.list.sing:'',fields:fields.map(c=>({k:c.k,l:c.l,t:c.t,opts:c.opts,unit:c.unit}))};
  let res;
  try{const fd=new FormData();fd.append('image',blob,'photo.jpg');fd.append('spec',JSON.stringify(spec));res=(await api('/api/ai/lire',{method:'POST',body:fd})).result;}
  catch(e){show('Lecture échouée : '+(e.message||'réessayez'),true);return;}
  if(!res||typeof res!=='object'){show('Rien de lisible sur cette photo.',true);return;}
  let n=0;target._ai=target._ai||{};target._src=target._src||{};
  for(const c of fields){let v=res[c.k];if(v==null||v==='')continue;
    if(c.opts){const hit=c.opts.find(o=>o.toLowerCase()===String(v).toLowerCase())||c.opts.find(o=>o.toLowerCase().startsWith(String(v).toLowerCase().slice(0,5)));if(!hit)continue;v=hit;}
    if(c.t==='number'){const num=parseFloat(String(v).replace(/[^\d.,-]/g,'').replace(',','.'));if(isNaN(num))continue;v=num;}
    if(isEmpty(target[c.k])||target._ai[c.k]){target[c.k]=v;target._ai[c.k]='photo';target._src[c.k]='Photo lue par Claude';n++;}}
  if(kind!=='facture'&&typeof res.remarque==='string'&&res.remarque.trim()&&isEmpty(target.notes)){target.notes=(res.lisible===false?'Plaque difficile à lire. ':'')+res.remarque.trim();target._ai.notes='photo';}
  touch();renderSection();
  show(n?`✓ ${n} champ${n>1?'s':''} rempli${n>1?'s':''} par Claude. Vérifiez les valeurs surlignées.`:(res.lisible===false?'Photo illisible. Rapprochez-vous ou nettoyez la plaque.':'Aucune nouvelle information lisible.'),false,true);
  toast(n?`${n} champ${n>1?'s':''} rempli${n>1?'s':''} à partir de la photo`:'Rien de nouveau sur cette photo');
}

/* ---------- Rapport ---------- */
function renderRapport(root){
  const sc=score(cur),cl=checklist(cur);
  root.append(el('div',{class:'sec-h'},el('div',{class:'eyebrow'},'Dossier pour la firme d’ingénierie'),el('h2',{},'Rapport de visite'),el('p',{},'Vérifiez ce qui manque, générez la synthèse, puis publiez le dossier dans le Drive de l’opportunité ou téléchargez-le.')));
  const wrap=el('div',{class:'rap'});root.append(wrap);
  wrap.append(el('div',{class:'panel'},el('div',{class:'score'},
    el('div',{class:'k'},el('b',{},sc.obl+'/'+sc.oblT),el('span',{},'Obligatoires pour lancer l’étude')),
    el('div',{class:'k'},el('b',{},sc.vis+'/'+sc.visT),el('span',{},'Relevés de la visite technique')),
    el('div',{class:'k'},el('b',{},String(photoFiles(cur).length)),el('span',{},'Photos dans le dossier')))));
  const manq=cl.filter(x=>!x.ok);const ck=el('ul',{class:'check'});
  if(!manq.length)ck.append(el('li',{class:'ok'},el('span',{class:'st'},'✓'),'Dossier complet. Rien ne manque.'));
  for(const x of manq)ck.append(el('li',{},el('span',{class:'st'},'!'),x.label,el('button',{class:'go',onclick:()=>{curSec=x.sec;renderSection();window.scrollTo(0,0);}},'Section '+S[x.sec].num+' ›')));
  wrap.append(el('div',{class:'panel'},el('h3',{},'À compléter ('+manq.length+')'),ck));

  const sp=el('div',{class:'panel'});sp.append(el('h3',{},'Synthèse de la visite'),el('p',{},'Claude rédige, à partir des relevés et du contexte CRM, une synthèse en français pour l’ingénieur. Relisez-la avant l’envoi.'));
  const out=el('div',{class:'synth'});out.hidden=!cur.synthese;out.textContent=cur.synthese||'';
  const ta=el('textarea',{class:'inp',id:'synth_edit',rows:8,placeholder:'La synthèse apparaîtra ici. Vous pouvez aussi l’écrire vous-même.'});ta.value=cur.synthese||'';ta.hidden=true;
  ta.addEventListener('input',()=>{cur.synthese=ta.value;touch();});
  const row=el('div',{class:'actions'});
  let ctl=null;const gen=el('button',{class:'btn primary',onclick:async()=>{if(ctl){ctl.abort();return;}ctl=new AbortController();gen.textContent='■ Arrêter';out.hidden=false;ta.hidden=true;out.textContent='Claude réfléchit…';
    try{const r=await fetch('/api/ai/synthese',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({visite:stripPending(cur)}),signal:ctl.signal});
      if(!r.ok)throw new Error((await r.text())||('Erreur '+r.status));
      const reader=r.body.getReader();const dec=new TextDecoder();let text='';
      while(true){const {value,done}=await reader.read();if(done)break;text+=dec.decode(value,{stream:true});out.textContent=text;}
      cur.synthese=text.trim();ta.value=cur.synthese;touch();toast('Synthèse générée. Relisez-la.');}
    catch(e){if(e.name!=='AbortError'){toast('La synthèse a échoué : '+(e.message||''),5000);}if(!cur.synthese)out.hidden=true;else out.textContent=cur.synthese;}
    finally{ctl=null;gen.textContent=cur.synthese?'↻ Régénérer la synthèse':'✎ Générer la synthèse';}}},cur.synthese?'↻ Régénérer la synthèse':'✎ Générer la synthèse');
  row.append(gen,el('button',{class:'btn',onclick:()=>{ta.hidden=!ta.hidden;out.hidden=!ta.hidden||!cur.synthese;if(!ta.hidden)ta.focus();}},'✎ Modifier à la main'));
  sp.append(out,ta,row);wrap.append(sp);

  const ex=el('div',{class:'panel'});ex.append(el('h3',{},'Transmettre à la firme d’ingénierie'),el('p',{},'Publier écrit Rapport.html et donnees.json dans le dossier « Visite technique » du Drive de l’opportunité, à côté des photos. Le .zip contient le rapport, les données et toutes les photos nommées par sujet, pour un envoi par courriel.'));
  const prog=el('div',{class:'prog'});const acts=el('div',{class:'actions'});
  const pub=el('button',{class:'btn accent',disabled:!(cur._drive&&cur._drive.visiteFolderId),onclick:async()=>{pub.disabled=true;prog.textContent='Publication dans le Drive…';if(dirty){clearTimeout(saveTimer);await flush();}
    try{const r=await api('/api/visites/'+cur.id+'/publish',{method:'POST',body:{visite:stripPending(cur)}});prog.innerHTML='';prog.append('Rapport publié : ',el('a',{href:r.url,target:'_blank',rel:'noopener'},'ouvrir dans le Drive ↗'));toast('Rapport publié dans le Drive.');}
    catch(e){prog.textContent='Publication échouée : '+(e.message||'');}finally{pub.disabled=false;}}},'☁ Publier dans le Drive de l’opportunité');
  const dl=el('button',{class:'btn',onclick:()=>exportZip(dl,prog)},'⬇ Télécharger le dossier (.zip)');
  acts.append(pub,dl,el('button',{class:'btn',onclick:async()=>{const t=resumeTexte(cur);try{await navigator.clipboard.writeText(t);toast('Résumé copié.');}catch(err){const m=modal();const ta2=el('textarea',{class:'inp',rows:14,id:'copy_fallback'});ta2.value=t;m.append(el('div',{class:'box'},el('h3',{},'Sélectionnez et copiez le texte'),ta2,el('div',{class:'row'},el('button',{class:'btn primary',onclick:()=>{m.hidden=true;}},'Fermer'))));ta2.select();}}},'⎘ Copier le résumé texte'));
  ex.append(acts,prog);wrap.append(ex);

  const dz=el('div',{class:'panel'});dz.append(el('h3',{},'Dossier'),el('p',{},'Créé le '+fmtDate(cur.cree)+', mis à jour le '+fmtDate(cur.maj)+(cur._drive&&cur._drive.visiteFolderId?'. Rangé dans le dossier « Visite technique » du Drive.':'.')));
  dz.append(el('button',{class:'btn danger sm',onclick:()=>confirmBox('Supprimer cette visite ?','Le dossier « Visite technique » et ses photos seront mis à la corbeille du Drive. L’opportunité CRM n’est pas touchée.',async()=>{const v=cur;try{await api('/api/visites/'+v.id+'?folderId='+encodeURIComponent((v._drive&&v._drive.visiteFolderId)||'')+'&fileId='+encodeURIComponent((v._drive&&v._drive.fileId)||''),{method:'DELETE'});}catch(e){toast('Suppression échouée : '+e.message);return;}try{localStorage.removeItem('hc_draft_'+v.id);}catch(e){}visites=visites.filter(x=>x.id!==v.id);dirty=false;go('accueil');toast('Visite supprimée');})},'Supprimer cette visite'));
  wrap.append(dz);
}
async function exportZip(btn,prog){
  if(!window.JSZip){toast('Module zip non chargé.');return;}
  btn.disabled=true;const files=photoFiles(cur);const zip=new JSZip();let missing=0;
  try{
    for(let i=0;i<files.length;i++){prog.textContent=`Photo ${i+1}/${files.length}…`;const b=await fetchBlob(files[i].id);if(b)zip.file('photos/'+files[i].name,b);else missing++;}
    prog.textContent='Assemblage du rapport…';
    zip.file('Rapport.html',rapportHTML(cur,files));
    zip.file('donnees.json',JSON.stringify(stripPending(cur),null,2));
    zip.file('LISEZMOI.txt',`Dossier de visite technique HeatConnect\n${cur.bat.nom||''}\n${cur.bat.adresse||''}\n\nRapport.html : rapport complet (ouvrir dans un navigateur)\ndonnees.json : données brutes\nphotos/ : photos nommées par sujet (ex. Chaudiere_1_plaque.jpg)\n${missing?'\nAttention : '+missing+' photo(s) n’ont pas pu être jointes.\n':''}`);
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:3}},m=>{prog.textContent='Compression '+Math.round(m.percent)+' %';});
    const slug=(cur.bat.nom||'batiment').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-zA-Z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,40)||'batiment';
    const name=`HeatConnect_${slug}_${new Date().toISOString().slice(0,10)}.zip`;
    const a=el('a',{href:URL.createObjectURL(blob),download:name});document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},2000);
    prog.textContent=`Prêt : ${name} (${(blob.size/1048576).toFixed(1)} Mo)${missing?' · '+missing+' photo(s) manquante(s)':''}`;
  }catch(e){prog.textContent='Échec de l’export : '+(e.message||'inconnu');}
  finally{btn.disabled=false;}
}

/* ---------- Navigation ---------- */
$('#btn-retour').onclick=()=>{if(dirty){clearTimeout(saveTimer);flush();}go('accueil');};
$('#btn-nouvelle').onclick=()=>pickDeal(async deal=>{
  const m=modal();m.append(el('div',{class:'box'},el('h3',{},'Création de la visite…'),el('p',{style:'color:var(--muted)'},deal?'Lecture de l’opportunité et préparation du dossier Drive.':'Création du dossier dans le Drive.')));
  try{const v=await api('/api/visites',{method:'POST',body:{dealId:deal?deal.id:null}});m.hidden=true;curSec='bat';go('v-'+v.id);}
  catch(e){m.hidden=true;toast('Création échouée : '+(e.message||''),6000);}
},true);
$('#btn-prev').onclick=()=>{const i=ORDER.indexOf(curSec);if(i>0){curSec=ORDER[i-1];renderSection();window.scrollTo(0,0);}};
$('#btn-next').onclick=()=>{const i=ORDER.indexOf(curSec);if(i<ORDER.length-1){curSec=ORDER[i+1];renderSection();window.scrollTo(0,0);}else{if(dirty){clearTimeout(saveTimer);flush();}go('accueil');}};

route();
})();
