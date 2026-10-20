// Together : code du widget Scriptable (chargé automatiquement par le petit script installé)
// Toucher le widget : Scriptable se referme aussitôt (iOS l'ouvre forcément, on ne montre rien et on revient à l'écran d'accueil)
if(!config.runsInWidget&&typeof args!=="undefined"&&args.queryParameters&&args.queryParameters.from==="widget"){try{App.close();}catch(e){}Script.complete();return;}
// Tout le visuel est dessiné à la main (DrawContext) : halos, grain, anneau du compte à rebours, icônes des thèmes.
const fm=FileManager.local(),cache=fm.joinPath(fm.documentsDirectory(),"together-widget.json");
let data=null;
// Ouvert en touchant le widget : on montre tout de suite la dernière copie, sans attendre le réseau trop longtemps
const fromTap=!config.runsInWidget&&typeof args!=="undefined"&&args.queryParameters&&args.queryParameters.from==="widget";
try{const rq=new Request(API);if(!config.runsInWidget)rq.timeoutInterval=fm.fileExists(cache)?2.5:8;const j=await rq.loadJSON();data=j.data;if(data)fm.writeString(cache,JSON.stringify(data));}catch(e){}
if(!data&&fm.fileExists(cache)){try{data=JSON.parse(fm.readString(cache));}catch(e){}}
const fam=config.widgetFamily||"medium",now=Date.now();
const items=((data&&data.items)||[]).filter(x=>x.s>(x.a?now-864e5:now-3600000)).sort((a,b)=>a.s-b.s);
const ICONS=(data&&data.ic)||{};
const TH=Object.assign({h:"#1E1A5E",p:"#4338CA",s:"#FFB547",f:"encre"},(data&&data.th)||{});

