// Together : le lanceur du widget (chargé par le petit script installé dans Scriptable).
// Le vrai code (widget-main.js) n'est téléchargé qu'une fois par version, puis gardé sur le téléphone :
// à chaque mise à jour du widget, seul ce petit fichier passe par le réseau.
const V="76";
const fm0=FileManager.local(),d0=fm0.documentsDirectory(),f0=fm0.joinPath(d0,"together-widget-main-"+V+".js");
let main=null;
if(fm0.fileExists(f0)){try{main=fm0.readString(f0);}catch(e){}}
if(!main){try{const t=await new Request(APP+"widget-main.js?v="+V).loadString();
  if(t&&t.includes("ListWidget")){main=t;fm0.writeString(f0,t);
    for(const n of fm0.listContents(d0))if(/^together-widget-main-/.test(n)&&n!=="together-widget-main-"+V+".js")fm0.remove(fm0.joinPath(d0,n));}}catch(e){}}
// hors connexion avant la première copie de cette version : la précédente, s'il y en a une
if(!main){try{const old=fm0.listContents(d0).filter(n=>/^together-widget-main-.*\.js$/.test(n)).sort().pop();if(old)main=fm0.readString(fm0.joinPath(d0,old));}catch(e){}}
if(!main){const w=new ListWidget();w.addText("Together : connexion impossible");Script.setWidget(w);Script.complete();}
else{const AF=Object.getPrototypeOf(async function(){}).constructor;await new AF("API","APP","WV",main)(API,APP,V);}
