// Together : code du widget Scriptable. widget-together.js (le lanceur) le télécharge une fois par version et le garde sur le téléphone.
// Tout le visuel est dessiné à la main (DrawContext) : halos, grain, anneaux, icônes des thèmes, photos.
// Le mot écrit dans « Paramètre » (réglages du widget) choisit le widget : vide pour l'agenda, ou courses,
// compte (compte à rebours), souvenir, idée (« On fait quoi ? »), voiture. La galerie de l'app les montre tous.
const fm=FileManager.local(),dir=fm.documentsDirectory(),cache=fm.joinPath(dir,"together-widget.json");
const QP=(typeof args!=="undefined"&&args&&args.queryParameters)||{};
const fold=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\s+/g," ").trim();
let data=null;
// Ouvert en touchant le widget : on montre tout de suite la dernière copie, sans attendre le réseau trop longtemps
const fromTap=!config.runsInWidget&&QP.from==="widget";
try{const rq=new Request(API);if(!config.runsInWidget)rq.timeoutInterval=fm.fileExists(cache)?2.5:8;const j=await rq.loadJSON();data=j.data;if(data)fm.writeString(cache,JSON.stringify(data));}catch(e){}
if(!data&&fm.fileExists(cache)){try{data=JSON.parse(fm.readString(cache));}catch(e){}}
const D=data||{};
const fam=config.widgetFamily||"medium",now=Date.now();

// ---------- quel widget ? ----------
const PARAM=fold((typeof args!=="undefined"&&args&&args.widgetParameter)||"");
function modeOf(p){
  if(/^(courses?|liste|panier|shop)/.test(p))return "shop";
  if(/^(compte|j ?-|rebours|decompte|countdown)/.test(p))return "cd";
  if(/^(souvenirs?|photos?|memoire)/.test(p))return "sv";
  if(/^(idees?|on fait quoi|sorties?|envies?)/.test(p))return "idea";
  if(/voiture|carplay|auto/.test(p))return "car";
  return "agenda";}
const MODE=fromTap?(["shop","cd","sv","idea"].includes(QP.w)?QP.w:"agenda"):modeOf(PARAM);
// « compte barcelone » : le compte à rebours d'un évènement précis (un mot de son titre suffit)
const CDQ=fromTap?fold(QP.q):MODE==="cd"?PARAM.replace(/^(compte( a)?( rebours)?|j ?-|rebours|decompte|countdown)\s*:?\s*/,""):"";

const items=(Array.isArray(D.items)?D.items:[]).filter(x=>x.s>(x.a?now-864e5:now-3600000)).sort((a,b)=>a.s-b.s);
const ICONS=D.ic||{};
const TH=Object.assign({h:"#1E1A5E",p:"#4338CA",s:"#FFB547",f:"encre"},D.th||{});