// ---------- texte et dates ----------
const hm=ms=>{const d=new Date(ms);return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");};
const cap=t=>t.replace(/^./,c=>c.toUpperCase());
const dayN=ms=>{const t=new Date();t.setHours(0,0,0,0);const x=new Date(ms);x.setHours(0,0,0,0);return Math.round((x-t)/864e5);};
const day=ms=>{const n=dayN(ms),d=new Date(ms);if(n===0)return "Aujourd'hui";if(n===1)return "Demain";
  if(n>1&&n<7)return cap(d.toLocaleDateString("fr-FR",{weekday:"long"}));
  return cap(d.toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"}));};
const short=ms=>{const n=dayN(ms),d=new Date(ms);if(n===0)return "Auj.";if(n===1)return "Dem.";
  if(n>1&&n<7)return cap(d.toLocaleDateString("fr-FR",{weekday:"short"}));return d.toLocaleDateString("fr-FR",{day:"numeric",month:"short"});};
const rel=ms=>{const m=Math.round((ms-now)/6e4);if(m<=0)return "maintenant";if(m<60)return "dans "+m+" min";const h=Math.floor(m/60);
  if(h<24)return "dans "+h+" h"+(m%60?" "+String(m%60).padStart(2,"0"):"");return day(ms).toLowerCase();};
const clip=(t,n)=>{t=String(t||"");return t.length>n?t.slice(0,n-1).trim()+"…":t;};
const esc=t=>String(t||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

const next=items.find(x=>!x.a)||items[0];
const rest=items.filter(x=>x!==next);
const dep=!!(next&&!next.a&&next.d&&next.d>now-15*6e4);
const target=next?(dep?next.d:next.s):0;

// ---------- couleurs ----------
const rgb=h=>{h=String(h||"#000000").replace("#","");if(h.length===3)h=h.split("").map(c=>c+c).join("");const n=parseInt(h,16)||0;return [n>>16&255,n>>8&255,n&255];};
const hex=a=>"#"+a.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")).join("");
const mix=(a,b,t)=>{const x=rgb(a),y=rgb(b);return hex(x.map((v,i)=>v+(y[i]-v)*t));};
const C=(h,a)=>new Color(h,a==null?1:a);
const lum=h=>{const [r,g,b]=rgb(h);return (0.299*r+0.587*g+0.114*b)/255;};
// fond toujours sombre pour que le texte blanc reste lisible, quel que soit le thème
const BG=lum(TH.h)>0.32?mix(TH.h,"#000000",0.55):TH.h;
const ACC=lum(TH.s)<0.35?mix(TH.s,"#ffffff",0.45):TH.s;
const EVC=next?next.c:TH.p;

// ---------- polices ----------
const FONTS={encre:"Georgia-Bold",aurore:"AvenirNext-Bold",tokyo:"Futura-CondensedExtraBold",velours:"Didot-Bold",jardin:"Georgia-BoldItalic",riviera:"AvenirNext-Heavy",bonbon:"MarkerFelt-Wide",metro:"AvenirNextCondensed-Heavy"};
const fTitle=s=>{try{return new Font(FONTS[TH.f]||"Georgia-Bold",s);}catch(e){return Font.boldSystemFont(s);}};
const fNum=s=>{try{return Font.heavyRoundedSystemFont(s);}catch(e){return Font.heavySystemFont(s);}};
const fKick=s=>Font.boldSystemFont(s),fText=s=>Font.semiboldSystemFont(s),fSmall=s=>Font.mediumSystemFont(s);

// ---------- outils de dessin ----------
let seed=1337;const rnd=()=>(seed=seed*16807%2147483647)/2147483647;
function canvas(W,H){const c=new DrawContext();c.size=new Size(W,H);c.opaque=true;c.respectScreenScale=true;return c;}
function blob(c,x,y,r,col,a){const n=22;for(let i=0;i<n;i++){const rr=r*(1-i/n);c.setFillColor(C(col,a/n*1.6));c.fillEllipse(new Rect(x-rr,y-rr,rr*2,rr*2));}}
function grain(c,W,H,n){for(let i=0;i<n;i++){const x=rnd()*W,y=rnd()*H,s=rnd()<.15?1.4:.8;c.setFillColor(C(rnd()<.5?"#ffffff":"#000000",.05+rnd()*.05));c.fillRect(new Rect(x,y,s,s));}}
function poly(c,pts,col,lw,fill){if(pts.length<2)return;const p=new Path();p.move(pts[0]);for(let i=1;i<pts.length;i++)p.addLine(pts[i]);
  if(fill){p.closeSubpath();c.addPath(p);c.setFillColor(col);c.fillPath();}else{c.addPath(p);c.setStrokeColor(col);c.setLineWidth(lw);c.strokePath();}}
function dot(c,x,y,r,col){c.setFillColor(col);c.fillEllipse(new Rect(x-r,y-r,r*2,r*2));}
function ring(c,x,y,r,col,lw){c.setStrokeColor(col);c.setLineWidth(lw);c.strokeEllipse(new Rect(x-r,y-r,r*2,r*2));}
function arc(c,x,y,r,a0,a1,col,lw){const n=Math.max(2,Math.ceil(Math.abs(a1-a0)/0.05)),pts=[];
  for(let i=0;i<=n;i++){const a=a0+(a1-a0)*i/n;pts.push(new Point(x+Math.cos(a)*r,y+Math.sin(a)*r));}
  poly(c,pts,col,lw);dot(c,pts[0].x,pts[0].y,lw/2,col);dot(c,pts[n].x,pts[n].y,lw/2,col);return pts[n];}
// icône d'un thème (tracés envoyés par l'app), avec rotation possible
function icon(c,key,cx,cy,size,col,lw,rot){const src=ICONS[key];if(!src)return false;const k=size/24,cs=Math.cos(rot||0),sn=Math.sin(rot||0);
  for(const part of src.split(";")){const fill=part[0]==="f",nums=(fill?part.slice(1):part).split(",").map(Number);
    if(fill&&nums.length===3){dot(c,cx+((nums[0]/10-12)*cs-(nums[1]/10-12)*sn)*k,cy+((nums[0]/10-12)*sn+(nums[1]/10-12)*cs)*k,Math.max(1,nums[2]/10*k),col);continue;}
    const pts=[];for(let i=0;i+1<nums.length;i+=2){const x=nums[i]/10-12,y=nums[i+1]/10-12;pts.push(new Point(cx+(x*cs-y*sn)*k,cy+(x*sn+y*cs)*k));}
    poly(c,pts,col,lw,fill);}
  return true;}
// le logo : deux anneaux entrelacés
function logo(c,cx,cy,r,lw,a,colA,colB){const o=r*0.52;ring(c,cx-o,cy,r,C(colA||ACC,a),lw);ring(c,cx+o,cy,r,C(colB||"#ffffff",a),lw);
  arc(c,cx-o,cy,r,-0.5,0.05,C(colA||ACC,a),lw);}
function txt(c,t,x,y,w,h,font,col,align){c.setFont(font);c.setTextColor(col);
  if(align==="c")c.setTextAlignedCenter();else if(align==="r")c.setTextAlignedRight();else c.setTextAlignedLeft();
  c.drawTextInRect(String(t),new Rect(x,y,w,h));}
function pill(c,x,y,w,h,col){const p=new Path();p.addRoundedRect(new Rect(x,y,w,h),h/2,h/2);c.addPath(p);c.setFillColor(col);c.fillPath();}

// ---------- éléments composés ----------
function backdrop(c,W,H){c.setFillColor(C(BG));c.fillRect(new Rect(0,0,W,H));
  blob(c,W*0.95,-H*0.1,Math.max(W,H)*0.55,TH.p,.85);
  blob(c,W*0.05,H*1.05,Math.max(W,H)*0.45,EVC,.7);
  blob(c,W*0.6,H*0.9,Math.max(W,H)*0.25,ACC,.18);
  grain(c,W,H,Math.round(W*H/40));}
function watermark(c,x,y,size){if(!(next&&next.m&&icon(c,next.m,x,y,size,C("#ffffff",.07),size/12,-0.22)))logo(c,x,y,size*0.32,size/22,.07,"#ffffff","#ffffff");}
function progress(){if(!next)return 0;const ms=target-now;if(ms<=0)return 1;const span=ms<864e5?864e5:7*864e5;return Math.max(0.04,Math.min(1,1-ms/span));}
function dial(c,x,y,r,lw){ring(c,x,y,r,C("#ffffff",.13),lw);
  const p=progress(),a0=-Math.PI/2;
  if(next){for(let g=3;g>=1;g--)arc(c,x,y,r,a0,a0+p*2*Math.PI,C(ACC,.08),lw+g*4);
    const end=arc(c,x,y,r,a0,a0+p*2*Math.PI,C(ACC),lw);dot(c,end.x,end.y,lw*0.9,C("#ffffff"));dot(c,end.x,end.y,lw*0.45,C(ACC));}
  // petits repères comme sur un cadran
  for(let i=0;i<12;i++){const a=i/12*2*Math.PI,r1=r-lw*1.6,r2=r-lw*1.6-(i%3?2:4);poly(c,[new Point(x+Math.cos(a)*r1,y+Math.sin(a)*r1),new Point(x+Math.cos(a)*r2,y+Math.sin(a)*r2)],C("#ffffff",i%3?.18:.35),1);}
  const s=r*0.78;
  if(!(next&&next.m&&icon(c,next.m,x,y,s,C("#ffffff"),Math.max(1.4,s/14))))logo(c,x,y,r*0.3,Math.max(1.6,r/16),1);}
function relK(ms){const m=Math.round((ms-now)/6e4);if(m<=0)return "MAINTENANT";if(m<60)return "DANS "+m+" MIN";
  if(m<1440){const h=Math.floor(m/60);return "DANS "+h+" H"+(m%60?" "+String(m%60).padStart(2,"0"):"");}
  const n=dayN(ms);return n<=1?"DEMAIN":"DANS "+n+" JOURS";}
function kicker(){if(!next)return "";
  if(next.a){const n=dayN(next.s);return (n<=0?"AUJOURD'HUI":n===1?"DEMAIN":"DANS "+n+" JOURS")+" · JOURNÉE";}
  return (dep?"DÉPART ":"")+relK(target);}
function meta(){if(!next)return "";const n=dayN(next.s);
  if(next.a)return day(next.s)+(next.l?"  ·  "+next.l:"");
  return (n>=1?short(next.s)+" ":"")+hm(next.s)+(next.l?"  ·  "+next.l:"");}
function who(c,x,y,r,x0){// les deux anneaux pour « tous les deux », sinon l'initiale
  if(!x0)return;dot(c,x,y,r,C("#ffffff",.16));txt(c,x0,x-r,y-r*0.75,r*2,r*1.6,Font.boldSystemFont(r*1.05),C("#ffffff"),"c");}
function week(c,x,y,w){const L=["D","L","M","M","J","V","S"],cw=w/7;
  for(let i=0;i<7;i++){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+i);const cx=x+cw*i+cw/2;
    const ev=items.find(e=>dayN(e.s)===i);
    if(i===0){pill(c,cx-cw/2+2,y-2,cw-4,34,C("#ffffff",.12));}
    txt(c,L[d.getDay()],cx-10,y,20,12,fKick(8),C("#ffffff",i===0?.9:.5),"c");
    txt(c,String(d.getDate()),cx-12,y+10,24,16,fNum(12),C("#ffffff",i===0?1:.82),"c");
    if(ev){dot(c,cx,y+29,2.6,C(ev.c));if(items.filter(e=>dayN(e.s)===i).length>1)dot(c,cx+6,y+29,1.6,C(ev.c,.6));}}}
function badges(c,x,y,align,w){if(!data||!(data.wishes||data.fb))return;
  const t=(data.wishes?"★ "+data.wishes+"  ":"")+(data.fb?"♥ "+data.fb:"");txt(c,t.trim(),x,y,w,14,fKick(10),C(ACC),align);}

function empty(c,W,H){logo(c,W/2,H*0.42,Math.min(W,H)*0.17,Math.min(W,H)/40,1);
  txt(c,data?"Rien de prévu":"Ouvre Together",0,H*0.66,W,24,fTitle(W>200?20:16),C("#ffffff"),"c");
  txt(c,data?(data.wishes?"★ "+data.wishes+" envie"+(data.wishes>1?"s":"")+" à exaucer":"Et si on sortait ?"):"pour afficher vos évènements",0,H*0.66+24,W,16,fSmall(11),C(ACC),"c");}

// ---------- mises en page ----------
function drawSmall(){const W=170,H=170,c=canvas(W,H);backdrop(c,W,H);
  if(!next){empty(c,W,H);return c.getImage();}
  watermark(c,W*0.82,H*0.78,120);
  dial(c,40,40,24,5);
  logo(c,W-22,22,5.5,1.4,.8);badges(c,W-80,34,"r",66);
  txt(c,kicker(),14,72,W-28,13,fKick(9.5),C(ACC));
  txt(c,next.a?short(next.s):hm(target),12,82,W-24,46,next.a?fTitle(30):fNum(40),C("#ffffff"));
  txt(c,clip(next.t,34),14,128,W-28,36,fTitle(14),C("#ffffff",.95));
  return c.getImage();}

function hero(c,W,H,withWeek){
  watermark(c,W-70,H*0.62,170);
  dial(c,76,H/2-2,52,7);
  who(c,76+40,H/2-2+40,9,next.w);
  badges(c,8,H-20,"c",136);
  const x0=150,w0=W-x0-16;
  logo(c,W-22,20,5.5,1.4,.8);
  txt(c,kicker(),x0,15,w0-24,13,fKick(10),C(ACC));
  const t=clip(next.t,40),big=t.length<=16;
  txt(c,t,x0,31,w0,56,fTitle(big?24:19),C("#ffffff"));
  let y=89;
  if(dep){const s="DÉPART "+hm(next.d);pill(c,x0,y,74,19,C(ACC));txt(c,s,x0,y+3,74,14,fKick(9.5),C(BG),"c");
    txt(c,clip(meta(),24),x0+80,y+2,w0-80,16,fText(11.5),C("#ffffff",.85));}
  else txt(c,clip(meta(),34),x0,y+1,w0,16,fText(12),C("#ffffff",.85));
  if(withWeek)week(c,x0-4,H-44,w0+8);}

function drawMedium(){const W=364,H=170,c=canvas(W,H);backdrop(c,W,H);
  if(!next){empty(c,W,H);return c.getImage();}
  hero(c,W,H,true);return c.getImage();}

function drawLarge(){const W=364,H=382,c=canvas(W,H);backdrop(c,W,H);
  if(!next){empty(c,W,H);return c.getImage();}
  const HH=170;hero(c,W,HH,true);
  // ligne de « billet » détachable
  const yp=HH+10;for(let x=26;x<W-26;x+=9)c.setFillColor(C("#ffffff",.22)),c.fillRect(new Rect(x,yp,5,1.2));
  dot(c,0,yp,11,C(mix(BG,"#000000",.35)));dot(c,W,yp,11,C(mix(BG,"#000000",.35)));
  let y=yp+14,lastDay=null;const list=rest.slice(0,4);
  if(!list.length)txt(c,"Rien d'autre de prévu pour l'instant",20,y+10,W-40,18,fSmall(12),C("#ffffff",.6));
  for(const x of list){const dn=dayN(x.s),d=new Date(x.s);
    if(dn!==lastDay){txt(c,String(d.getDate()),14,y+1,36,22,fTitle(20),C("#ffffff"),"c");
      txt(c,d.toLocaleDateString("fr-FR",{month:"short"}).replace(".","").toUpperCase(),14,y+22,36,10,fKick(7.5),C("#ffffff",.55),"c");lastDay=dn;}
    else poly(c,[new Point(32,y-6),new Point(32,y+28)],C("#ffffff",.15),1);
    dot(c,72,y+14,14,C(x.c,.9));if(!icon(c,x.m,72,y+14,17,C("#ffffff"),1.5))dot(c,72,y+14,3,C("#ffffff"));
    txt(c,clip(x.t,23),94,y+3,W-184,18,fText(14),C("#ffffff"));
    txt(c,clip([dn>1&&dn<7?short(x.s):dn>=7?"":day(x.s),x.l].filter(Boolean).join(" · "),36),94,y+20,W-180,14,fSmall(10.5),C("#ffffff",.6));
    txt(c,x.a?"Journée":hm(x.s),W-84,y+6,68,18,x.a?fKick(11):fNum(15),C(ACC),"r");
    if(x.w)who(c,W-84-6,y+14,7,x.w);
    y+=38;}
  // pied : vos prénoms + envies et souvenirs
  const names=data&&data.names?data.names.join(" & "):"";
  logo(c,26,H-18,5,1.3,.8);txt(c,names,40,H-26,170,14,fSmall(10.5),C("#ffffff",.65));
  if(data&&(data.wishes||data.fb))txt(c,[data.wishes?"★ "+data.wishes+" envie"+(data.wishes>1?"s":""):"",data.fb?"♥ "+data.fb+" souvenir"+(data.fb>1?"s":""):""].filter(Boolean).join("   "),W-200,H-26,184,14,fKick(10.5),C(ACC),"r");
  return c.getImage();}

function drawCircular(){const S=76,c=new DrawContext();c.size=new Size(S,S);c.opaque=false;c.respectScreenScale=true;
  ring(c,S/2,S/2,S/2-5,C("#ffffff",.25),5);
  if(next){arc(c,S/2,S/2,S/2-5,-Math.PI/2,-Math.PI/2+progress()*2*Math.PI,C("#ffffff"),5);
    txt(c,next.a?short(next.s):hm(target),0,S/2-12,S,18,fNum(15),C("#ffffff"),"c");
    txt(c,dep?"départ":next.a?"journée":"rdv",0,S/2+5,S,12,fSmall(9),C("#ffffff",.8),"c");}
  else logo(c,S/2,S/2,9,2,1,"#ffffff","#ffffff");
  return c.getImage();}

// ---------- lancé depuis l'app Scriptable (toucher le widget, ou ▶) : aperçu au style de Together ----------
function svgIcon(key,col,size,sw){const src=ICONS[key];if(!src)return "";let o="";
  for(const part of src.split(";")){const f=part[0]==="f",n=(f?part.slice(1):part).split(",").map(Number);
    if(f&&n.length===3){o+=`<circle cx="${n[0]/10}" cy="${n[1]/10}" r="${Math.max(.8,n[2]/10)}" fill="${col}"/>`;continue;}
    const pts=[];for(let i=0;i+1<n.length;i+=2)pts.push(n[i]/10+","+n[i+1]/10);
    o+=f?`<polygon points="${pts.join(" ")}" fill="${col}"/>`:`<polyline points="${pts.join(" ")}" fill="none" stroke="${col}" stroke-width="${sw||1.8}" stroke-linecap="round" stroke-linejoin="round"/>`;}
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${o}</svg>`;}
function rings(h,a,b){return `<svg viewBox="0 0 40 24" height="${h}" width="${h*40/24}" aria-hidden="true"><circle cx="14" cy="12" r="8.5" fill="none" stroke="${a}" stroke-width="3"/><circle cx="26" cy="12" r="8.5" fill="none" stroke="${b}" stroke-width="3"/><path d="M14 3.5a8.5 8.5 0 0 1 7.6 4.7" fill="none" stroke="${a}" stroke-width="3"/></svg>`;}
function previewHtml(){
  const T=Object.assign({b:"#EDEEF5",u:"#FFFFFF",i:"#16163A",m:"#606181",l:"#DCDDEA"},TH),dark=lum(T.b)<0.4;
  const names=(data&&data.names)||[];
  const todayTxt=cap(new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"}));
  let heroH="";
  if(next){const p=progress(),R=46,L=2*Math.PI*R;
    heroH=`<section class="hero" style="--c:${esc(EVC)}">
      <div class="wm">${svgIcon(next.m,"#ffffff",230,1.2)||rings(150,"#ffffff","#ffffff")}</div>
      <div class="dial"><svg viewBox="0 0 110 110" width="110" height="110"><circle cx="55" cy="55" r="${R}" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="7"/>
        <circle cx="55" cy="55" r="${R}" fill="none" stroke="${ACC}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(p*L).toFixed(1)} ${L.toFixed(1)}" transform="rotate(-90 55 55)" class="arc"/></svg>
        <div class="ic">${svgIcon(next.m,"#ffffff",40,1.8)||rings(26,ACC,"#ffffff")}</div></div>
      <div class="ht"><p class="kick">${esc(kicker())}</p><h3>${esc(next.t)}</h3>
        <p class="meta">${dep?`<span class="go">Départ ${hm(next.d)}</span>`:""}${esc(meta())}</p>${next.k?`<p class="mk">${esc(next.k)}</p>`:""}</div></section>`;}
  else heroH=`<section class="hero none"><div class="ic">${rings(54,ACC,"#ffffff")}</div><div class="ht"><h3>${data?"Rien de prévu":"Ouvre Together"}</h3><p class="meta">${data?"Et si on sortait ?":"une fois pour afficher vos évènements ici"}</p></div></section>`;
  const L7=["D","L","M","M","J","V","S"];let wk="";
  for(let i=0;i<7;i++){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+i);const evs=items.filter(e=>dayN(e.s)===i);
    wk+=`<div class="wd${i===0?" on":""}"><small>${L7[d.getDay()]}</small><b>${d.getDate()}</b><i>${evs.slice(0,3).map(e=>`<u style="background:${esc(e.c)}"></u>`).join("")}</i></div>`;}
  const chips=data&&(data.wishes||data.fb)?`<div class="chips">${data.wishes?`<span>★ ${data.wishes} envie${data.wishes>1?"s":""} à exaucer</span>`:""}${data.fb?`<span>♥ ${data.fb} souvenir${data.fb>1?"s":""} à raconter</span>`:""}</div>`:"";
  let rows="",last="",n=0;
  for(const x of rest){const d=day(x.s);if(d!==last){rows+=`<h4>${esc(d)}</h4>`;last=d;}
    rows+=`<article style="--c:${esc(x.c)};--d:${(n++)*60}ms"><div class="tm">${x.a?"<small>Journée</small>":`<b>${hm(x.s)}</b>`}${x.d&&x.d>now?`<small>dép. ${hm(x.d)}</small>`:""}</div>
      <div class="bub">${svgIcon(x.m,"#ffffff",22,2)||"<em></em>"}</div>
      <div class="tx"><b>${esc(x.t)}</b>${x.l||x.k?`<small>${esc([x.l,x.k].filter(Boolean).join(" · "))}</small>`:""}</div>${x.w?`<span class="who">${esc(x.w)}</span>`:""}</article>`;}
  if(data&&!rest.length&&next)rows=`<p class="empty">Rien d'autre de prévu pour l'instant.</p>`;
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Fraunces:opsz,wght@9..144,500..800&display=swap" rel="stylesheet">
<style>
:root{--bg:${T.b};--su:${T.u};--ink:${T.i};--mu:${T.m};--hair:${T.l};--p:${T.p};--s:${ACC};--hero:${BG};--f:"Bricolage Grotesque",-apple-system,system-ui,sans-serif;--fd:"Fraunces",Georgia,serif;color-scheme:${dark?"dark":"light"}}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(70% 380px at 100% -80px,color-mix(in oklab,var(--p) 30%,transparent),transparent 70%),var(--bg);color:var(--ink);font:16px/1.35 var(--f);padding:18px 16px 40px;-webkit-font-smoothing:antialiased}
header{display:flex;align-items:center;justify-content:space-between}.brand{display:flex;align-items:center;gap:8px;font-weight:800;font-size:20px;letter-spacing:-.01em}
.duo{display:flex}.duo span{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:13px;color:#fff;background:var(--p);border:2px solid var(--bg)}.duo span+span{margin-left:-9px;background:color-mix(in oklab,var(--s) 85%,#000);color:#1a1000}
.today{font:800 30px/1.1 var(--fd);letter-spacing:-.02em;margin:18px 2px 14px}
.hero{position:relative;overflow:hidden;border-radius:28px;padding:20px 18px;color:#fff;display:flex;gap:16px;align-items:center;min-height:170px;
  background:radial-gradient(90% 90% at 100% 0%,color-mix(in oklab,var(--p) 75%,transparent),transparent 60%),radial-gradient(80% 90% at 0% 100%,color-mix(in oklab,var(--c,var(--p)) 70%,transparent),transparent 60%),var(--hero);
  box-shadow:0 22px 44px -24px color-mix(in oklab,var(--c,var(--p)) 80%,transparent);animation:up .5s cubic-bezier(.2,.8,.2,1) both}
.hero .wm{position:absolute;right:-50px;bottom:-60px;opacity:.09;transform:rotate(-13deg)}
.dial{position:relative;flex:none;width:110px;height:110px}.dial .ic{position:absolute;inset:0;display:grid;place-items:center}
.arc{filter:drop-shadow(0 0 6px ${ACC});animation:draw 1.1s cubic-bezier(.2,.8,.2,1) both}
@keyframes draw{from{stroke-dasharray:0 999}}
.ht{position:relative;min-width:0}.kick{margin:0;color:var(--s);font-weight:800;font-size:12px;letter-spacing:.06em}
.hero h3{font:800 26px/1.08 var(--fd);margin:4px 0 8px;letter-spacing:-.01em}.meta{margin:0;font-weight:600;font-size:14px;opacity:.88;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.go{background:var(--s);color:#1a1000;border-radius:99px;padding:3px 10px;font-weight:800;font-size:12px}.mk{margin:8px 0 0;font-size:12px;opacity:.65}
.hero.none{justify-content:flex-start}.hero.none .ic{flex:none}
.week{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin:14px 0 4px}
.wd{background:var(--su);border:1px solid var(--hair);border-radius:16px;padding:8px 0 7px;display:grid;justify-items:center;gap:1px}
.wd small{font-size:10px;font-weight:700;color:var(--mu)}.wd b{font-size:17px;font-weight:800}.wd i{display:flex;gap:3px;height:6px}.wd u{width:6px;height:6px;border-radius:50%}
.wd.on{background:var(--p);border-color:transparent;color:#fff}.wd.on small{color:rgba(255,255,255,.8)}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0}.chips span{background:color-mix(in oklab,var(--s) 18%,var(--su));border:1px solid color-mix(in oklab,var(--s) 45%,transparent);border-radius:99px;padding:7px 12px;font-weight:700;font-size:13px}
h2{font:800 20px var(--fd);margin:24px 2px 4px}h4{margin:16px 4px 8px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--mu)}
article{display:flex;align-items:center;gap:12px;background:var(--su);border:1px solid var(--hair);border-radius:20px;padding:12px 14px;margin-bottom:8px;position:relative;overflow:hidden;animation:up .45s var(--d) cubic-bezier(.2,.8,.2,1) both}
article::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--c)}
.tm{width:52px;flex:none;display:grid}.tm b{font-size:17px;font-weight:800;font-variant-numeric:tabular-nums}.tm small{font-size:11px;color:var(--mu);font-weight:600}
.bub{width:40px;height:40px;border-radius:14px;background:var(--c);display:grid;place-items:center;flex:none;box-shadow:0 8px 16px -10px var(--c)}.bub em{width:8px;height:8px;border-radius:50%;background:#fff}
.tx{min-width:0;flex:1;display:grid}.tx b{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tx small{color:var(--mu);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.who{width:24px;height:24px;border-radius:50%;background:var(--hair);display:grid;place-items:center;font-size:11px;font-weight:800;flex:none}
.empty{color:var(--mu)}.tip{margin:26px 4px 0;font-size:13px;color:var(--mu);text-align:center}
@keyframes up{from{opacity:0;transform:translateY(10px)}}
</style>
<header><div class="brand">${rings(22,ACC,T.p)}Together</div><div class="duo">${names.slice(0,2).map(x=>`<span>${esc(String(x).slice(0,1).toUpperCase())}</span>`).join("")}</div></header>
<h1 class="today">${esc(todayTxt)}</h1>
${heroH}<div class="week">${wk}</div>${chips}
${rest.length||next?`<h2>Ensuite</h2>`:""}${rows}
<p class="tip">Pour ajouter ou modifier, ouvre l'icône Together sur ton écran d'accueil.</p></html>`;}
if(!config.runsInWidget&&config.runsInApp){
  const wv=new WebView();await wv.loadHTML(previewHtml());await wv.present(true);
  // Après « Close » : retour direct à l'écran d'accueil, pas à la liste des scripts
  try{App.close();}catch(e){}
  Script.complete();return;
}

// ---------- assemblage ----------
const w=new ListWidget();w.refreshAfterDate=new Date(now+15*6e4);
// toucher le widget ouvre la liste dans Scriptable (iOS ne permet pas d'ouvrir directement une app web)
try{w.url="scriptable:///run/"+encodeURIComponent(Script.name())+"?from=widget";}catch(e){}
if(fam==="accessoryCircular"){w.addSpacer();const im=w.addImage(drawCircular());im.centerAlignImage();w.addSpacer();}
else if(fam==="accessoryInline"){w.addText(next?(dep?"Départ "+hm(next.d):next.a?short(next.s):hm(next.s))+" · "+next.t:"Together : rien de prévu");}
else if(fam==="accessoryRectangular"){
  if(!next){w.addText("Together : rien de prévu");}
  else{const k=w.addText(kicker());k.font=Font.boldSystemFont(10);k.lineLimit=1;
    const a=w.addText(next.t);a.font=Font.boldSystemFont(15);a.lineLimit=1;
    const b=w.addText(next.a?"Toute la journée":hm(next.s)+(next.l?" · "+next.l:""));b.font=Font.systemFont(12);b.lineLimit=1;}}
else{
  w.setPadding(0,0,0,0);
  w.backgroundImage=fam==="small"?drawSmall():fam==="large"?drawLarge():drawMedium();
}
Script.setWidget(w);
if(!config.runsInWidget)await (fam==="small"?w.presentSmall():fam==="large"?w.presentLarge():w.presentMedium());
Script.complete();
