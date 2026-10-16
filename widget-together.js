// Together : code du widget Scriptable (chargé automatiquement par le petit script installé)
const fm=FileManager.local(),cache=fm.joinPath(fm.documentsDirectory(),"together-widget.json");
let data=null;
try{const j=await new Request(API).loadJSON();data=j.data;if(data)fm.writeString(cache,JSON.stringify(data));}catch(e){}
if(!data&&fm.fileExists(cache)){try{data=JSON.parse(fm.readString(cache));}catch(e){}}
const fam=config.widgetFamily||"medium",now=Date.now();
const items=((data&&data.items)||[]).filter(x=>x.s>now-3600000);
const hm=ms=>{const d=new Date(ms);return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");};
const day=ms=>{const d=new Date(ms),t=new Date();t.setHours(0,0,0,0);const x=new Date(d);x.setHours(0,0,0,0);const n=Math.round((x-t)/864e5);return n===0?"Aujourd'hui":n===1?"Demain":d.toLocaleDateString("fr-FR",{weekday:"long"}).replace(/^./,c=>c.toUpperCase());};
const rel=ms=>{const m=Math.round((ms-now)/6e4);if(m<=0)return "maintenant";if(m<60)return "dans "+m+" min";const h=Math.floor(m/60);if(h<24)return "dans "+h+" h"+(m%60?" "+String(m%60).padStart(2,"0"):"");return day(ms).toLowerCase();};
const w=new ListWidget();w.url=APP;w.refreshAfterDate=new Date(now+15*6e4);
const next=items[0];
if(fam.startsWith("accessory")){
  if(!next){w.addText("Together : rien de prévu");}
  else if(fam==="accessoryInline"){w.addText((next.d&&next.d>now?"Départ "+hm(next.d):hm(next.s))+" "+next.t);}
  else if(fam==="accessoryCircular"){const s=w.addStack();s.layoutVertically();const a=s.addText(hm(next.d&&next.d>now?next.d:next.s));a.font=Font.boldSystemFont(14);a.centerAlignText();const b=s.addText(next.d&&next.d>now?"départ":"rdv");b.font=Font.systemFont(9);b.centerAlignText();}
  else{const a=w.addText(next.t);a.font=Font.boldSystemFont(14);a.lineLimit=1;const b=w.addText((next.d&&next.d>now?"Départ "+hm(next.d)+", ":"")+day(next.s)+" "+hm(next.s));b.font=Font.systemFont(12);}
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
else{const dep=next.d&&next.d>now-15*6e4;
  const k=left.addText(dep?"Prochain départ":"Prochain moment");k.font=Font.mediumSystemFont(11);k.textColor=new Color("#ffffff",.75);
  const big=left.addText(hm(dep?next.d:next.s));big.font=Font.heavySystemFont(fam==="small"?30:36);big.textColor=new Color("#FFB547");big.minimumScaleFactor=.6;
  const ti=left.addText(next.t);ti.font=Font.boldSystemFont(14);ti.textColor=Color.white();ti.lineLimit=1;
  const r=left.addText(rel(dep?next.d:next.s)+(next.l?", "+next.l:""));r.font=Font.systemFont(11);r.textColor=new Color("#ffffff",.75);r.lineLimit=1;}
if(fam!=="small"&&items.length>1){body.addSpacer(12);const right=body.addStack();right.layoutVertically();
  for(const x of items.slice(1,fam==="large"?6:4)){const row=right.addStack();row.centerAlignContent();const dot=row.addText("● ");dot.font=Font.systemFont(9);dot.textColor=new Color(x.c);
    const tx=row.addText(day(x.s).slice(0,3)+". "+hm(x.s)+"  "+x.t);tx.font=Font.systemFont(12);tx.textColor=Color.white();tx.lineLimit=1;right.addSpacer(4);}}
body.addSpacer();
w.addSpacer();
Script.setWidget(w);if(!config.runsInWidget)await (fam==="small"?w.presentSmall():w.presentMedium());Script.complete();