// ---------- texte et dates ----------
const hm=ms=>{const d=new Date(ms);return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");};
// « 20 h 10 », comme on le dit
const hs=ms=>{const d=new Date(ms),m=d.getMinutes();return d.getHours()+" h"+(m?" "+String(m).padStart(2,"0"):"");};
const cap=t=>String(t||"").replace(/^./,c=>c.toUpperCase());
const dayN=ms=>{const t=new Date();t.setHours(0,0,0,0);const x=new Date(ms);x.setHours(0,0,0,0);return Math.round((x-t)/864e5);};
const day=ms=>{const n=dayN(ms),d=new Date(ms);if(n===0)return "Aujourd'hui";if(n===1)return "Demain";
  if(n>1&&n<7)return cap(d.toLocaleDateString("fr-FR",{weekday:"long"}));
  return cap(d.toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"}));};
const short=ms=>{const n=dayN(ms),d=new Date(ms);if(n===0)return "Auj.";if(n===1)return "Dem.";
  if(n>1&&n<7)return cap(d.toLocaleDateString("fr-FR",{weekday:"short"}));return d.toLocaleDateString("fr-FR",{day:"numeric",month:"short"});};
const dLong=ms=>cap(new Date(ms).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"}));
const keyOf=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const rel=ms=>{const m=Math.round((ms-now)/6e4);if(m<=0)return "maintenant";if(m<60)return "dans "+m+" min";const h=Math.floor(m/60);
  if(h<24)return "dans "+h+" h"+(m%60?" "+String(m%60).padStart(2,"0"):"");return day(ms).toLowerCase();};
const clip=(t,n)=>{t=String(t||"");return t.length>n?t.slice(0,n-1).trim()+"…":t;};
const esc=t=>String(t||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const plural=(n,a,b)=>n+" "+(n>1?(b||a+"s"):a);

const next=items.find(x=>!x.a)||items[0];
const rest=items.filter(x=>x!==next);
const dep=!!(next&&!next.a&&next.d&&next.d>now-15*6e4);
const target=next?(dep?next.d:next.s):0;

// ---------- les autres widgets : courses, compte à rebours, souvenir, idée ----------
const SHOP=D.shop&&typeof D.shop==="object"?D.shop:null;
const SHOPA=SHOP&&Array.isArray(SHOP.a)?SHOP.a.filter(g=>g&&Array.isArray(g.i)):[];
const SHOPN=SHOP?Math.max(0,+SHOP.n||0):0;
const shopList=()=>[].concat(...SHOPA.map(g=>g.i.map(it=>({t:String(it.t||""),q:String(it.q||""),c:g.c||"#16A34A"}))));
const CDS=(Array.isArray(D.cd)?D.cd:[]).filter(x=>x&&+x.s>0&&x.t&&dayN(+x.s)>=0);
function cdPick(){if(!CDS.length)return null;if(CDQ){const m=CDS.find(x=>fold(x.t).includes(CDQ));if(m)return m;}return CDS[0];}
const CDX=MODE==="cd"?cdPick():null,CDR=CDS.filter(x=>x!==CDX).sort((a,b)=>a.s-b.s);
const SV=D.sv&&typeof D.sv==="object"&&D.sv.t?D.sv:null;
// « On fait quoi ? » : le moment libre doit être encore à venir (l'app a pu le calculer hier) ; sinon, le suivant
const slotEnd=x=>x&&x.d&&x.to?new Date(x.d+"T"+x.to+":00").getTime():0;
const PART={"Soirée":"soir","Matin":"matin","Après-midi":"après-midi"};
function slotLabel(x){if(!x||!x.d||!x.lab)return (x&&x.sl)||"";const d=new Date(x.d+"T12:00:00"),n=dayN(d.getTime()),part=PART[x.lab]||"soir";
  if(n<=0)return x.lab==="Soirée"?"Ce soir":x.lab==="Matin"?"Ce matin":"Cet après-midi";if(n===1)return "Demain "+part;
  const wd=d.toLocaleDateString("fr-FR",{weekday:"long"});return cap(n<7?wd:wd+" "+d.getDate())+" "+part;}
const IDEA=(()=>{const I=D.idea&&typeof D.idea==="object"?D.idea:null;if(!I||!I.sl)return I;
  const more=(Array.isArray(I.more)?I.more:[]).filter(m=>m&&(!slotEnd(m)||slotEnd(m)>now)).map(m=>({...m,sl:slotLabel(m)}));
  if(!slotEnd(I)||slotEnd(I)>now)return {...I,sl:slotLabel(I),more};
  const nx=more.find(m=>slotEnd(m)>now);if(!nx)return {sl:""};
  return {sl:nx.sl,d:nx.d,f:nx.f,to:nx.to,lab:nx.lab,t:nx.t||"",k:nx.k||"",c:nx.c||"",why:[],alt:[],more:more.filter(m=>m!==nx)};})();
// jours fériés et vacances scolaires des deux semaines à venir (pour la semaine du widget)
const FER=D.fer&&typeof D.fer==="object"?D.fer:{},VAC=Array.isArray(D.vac)?D.vac.filter(v=>v&&v.a&&v.b):[];
const vacOn=k=>VAC.find(v=>k>=v.a&&k<v.b)||null;

// ---------- en direct : qui arrive, et les retards annoncés ----------
function liveInfo(){
  const L=D.live;
  // un trajet sans nouvelles depuis 4 h, ou dont l'arrivée est passée depuis une demi-heure, est terminé
  if(L&&(L.st==="go"||L.st==="here")&&!(+L.up&&now-L.up>4*3600000)&&!(L.st==="go"&&+L.eta&&now>+L.eta+30*6e4)){
    const by=String(L.by||""),to=String(L.to||""),eta=+L.eta||0,due=+L.due||0,late=eta&&due?Math.round((eta-due)/6e4):0;
    const lt=late>=5?"environ "+late+" min de retard":"";
    if(L.st==="here"){if(L.me)return null;const at=+L.at||now;if(now-at>40*6e4)return null;
      const a=L.k==="pick"?by+" t'attend en bas":L.k==="home"?by+" vient de rentrer":by+" vient d'arriver";
      return {k:"ARRIVÉE",big:hm(at),a,s:a,b:L.t||"",c:L.k==="pick"?"en bas":"arrivée",at};}
    if(L.me){if(!eta)return null;const w=L.k==="pick"?"Chez "+to:L.k==="home"?"À la maison":"Arrivée";
      return {k:"EN ROUTE",big:hm(eta),a:w+" vers "+hs(eta),s:w,b:lt||L.t||"",c:"arrivée",at:eta};}
    if(!eta)return {k:"EN ROUTE",big:"…",a:by+(L.k==="home"?" rentre":" est en route"),s:by+" en route",b:L.t||"",c:"en route",at:now};
    const soon=eta<now-6e4,verb=L.k==="home"?" rentre":" arrive";
    return {k:lt?"EN ROUTE · RETARD":"EN ROUTE",big:hm(eta),a:soon?by+" arrive d'un instant à l'autre":by+verb+" vers "+hs(eta),s:by+verb,b:lt||L.t||"",c:L.k==="home"?"rentre":"arrive",at:eta};}
  // « Dis Siri, je suis en retard » : le serveur ajoute les retards annoncés par l'autre
  const LT=(Array.isArray(D.late)?D.late:[]).filter(x=>x&&+x.m>0&&now-(+x.at||0)<3*3600000&&(!+x.s||now<+x.s+(+x.m+90)*6e4)).sort((p,q)=>q.at-p.at)[0];
  if(LT){const arr=+LT.s?+LT.s+LT.m*6e4:0,n=LT.n||"Ta moitié";
    return {k:"RETARD ANNONCÉ",big:"+"+LT.m+" min",cb:"+"+LT.m,a:n+" aura environ "+LT.m+" min de retard",s:n+" en retard",b:(arr?"Arrivée vers "+hs(arr):"")+(LT.t?(arr?" · ":"")+LT.t:""),c:"retard",at:arr||now};}
  return null;}
const LIVE=MODE==="agenda"||MODE==="car"?liveInfo():null;

// ---------- couleurs ----------
const rgb=h=>{h=String(h||"#000000").replace("#","");if(h.length===3)h=h.split("").map(c=>c+c).join("");const n=parseInt(h,16)||0;return [n>>16&255,n>>8&255,n&255];};
const hex=a=>"#"+a.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")).join("");
const mix=(a,b,t)=>{const x=rgb(a),y=rgb(b);return hex(x.map((v,i)=>v+(y[i]-v)*t));};
const C=(h,a)=>new Color(h,a==null?1:a);
const lum=h=>{const [r,g,b]=rgb(h);return (0.299*r+0.587*g+0.114*b)/255;};
// fond toujours sombre pour que le texte blanc reste lisible, quel que soit le thème
const BG=lum(TH.h)>0.32?mix(TH.h,"#000000",0.55):TH.h;
const ACC=lum(TH.s)<0.35?mix(TH.s,"#ffffff",0.45):TH.s;
const SHOPC="#16A34A",FERC="#FF8E8E";
const EVC=MODE==="shop"?SHOPC:MODE==="cd"?(CDX&&CDX.c)||TH.p:MODE==="sv"?(SV&&SV.c)||"#E11D48":MODE==="idea"?(IDEA&&IDEA.c)||TH.p:next?next.c:TH.p;

// ---------- polices ----------
const FONTS={encre:"Georgia-Bold",aurore:"AvenirNext-Bold",tokyo:"Futura-CondensedExtraBold",velours:"Didot-Bold",jardin:"Georgia-BoldItalic",riviera:"AvenirNext-Heavy",bonbon:"MarkerFelt-Wide",metro:"AvenirNextCondensed-Heavy"};
const fTitle=s=>{try{return new Font(FONTS[TH.f]||"Georgia-Bold",s);}catch(e){return Font.boldSystemFont(s);}};
const fNum=s=>{try{return Font.heavyRoundedSystemFont(s);}catch(e){return Font.heavySystemFont(s);}};
const fKick=s=>Font.boldSystemFont(s),fText=s=>Font.semiboldSystemFont(s),fSmall=s=>Font.mediumSystemFont(s);
const fQuote=s=>{try{return new Font("Georgia-Italic",s);}catch(e){return Font.italicSystemFont(s);}};
const fHand=s=>{try{return new Font("Noteworthy-Bold",s);}catch(e){return Font.semiboldSystemFont(s);}};

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
function rrect(c,x,y,w,h,r,col){const p=new Path();p.addRoundedRect(new Rect(x,y,w,h),r,r);c.addPath(p);c.setFillColor(col);c.fillPath();}
function pill(c,x,y,w,h,col){rrect(c,x,y,w,h,h/2,col);}
// dégradé vertical (pour lire le texte posé sur une photo)
function shade(c,x,y,w,h,col,a0,a1){const n=Math.max(8,Math.round(h/4));let y0=Math.round(y);
  for(let i=1;i<=n;i++){const y1=Math.round(y+h*i/n),t=(i-.5)/n,a=a0+(a1-a0)*t*t*(3-2*t);if(y1>y0){c.setFillColor(C(col,a));c.fillRect(new Rect(x,y0,w,y1-y0));}y0=y1;}}
// une photo recadrée pour remplir exactement w × h (un peu plus de haut que de bas : les visages)
function coverImg(img,w,h,fy){const s=img.size,k=Math.max(w/s.width,h/s.height),dw=s.width*k,dh=s.height*k;
  const c=canvas(w,h);c.drawImageInRect(img,new Rect((w-dw)/2,(h-dh)*(fy==null?.4:fy),dw,dh));return c.getImage();}
function dice(c,x,y,s,col){const p=new Path();p.addRoundedRect(new Rect(x-s/2,y-s/2,s,s),s*.26,s*.26);c.addPath(p);c.setStrokeColor(col);c.setLineWidth(Math.max(1.3,s/11));c.strokePath();
  for(const [a,b] of [[-.22,-.22],[.22,.22],[.22,-.22],[-.22,.22],[0,0]])dot(c,x+a*s,y+b*s,Math.max(1,s*.075),col);}
function tick(c,x,y,r,col,lw){poly(c,[new Point(x-r*.5,y+r*.02),new Point(x-r*.12,y+r*.4),new Point(x+r*.55,y-r*.38)],col,lw);}

// ---------- décors de saison (Together, Thème : Noël, Nouvel An, Saint-Valentin, Halloween, été, votre anniversaire) ----------
function flake(c,x,y,r,col){for(let i=0;i<3;i++){const a=i*Math.PI/3;poly(c,[new Point(x-Math.cos(a)*r,y-Math.sin(a)*r),new Point(x+Math.cos(a)*r,y+Math.sin(a)*r)],col,Math.max(1,r/4));}}
// un cœur : deux ronds et une pointe, remplis d'un seul coup (pas de recouvrement plus foncé)
function heart(c,x,y,s,col){const p=new Path();p.addEllipse(new Rect(x-s*1.02,y-s*0.72,s*1.04,s*1.04));p.addEllipse(new Rect(x-s*0.02,y-s*0.72,s*1.04,s*1.04));
  p.move(new Point(x-s*0.97,y-s*0.02));p.addLine(new Point(x+s*0.97,y-s*0.02));p.addLine(new Point(x,y+s*0.98));p.closeSubpath();c.addPath(p);c.setFillColor(col);c.fillPath();}
function bat(c,x,y,s,col){poly(c,[[-1,0],[-.55,-.45],[-.4,-.1],[-.15,-.32],[0,-.12],[.15,-.32],[.4,-.1],[.55,-.45],[1,0],[.55,-.08],[.3,.2],[0,.02],[-.3,.2],[-.55,-.08]].map(([a,b])=>new Point(x+a*s,y+b*s)),col,0,true);}
function pumpkin(c,x,y,s){const p=new Path();p.addEllipse(new Rect(x-s*1.15,y-s*0.85,s*2.3,s*1.7));c.addPath(p);c.setFillColor(C("#F97316",.55));c.fillPath();
  const q=new Path();q.addEllipse(new Rect(x-s*0.45,y-s*0.85,s*0.9,s*1.7));c.addPath(q);c.setFillColor(C("#FB923C",.45));c.fillPath();
  poly(c,[new Point(x,y-s*0.8),new Point(x+s*0.25,y-s*1.25)],C("#16A34A",.7),Math.max(1.5,s*0.18));}
function seasonDeco(c,W,H){const z=TH.z;if(!["noel","nouvelan","valentin","anniv","halloween","ete"].includes(z))return;
  let s=91;const r=()=>(s=s*16807%2147483647)/2147483647,S=Math.min(W,H),at=()=>[W*(0.6+r()*0.37),H*(0.05+r()*0.42)];
  if(z==="noel")for(let i=0;i<8;i++){const [x,y]=at();flake(c,x,y,S*(0.022+r()*0.02),C("#ffffff",.2+r()*.2));}
  else if(z==="valentin"||z==="anniv")for(let i=0;i<6;i++){const [x,y]=at();heart(c,x,y,S*(0.026+r()*0.022),C(i%2?"#FF8FB1":"#ffffff",.22+r()*.16));}
  // la citrouille seulement sur le petit (ailleurs, le coin du bas est pris par la semaine ou vos prénoms)
  else if(z==="halloween"){if(W<200)pumpkin(c,W-S*0.14,H-S*0.13,S*0.07);for(let i=0;i<3;i++){const [x,y]=at();bat(c,x,y,S*(0.045+r()*0.02),C("#07030F",.5));}}
  // le soleil qui dépasse du coin, derrière le logo
  else if(z==="ete"){const x=W-S*0.03,y=S*0.03,R=S*0.1;dot(c,x,y,R*1.25,C("#FFD54A",.14));dot(c,x,y,R,C("#FFD54A",.6));
    for(let i=0;i<12;i++){const a=i*Math.PI/6;poly(c,[new Point(x+Math.cos(a)*R*1.3,y+Math.sin(a)*R*1.3),new Point(x+Math.cos(a)*R*1.75,y+Math.sin(a)*R*1.75)],C("#FFD54A",.55),Math.max(1.2,S*0.011));}}
  else{const cols=["#FFD54A","#FF8FB1","#5EEAD4","#A78BFA"];for(let i=0;i<12;i++){const [x,y]=at(),a=r()*Math.PI,l=S*0.018;
    poly(c,[new Point(x-Math.cos(a)*l,y-Math.sin(a)*l),new Point(x+Math.cos(a)*l,y+Math.sin(a)*l)],C(cols[i%4],.55),Math.max(1.5,S*0.012));}}}

// ---------- éléments composés ----------
function backdrop(c,W,H,col){c.setFillColor(C(BG));c.fillRect(new Rect(0,0,W,H));
  blob(c,W*0.95,-H*0.1,Math.max(W,H)*0.55,TH.p,.85);
  blob(c,W*0.05,H*1.05,Math.max(W,H)*0.45,col||EVC,.7);
  blob(c,W*0.6,H*0.9,Math.max(W,H)*0.25,ACC,.18);
  seasonDeco(c,W,H);
  grain(c,W,H,Math.round(W*H/40));}
function watermarkM(c,x,y,size,m){if(!(m&&icon(c,m,x,y,size,C("#ffffff",.07),size/12,-0.22)))logo(c,x,y,size*0.32,size/22,.07,"#ffffff","#ffffff");}
function watermark(c,x,y,size){watermarkM(c,x,y,size,next&&next.m);}
function progress(){if(!next)return 0;const ms=target-now;if(ms<=0)return 1;const span=ms<864e5?864e5:7*864e5;return Math.max(0.04,Math.min(1,1-ms/span));}
function ticks(c,x,y,r,lw,n,major){for(let i=0;i<n;i++){const a=i/n*2*Math.PI,r1=r-lw*1.6,r2=r-lw*1.6-(i%major?2:4);poly(c,[new Point(x+Math.cos(a)*r1,y+Math.sin(a)*r1),new Point(x+Math.cos(a)*r2,y+Math.sin(a)*r2)],C("#ffffff",i%major?.18:.35),1);}}
function glowArc(c,x,y,r,a0,a1,lw,end){for(let g=3;g>=1;g--)arc(c,x,y,r,a0,a1,C(ACC,.08),lw+g*4);
  const e=arc(c,x,y,r,a0,a1,C(ACC),lw);if(end){dot(c,e.x,e.y,lw*0.9,C("#ffffff"));dot(c,e.x,e.y,lw*0.45,C(ACC));}}
function dial(c,x,y,r,lw){ring(c,x,y,r,C("#ffffff",.13),lw);
  const p=progress(),a0=-Math.PI/2;
  if(next)glowArc(c,x,y,r,a0,a0+p*2*Math.PI,lw,true);
  // petits repères comme sur un cadran
  ticks(c,x,y,r,lw,12,3);
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
function who(c,x,y,r,x0){// l'initiale de la personne concernée (rien pour « tous les deux »)
  if(!x0)return;dot(c,x,y,r,C("#ffffff",.16));txt(c,x0,x-r,y-r*0.75,r*2,r*1.6,Font.boldSystemFont(r*1.05),C("#ffffff"),"c");}
// la semaine : les jours fériés en rose, un trait sous les jours de vacances scolaires
function week(c,x,y,w){const L=["D","L","M","M","J","V","S"],cw=w/7;let v0=-1;
  for(let i=0;i<=7;i++){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+i);const on=i<7&&!!vacOn(keyOf(d));
    if(on&&v0<0)v0=i;if(!on&&v0>=0){pill(c,x+cw*v0+5,y+35,cw*(i-v0)-10,3,C(ACC,.6));v0=-1;}}
  for(let i=0;i<7;i++){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+i);const cx=x+cw*i+cw/2,f=!!FER[keyOf(d)];
    const ev=items.find(e=>dayN(e.s)===i);
    if(i===0){pill(c,cx-cw/2+2,y-2,cw-4,34,C("#ffffff",.12));}
    txt(c,L[d.getDay()],cx-10,y,20,12,fKick(8),f?C(FERC):C("#ffffff",i===0?.9:.5),"c");
    txt(c,String(d.getDate()),cx-12,y+10,24,16,fNum(12),f?C(FERC):C("#ffffff",i===0?1:.82),"c");
    if(ev){dot(c,cx,y+29,2.6,C(ev.c));if(items.filter(e=>dayN(e.s)===i).length>1)dot(c,cx+6,y+29,1.6,C(ev.c,.6));}
    else if(f)dot(c,cx,y+29,2,C(FERC,.85));}}
function badges(c,x,y,align,w){if(!data||!(D.wishes||D.fb))return;
  const t=(D.wishes?"★ "+D.wishes+"  ":"")+(D.fb?"♥ "+D.fb:"");txt(c,t.trim(),x,y,w,14,fKick(10),C(ACC),align);}
function empty(c,W,H){logo(c,W/2,H*0.42,Math.min(W,H)*0.17,Math.min(W,H)/40,1);
  txt(c,data?"Rien de prévu":"Ouvre Together",0,H*0.66,W,24,fTitle(W>200?20:16),C("#ffffff"),"c");
  txt(c,data?(D.wishes?"★ "+D.wishes+" envie"+(D.wishes>1?"s":"")+" à exaucer":"Et si on sortait ?"):"pour afficher vos évènements",0,H*0.66+24,W,16,fSmall(11),C(ACC),"c");}
// un message centré, avec le logo (pas encore de données, liste vide…)
function note(c,W,H,a,b){logo(c,W/2,H*0.36,Math.min(W,H)*0.15,Math.min(W,H)/40,1);
  txt(c,a,10,H*0.56,W-20,26,fTitle(W>200?20:16),C("#ffffff"),"c");
  if(b)txt(c,b,16,H*0.56+25,W-32,34,fSmall(W>200?11.5:10.5),C(ACC),"c");}
// le bandeau « en direct » : qui arrive, et à quelle heure
function liveBanner(c,x,y,w){pill(c,x,y,w,36,C("#ffffff",.14));
  const cx=x+19,cy=y+18;dot(c,cx,cy,10,C(ACC,.22));dot(c,cx,cy,5.5,C(ACC));dot(c,cx,cy,2.2,C("#ffffff"));
  txt(c,clip(LIVE.a,38),x+35,y+(LIVE.b?3:10),w-44,16,fText(12),C("#ffffff"));
  if(LIVE.b)txt(c,clip(LIVE.b,44),x+35,y+19,w-44,14,fSmall(10),C(ACC));}

// ---------- agenda ----------
function drawSmall(){const W=170,H=170,c=canvas(W,H);backdrop(c,W,H);
  if(LIVE){// en route : le petit widget devient l'heure d'arrivée
    const x=32,y=34;for(let g=3;g>=1;g--)dot(c,x,y,7+g*5,C(ACC,.08));dot(c,x,y,8,C(ACC));dot(c,x,y,3.2,C("#ffffff"));
    logo(c,W-22,22,5.5,1.4,.8);
    txt(c,LIVE.k,14,62,W-28,13,fKick(9.5),C(ACC));
    txt(c,LIVE.big,12,72,W-24,46,fNum(LIVE.big.length>6?30:40),C("#ffffff"));
    txt(c,clip(LIVE.s,30),14,118,W-28,20,fTitle(14),C("#ffffff",.95));
    if(LIVE.b)txt(c,clip(LIVE.b,30),14,140,W-28,24,fSmall(10),C(ACC));
    return c.getImage();}
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
  // en direct, le bandeau d'arrivée prend la place de la semaine
  if(withWeek){if(LIVE)liveBanner(c,x0-4,H-48,w0+8);else week(c,x0-4,H-44,w0+8);}}

function drawMedium(){const W=364,H=170,c=canvas(W,H);backdrop(c,W,H);
  if(!next){if(LIVE){empty(c,W,H-40);liveBanner(c,16,H-48,W-32);}else empty(c,W,H);return c.getImage();}
  hero(c,W,H,true);return c.getImage();}

function drawLarge(){const W=364,H=382,c=canvas(W,H);backdrop(c,W,H);
  if(!next){empty(c,W,H);if(LIVE)liveBanner(c,16,H-56,W-32);return c.getImage();}
  const HH=170;hero(c,W,HH,true);
  // ligne de « billet » détachable
  const yp=HH+10;for(let x=26;x<W-26;x+=9)c.setFillColor(C("#ffffff",.22)),c.fillRect(new Rect(x,yp,5,1.2));
  dot(c,0,yp,11,C(mix(BG,"#000000",.35)));dot(c,W,yp,11,C(mix(BG,"#000000",.35)));
  let y=yp+14,lastDay=null;const list=rest.slice(0,LIVE?3:4);
  // en direct : la semaine (avec les fériés) reste visible ici
  if(LIVE){week(c,24,y,W-48);y+=46;}
  if(!list.length)txt(c,"Rien d'autre de prévu pour l'instant",20,y+10,W-40,18,fSmall(12),C("#ffffff",.6));
  for(const x of list){const dn=dayN(x.s),d=new Date(x.s);
    if(dn!==lastDay){txt(c,String(d.getDate()),14,y+1,36,22,fTitle(20),C("#ffffff"),"c");
      txt(c,d.toLocaleDateString("fr-FR",{month:"short"}).replace(".","").toUpperCase(),14,y+22,36,10,fKick(7.5),C("#ffffff",.55),"c");lastDay=dn;}
    else poly(c,[new Point(32,y-6),new Point(32,y+28)],C("#ffffff",.15),1);
    dot(c,72,y+14,14,C(x.c,.9));if(!icon(c,x.m,72,y+14,17,C("#ffffff"),1.5))dot(c,72,y+14,3,C("#ffffff"));
    txt(c,clip(x.t,23),94,y+3,W-184,18,fText(14),C("#ffffff"));
    const f=FER[keyOf(d)];
    txt(c,clip([dn>1&&dn<7?short(x.s):dn>=7?"":day(x.s),f?"férié":"",x.l].filter(Boolean).join(" · "),36),94,y+20,W-180,14,fSmall(10.5),C("#ffffff",.6));
    txt(c,x.a?"Journée":hm(x.s),W-84,y+6,68,18,x.a?fKick(11):fNum(15),C(ACC),"r");
    if(x.w)who(c,W-84-6,y+14,7,x.w);
    y+=38;}
  // pied : vos prénoms + envies et souvenirs
  const names=D.names?D.names.join(" & "):"";
  logo(c,26,H-18,5,1.3,.8);txt(c,names,40,H-26,170,14,fSmall(10.5),C("#ffffff",.65));
  if(data&&(D.wishes||D.fb))txt(c,[D.wishes?"★ "+D.wishes+" envie"+(D.wishes>1?"s":""):"",D.fb?"♥ "+D.fb+" souvenir"+(D.fb>1?"s":""):""].filter(Boolean).join("   "),W-200,H-26,184,14,fKick(10.5),C(ACC),"r");
  return c.getImage();}

// ---------- courses : la liste partagée, rayon par rayon ----------
function shopLabel(){const r=SHOP&&SHOP.run;if(r)return r.me?"Tu fais les courses":(r.by||"Ta moitié")+" fait les courses";return SHOPN>1?"articles à prendre":"article à prendre";}
function aisleBar(c,x,y,w,h){const A=SHOPA.map(g=>({c:g.c||SHOPC,n:+g.k||g.i.length})).filter(g=>g.n>0),tot=A.reduce((s,g)=>s+g.n,0);if(!tot)return;
  const gap=2,usable=w-gap*(A.length-1);let cx=x;
  A.forEach((g,i)=>{const ww=i===A.length-1?x+w-cx:Math.max(h,usable*g.n/tot);if(ww>0)pill(c,cx,y,ww,h,C(g.c));cx+=ww+gap;});}
function shopDone(c,W,H){const r=Math.min(W,H)*0.15,cx=W/2,cy=H*0.36;ring(c,cx,cy,r,C(ACC),Math.max(2.2,r/6.5));tick(c,cx,cy,r,C("#ffffff"),Math.max(2.4,r/5.5));
  txt(c,"Liste vide",10,H*0.56,W-20,26,fTitle(W>200?20:16),C("#ffffff"),"c");
  txt(c,"Rien à acheter pour l'instant",16,H*0.56+25,W-32,34,fSmall(W>200?11.5:10.5),C(ACC),"c");}
function shopPre(c,W,H){if(!SHOP){note(c,W,H,data?"Mets Together à jour":"Ouvre Together","pour afficher la liste de courses");return true;}
  if(!SHOPN){shopDone(c,W,H);return true;}return false;}
const itemTxt=it=>it.q?it.t+" · "+it.q:it.t;
function drawShopSmall(){const W=170,H=170,c=canvas(W,H);backdrop(c,W,H);if(shopPre(c,W,H))return c.getImage();
  watermarkM(c,W*0.82,H*0.8,110,"panier");
  txt(c,"COURSES",14,13,80,13,fKick(9.5),C(ACC));
  if(SHOP.run){pill(c,W-76,10,64,17,C(ACC));txt(c,"EN COURS",W-76,13,64,12,fKick(8.5),C(BG),"c");}
  txt(c,String(SHOPN),12,24,W-24,46,fNum(40),C("#ffffff"));
  txt(c,clip(shopLabel(),26),14,68,W-28,14,fSmall(10.5),C("#ffffff",.75));
  aisleBar(c,14,86,W-28,5);
  const L=shopList();let y=96;
  for(const it of L.slice(0,3)){dot(c,19,y+7.5,3.2,C(it.c));txt(c,clip(itemTxt(it),18),28,y,W-40,16,fText(12.5),C("#ffffff"));y+=17;}
  const more=SHOPN-Math.min(3,L.length);if(more>0)txt(c,"+ "+plural(more,"autre"),28,y+1,W-40,14,fKick(10),C(ACC));
  return c.getImage();}
function drawShopMedium(){const W=364,H=170,c=canvas(W,H);backdrop(c,W,H);if(shopPre(c,W,H))return c.getImage();
  watermarkM(c,74,H*0.84,140,"panier");logo(c,W-22,20,5.5,1.4,.8);
  // à gauche : le nombre, et la part de chaque rayon
  txt(c,"COURSES",16,15,120,13,fKick(10),C(ACC));
  txt(c,String(SHOPN),14,26,124,58,fNum(52),C("#ffffff"));
  txt(c,clip(shopLabel(),36),16,86,122,30,fSmall(11),C("#ffffff",.78));
  aisleBar(c,16,120,118,6);
  const A=SHOPA.slice(0,2).map(g=>String(g.n||"").split(/[ ,]/)[0]+" "+(+g.k||g.i.length)).join(" · ");
  txt(c,clip(A,26),16,131,124,14,fSmall(9.5),C("#ffffff",.6));
  if(SHOP.run){pill(c,16,H-27,84,18,C(ACC));txt(c,"EN COURS",16,H-24,84,13,fKick(9),C(BG),"c");}
  // à droite : les articles dans l'ordre du magasin, sur deux colonnes
  const L=shopList(),rows=6,x0=150,cw=(W-x0-30)/2,max=rows*2;
  const show=L.slice(0,SHOPN>max?max-1:max);
  show.forEach((it,i)=>{const x=x0+Math.floor(i/rows)*cw,y=16+(i%rows)*23;
    dot(c,x+4,y+8,3.4,C(it.c));txt(c,clip(itemTxt(it),15),x+13,y,cw-16,16,fText(12),C("#ffffff"));});
  if(SHOPN>show.length){const i=show.length;txt(c,"+ "+plural(SHOPN-show.length,"autre"),x0+Math.floor(i/rows)*cw+13,16+(i%rows)*23,cw-16,16,fKick(11),C(ACC));}
  return c.getImage();}
function drawShopLarge(){const W=364,H=382,c=canvas(W,H);backdrop(c,W,H);if(shopPre(c,W,H))return c.getImage();
  watermarkM(c,W-64,H-74,180,"panier");logo(c,W-22,20,5.5,1.4,.8);
  txt(c,"COURSES",18,16,200,13,fKick(10),C(ACC));
  txt(c,String(SHOPN),16,28,140,54,fNum(48),C("#ffffff"));
  txt(c,clip(shopLabel(),40),18,82,W-36,16,fText(12.5),C("#ffffff",.85));
  if(SHOP.run){pill(c,W-108,40,86,18,C(ACC));txt(c,"EN COURS",W-108,43,86,13,fKick(9),C(BG),"c");}
  aisleBar(c,18,104,W-36,6);
  let y=120,shown=0;const bottom=H-30,cw=(W-36)/2;
  for(const g of SHOPA){if(!g.i.length)continue;if(y+36>bottom)break;
    txt(c,String(g.n||"").toUpperCase()+"  "+(+g.k||g.i.length),18,y,W-36,12,fKick(9),C(mix(g.c||SHOPC,"#ffffff",.35)));y+=15;
    for(let i=0;i<g.i.length;i+=2){if(y+18>bottom)break;
      for(let j=0;j<2&&i+j<g.i.length;j++){const it=g.i[i+j],x=18+j*cw;dot(c,x+4,y+8,3.2,C(g.c||SHOPC));txt(c,clip(itemTxt(it),22),x+13,y,cw-16,16,fText(12.5),C("#ffffff"));shown++;}
      y+=20;}
    y+=6;}
  const more=SHOPN-shown;
  txt(c,more>0?"+ "+plural(more,"autre")+" dans la liste · touche pour tout voir":"Touche pour voir la liste",18,H-24,W-36,14,fKick(10),C(ACC));
  return c.getImage();}

// ---------- compte à rebours ----------
const cdN=x=>Math.max(0,dayN(x.s));
const jShort=x=>{const n=cdN(x);return n===0?"AUJ.":n===1?"DEMAIN":"J-"+n;};
const jTxt=x=>{const n=cdN(x);return n===0?"Aujourd'hui":n===1?"Demain":"J-"+n;};
// la progression : depuis l'annonce (ou un mois avant) jusqu'au jour J
function cdP(x){const f=+x.f>0&&+x.f<x.s-864e5?+x.f:x.s-30*864e5;return Math.max(0.03,Math.min(1,(now-f)/(x.s-f)));}
function cdKick(x){return x.k==="lw"?(x.p?"PONT":"LONG WEEK-END"):x.k==="vac"?"VACANCES SCOLAIRES":"COMPTE À REBOURS";}
function cdMeta(x){let t=cap(new Date(x.s).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"}));
  if((x.k==="lw"||x.k==="vac")&&x.n)t+=" · "+x.n+" jours";else if(!x.a)t+=" · "+hm(x.s);return t+(x.l?"  ·  "+x.l:"");}
function cdNone(c,W,H){note(c,W,H,"Rien en vue",W>200?"Dans Together, touche un évènement puis « Compte à rebours »":"Touche un évènement, puis « Compte à rebours »");}
function cdDial(c,x,y,r,lw,X){ring(c,x,y,r,C("#ffffff",.13),lw);const a0=-Math.PI/2;glowArc(c,x,y,r,a0,a0+cdP(X)*2*Math.PI,lw,true);ticks(c,x,y,r,lw,12,3);
  const n=cdN(X);
  if(n<=1)txt(c,n===0?"Jour J":"Demain",x-r,y-r*.24,r*2,r*.6,fTitle(r*.34),C("#ffffff"),"c");
  else{txt(c,String(n),x-r,y-r*.6,r*2,r*.95,fNum(n>99?r*.54:r*.7),C("#ffffff"),"c");txt(c,n>1?"JOURS":"JOUR",x-r,y+r*.28,r*2,r*.3,fKick(r*.18),C(ACC),"c");}}
function drawCdSmall(){const W=170,H=170,c=canvas(W,H);backdrop(c,W,H);if(!CDX){cdNone(c,W,H);return c.getImage();}
  watermarkM(c,W*0.8,H*0.76,118,CDX.m);logo(c,W-22,22,5.5,1.4,.8);
  txt(c,cdKick(CDX),14,14,W-50,13,fKick(9),C(ACC));
  const n=cdN(CDX);txt(c,n===0?"Jour J":n===1?"Demain":"J-"+n,12,26,W-24,52,n<=1?fTitle(30):fNum(46),C("#ffffff"));
  // le trait qui se remplit jusqu'au jour J
  pill(c,14,84,W-28,5,C("#ffffff",.16));pill(c,14,84,Math.max(5,(W-28)*cdP(CDX)),5,C(ACC));
  txt(c,clip(CDX.t,36),14,96,W-28,38,fTitle(15),C("#ffffff",.96));
  txt(c,clip(dLong(CDX.s)+(CDX.l?" · "+CDX.l:""),28),14,H-24,W-28,14,fSmall(10.5),C("#ffffff",.72));
  return c.getImage();}
function cdHero(c,W,H){watermarkM(c,W-70,H*0.62,170,CDX.m);cdDial(c,76,H/2-2,54,7,CDX);logo(c,W-22,20,5.5,1.4,.8);
  const x0=150,w0=W-x0-16;
  txt(c,cdKick(CDX),x0,15,w0-24,13,fKick(10),C(ACC));
  const t=clip(CDX.t,40),big=t.length<=16;txt(c,t,x0,31,w0,56,fTitle(big?24:19),C("#ffffff"));
  txt(c,clip(cdMeta(CDX),36),x0,89,w0,16,fText(12),C("#ffffff",.85));
  return {x0,w0};}
function drawCdMedium(){const W=364,H=170,c=canvas(W,H);backdrop(c,W,H);if(!CDX){cdNone(c,W,H);return c.getImage();}
  const {x0,w0}=cdHero(c,W,H);
  // ensuite : les deux comptes suivants
  let y=H-46;for(const x of CDR.slice(0,2)){txt(c,jShort(x),x0,y+1,52,15,fKick(10.5),C(ACC));txt(c,clip(x.t,28),x0+54,y,w0-54,16,fText(11.5),C("#ffffff",.82));y+=19;}
  return c.getImage();}
function drawCdLarge(){const W=364,H=382,c=canvas(W,H);backdrop(c,W,H);if(!CDX){cdNone(c,W,H);return c.getImage();}
  const HH=170;cdHero(c,W,HH);
  const yp=HH+10;for(let x=26;x<W-26;x+=9)c.setFillColor(C("#ffffff",.22)),c.fillRect(new Rect(x,yp,5,1.2));
  dot(c,0,yp,11,C(mix(BG,"#000000",.35)));dot(c,W,yp,11,C(mix(BG,"#000000",.35)));
  let y=yp+16;const list=CDR.slice(0,4);
  if(!list.length)txt(c,"Pas d'autre grand moment en vue. Dans Together, touche un évènement puis « Compte à rebours ».",20,y+6,W-40,40,fSmall(12),C("#ffffff",.6));
  for(const x of list){const d=new Date(x.s);
    txt(c,String(d.getDate()),14,y+1,36,22,fTitle(20),C("#ffffff"),"c");
    txt(c,d.toLocaleDateString("fr-FR",{month:"short"}).replace(".","").toUpperCase(),14,y+22,36,10,fKick(7.5),C("#ffffff",.55),"c");
    dot(c,72,y+14,14,C(x.c||TH.p,.9));if(!icon(c,x.m,72,y+14,17,C("#ffffff"),1.5))dot(c,72,y+14,3,C("#ffffff"));
    txt(c,clip(x.t,24),94,y+1,W-184,18,fText(14),C("#ffffff"));
    pill(c,94,y+23,W-200,4,C("#ffffff",.14));pill(c,94,y+23,Math.max(4,(W-200)*cdP(x)),4,C(ACC,.85));
    txt(c,jShort(x),W-90,y+5,74,18,fNum(15),C(ACC),"r");
    y+=42;}
  const names=D.names?D.names.join(" & "):"";
  logo(c,26,H-18,5,1.3,.8);txt(c,names,40,H-26,200,14,fSmall(10.5),C("#ffffff",.65));
  return c.getImage();}

// ---------- souvenir : la photo du jour ----------
async function svImage(){
  if(!SV||!SV.k)return null;
  const f=fm.joinPath(dir,"together-sv-"+SV.k+".jpg");
  if(fm.fileExists(f)){try{const im=fm.readImage(f);if(im)return im;}catch(e){}}
  try{const rq=new Request(API.replace("/api/w?","/api/wimg?")+"&k="+encodeURIComponent(SV.k));rq.timeoutInterval=config.runsInWidget?12:4;
    const dt=await rq.load(),im=Image.fromData(dt);
    if(im&&im.size&&im.size.width>0){try{fm.write(f,dt);for(const n of fm.listContents(dir))if(/^together-sv-/.test(n)&&n!=="together-sv-"+SV.k+".jpg")fm.remove(fm.joinPath(dir,n));}catch(e){}return im;}}catch(e){}
  return null;}
const SVIMG=MODE==="sv"&&SV&&SV.k&&!/^accessory/.test(fam)?await svImage():null;
// « Il y a un an » seulement le jour même (l'app a pu choisir le souvenir la veille)
function svYears(){const y=+SV.y||0;return y&&SV.d&&SV.d.slice(5)===keyOf(new Date()).slice(5)?y:0;}
function svKick(){const y=svYears();return y===1?"IL Y A UN AN":y>1?"IL Y A "+y+" ANS":SV.f?"COUP DE CŒUR":"SOUVENIR";}
function svDate(){if(!SV.d)return "";return cap(new Date(SV.d+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}));}
const svHearts=()=>+SV.love>0?"♥ "+String(SV.love).replace(".",","):"";
function svNone(c,W,H){note(c,W,H,data?"Vos souvenirs":"Ouvre Together",data?"Notez vos sorties et ajoutez vos photos : elles reviendront ici":"pour afficher vos souvenirs");}
function heartBadge(c,x,y){const h=svHearts();if(!h)return;const w=10+h.length*7;pill(c,x-w,y,w,20,C("#000000",.42));txt(c,h,x-w,y+3,w,15,fKick(11),C("#ffffff"),"c");}
function photoBack(c,W,H,fy){c.setFillColor(C("#000000"));c.fillRect(new Rect(0,0,W,H));const s=SVIMG.size,k=Math.max(W/s.width,H/s.height);
  c.drawImageInRect(SVIMG,new Rect((W-s.width*k)/2,(H-s.height*k)*fy,s.width*k,s.height*k));}
function drawSvSmall(){const W=170,H=170,c=canvas(W,H);
  if(!SV){backdrop(c,W,H);svNone(c,W,H);return c.getImage();}
  if(SVIMG){photoBack(c,W,H,.35);shade(c,0,H*.34,W,H*.66,"#000000",0,.84);shade(c,0,0,W,40,"#000000",.32,0);}
  else{backdrop(c,W,H);watermarkM(c,W*.74,H*.36,120,SV.m);}
  heartBadge(c,W-10,10);
  txt(c,svKick(),14,H-72,W-28,13,fKick(9.5),C(ACC));
  txt(c,clip(SV.t,34),14,H-58,W-28,38,fTitle(15),C("#ffffff"));
  txt(c,svDate(),14,H-21,W-28,14,fSmall(10),C("#ffffff",.8));
  return c.getImage();}
function drawSvMedium(){const W=364,H=170,c=canvas(W,H);backdrop(c,W,H);if(!SV){svNone(c,W,H);return c.getImage();}
  // le tirage photo à droite, avec son ombre et un bout de ruban adhésif
  const fw=138,fh=154,fx=W-fw-18,fy=9;
  for(let i=7;i>=1;i--)rrect(c,fx-i+1,fy-i+5,fw+i*2-2,fh+i*2-2,6+i,C("#000000",.045));
  rrect(c,fx,fy,fw,fh,5,C("#FBF8F2"));
  const px=fx+8,py=fy+8,pw=fw-16,ph=fh-38;
  if(SVIMG)c.drawImageInRect(coverImg(SVIMG,pw,ph,.35),new Rect(px,py,pw,ph));
  else{c.setFillColor(C(SV.c||EVC));c.fillRect(new Rect(px,py,pw,ph));if(!icon(c,SV.m,px+pw/2,py+ph/2,ph*.56,C("#ffffff",.92),2.2))logo(c,px+pw/2,py+ph/2,ph*.16,2.4,1,"#ffffff","#ffffff");}
  txt(c,clip(svDate(),22),fx+6,fy+fh-27,fw-12,18,fHand(12),C("#3A3346"),"c");
  c.setFillColor(C("#ffffff",.55));c.fillRect(new Rect(fx+fw/2-24,fy-7,48,14));
  // à gauche : de quoi il s'agit, et ce que vous en avez dit
  const x0=18,w0=fx-x0-16;
  txt(c,svKick(),x0,18,w0,13,fKick(10),C(ACC));
  txt(c,clip(SV.t,46),x0,34,w0,58,fTitle(SV.t.length<18?23:19),C("#ffffff"));
  if(SV.q)txt(c,"« "+clip(SV.q,70)+" »",x0,94,w0,46,fQuote(12),C("#ffffff",.88));
  txt(c,[svHearts(),SV.q&&SV.qn?SV.qn:"",!SV.q&&+SV.n?plural(+SV.n,"photo"):""].filter(Boolean).join("  ·  "),x0,H-25,w0,14,fKick(10.5),C(ACC));
  return c.getImage();}
function drawSvLarge(){const W=364,H=382,c=canvas(W,H);
  if(!SV){backdrop(c,W,H);svNone(c,W,H);return c.getImage();}
  if(SVIMG){photoBack(c,W,H,.3);shade(c,0,H*.4,W,H*.6,"#000000",0,.86);shade(c,0,0,W,56,"#000000",.34,0);}
  else{backdrop(c,W,H);watermarkM(c,W*.66,H*.36,230,SV.m);}
  heartBadge(c,W-14,14);logo(c,24,26,5.5,1.4,.9);
  let y=H-(SV.q?150:108);
  txt(c,svKick(),20,y,W-40,13,fKick(10.5),C(ACC));y+=16;
  txt(c,clip(SV.t,50),20,y,W-40,62,fTitle(SV.t.length<22?26:21),C("#ffffff"));y+=SV.t.length<22&&SV.t.length>0?36:58;
  if(SV.q){txt(c,"« "+clip(SV.q,110)+" »"+(SV.qn?"  "+SV.qn:""),20,y,W-40,48,fQuote(13),C("#ffffff",.9));}
  txt(c,[svDate(),+SV.n?plural(+SV.n,"photo"):""].filter(Boolean).join("  ·  "),20,H-26,W-40,14,fSmall(11),C("#ffffff",.8));
  return c.getImage();}

// ---------- « On fait quoi ? » : un moment libre à deux, et l'envie qui va avec ----------
const ang=t=>{const [h,m]=String(t||"0:0").split(":").map(Number);return -Math.PI/2+(((h||0)+(m||0)/60)/24)*2*Math.PI;};
function ideaPre(c,W,H){if(!IDEA){note(c,W,H,data?"Mets Together à jour":"Ouvre Together","pour trouver votre prochain moment libre");return true;}
  if(!IDEA.sl){note(c,W,H,"Pas de moment libre","cette semaine pour vous deux");return true;}return false;}
const ideaQ=()=>clip(IDEA.t,44)+" ?";
// un mot pour le petit rond de l'écran verrouillé : « samedi », « demain », « ce soir »
const slotWord=sl=>{const l=String(sl||"").toLowerCase(),w0=l.split(" ")[0];return /^(ce|cet)$/.test(w0)?(l==="ce soir"?"ce soir":"aujourd'hui"):clip(w0,10);};
// le cadran de 24 h : le moment libre en couleur, l'icône de l'idée au milieu
function ideaDial(c,x,y,r,lw){ring(c,x,y,r,C("#ffffff",.13),lw);glowArc(c,x,y,r,ang(IDEA.f),ang(IDEA.to),lw,false);ticks(c,x,y,r,lw,24,6);
  if(IDEA.t&&IDEA.k&&icon(c,IDEA.k,x,y,r*.66,C("#ffffff"),Math.max(1.4,r/22))){dot(c,x+r*.72,y+r*.72,r*.24,C(BG));dice(c,x+r*.72,y+r*.72,r*.26,C(ACC));}
  else dice(c,x,y,r*.6,C("#ffffff"));}
function drawIdeaSmall(){const W=170,H=170,c=canvas(W,H);backdrop(c,W,H);if(ideaPre(c,W,H))return c.getImage();
  if(IDEA.t)watermarkM(c,W*.8,H*.78,118,IDEA.k);
  dice(c,W-24,22,16,C("#ffffff",.85));
  txt(c,"ON FAIT QUOI ?",14,14,W-50,13,fKick(9.5),C(ACC));
  txt(c,clip(IDEA.sl+" libre",26),14,32,W-28,16,fText(12.5),C("#ffffff",.92));
  txt(c,IDEA.f+" – "+IDEA.to,14,48,W-28,14,fSmall(10.5),C("#ffffff",.6));
  if(IDEA.t){txt(c,ideaQ(),14,70,W-28,68,fTitle(IDEA.t.length<14?21:17),C("#ffffff"));
    if(IDEA.why&&IDEA.why[0])txt(c,clip(cap(IDEA.why[0]),44),14,H-31,W-28,28,fSmall(10),C(ACC));}
  else{txt(c,"Et si on sortait ?",14,74,W-28,30,fTitle(18),C("#ffffff"));txt(c,"Ajoutez des envies dans Together",14,104,W-28,32,fSmall(10.5),C(ACC));}
  return c.getImage();}
function ideaHero(c,W,H){if(IDEA.t)watermarkM(c,W-70,H*0.62,170,IDEA.k);ideaDial(c,76,H/2-2,52,7);logo(c,W-22,20,5.5,1.4,.8);
  const x0=150,w0=W-x0-16;
  txt(c,"ON FAIT QUOI ?",x0,15,w0-24,13,fKick(10),C(ACC));
  txt(c,clip(IDEA.sl+" libre · "+IDEA.f+"–"+IDEA.to,40),x0,31,w0,16,fText(12),C("#ffffff",.85));
  if(IDEA.t){txt(c,ideaQ(),x0,49,w0,54,fTitle(IDEA.t.length<15?22:18),C("#ffffff"));
    if(IDEA.why&&IDEA.why.length)txt(c,clip(cap(IDEA.why.join(" · ")),60),x0,104,w0,28,fSmall(10.5),C(ACC));}
  else{txt(c,"Et si on sortait ?",x0,52,w0,30,fTitle(21),C("#ffffff"));txt(c,"Ajoutez des envies dans Together : elles viendront ici",x0,82,w0,30,fSmall(11),C(ACC));}
  return {x0,w0};}
function drawIdeaMedium(){const W=364,H=170,c=canvas(W,H);backdrop(c,W,H);if(ideaPre(c,W,H))return c.getImage();
  const {x0,w0}=ideaHero(c,W,H);
  const alt=(IDEA.alt||[]).map(x=>x.t).filter(Boolean);
  if(alt.length)txt(c,clip("Sinon : "+alt.join(" · "),48),x0,H-24,w0,14,fSmall(10.5),C("#ffffff",.62));
  return c.getImage();}
function drawIdeaLarge(){const W=364,H=382,c=canvas(W,H);backdrop(c,W,H);if(ideaPre(c,W,H))return c.getImage();
  const HH=170;ideaHero(c,W,HH);
  const yp=HH+10;for(let x=26;x<W-26;x+=9)c.setFillColor(C("#ffffff",.22)),c.fillRect(new Rect(x,yp,5,1.2));
  dot(c,0,yp,11,C(mix(BG,"#000000",.35)));dot(c,W,yp,11,C(mix(BG,"#000000",.35)));
  let y=yp+14;
  const alt=(IDEA.alt||[]).filter(x=>x&&x.t);
  if(alt.length){txt(c,"SINON, LE MÊME JOUR",20,y,W-40,12,fKick(9),C(ACC));y+=16;
    for(const x of alt){dot(c,30,y+9,9,C(x.c||TH.p,.9));if(!icon(c,x.k,30,y+9,11,C("#ffffff"),1.3))dot(c,30,y+9,2.5,C("#ffffff"));txt(c,clip(x.t,36),46,y+1,W-66,18,fText(13.5),C("#ffffff"));y+=24;}
    y+=6;}
  const more=(IDEA.more||[]).filter(x=>x&&x.sl);
  if(more.length&&y<H-60){txt(c,"VOS AUTRES MOMENTS LIBRES",20,y,W-40,12,fKick(9),C(ACC));y+=16;
    for(const x of more){if(y>H-56)break;txt(c,clip(x.sl,21),20,y+2,132,16,fText(11.5),C("#ffffff",.8));
      txt(c,clip(x.t?x.t+" ?":"à imaginer",24),158,y,W-178,18,x.t?fTitle(14):fSmall(12),C("#ffffff",x.t?1:.6));y+=23;}}
  if(!alt.length&&!more.length)txt(c,"Ajoutez vos envies dans Together (Nos envies) : un resto, une balade, une expo… Le widget choisit la meilleure pour chaque moment libre, selon la météo, le budget et la distance.",20,y+4,W-40,90,fSmall(12),C("#ffffff",.7));
  logo(c,26,H-18,5,1.3,.8);txt(c,D.wishes?"★ "+plural(D.wishes,"envie")+" à exaucer":"Vos envies, dans Together",40,H-26,W-60,14,fSmall(10.5),C("#ffffff",.65));
  return c.getImage();}

// ---------- écran verrouillé ----------
function drawCircular(){const S=76,c=new DrawContext();c.size=new Size(S,S);c.opaque=false;c.respectScreenScale=true;
  const mid=(a,b,p)=>{ring(c,S/2,S/2,S/2-5,C("#ffffff",.25),5);if(p!=null&&p>0)arc(c,S/2,S/2,S/2-5,-Math.PI/2,-Math.PI/2+Math.min(1,p)*2*Math.PI,C("#ffffff"),5);
    txt(c,a,0,S/2-13,S,20,fNum(String(a).length>4?14:17),C("#ffffff"),"c");if(b)txt(c,b,0,S/2+6,S,12,fSmall(9),C("#ffffff",.8),"c");};
  if(MODE==="shop"){const A=SHOPA.map(g=>+g.k||g.i.length).filter(n=>n>0),tot=A.reduce((s,n)=>s+n,0);
    ring(c,S/2,S/2,S/2-5,C("#ffffff",.25),5);let a0=-Math.PI/2;for(const n of A){const sp=n/tot*2*Math.PI;arc(c,S/2,S/2,S/2-5,a0+(A.length>1?.12:0),a0+sp-(A.length>1?.12:0),C("#ffffff"),5);a0+=sp;}
    txt(c,String(SHOPN),0,S/2-13,S,20,fNum(17),C("#ffffff"),"c");txt(c,"courses",0,S/2+6,S,12,fSmall(9),C("#ffffff",.8),"c");}
  else if(MODE==="cd"){if(!CDX)logo(c,S/2,S/2,9,2,1,"#ffffff","#ffffff");else{const n=cdN(CDX);mid(n===0?"J":String(n),n===0?"jour J":n===1?"jour":"jours",cdP(CDX));}}
  else if(MODE==="sv"){const y=SV?svYears():0;mid("♥",SV?(y?(y===1?"1 an":y+" ans"):"souvenir"):"",null);}
  else if(MODE==="idea"){ring(c,S/2,S/2,S/2-5,C("#ffffff",.25),5);if(IDEA&&IDEA.sl)arc(c,S/2,S/2,S/2-5,ang(IDEA.f),ang(IDEA.to),C("#ffffff"),5);
    dice(c,S/2,S/2-6,18,C("#ffffff"));txt(c,IDEA&&IDEA.sl?slotWord(IDEA.sl):"",0,S/2+9,S,12,fSmall(9),C("#ffffff",.85),"c");}
  else if(LIVE)mid(LIVE.cb||LIVE.big,LIVE.c,1);
  else{ring(c,S/2,S/2,S/2-5,C("#ffffff",.25),5);
    if(next){arc(c,S/2,S/2,S/2-5,-Math.PI/2,-Math.PI/2+progress()*2*Math.PI,C("#ffffff"),5);
      txt(c,next.a?short(next.s):hm(target),0,S/2-12,S,18,fNum(15),C("#ffffff"),"c");
      txt(c,dep?"départ":next.a?"journée":"rdv",0,S/2+5,S,12,fSmall(9),C("#ffffff",.8),"c");}
    else logo(c,S/2,S/2,9,2,1,"#ffffff","#ffffff");}
  return c.getImage();}
// trois lignes : le petit titre, l'essentiel, le détail
function lines3(w,k,a,b){const t1=w.addText(k);t1.font=Font.boldSystemFont(10);t1.lineLimit=1;
  const t2=w.addText(a);t2.font=Font.boldSystemFont(15);t2.lineLimit=1;
  if(b){const t3=w.addText(b);t3.font=Font.systemFont(12);t3.lineLimit=1;}}
function rectWidget(w){
  if(MODE==="shop"){if(!SHOP)w.addText("Courses : ouvre Together");else if(!SHOPN)lines3(w,"COURSES","Liste vide","Rien à acheter");
    else lines3(w,"COURSES · "+SHOPN,clip(shopList().slice(0,4).map(x=>x.t).join(", "),60),SHOP.run?shopLabel():SHOPA.length+" rayon"+(SHOPA.length>1?"s":""));return;}
  if(MODE==="cd"){if(!CDX)w.addText("Compte à rebours : rien en vue");else lines3(w,jTxt(CDX).toUpperCase()+" · "+cdKick(CDX),CDX.t,dLong(CDX.s)+(CDX.l?" · "+CDX.l:""));return;}
  if(MODE==="sv"){if(!SV)w.addText("Together : vos souvenirs");else lines3(w,svKick(),SV.t,[svDate(),svHearts()].filter(Boolean).join(" · "));return;}
  if(MODE==="idea"){if(!IDEA||!IDEA.sl)w.addText("On fait quoi ? Rien de libre");else lines3(w,"ON FAIT QUOI ?",IDEA.t?IDEA.t+" ?":"Et si on sortait ?",IDEA.sl+" · "+IDEA.f+"–"+IDEA.to);return;}
  if(LIVE){lines3(w,LIVE.k,LIVE.a,LIVE.b);return;}
  if(!next){w.addText("Together : rien de prévu");return;}
  lines3(w,kicker(),next.t,next.a?"Toute la journée":hm(next.s)+(next.l?" · "+next.l:""));}
function inlineText(){
  if(MODE==="shop")return !SHOP?"Courses : ouvre Together":!SHOPN?"Courses : liste vide":plural(SHOPN,"course")+" : "+shopList().slice(0,3).map(x=>x.t.toLowerCase()).join(", ");
  if(MODE==="cd")return CDX?jTxt(CDX)+" · "+CDX.t:"Compte à rebours : rien en vue";
  if(MODE==="sv")return SV?cap(svKick().toLowerCase())+" : "+SV.t:"Together : vos souvenirs";
  if(MODE==="idea")return IDEA&&IDEA.sl?IDEA.sl+(IDEA.t?" : "+IDEA.t+" ?":" libre"):"On fait quoi ? Rien de libre";
  if(LIVE)return LIVE.a;
  return next?(dep?"Départ "+hm(next.d):next.a?short(next.s):hm(next.s))+" · "+next.t:"Together : rien de prévu";}

// ---------- lancé depuis l'app Scriptable (toucher le widget, ou ▶) : aperçu au style de Together ----------
function svgIcon(key,col,size,sw){const src=ICONS[key];if(!src)return "";let o="";
  for(const part of src.split(";")){const f=part[0]==="f",n=(f?part.slice(1):part).split(",").map(Number);
    if(f&&n.length===3){o+=`<circle cx="${n[0]/10}" cy="${n[1]/10}" r="${Math.max(.8,n[2]/10)}" fill="${col}"/>`;continue;}
    const pts=[];for(let i=0;i+1<n.length;i+=2)pts.push(n[i]/10+","+n[i+1]/10);
    o+=f?`<polygon points="${pts.join(" ")}" fill="${col}"/>`:`<polyline points="${pts.join(" ")}" fill="none" stroke="${col}" stroke-width="${sw||1.8}" stroke-linecap="round" stroke-linejoin="round"/>`;}
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${o}</svg>`;}
function rings(h,a,b){return `<svg viewBox="0 0 40 24" height="${h}" width="${h*40/24}" aria-hidden="true"><circle cx="14" cy="12" r="8.5" fill="none" stroke="${a}" stroke-width="3"/><circle cx="26" cy="12" r="8.5" fill="none" stroke="${b}" stroke-width="3"/><path d="M14 3.5a8.5 8.5 0 0 1 7.6 4.7" fill="none" stroke="${a}" stroke-width="3"/></svg>`;}
function diceSvg(s,col){return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="${col}" stroke-width="2" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><g fill="${col}" stroke="none"><circle cx="8.6" cy="8.6" r="1.3"/><circle cx="15.4" cy="15.4" r="1.3"/><circle cx="15.4" cy="8.6" r="1.3"/><circle cx="8.6" cy="15.4" r="1.3"/><circle cx="12" cy="12" r="1.3"/></g></svg>`;}
// un cadran SVG : la progression p (0 à 1), ou un arc de a0 à a1 (en radians, 0 = en haut)
function dialSvg(inner,p,a0,a1){const R=46,L=2*Math.PI*R;let arcH="";
  if(p!=null)arcH=`<circle cx="55" cy="55" r="${R}" fill="none" stroke="${ACC}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(p*L).toFixed(1)} ${L.toFixed(1)}" transform="rotate(-90 55 55)" class="arc"/>`;
  else if(a0!=null){const pt=a=>[55+R*Math.sin(a),55-R*Math.cos(a)].map(v=>v.toFixed(1)).join(" ");const big=a1-a0>Math.PI?1:0;
    arcH=`<path d="M${pt(a0)} A${R} ${R} 0 ${big} 1 ${pt(a1)}" fill="none" stroke="${ACC}" stroke-width="7" stroke-linecap="round" class="arc"/>`;}
  return `<div class="dial"><svg viewBox="0 0 110 110" width="110" height="110"><circle cx="55" cy="55" r="${R}" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="7"/>${arcH}</svg><div class="ic">${inner}</div></div>`;}
function weekHtml(){const L7=["D","L","M","M","J","V","S"];let wk="";const marks=[];
  for(let i=0;i<7;i++){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+i);const k=keyOf(d),evs=items.filter(e=>dayN(e.s)===i),f=FER[k],v=vacOn(k);
    if(f)marks.push(`<span class="mk-f">Férié · ${esc(d.toLocaleDateString("fr-FR",{weekday:"long"}))} ${d.getDate()===1?"1er":d.getDate()} : ${esc(f)}</span>`);
    if(v&&(i===0||v.a===k)){const e=new Date(new Date(v.b+"T12:00:00").getTime()-864e5),n=e.getDate();
      marks.push(`<span class="mk-v">${esc(v.n)}${v.a===k?" à partir d'aujourd'hui":""} · jusqu'au ${n===1?"1er":n} ${esc(e.toLocaleDateString("fr-FR",{month:"long"}))}</span>`);}
    wk+=`<div class="wd${i===0?" on":""}${f?" fer":""}${v?" vac":""}"><small>${L7[d.getDay()]}</small><b>${d.getDate()}</b><i>${evs.slice(0,3).map(e=>`<u style="background:${esc(e.c)}"></u>`).join("")}</i></div>`;}
  return `<div class="week">${wk}</div>${marks.length?`<div class="marks">${marks.join("")}</div>`:""}`;}
function liveHtml(){if(!LIVE)return "";return `<div class="live"><i></i><div><b>${esc(LIVE.a)}</b>${LIVE.b?`<small>${esc(LIVE.b)}</small>`:""}</div></div>`;}
function bodyAgenda(){
  const todayTxt=cap(new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"}));
  let heroH="";
  if(next){heroH=`<section class="hero" style="--c:${esc(EVC)}">
      <div class="wm">${svgIcon(next.m,"#ffffff",230,1.2)||rings(150,"#ffffff","#ffffff")}</div>
      ${dialSvg(svgIcon(next.m,"#ffffff",40,1.8)||rings(26,ACC,"#ffffff"),progress())}
      <div class="ht"><p class="kick">${esc(kicker())}</p><h3>${esc(next.t)}</h3>
        <p class="meta">${dep?`<span class="go">Départ ${hm(next.d)}</span>`:""}${esc(meta())}</p>${next.k?`<p class="mk">${esc(next.k)}</p>`:""}</div></section>`;}
  else heroH=`<section class="hero none"><div class="ic">${rings(54,ACC,"#ffffff")}</div><div class="ht"><h3>${data?"Rien de prévu":"Ouvre Together"}</h3><p class="meta">${data?"Et si on sortait ?":"une fois pour afficher vos évènements ici"}</p></div></section>`;
  const chips=data&&(D.wishes||D.fb)?`<div class="chips">${D.wishes?`<span>★ ${D.wishes} envie${D.wishes>1?"s":""} à exaucer</span>`:""}${D.fb?`<span>♥ ${D.fb} souvenir${D.fb>1?"s":""} à raconter</span>`:""}</div>`:"";
  let rows="",last="",n=0;
  for(const x of rest){const d=day(x.s);if(d!==last){rows+=`<h4>${esc(d)}${FER[keyOf(new Date(x.s))]?` · <span class="fer-t">férié</span>`:""}</h4>`;last=d;}
    rows+=`<article style="--c:${esc(x.c)};--d:${(n++)*60}ms"><div class="tm">${x.a?"<small>Journée</small>":`<b>${hm(x.s)}</b>`}${x.d&&x.d>now?`<small>dép. ${hm(x.d)}</small>`:""}</div>
      <div class="bub">${svgIcon(x.m,"#ffffff",22,2)||"<em></em>"}</div>
      <div class="tx"><b>${esc(x.t)}</b>${x.l||x.k?`<small>${esc([x.l,x.k].filter(Boolean).join(" · "))}</small>`:""}</div>${x.w?`<span class="who">${esc(x.w)}</span>`:""}</article>`;}
  if(data&&!rest.length&&next)rows=`<p class="empty">Rien d'autre de prévu pour l'instant.</p>`;
  return `<h1 class="today">${esc(todayTxt)}</h1>${liveHtml()}${heroH}${weekHtml()}${chips}${rest.length||next?`<h2>Ensuite</h2>`:""}${rows}`;}
function bodyShop(){
  if(!SHOP)return `<h1 class="today">Courses</h1><p class="empty">Ouvre Together une fois : la liste apparaîtra ici.</p>`;
  const tot=SHOPA.reduce((s,g)=>s+(+g.k||g.i.length),0)||1;
  let h=`<h1 class="today">Courses</h1><section class="hero shop" style="--c:${SHOPC}"><div class="wm">${svgIcon("panier","#ffffff",220,1.2)}</div><div class="ht">
    <p class="kick">LISTE PARTAGÉE</p><p class="bigc">${SHOPN}</p><p class="meta">${esc(SHOPN?shopLabel():"Rien à acheter pour l'instant")}</p>
    ${SHOPN?`<div class="bar">${SHOPA.map(g=>`<i style="flex:${(+g.k||g.i.length)/tot};background:${esc(g.c)}"></i>`).join("")}</div>`:""}</div></section>`;
  let shown=0,n=0;
  for(const g of SHOPA){if(!g.i.length)continue;h+=`<h4 style="color:${esc(g.c)}">${esc(g.n)} · ${+g.k||g.i.length}</h4>`;
    for(const it of g.i){shown++;h+=`<article style="--c:${esc(g.c)};--d:${(n++)*40}ms"><div class="ck"></div><div class="tx"><b>${esc(it.t)}</b>${it.q?`<small>${esc(it.q)}</small>`:""}</div></article>`;}}
  if(SHOPN>shown)h+=`<p class="empty">Et ${plural(SHOPN-shown,"autre")} dans la liste complète.</p>`;
  if(!SHOPN)h+=`<p class="empty">Tout est pris. Pour ajouter : « Dis Siri, ajoute du lait » ou dans Together.</p>`;
  return h;}
function bodyCd(){
  if(!CDX)return `<h1 class="today">Compte à rebours</h1><p class="empty">Rien en vue. Dans Together, touche un évènement, puis « Compte à rebours ».</p>`;
  const n=cdN(CDX);
  let h=`<h1 class="today">Compte à rebours</h1><section class="hero" style="--c:${esc(EVC)}"><div class="wm">${svgIcon(CDX.m,"#ffffff",230,1.2)||rings(150,"#ffffff","#ffffff")}</div>
    ${dialSvg(n<=1?`<b class="dn">${n===0?"Jour J":"Demain"}</b>`:`<b class="dn">${n}<small>jours</small></b>`,cdP(CDX))}
    <div class="ht"><p class="kick">${esc(cdKick(CDX))}</p><h3>${esc(CDX.t)}</h3><p class="meta">${esc(cdMeta(CDX))}</p></div></section>`;
  if(CDR.length){h+=`<h2>Ensuite</h2>`;let i=0;
    for(const x of CDR)h+=`<article style="--c:${esc(x.c||TH.p)};--d:${(i++)*60}ms"><div class="tm"><b>${esc(jShort(x))}</b></div><div class="bub">${svgIcon(x.m,"#ffffff",22,2)||"<em></em>"}</div>
      <div class="tx"><b>${esc(x.t)}</b><small>${esc(cdMeta(x))}</small><span class="pg"><i style="width:${Math.round(cdP(x)*100)}%"></i></span></div></article>`;}
  return h;}
function bodySv(b64){
  if(!SV)return `<h1 class="today">Souvenir</h1><p class="empty">Notez vos sorties et ajoutez vos photos dans Together : elles reviendront ici, chaque jour.</p>`;
  return `<h1 class="today">${esc(cap(svKick().toLowerCase()))}</h1><section class="photo" style="--c:${esc(EVC)}">${b64?`<img src="data:image/jpeg;base64,${b64}" alt="">`:`<div class="noimg">${svgIcon(SV.m,"#ffffff",120,1.4)||rings(80,"#ffffff","#ffffff")}</div>`}
    <div class="cap"><h3>${esc(SV.t)}</h3><p>${esc([svDate(),svHearts()].filter(Boolean).join(" · "))}</p></div></section>
    ${SV.q?`<blockquote>« ${esc(SV.q)} »${SV.qn?`<cite>${esc(SV.qn)}</cite>`:""}</blockquote>`:""}
    <p class="empty">${+SV.n?plural(+SV.n,"photo")+" dans ce souvenir. ":""}Le film et toutes les photos sont dans Together, onglet Souvenirs.</p>`;}
function bodyIdea(){
  if(!IDEA)return `<h1 class="today">On fait quoi ?</h1><p class="empty">Ouvre Together une fois : votre prochain moment libre apparaîtra ici.</p>`;
  if(!IDEA.sl)return `<h1 class="today">On fait quoi ?</h1><p class="empty">Pas de moment libre pour vous deux cette semaine.</p>`;
  let h=`<h1 class="today">On fait quoi ?</h1><section class="hero" style="--c:${esc(EVC)}"><div class="wm">${svgIcon(IDEA.k,"#ffffff",230,1.2)||diceSvg(150,"#ffffff")}</div>
    ${dialSvg(IDEA.t&&svgIcon(IDEA.k,"#ffffff",40,1.8)||diceSvg(36,"#ffffff"),null,ang(IDEA.f)+Math.PI/2,ang(IDEA.to)+Math.PI/2)}
    <div class="ht"><p class="kick">${esc((IDEA.sl+" libre").toUpperCase())}</p><h3>${esc(IDEA.t?IDEA.t+" ?":"Et si on sortait ?")}</h3><p class="meta">${esc(IDEA.f+" – "+IDEA.to)}</p></div></section>`;
  if(IDEA.why&&IDEA.why.length)h+=`<div class="chips">${IDEA.why.map(x=>`<span>${esc(cap(x))}</span>`).join("")}</div>`;
  if(!IDEA.t)h+=`<p class="empty">Ajoutez des envies dans Together : la meilleure pour ce moment-là viendra ici.</p>`;
  const alt=(IDEA.alt||[]).filter(x=>x&&x.t);let i=0;
  if(alt.length){h+=`<h2>Sinon</h2>`;for(const x of alt)h+=`<article style="--c:${esc(x.c||TH.p)};--d:${(i++)*60}ms"><div class="bub">${svgIcon(x.k,"#ffffff",22,2)||"<em></em>"}</div><div class="tx"><b>${esc(x.t)}</b></div></article>`;}
  const more=(IDEA.more||[]).filter(x=>x&&x.sl);
  if(more.length){h+=`<h2>Vos autres moments libres</h2>`;for(const x of more)h+=`<article style="--c:${esc(x.c||TH.p)};--d:${(i++)*60}ms"><div class="bub">${svgIcon(x.k,"#ffffff",22,2)||"<em></em>"}</div><div class="tx"><b>${esc(x.sl)}</b><small>${esc(x.t?x.t+" ?":"À imaginer ensemble")}</small></div></article>`;}
  return h+`<p class="empty">Pour le prévoir : Together, Nos envies, « On fait quoi ? ».</p>`;}
function previewHtml(b64){
  const T=Object.assign({b:"#EDEEF5",u:"#FFFFFF",i:"#16163A",m:"#606181",l:"#DCDDEA"},TH),dark=lum(T.b)<0.4;
  const names=D.names||[];
  const body=MODE==="shop"?bodyShop():MODE==="cd"?bodyCd():MODE==="sv"?bodySv(b64):MODE==="idea"?bodyIdea():bodyAgenda();
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Fraunces:ital,opsz,wght@0,9..144,500..800;1,9..144,500&display=swap" rel="stylesheet">
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
.dial{position:relative;flex:none;width:110px;height:110px}.dial .ic{position:absolute;inset:0;display:grid;place-items:center;text-align:center}
.dn{font:800 34px/1 var(--f);display:grid;justify-items:center}.dn small{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--s);margin-top:2px}
.arc{filter:drop-shadow(0 0 6px ${ACC});animation:draw 1.1s cubic-bezier(.2,.8,.2,1) both}
@keyframes draw{from{stroke-dasharray:0 999}}
.ht{position:relative;min-width:0}.kick{margin:0;color:var(--s);font-weight:800;font-size:12px;letter-spacing:.06em}
.hero h3{font:800 26px/1.08 var(--fd);margin:4px 0 8px;letter-spacing:-.01em}.meta{margin:0;font-weight:600;font-size:14px;opacity:.88;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.go{background:var(--s);color:#1a1000;border-radius:99px;padding:3px 10px;font-weight:800;font-size:12px}.mk{margin:8px 0 0;font-size:12px;opacity:.65}
.hero.none{justify-content:flex-start}.hero.none .ic{flex:none}
.hero.shop .ht{flex:1}.bigc{font:800 64px/1 var(--f);margin:4px 0}.bar{display:flex;gap:3px;height:8px;margin-top:14px}.bar i{border-radius:99px;min-width:8px}
.week{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin:14px 0 4px}
.wd{background:var(--su);border:1px solid var(--hair);border-radius:16px;padding:8px 0 7px;display:grid;justify-items:center;gap:1px;position:relative}
.wd small{font-size:10px;font-weight:700;color:var(--mu)}.wd b{font-size:17px;font-weight:800}.wd i{display:flex;gap:3px;height:6px}.wd u{width:6px;height:6px;border-radius:50%}
.wd.on{background:var(--p);border-color:transparent;color:#fff}.wd.on small{color:rgba(255,255,255,.8)}
.wd.fer b,.wd.fer small{color:#E5484D}.wd.on.fer b,.wd.on.fer small{color:#FFC2C2}
.wd.vac::after{content:"";position:absolute;left:8px;right:8px;bottom:-5px;height:3px;border-radius:9px;background:var(--s)}
.marks{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 0}.marks span{font-size:12px;font-weight:700;border-radius:99px;padding:5px 10px;background:var(--su);border:1px solid var(--hair)}
.marks .mk-f{color:#C7363B;border-color:#F3C6C7}.marks .mk-v{border-color:color-mix(in oklab,var(--s) 60%,transparent)}
.fer-t{color:#E5484D}
.live{display:flex;gap:12px;align-items:center;background:color-mix(in oklab,var(--s) 18%,var(--su));border:1px solid color-mix(in oklab,var(--s) 50%,transparent);border-radius:20px;padding:12px 14px;margin:0 0 12px}
.live i{flex:none;width:12px;height:12px;border-radius:50%;background:var(--s);animation:beat 1.6s ease-in-out infinite}.live div{display:grid}.live b{font-weight:800}.live small{color:var(--mu);font-weight:600}
@keyframes beat{50%{box-shadow:0 0 0 8px color-mix(in oklab,var(--s) 25%,transparent)}}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0}.chips span{background:color-mix(in oklab,var(--s) 18%,var(--su));border:1px solid color-mix(in oklab,var(--s) 45%,transparent);border-radius:99px;padding:7px 12px;font-weight:700;font-size:13px}
h2{font:800 20px var(--fd);margin:24px 2px 4px}h4{margin:16px 4px 8px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--mu)}
article{display:flex;align-items:center;gap:12px;background:var(--su);border:1px solid var(--hair);border-radius:20px;padding:12px 14px;margin-bottom:8px;position:relative;overflow:hidden;animation:up .45s var(--d) cubic-bezier(.2,.8,.2,1) both}
article::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--c)}
.tm{width:52px;flex:none;display:grid}.tm b{font-size:17px;font-weight:800;font-variant-numeric:tabular-nums}.tm small{font-size:11px;color:var(--mu);font-weight:600}
.bub{width:40px;height:40px;border-radius:14px;background:var(--c);display:grid;place-items:center;flex:none;box-shadow:0 8px 16px -10px var(--c)}.bub em{width:8px;height:8px;border-radius:50%;background:#fff}
.ck{width:10px;height:10px;border-radius:50%;background:var(--c);flex:none;margin:0 4px}
.tx{min-width:0;flex:1;display:grid}.tx b{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tx small{color:var(--mu);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pg{display:block;height:4px;border-radius:9px;background:var(--hair);margin-top:6px;overflow:hidden}.pg i{display:block;height:100%;border-radius:9px;background:var(--s)}
.who{width:24px;height:24px;border-radius:50%;background:var(--hair);display:grid;place-items:center;font-size:11px;font-weight:800;flex:none}
.photo{position:relative;border-radius:28px;overflow:hidden;background:var(--hero);box-shadow:0 26px 50px -26px color-mix(in oklab,var(--c) 70%,#000);animation:up .5s cubic-bezier(.2,.8,.2,1) both}
.photo img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover}.noimg{aspect-ratio:4/3;display:grid;place-items:center;background:radial-gradient(80% 90% at 0% 100%,var(--c),transparent 70%),var(--hero)}
.photo .cap{position:absolute;left:0;right:0;bottom:0;padding:60px 20px 18px;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.72))}
.photo h3{font:800 28px/1.08 var(--fd);margin:0 0 6px}.photo p{margin:0;font-weight:600;opacity:.88}
blockquote{margin:18px 4px 0;font:italic 500 19px/1.4 var(--fd)}blockquote cite{display:block;margin-top:6px;font:700 13px var(--f);color:var(--mu);font-style:normal}
.empty{color:var(--mu)}.tip{margin:26px 4px 0;font-size:13px;color:var(--mu);text-align:center}
@keyframes up{from{opacity:0;transform:translateY(10px)}}
</style>
<header><div class="brand">${rings(22,ACC,T.p)}Together</div><div class="duo">${names.slice(0,2).map(x=>`<span>${esc(String(x).slice(0,1).toUpperCase())}</span>`).join("")}</div></header>
${body}
<p class="tip">Pour ajouter ou modifier, ouvre l'icône Together sur ton écran d'accueil.</p></html>`;}
if(!config.runsInWidget&&config.runsInApp){
  let b64="";
  if(MODE==="sv"&&SV&&SV.k){try{const f=fm.joinPath(dir,"together-sv-"+SV.k+".jpg");if(!fm.fileExists(f))await svImage();if(fm.fileExists(f))b64=fm.read(f).toBase64String();}catch(e){}}
  const wv=new WebView();await wv.loadHTML(previewHtml(b64));await wv.present(true);
  // Après « Close » : retour direct à l'écran d'accueil, pas à la liste des scripts
  try{App.close();}catch(e){}
  Script.complete();return;
}

// ---------- version voiture (CarPlay avec iOS 26) : paramètre « voiture » dans les réglages du widget ----------
// Texte natif plutôt qu'une image : très lisible, et le temps restant se met à jour tout seul, sans attendre l'iPhone.
function carWidget(w){
  const g=new LinearGradient();g.colors=[C(BG),C(mix(BG,"#000000",.45))];g.locations=[0,1];w.backgroundGradient=g;
  w.setPadding(11,13,11,13);
  const T=Date.now(),WAZE=/waze/.test(PARAM);
  const nav=a=>WAZE?"https://waze.com/ul?q="+encodeURIComponent(a)+"&navigate=yes":"https://maps.apple.com/?daddr="+encodeURIComponent(a)+"&dirflg=d";
  const put=(st,s,font,col,n)=>{const t=st.addText(String(s||""));t.font=font;t.textColor=col;t.lineLimit=n||1;t.minimumScaleFactor=.6;return t;};
  const head=(k,ic)=>{const h=w.addStack();h.layoutHorizontally();h.centerAlignContent();h.spacing=5;
    try{const s=SFSymbol.named(ic);s.applyFont(Font.boldSystemFont(12));const i=h.addImage(s.image);i.imageSize=new Size(14,14);i.tintColor=C(ACC);}catch(e){}
    put(h,k,Font.heavySystemFont(11),C(ACC));};
  // quelqu'un arrive, ou a prévenu d'un retard : une ligne en haut
  const liveLine=()=>{if(LIVE&&!(D.live&&D.live.me)){put(w,LIVE.a,Font.semiboldSystemFont(11.5),C(ACC));w.addSpacer(3);}};
  // les évènements à heure fixe pas encore commencés (une journée entière ne guide nulle part)
  const up=items.filter(x=>!x.a&&x.s>T-5*6e4);
  if(!up.length){head("TOGETHER","heart.fill");w.addSpacer(6);liveLine();
    put(w,data?"Rien de prévu":"Ouvre Together",Font.boldSystemFont(17),C("#ffffff"),2);
    if(items[0]){w.addSpacer(4);put(w,items[0].t,Font.mediumSystemFont(12),C("#ffffff",.7));}
    w.addSpacer();w.refreshAfterDate=refreshAt();return;}
  // l'étape du moment : partir, passer chez l'autre, arriver
  const x=up[0],pkAt=x.pk&&x.d?x.d+(+x.pm||0)*6e4:0;let st;
  if(x.d&&T<x.d)st={k:x.pk?"PARTIR · "+String(x.pw||"").toUpperCase():"PARTIR",ic:"car.fill",at:x.d,a:x.t,b:x.pk?"Chez "+x.pw+" à "+hm(pkAt):x.l,dest:x.pk||x.to};
  else if(pkAt&&T<pkAt+5*6e4)st={k:"CHEZ "+String(x.pw||"").toUpperCase(),ic:"figure.wave",at:pkAt,a:x.pkl||x.pw,b:"Puis "+x.t+" à "+hm(x.s),dest:x.pk};
  else st={k:"ARRIVÉE",ic:"flag.checkered",at:x.s,a:x.t,b:x.l,dest:x.to};
  head(st.k,st.ic);
  put(w,hm(st.at),fNum(38),C("#ffffff"));
  // le temps restant se met à jour tout seul sur l'écran, sans attendre l'iPhone
  const r=w.addDate(new Date(st.at));r.applyRelativeStyle();r.font=Font.semiboldSystemFont(14);r.textColor=C("#ffffff",.85);r.lineLimit=1;
  w.addSpacer();
  liveLine();
  put(w,st.a,Font.boldSystemFont(14),C("#ffffff"));
  if(st.b)put(w,st.b,Font.mediumSystemFont(11.5),C("#ffffff",.72));
  const nx=up[1];
  if(nx&&dayN(nx.s)<=1){w.addSpacer(3);put(w,"Ensuite · "+(dayN(nx.s)===1?"demain ":"")+hm(nx.s)+" "+nx.t,Font.semiboldSystemFont(10.5),C(ACC,.9));}
  // un toucher sur l'écran de la voiture : l'itinéraire de l'étape (Plans, ou Waze avec le paramètre « voiture waze »)
  if(st.dest)w.url=nav(st.dest);
  const marks=[x.d,pkAt?pkAt+5*6e4:0,x.s].filter(v=>v&&v>T);
  w.refreshAfterDate=new Date(Math.min(refreshAt().getTime(),(marks[0]||T+15*6e4)+3e4));
}

// ---------- quand se remettre à jour ----------
// Plus souvent autour d'un départ, pendant un trajet ou un retard ; à minuit pour le compte à rebours et le souvenir du jour ;
// la nuit, pas avant 6 h (sauf départ très tôt). iOS décide du moment exact, ce n'est qu'un souhait.
function refreshAt(){
  const T=Date.now(),M=6e4;let mins=15;
  const agenda=MODE==="agenda"||MODE==="car";
  const soon=agenda&&items.some(x=>!x.a&&((x.d&&x.d>T-10*M&&x.d<T+60*M)||(x.s>T-10*M&&x.s<T+45*M)));
  if(agenda&&(LIVE||soon))mins=5;
  else if(MODE==="cd"||MODE==="sv")mins=120;
  else if(MODE==="idea")mins=30;
  else if(MODE==="shop")mins=SHOP&&SHOP.run?5:15;
  let at=T+mins*M;
  const hr=new Date(T).getHours();
  if(hr<6&&!soon&&!LIVE){const six=new Date(T);six.setHours(6,0,0,0);const first=items.find(x=>!x.a&&x.s>T);
    if(!(agenda&&first&&first.s<six.getTime()+90*M))at=Math.max(at,six.getTime());}
  const mid=new Date(T);mid.setHours(24,0,30,0);if(at>mid.getTime())at=mid.getTime();
  return new Date(at);}

// ---------- assemblage ----------
const w=new ListWidget();w.refreshAfterDate=refreshAt();
// toucher le widget ouvre son aperçu dans Scriptable (iOS ne permet pas d'ouvrir directement une app web)
try{w.url="scriptable:///run/"+encodeURIComponent(Script.name())+"?from=widget"+(["shop","cd","sv","idea"].includes(MODE)?"&w="+MODE+(CDQ?"&q="+encodeURIComponent(CDQ):""):"");}catch(e){}
if(fam==="accessoryCircular"){w.addSpacer();const im=w.addImage(drawCircular());im.centerAlignImage();w.addSpacer();}
else if(fam==="accessoryInline"){w.addText(inlineText());}
else if(fam==="accessoryRectangular"){rectWidget(w);}
else if(MODE==="car"){carWidget(w);}
else{
  w.setPadding(0,0,0,0);
  const S=fam==="small",L=fam==="large";
  w.backgroundImage=MODE==="shop"?(S?drawShopSmall():L?drawShopLarge():drawShopMedium()):
    MODE==="cd"?(S?drawCdSmall():L?drawCdLarge():drawCdMedium()):
    MODE==="sv"?(S?drawSvSmall():L?drawSvLarge():drawSvMedium()):
    MODE==="idea"?(S?drawIdeaSmall():L?drawIdeaLarge():drawIdeaMedium()):
    (S?drawSmall():L?drawLarge():drawMedium());
}
Script.setWidget(w);
if(!config.runsInWidget)await (fam==="small"?w.presentSmall():fam==="large"?w.presentLarge():w.presentMedium());
Script.complete();
