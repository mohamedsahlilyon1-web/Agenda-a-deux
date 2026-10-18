// Together : code du widget Scriptable (chargé automatiquement par le petit script installé)
const fm=FileManager.local(),cache=fm.joinPath(fm.documentsDirectory(),"together-widget.json");
let data=null;
try{const j=await new Request(API).loadJSON();data=j.data;if(data)fm.writeString(cache,JSON.stringify(data));}catch(e){}
if(!data&&fm.fileExists(cache)){try{data=JSON.parse(fm.readString(cache));}catch(e){}}
const fam=config.widgetFamily||"medium",now=Date.now();
const items=((data&&data.items)||[]).filter(x=>x.s>(x.a?now-864e5:now-3600000));
const hm=ms=>{const d=new Date(ms);return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");};
const cap=t=>t.replace(/^./,c=>c.toUpperCase());
const dayN=ms=>{const t=new Date();t.setHours(0,0,0,0);const x=new Date(ms);x.setHours(0,0,0,0);return Math.round((x-t)/864e5);};
// « Aujourd'hui », « Demain », « Mardi » dans la semaine, sinon « Dim. 25 oct. »
const day=ms=>{const n=dayN(ms),d=new Date(ms);if(n===0)return "Aujourd'hui";if(n===1)return "Demain";
  if(n>1&&n<7)return cap(d.toLocaleDateString("fr-FR",{weekday:"long"}));
  return cap(d.toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"}));};
const short=ms=>{const n=dayN(ms),d=new Date(ms);if(n===0)return "Auj.";if(n===1)return "Dem.";
  if(n>1&&n<7)return cap(d.toLocaleDateString("fr-FR",{weekday:"short"}));return d.toLocaleDateString("fr-FR",{day:"numeric",month:"short"});};
const when=x=>x.a?"Journée":hm(x.s);
const rel=ms=>{const m=Math.round((ms-now)/6e4);if(m<=0)return "maintenant";if(m<60)return "dans "+m+" min";const h=Math.floor(m/60);if(h<24)return "dans "+h+" h"+(m%60?" "+String(m%60).padStart(2,"0"):"");return day(ms).toLowerCase();};
const esc=t=>String(t||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

// Lancé depuis l'app Scriptable (toucher le widget, ou ▶) : liste complète des prochains moments
if(!config.runsInWidget&&config.runsInApp){
  let rows="",last="";
  for(const x of items){const d=day(x.s);if(d!==last){rows+=`<h2>${esc(d)}</h2>`;last=d;}
    rows+=`<div class="it" style="--c:${esc(x.c)}"><b>${x.a?"Journée":(x.d&&x.d>now?"Départ "+hm(x.d)+" · ":"")+hm(x.s)}</b><span>${esc(x.t)}</span>${x.l?`<small>${esc(x.l)}</small>`:""}</div>`;}
  if(!data)rows=`<p class="none">Ouvre Together une fois pour afficher vos évènements ici.</p>`;
  else if(!items.length)rows=`<p class="none">Rien de prévu pour l'instant.</p>`;
  const badges=data&&(data.wishes||data.fb)?`<p class="bd">${data.wishes?"★ "+data.wishes+" envie"+(data.wishes>1?"s":"")+" en attente ":""}${data.fb?"♥ "+data.fb+" souvenir"+(data.fb>1?"s":"")+" à raconter":""}</p>`:"";
  const html=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  body{margin:0;font:16px -apple-system,system-ui;background:linear-gradient(160deg,#4338CA,#0d0e1c 70%) fixed;color:#fff;padding:22px 18px 40px}
  h1{font-size:30px;margin:8px 0 2px}.sub{opacity:.75;margin:0 0 14px;font-size:14px}.bd{color:#FFB547;font-weight:600;font-size:14px}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;opacity:.7;margin:20px 0 8px}
  .it{background:rgba(255,255,255,.1);border-left:4px solid var(--c);border-radius:14px;padding:12px 14px;margin-bottom:8px;display:grid;gap:2px}
  .it b{color:#FFB547;font-size:15px}.it small{opacity:.7}.none{opacity:.8}
  .tip{margin-top:26px;font-size:13px;opacity:.7;line-height:1.4}</style>
  <h1>Together</h1><p class="sub">${data&&data.names?esc(data.names.join(" & ")):""}</p>${badges}${rows}
  <p class="tip">Pour ajouter ou modifier, ouvre l'icône Together sur ton écran d'accueil.</p>`;
  const wv=new WebView();await wv.loadHTML(html);await wv.present(true);Script.complete();return;
}

const w=new ListWidget();w.refreshAfterDate=new Date(now+15*6e4);
// Toucher le widget ouvre la liste dans Scriptable (iOS ne permet pas d'ouvrir directement une app web)
try{w.url="scriptable:///run/"+encodeURIComponent(Script.name());}catch(e){}
const next=items.find(x=>!x.a)||items[0];
const rest=items.filter(x=>x!==next);
if(fam.startsWith("accessory")){
  if(!next){w.addText("Together : rien de prévu");}
  else if(fam==="accessoryInline"){w.addText((next.d&&next.d>now?"Départ "+hm(next.d):when(next))+" "+next.t);}
  else if(fam==="accessoryCircular"){const s=w.addStack();s.layoutVertically();const a=s.addText(next.a?short(next.s):hm(next.d&&next.d>now?next.d:next.s));a.font=Font.boldSystemFont(14);a.minimumScaleFactor=.6;a.centerAlignText();const b=s.addText(next.d&&next.d>now?"départ":"rdv");b.font=Font.systemFont(9);b.centerAlignText();}
  else{const a=w.addText(next.t);a.font=Font.boldSystemFont(14);a.lineLimit=1;const b=w.addText((next.d&&next.d>now?"Départ "+hm(next.d)+", ":"")+day(next.s)+(next.a?"":" "+hm(next.s)));b.font=Font.systemFont(12);}
  Script.setWidget(w);Script.complete();return;
}
const g=new LinearGradient();g.colors=[new Color(next?next.c:"#4338CA",1),new Color("#0d0e1c",1)];g.locations=[0,1];g.startPoint=new Point(1,0);g.endPoint=new Point(0,1);w.backgroundGradient=g;
w.setPadding(14,14,14,14);
const top=w.addStack();const brand=top.addText("Together");brand.font=Font.boldSystemFont(12);brand.textColor=new Color("#ffffff",.8);top.addSpacer();
if(data&&(data.wishes||data.fb)){const bd=top.addText((data.wishes?"★"+data.wishes+" ":"")+(data.fb?"♥"+data.fb:""));bd.font=Font.boldSystemFont(12);bd.textColor=new Color("#FFB547");}
w.addSpacer(6);
const body=w.addStack();body.layoutHorizontally();body.topAlignContent();
const left=body.addStack();left.layoutVertically();
if(!data){const t=left.addText("Ouvre Together");t.font=Font.boldSystemFont(18);t.textColor=Color.white();const s=left.addText("une fois pour afficher vos évènements ici");s.font=Font.systemFont(12);s.textColor=new Color("#ffffff",.7);}
else if(!next){const t=left.addText("Rien de prévu");t.font=Font.boldSystemFont(18);t.textColor=Color.white();const s=left.addText("Ajoutez une sortie à deux");s.font=Font.systemFont(12);s.textColor=new Color("#ffffff",.7);}
else{const dep=!next.a&&next.d&&next.d>now-15*6e4;
  const k=left.addText(dep?"Prochain départ":"Prochain moment");k.font=Font.mediumSystemFont(11);k.textColor=new Color("#ffffff",.75);
  const big=left.addText(next.a?day(next.s):hm(dep?next.d:next.s));big.font=Font.heavySystemFont(next.a?22:(fam==="small"?30:36));big.textColor=new Color("#FFB547");big.minimumScaleFactor=.5;big.lineLimit=1;
  const ti=left.addText(next.t);ti.font=Font.boldSystemFont(14);ti.textColor=Color.white();ti.lineLimit=fam==="small"?2:1;
  const r=left.addText((next.a?"toute la journée":rel(dep?next.d:next.s))+(next.l?", "+next.l:""));r.font=Font.systemFont(11);r.textColor=new Color("#ffffff",.75);r.lineLimit=1;}
if(fam!=="small"&&rest.length){body.addSpacer(12);const right=body.addStack();right.layoutVertically();
  for(const x of rest.slice(0,fam==="large"?8:4)){const row=right.addStack();row.centerAlignContent();const dot=row.addText("● ");dot.font=Font.systemFont(9);dot.textColor=new Color(x.c);
    const tx=row.addText(short(x.s)+" "+(x.a?"":hm(x.s)+" ")+x.t);tx.font=Font.systemFont(12);tx.textColor=Color.white();tx.lineLimit=1;right.addSpacer(4);}}
body.addSpacer();
w.addSpacer();
Script.setWidget(w);if(!config.runsInWidget)await (fam==="small"?w.presentSmall():w.presentMedium());Script.complete();
