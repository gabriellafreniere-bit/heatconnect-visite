/* HeatConnect · Visite technique · module partagé (client + serveur)
   Schéma du formulaire (HC-REQ-RENO rév. A), complétude, rapport. */
const HC=(()=>{
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isEmpty=x=>x==null||x===''||(Array.isArray(x)&&x.length===0);
const fmtDate=ts=>ts?new Date(ts).toLocaleDateString('fr-CA',{year:'numeric',month:'short',day:'numeric'}):'';
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);

/* ---------- Schéma du formulaire (reprend HC-REQ-RENO rév. A) ---------- */
const COMM=['Commercial','Bureaux','Institutionnel','Industriel','Hôtel','Mixte'];
const OPTS_ETAT=['Bon','Moyen','Fin de vie','Inconnu'];
const OPTS_COMB=['Gaz naturel','Électricité','Mazout','Propane','Autre'];
const OPTS_FACT=['Reçues','Le client les enverra','Photographiées sur place','Non disponibles'];
const EQ_PHOTOS=[{k:'plaque',l:'Plaque signalétique',tag:'obl',ai:'plaque'},{k:'vue',l:"Vue d'ensemble",tag:'obl',multi:true}];
const eqBase=(extra)=>[
  {k:'qte',l:"Nombre d'unités identiques",t:'number',def:1,unit:'unités'},
  ...extra,
  {k:'marque',l:'Marque',t:'text',ai:1,tag:'obl'},
  {k:'modele',l:'Modèle',t:'text',ai:1,tag:'obl'},
  {k:'serie',l:'Numéro de série',t:'text',ai:1},
  {k:'annee',l:'Année de fabrication',t:'number',ai:1,tag:'obl',hint:'Souvent encodée dans le numéro de série.'},
  {k:'etat',l:'État apparent',t:'select',opts:OPTS_ETAT,tag:'visite'},
  {k:'notes',l:'Notes',t:'text',full:true},
];

const S={
 bat:{num:'01',titre:'Le bâtiment',sous:"Pour situer le projet et ouvrir le dossier d'étude.",prefix:'Batiment',
  champs:[
   {k:'nom',l:'Nom du bâtiment ou du projet',t:'text',tag:'obl'},
   {k:'adresse',l:'Adresse complète',t:'text',tag:'obl',ac:'street-address',ph:'1234 rue Exemple, Montréal (Québec) H2X 1Y2',full:true},
   {k:'type',l:'Type et vocation',t:'select',tag:'obl',opts:['Logements locatifs','Copropriété','Résidence pour aînés','Hôtel','Commercial','Bureaux','Institutionnel','Industriel','Mixte','Autre']},
   {k:'vocation_detail',l:'Précision sur la vocation',t:'text',tag:'utile',ph:'ex. : école primaire, CHSLD, entrepôt chauffé'},
   {k:'nb_unites',l:'Logements, chambres ou locaux',t:'number',tag:'obl',unit:'unités'},
   {k:'etages_hs',l:'Étages hors-sol',t:'number',tag:'obl'},
   {k:'etages_ss',l:'Étages en sous-sol',t:'number',tag:'obl'},
   {k:'heures_jour',l:"Heures d'ouverture par jour",t:'number',tag:'obl',unit:'h/jour',showIf:v=>COMM.includes(v.bat.type)},
   {k:'jours_semaine',l:"Jours d'ouverture par semaine",t:'number',tag:'obl',unit:'j/sem',showIf:v=>COMM.includes(v.bat.type)},
   {k:'superficie_totale',l:'Superficie totale',t:'number',tag:'utile'},
   {k:'superficie_chauffee',l:'Superficie chauffée',t:'number',tag:'utile'},
   {k:'unite_surface',l:'Unité de superficie',t:'select',opts:['pi²','m²'],tag:'utile'},
   {k:'annee_construction',l:'Année de construction',t:'number',tag:'utile'},
   {h:'Personne-ressource',hint:"La personne qui connaît le bâtiment : gestionnaire, concierge, responsable de l'entretien."},
   {k:'contact_nom',l:'Nom',t:'text',tag:'obl',ac:'name'},
   {k:'contact_role',l:'Rôle',t:'select',opts:['Gestionnaire','Propriétaire','Concierge',"Responsable de l'entretien",'Syndicat de copropriété','Autre']},
   {k:'contact_courriel',l:'Courriel',t:'email',tag:'obl',ac:'email'},
   {k:'contact_tel',l:'Téléphone',t:'tel',tag:'obl',ac:'tel'},
   {k:'notes',l:'Notes sur le bâtiment',t:'textarea',full:true},
  ],
  photos:[{k:'facade',l:'Façade et vue extérieure',tag:'utile',multi:true}]
 },
 ene:{num:'02',titre:"La consommation d'énergie",sous:"C'est la donnée qui fixe l'économie de chauffage réelle.",prefix:'Energie',
  champs:[
   {h:'Hydro-Québec'},
   {k:'hq_nb_compteurs',l:'Nombre de compteurs Hydro-Québec',t:'number',tag:'utile'},
   {k:'hq_factures',l:'Factures des 12 derniers mois (tous les compteurs)',t:'select',tag:'obl',opts:OPTS_FACT},
   {k:'hq_estime',l:'Estimé annuel Hydro-Québec',t:'number',tag:'utile',unit:'$/an'},
   {h:'Gaz naturel ou autre combustible'},
   {k:'combustible',l:'Combustible principal de chauffage',t:'select',tag:'obl',opts:['Gaz naturel (Énergir)','Mazout','Propane','Électricité seulement','Autre']},
   {k:'gaz_factures',l:'Factures de gaz ou de livraison des 12 derniers mois',t:'select',tag:'obl',opts:OPTS_FACT,showIf:v=>v.ene.combustible&&v.ene.combustible!=='Électricité seulement'},
   {k:'gaz_estime',l:'Estimé annuel Énergir',t:'number',tag:'utile',unit:'$/an',showIf:v=>v.ene.combustible==='Gaz naturel (Énergir)'},
   {k:'historique_court',l:"Moins de 12 mois d'historique ?",t:'bool',tag:'utile',hint:"Achat récent du bâtiment, par exemple. L'étude en tient compte."},
   {k:'factures',t:'liste',l:'Factures photographiées sur place',sing:'Facture',prefix:'Facture',ai:'facture',
     hint:'Photographiez une facture : Claude lit le compte, la période, la consommation et le montant.',
     champs:[
      {k:'fournisseur',l:'Fournisseur',t:'select',opts:['Hydro-Québec','Énergir','Mazout','Propane','Autre'],ai:1},
      {k:'compte',l:'Numéro de compte ou de compteur',t:'text',ai:1},
      {k:'periode',l:'Période facturée',t:'text',ai:1,ph:'2026-01-05 au 2026-03-04'},
      {k:'consommation',l:'Consommation',t:'text',ai:1,ph:'12 345 kWh ou 1 234 m³'},
      {k:'montant',l:'Montant',t:'number',unit:'$',ai:1},
     ],photos:[{k:'facture',l:'Photo de la facture',ai:'facture'}]},
   {k:'notes',l:'Notes sur la consommation',t:'textarea',full:true},
  ],
  photos:[{k:'compteurs',l:'Compteurs (Hydro-Québec, gaz)',tag:'utile',multi:true}]
 },
 chauf:{num:'03',titre:"Le chauffage et l'eau chaude",sous:'Pour savoir où et comment la chaleur HeatConnect se raccorde.',prefix:'Chauffage',
  champs:[
   {h:'Eau chaude domestique centralisée'},
   {k:'ecd_centralise',l:"L'eau chaude domestique est-elle centralisée ?",t:'bool',tag:'obl',full:true},
   {k:'chauffe_eau',t:'liste',l:'Chauffe-eau',sing:'Chauffe-eau',prefix:'ChauffeEau',ai:'plaque',showIf:v=>v.chauf.ecd_centralise==='Oui',
     champs:eqBase([
      {k:'type',l:'Type',t:'select',opts:['Direct (brûleur intégré)','Indirect (serpentin ou échangeur)','Réservoir électrique','Instantané','Autre'],ai:1,tag:'obl'},
      {k:'combustible',l:'Combustible',t:'select',opts:OPTS_COMB,ai:1},
      {k:'capacite',l:'Capacité',t:'number',unit:'gal',ai:1,tag:'obl'},
      {k:'puissance',l:'Puissance (entrée)',t:'text',ai:1,tag:'obl',ph:'199 000 BTU/h ou 4,5 kW'},
     ]),photos:EQ_PHOTOS},
   {h:'Chauffage centralisé à eau chaude'},
   {k:'chauffage_centralise',l:'Le chauffage est-il centralisé à eau chaude ?',t:'bool',tag:'obl',full:true},
   {k:'chaudieres',t:'liste',l:'Chaudières',sing:'Chaudière',prefix:'Chaudiere',ai:'plaque',showIf:v=>v.chauf.chauffage_centralise==='Oui',
     champs:eqBase([
      {k:'type',l:'Type',t:'select',opts:['Atmosphérique','Condensation','Tubes à feu','Tubes à eau','Électrique','Autre'],ai:1},
      {k:'combustible',l:'Combustible',t:'select',opts:OPTS_COMB,ai:1},
      {k:'puissance_entree',l:'Puissance entrée (input)',t:'text',ai:1,tag:'obl',ph:'1 500 000 BTU/h'},
      {k:'puissance_sortie',l:'Puissance sortie (output)',t:'text',ai:1,ph:'1 230 000 BTU/h'},
     ]),photos:EQ_PHOTOS},
   {k:'distribution',l:'Distribution de chaleur',t:'multi',tag:'visite',opts:['Calorifères (radiateurs)','Plinthes hydroniques','Plancher radiant','Ventilo-convecteurs','Serpentins de ventilation','Autre'],full:true,showIf:v=>v.chauf.chauffage_centralise==='Oui'},
   {k:'temp_alim',l:"Température d'alimentation de la boucle",t:'number',unit:'°C',tag:'visite',showIf:v=>v.chauf.chauffage_centralise==='Oui'},
   {k:'temp_retour',l:'Température de retour de la boucle',t:'number',unit:'°C',tag:'visite',showIf:v=>v.chauf.chauffage_centralise==='Oui'},
   {k:'controle',l:'Contrôle dans les unités',t:'select',tag:'visite',opts:['Thermostat par logement','Thermostat par zone','Contrôle central','Aucun contrôle','Inconnu']},
   {k:'notes',l:'Notes sur le chauffage',t:'textarea',full:true},
  ],
  photos:[{k:'calorifere',l:'Calorifère ou plinthe type dans un logement',tag:'obl',showIf:v=>v.chauf.chauffage_centralise==='Oui'},{k:'chaufferie',l:"Vue d'ensemble de la chaufferie",tag:'visite',multi:true}]
 },
 air:{num:'04',titre:'Les autres charges de chauffage',sous:"Chaque charge peut devenir une mesure évaluée séparément dans l'étude.",prefix:'Charges',
  champs:[
   {h:"Traitement de l'air : unités au toit, air neuf, ventilation"},
   {k:'air_present',l:"Y a-t-il des unités de traitement de l'air chauffées ?",t:'bool',tag:'obl',full:true},
   {k:'unites_air',t:'liste',l:"Unités de traitement de l'air",sing:'Unité',prefix:'UniteToit',ai:'plaque',showIf:v=>v.air.air_present==='Oui',
     champs:eqBase([
      {k:'type',l:'Type',t:'select',opts:['Unité de toit (RTU)',"Unité d'air neuf (MUA)",'Ventilateur récupérateur','Autre'],ai:1},
      {k:'combustible',l:'Combustible',t:'select',opts:OPTS_COMB,ai:1},
      {k:'capacite_btu',l:'Capacité de chauffage',t:'text',ai:1,tag:'visite',ph:'400 000 BTU/h'},
      {k:'cfm',l:"Débit d'air",t:'number',unit:'CFM',ai:1,tag:'visite'},
      {k:'horaire',l:'Horaire de fonctionnement',t:'text',tag:'visite',ph:'24/7 ou 6 h à 22 h en semaine'},
      {k:'volets',l:"Contrôle des volets d'air neuf",t:'select',opts:['Oui','Non','Inconnu'],tag:'visite'},
     ]),photos:EQ_PHOTOS},
   {h:'Stationnement intérieur, garage, aérothermes'},
   {k:'garage_present',l:'Y a-t-il un stationnement intérieur ou un garage chauffé ?',t:'bool',tag:'obl',full:true},
   {k:'aerothermes',t:'liste',l:'Aérothermes',sing:'Aérotherme',prefix:'Aerotherme',ai:'plaque',showIf:v=>v.air.garage_present==='Oui',
     champs:[
      {k:'qte',l:"Nombre d'unités",t:'number',def:1,tag:'obl',unit:'unités'},
      {k:'combustible',l:'Combustible',t:'select',opts:OPTS_COMB,ai:1},
      {k:'puissance',l:'Puissance approximative par unité',t:'text',ai:1,tag:'obl',ph:'150 000 BTU/h ou 5 kW'},
      {k:'thermostat',l:'Contrôle',t:'select',opts:['Thermostat avec horaire','Thermostat sans horaire','Aucun thermostat'],tag:'obl'},
      {k:'marque',l:'Marque',t:'text',ai:1},
      {k:'modele',l:'Modèle',t:'text',ai:1},
      {k:'annee',l:'Année',t:'number',ai:1},
      {k:'etat',l:'État apparent',t:'select',opts:OPTS_ETAT,tag:'visite'},
      {k:'notes',l:'Notes',t:'text',full:true},
     ],photos:[{k:'vue',l:"Vue d'ensemble des unités",tag:'obl',multi:true},{k:'plaque',l:'Plaque signalétique',ai:'plaque'}]},
   {h:'Fonte de neige, piscine'},
   {k:'piscine_present',l:'Piscine chauffée ?',t:'bool',tag:'utile'},
   {k:'piscine_equipement',l:'Équipement qui chauffe la piscine aujourd’hui',t:'text',tag:'visite',showIf:v=>v.air.piscine_present==='Oui'},
   {k:'fonte_present',l:'Fonte de neige ?',t:'bool',tag:'utile'},
   {k:'fonte_equipement',l:'Équipement qui chauffe la fonte de neige aujourd’hui',t:'text',tag:'visite',showIf:v=>v.air.fonte_present==='Oui'},
   {k:'notes',l:'Notes sur les autres charges',t:'textarea',full:true},
  ],
  photos:[{k:'piscine',l:'Équipement de piscine',tag:'visite',multi:true,showIf:v=>v.air.piscine_present==='Oui'},{k:'fonte',l:'Équipement de fonte de neige',tag:'visite',multi:true,showIf:v=>v.air.fonte_present==='Oui'}]
 },
 plans:{num:'05',titre:'Les plans',sous:"Un atout considérable, mais on peut s'organiser sans.",prefix:'Plans',
  champs:[
   {k:'meca',l:'Plans mécaniques',t:'select',tag:'utile',opts:['Reçus','Le client les enverra','Photographiés sur place','Inexistants','Inconnu'],hint:'Chaufferie, eau chaude, unités au toit et ventilation.'},
   {k:'elec',l:'Plans électriques',t:'select',tag:'utile',opts:['Reçus','Le client les enverra','Photographiés sur place','Inexistants','Inconnu'],hint:'Entrée électrique et unifilaire.'},
   {k:'archi',l:"Plans d'architecture",t:'select',tag:'utile',opts:['Reçus','Le client les enverra','Photographiés sur place','Inexistants','Inconnu'],hint:"Plans d'étages, sous-sol et toiture."},
   {k:'notes',l:'Notes sur les plans',t:'textarea',full:true},
  ],
  photos:[{k:'plans',l:'Plans photographiés sur place',tag:'utile',multi:true}]
 },
 esp:{num:'06',titre:"L'espace et l'électricité",sous:'Validé à la visite. Les photos préparent le travail du plombier et de l’électricien.',prefix:'Espace',
  champs:[
   {info:"Module HeatConnect V4 : <b>790 × 1 297 mm</b> au sol (975 mm de large avec le boîtier électrique), <b>2 261 mm</b> de hauteur, <b>748 kg</b> max. avec serveurs. Dégagements : <b>914 mm</b> à l'avant et du côté du boîtier, <b>610 mm</b> à l'arrière, <b>305 mm</b> de l'autre côté. Compteur Hydro-Québec dédié de <b>100 A</b>. Le module est sur roulettes."},
   {h:'Salle mécanique'},
   {k:'unite_dim',l:'Unité de mesure',t:'select',opts:['m','pi'],def:'m'},
   {k:'salle_longueur',l:'Longueur disponible',t:'number',tag:'visite',unitFrom:'unite_dim'},
   {k:'salle_largeur',l:'Largeur disponible',t:'number',tag:'visite',unitFrom:'unite_dim'},
   {k:'salle_hauteur',l:'Hauteur libre',t:'number',tag:'visite',unitFrom:'unite_dim'},
   {k:'espace_module',l:'Espace suffisant pour le module et ses dégagements ?',t:'select',opts:['Oui','À valider','Non'],tag:'visite'},
   {h:"Chemin d'accès et plancher",hint:'Portes, corridors et ascenseur jusqu’à la salle. Capacité portante du plancher.'},
   {k:'unite_acces',l:'Unité de mesure',t:'select',opts:['cm','po'],def:'cm'},
   {k:'porte_largeur',l:'Largeur de la porte la plus étroite',t:'number',tag:'visite',unitFrom:'unite_acces'},
   {k:'porte_hauteur',l:'Hauteur de la porte la plus basse',t:'number',tag:'visite',unitFrom:'unite_acces'},
   {k:'corridor_largeur',l:'Largeur du corridor le plus étroit',t:'number',tag:'visite',unitFrom:'unite_acces'},
   {k:'ascenseur',l:'Ascenseur ou monte-charge requis ?',t:'select',opts:['Oui','Non, accès de plain-pied','Non, mais des marches'],tag:'visite'},
   {k:'ascenseur_capacite',l:"Capacité de l'ascenseur",t:'number',unit:'kg',tag:'visite',showIf:v=>v.esp.ascenseur==='Oui'},
   {k:'marches_detail',l:'Marches ou dénivelés sur le parcours',t:'text',tag:'visite',ph:'ex. : 4 marches à l’entrée du sous-sol',showIf:v=>v.esp.ascenseur==='Non, mais des marches'},
   {k:'plancher',l:'Plancher de la salle',t:'select',opts:['Dalle de béton sur sol','Dalle structurale','Plancher de bois','Autre'],tag:'visite'},
   {k:'capacite_portante',l:'Capacité portante connue',t:'text',tag:'visite',ph:'inconnue ou kPa / lb/pi²'},
   {h:'Entrée électrique',hint:'Photographiez le panneau principal et sa plaque : Claude relève la tension et l’ampérage.'},
   {k:'tension',l:'Tension',t:'select',opts:['120/208 V','347/600 V','120/240 V','600 V','Autre'],tag:'visite',ai:1},
   {k:'amperage',l:"Ampérage de l'entrée",t:'number',unit:'A',tag:'visite',ai:1},
   {k:'espace_compteur',l:'Espace pour un compteur dédié ?',t:'select',opts:['Oui','À valider','Non'],tag:'visite'},
   {h:'Refroidisseur à sec',hint:'Espace extérieur le plus près possible de la salle mécanique.'},
   {k:'refroidisseur_emplacement',l:'Emplacement possible',t:'select',opts:['Au sol','Au mur','Au toit','À déterminer'],tag:'visite'},
   {k:'refroidisseur_distance',l:'Distance approximative à la salle',t:'number',unit:'m',tag:'visite'},
   {h:'Internet et drain'},
   {k:'internet',l:'Accès Internet dans la salle',t:'select',opts:['Oui, filaire','Oui, Wi-Fi seulement','Non','Inconnu'],tag:'visite'},
   {k:'drain',l:'Drain de plancher présent ?',t:'bool',tag:'visite'},
   {k:'notes',l:"Notes sur l'espace et l'électricité",t:'textarea',full:true},
  ],
  photos:[{k:'salle',l:'Salle mécanique (espace disponible)',tag:'visite',multi:true},{k:'acces',l:"Chemin d'accès : portes, corridors, ascenseur",tag:'visite',multi:true},{k:'panneau',l:'Panneau électrique principal et sa plaque',tag:'visite',ai:'panneau'},{k:'exterieur',l:'Emplacement possible du refroidisseur à sec',tag:'visite',multi:true},{k:'drain',l:'Drain de plancher',tag:'visite'}]
 },
};
const ORDER=['bat','ene','chauf','air','plans','esp','rap'];
const TAGL={obl:'Obligatoire',utile:'Utile',visite:'À la visite'};


function nouvelleVisite(){return ensure({id:uid(),cree:Date.now(),maj:Date.now()});}
function ensure(v){
  for(const sid of Object.keys(S)){v[sid]=v[sid]||{};v[sid]._photos=v[sid]._photos||[];v[sid]._ai=v[sid]._ai||{};v[sid]._src=v[sid]._src||{};
    for(const f of S[sid].champs){if(f.t==='liste'){v[sid][f.k]=Array.isArray(v[sid][f.k])?v[sid][f.k]:[];for(const it of v[sid][f.k]){it._photos=it._photos||[];it.id=it.id||uid();it._ai=it._ai||{};it._src=it._src||{};}}
      else if(f.k&&f.def!=null&&v[sid][f.k]==null)v[sid][f.k]=f.def;}}
  v.synthese=v.synthese||'';v.docs=Array.isArray(v.docs)?v.docs:[];v.sources=Array.isArray(v.sources)?v.sources:[];v.crm=v.crm||null;v._drive=v._drive||null;return v;
}
function holderPhotos(h){return (h._photos||[]).filter(p=>!p.pending);}
function stripPending(v){const c=JSON.parse(JSON.stringify(v));for(const sid of Object.keys(S)){c[sid]._photos=(c[sid]._photos||[]).filter(p=>!p.pending);for(const f of S[sid].champs)if(f.t==='liste')for(const it of c[sid][f.k]||[])it._photos=(it._photos||[]).filter(p=>!p.pending);}return c;}

/* ---------- Complétude ---------- */
function checklist(v){
  const out=[];const add=(grp,sec,label,ok)=>out.push({grp,sec,label,ok:!!ok});
  const b=v.bat;
  add('obl','bat','Nom et adresse du bâtiment',b.nom&&b.adresse);
  add('obl','bat','Personne-ressource (nom + courriel ou téléphone)',b.contact_nom&&(b.contact_courriel||b.contact_tel));
  add('obl','bat','Type et vocation',b.type);
  add('obl','bat','Nombre de logements ou d’unités',!isEmpty(b.nb_unites));
  add('obl','bat','Nombre d’étages (hors-sol et sous-sol)',!isEmpty(b.etages_hs)&&!isEmpty(b.etages_ss));
  if(COMM.includes(b.type))add('obl','bat','Heures d’ouverture',!isEmpty(b.heures_jour)&&!isEmpty(b.jours_semaine));
  const e=v.ene;
  add('obl','ene','Factures Hydro-Québec : statut',e.hq_factures);
  add('obl','ene','Combustible principal',e.combustible);
  if(e.combustible&&e.combustible!=='Électricité seulement')add('obl','ene','Factures de gaz ou de combustible : statut',e.gaz_factures);
  const c=v.chauf;
  add('obl','chauf','Eau chaude domestique centralisée : oui/non',c.ecd_centralise);
  if(c.ecd_centralise==='Oui'){add('obl','chauf','Au moins un chauffe-eau décrit',c.chauffe_eau.length>0);
    c.chauffe_eau.forEach((it,i)=>{add('obl','chauf',`Chauffe-eau ${i+1} : capacité, puissance, type, marque, modèle, année`,!isEmpty(it.capacite)&&it.puissance&&it.type&&it.marque&&it.modele&&!isEmpty(it.annee));
      add('obl','chauf',`Chauffe-eau ${i+1} : photos plaque et vue d’ensemble`,hasPhoto(it,'plaque')&&hasPhoto(it,'vue'));});}
  add('obl','chauf','Chauffage centralisé à eau chaude : oui/non',c.chauffage_centralise);
  if(c.chauffage_centralise==='Oui'){add('obl','chauf','Au moins une chaudière décrite',c.chaudieres.length>0);
    c.chaudieres.forEach((it,i)=>{add('obl','chauf',`Chaudière ${i+1} : puissance, marque, modèle, année`,it.puissance_entree&&it.marque&&it.modele&&!isEmpty(it.annee));
      add('obl','chauf',`Chaudière ${i+1} : photos plaque et vue d’ensemble`,hasPhoto(it,'plaque')&&hasPhoto(it,'vue'));});
    add('obl','chauf','Photo d’un calorifère ou d’une plinthe type',hasPhoto(c,'calorifere'));
    add('visite','chauf','Distribution de chaleur',!isEmpty(c.distribution));
    add('visite','chauf','Contrôle dans les unités',c.controle);}
  const a=v.air;
  add('obl','air','Unités de traitement de l’air : oui/non',a.air_present);
  if(a.air_present==='Oui'){add('obl','air','Au moins une unité décrite',a.unites_air.length>0);
    a.unites_air.forEach((it,i)=>{add('obl','air',`Unité ${i+1} : marque, modèle, année`,it.marque&&it.modele&&!isEmpty(it.annee));
      add('obl','air',`Unité ${i+1} : photos plaque et vue d’ensemble`,hasPhoto(it,'plaque')&&hasPhoto(it,'vue'));
      add('visite','air',`Unité ${i+1} : capacité, débit, horaire, volets`,it.capacite_btu&&!isEmpty(it.cfm)&&it.horaire&&it.volets);});}
  add('obl','air','Stationnement ou garage chauffé : oui/non',a.garage_present);
  if(a.garage_present==='Oui'){add('obl','air','Au moins un groupe d’aérothermes décrit',a.aerothermes.length>0);
    a.aerothermes.forEach((it,i)=>{add('obl','air',`Aérothermes ${i+1} : nombre, puissance, contrôle`,!isEmpty(it.qte)&&it.puissance&&it.thermostat);
      add('obl','air',`Aérothermes ${i+1} : photo des unités`,hasPhoto(it,'vue'));});}
  if(a.piscine_present==='Oui')add('visite','air','Piscine : équipement en place et photo',a.piscine_equipement&&hasPhoto(a,'piscine'));
  if(a.fonte_present==='Oui')add('visite','air','Fonte de neige : équipement en place et photo',a.fonte_equipement&&hasPhoto(a,'fonte'));
  const s=v.esp;
  add('visite','esp','Salle mécanique : dimensions et hauteur libre',!isEmpty(s.salle_longueur)&&!isEmpty(s.salle_largeur)&&!isEmpty(s.salle_hauteur));
  add('visite','esp','Salle mécanique : photos',hasPhoto(s,'salle'));
  add('visite','esp','Chemin d’accès : portes, corridors, ascenseur',!isEmpty(s.porte_largeur)&&s.ascenseur);
  add('visite','esp','Plancher et capacité portante',s.plancher);
  add('visite','esp','Entrée électrique : tension, ampérage, photo du panneau',s.tension&&!isEmpty(s.amperage)&&hasPhoto(s,'panneau'));
  add('visite','esp','Espace pour un compteur dédié',s.espace_compteur);
  add('visite','esp','Emplacement du refroidisseur à sec',s.refroidisseur_emplacement);
  add('visite','esp','Internet et drain',s.internet&&s.drain);
  return out;
}
function hasPhoto(h,k){return holderPhotos(h).some(p=>p.k===k);}
function score(v){const l=checklist(v);const o=l.filter(x=>x.grp==='obl'),vi=l.filter(x=>x.grp==='visite');return{obl:o.filter(x=>x.ok).length,oblT:o.length,vis:vi.filter(x=>x.ok).length,visT:vi.length,pct:l.length?Math.round(100*l.filter(x=>x.ok).length/l.length):0};}
function secState(v,sid){const l=checklist(v).filter(x=>x.sec===sid);if(!l.length)return '';const ok=l.filter(x=>x.ok).length;return ok===l.length?'ok':ok?'part':'bad';}


/* ---------- Rapport ---------- */
function labelOf(sec,k){const f=S[sec].champs.find(c=>c.k===k);return f?f.l:k;}
function fmtVal(f,v,obj){if(isEmpty(v))return '';if(Array.isArray(v))return v.join(', ');const u=f.unit||(f.unitFrom?obj[f.unitFrom]:'');return typeof v==='number'?v.toLocaleString('fr-CA')+(u?' '+u:''):String(v)+(u&&f.t==='number'?' '+u:'');}
function photoFiles(v){
  const out=[];const push=(h,prefix,n,defs)=>{const counts={};for(const ph of holderPhotos(h)){counts[ph.k]=(counts[ph.k]||0)+1;const def=defs.find(d=>d.k===ph.k);const name=`${prefix}${n?'_'+n:''}_${ph.k}${counts[ph.k]>1||(def&&def.multi)?'_'+counts[ph.k]:''}.jpg`;out.push({id:ph.id,name,label:(def?def.l:ph.k),legende:ph.legende||'',holder:h,k:ph.k});}};
  for(const sid of Object.keys(S)){const sec=S[sid];push(v[sid],sec.prefix,0,sec.photos);for(const f of sec.champs)if(f.t==='liste')v[sid][f.k].forEach((it,i)=>push(it,f.prefix,i+1,f.photos));}
  return out;
}
function rapportHTML(v,files,opts={}){
  const srcOf=opts.src||(f=>'photos/'+f.name);const hrefOf=opts.href||srcOf;
  const byHolder=h=>files.filter(f=>f.holder===h);
  const imgs=list=>list.length?`<div class="ph">${list.map(f=>`<figure><a href="${esc(hrefOf(f))}"><img src="${esc(srcOf(f))}" alt="${esc(f.label)}" loading="lazy"></a><figcaption><code>${esc(f.name)}</code> · ${esc(f.label)}${f.legende?' · '+esc(f.legende):''}</figcaption></figure>`).join('')}</div>`:'';
  const rows=(obj,champs,sec)=>{let r='';for(const f of champs){if(!f.k||f.t==='liste')continue;if(f.showIf&&!f.showIf(v))continue;const val=fmtVal(f,obj[f.k],obj);if(!val)continue;r+=`<tr><th>${esc(f.l)}</th><td>${esc(val)}${obj._ai?.[f.k]==='prefill'?' <span class="ai">prérempli · '+esc(obj._src?.[f.k]||'CRM')+'</span>':(obj._ai?.[f.k]?' <span class="ai">lu par Claude</span>':'')}</td></tr>`;}return r?`<table>${r}</table>`:'<p class="none">Aucune donnée saisie.</p>';};
  const cl=checklist(v);const sc=score(v);
  let html=`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dossier HeatConnect · ${esc(v.bat.nom||'Bâtiment')}</title><style>
  body{font-family:-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:#1d2130;margin:0;background:#fff;line-height:1.45}
  .wrap{max-width:900px;margin:0 auto;padding:28px 20px 60px}
  header{border-bottom:3px solid #313749;padding-bottom:12px;margin-bottom:24px}
  header .k{font:500 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:#e4712f}
  h1{font-size:26px;margin:6px 0 2px}h2{font-size:18px;margin:34px 0 10px;padding-top:12px;border-top:1px solid #d6d7d2}h3{font-size:15px;margin:18px 0 6px}
  table{border-collapse:collapse;width:100%;font-size:14px;margin:6px 0 10px}th,td{text-align:left;vertical-align:top;padding:6px 8px;border-bottom:1px solid #ebebe6}th{width:42%;font-weight:500;color:#5f6475}
  .ai{font:500 10px/1 ui-monospace,monospace;background:#e9e3f8;color:#6b4fbb;padding:2px 5px;border-radius:4px;vertical-align:middle;text-transform:uppercase;letter-spacing:.05em}
  .ph{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin:8px 0 16px}figure{margin:0}figure img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px;border:1px solid #d6d7d2;background:#f4f4f1}figcaption{font-size:12px;color:#5f6475;margin-top:4px}code{font-size:11px}
  .none{color:#8a8f9e;font-size:14px;font-style:italic}
  .meta{display:flex;gap:24px;flex-wrap:wrap;font-size:14px;color:#5f6475}
  .score{display:flex;gap:14px;flex-wrap:wrap;margin:14px 0}.score div{background:#f4f4f1;border-radius:8px;padding:10px 14px;min-width:150px}.score b{display:block;font-size:22px}.score span{font-size:12px;color:#5f6475}
  ul.ck{list-style:none;padding:0;margin:0;font-size:14px}ul.ck li{padding:4px 0 4px 26px;position:relative}ul.ck li::before{content:"✓";position:absolute;left:0;top:4px;width:18px;height:18px;border-radius:50%;background:#2e8b57;color:#fff;font-size:12px;text-align:center;line-height:18px}ul.ck li.no::before{content:"!";background:#c0392b}
  .synth{white-space:pre-wrap;background:#f4f4f1;border-left:4px solid #313749;padding:12px 14px;border-radius:0 8px 8px 0;font-size:14px}
  .card{border:1px solid #d6d7d2;border-radius:8px;padding:12px 14px;margin:10px 0}
  footer{margin-top:40px;font-size:12px;color:#8a8f9e;border-top:1px solid #d6d7d2;padding-top:10px}
  @media print{.wrap{padding:0}h2{break-after:avoid}figure{break-inside:avoid}}
  </style></head><body><div class="wrap">
  <header><div class="k">HeatConnect · Visite technique · Bâtiment existant (HC-REQ-RENO rév. A)</div><h1>${esc(v.bat.nom||'Bâtiment sans nom')}</h1><div class="meta"><span>${esc(v.bat.adresse||'Adresse à compléter')}</span>${v.crm?`<span>Opportunité : ${esc(v.crm.dealName||'')}${v.crm.stage?' · '+esc(v.crm.stage):''}</span>`:''}<span>Visite : ${esc(fmtDate(v.cree))}</span><span>Dossier mis à jour : ${esc(fmtDate(v.maj))}</span></div></header>
  <div class="score"><div><b>${sc.obl}/${sc.oblT}</b><span>Éléments obligatoires pour l'étude</span></div><div><b>${sc.vis}/${sc.visT}</b><span>Relevés de la visite technique</span></div><div><b>${files.length}</b><span>Photos jointes</span></div></div>`;
  if(v.synthese)html+=`<h2>Synthèse de la visite</h2><div class="synth">${esc(v.synthese)}</div>`;
  const manq=cl.filter(x=>!x.ok);
  html+=`<h2>Éléments manquants</h2>${manq.length?'<ul class="ck">'+manq.map(x=>`<li class="no">${esc(x.label)} <span style="color:#8a8f9e">(section ${S[x.sec].num})</span></li>`).join('')+'</ul>':'<p>Aucun. Le dossier est complet.</p>'}`;
  if(v.sources&&v.sources.length)html+=`<h2>Sources du préremplissage</h2><ul class="ck">${v.sources.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
  for(const sid of Object.keys(S)){const sec=S[sid];const d=v[sid];
    html+=`<h2>${sec.num} · ${esc(sec.titre)}</h2>`;
    html+=rows(d,sec.champs,sid);
    for(const f of sec.champs){if(f.t!=='liste'||(f.showIf&&!f.showIf(v)))continue;html+=`<h3>${esc(f.l)} (${d[f.k].length})</h3>`;if(!d[f.k].length)html+='<p class="none">Aucun élément.</p>';
      d[f.k].forEach((it,i)=>{html+=`<div class="card"><strong>${esc(f.sing)} ${i+1}</strong>${rows(it,f.champs,sid)}${imgs(byHolder(it))}</div>`;});}
    html+=imgs(byHolder(d));
  }
  html+=`<footer>Dossier généré par l'outil Visite technique HeatConnect. Les photos sont dans le dossier <code>photos/</code> de l'archive, nommées par sujet. Les données complètes sont dans <code>donnees.json</code>. Les valeurs marquées « lu par Claude » proviennent d'une lecture automatique des photos ; celles marquées « prérempli » viennent du CRM, du Drive de l'opportunité ou des courriels. Toutes ont été vérifiées par le gestionnaire de compte.</footer></div></body></html>`;
  return html;
}
function resumeTexte(v){
  const sc=score(v);const L=[];L.push(`DOSSIER HEATCONNECT · ${v.bat.nom||'Bâtiment'}`,v.bat.adresse||'',v.crm?`Opportunité : ${v.crm.dealName||''}`:'',`Visite du ${fmtDate(v.cree)} · ${sc.obl}/${sc.oblT} éléments obligatoires · ${photoFiles(v).length} photos`,'');
  for(const sid of Object.keys(S)){const sec=S[sid],d=v[sid];L.push(`${sec.num} ${sec.titre.toUpperCase()}`);
    for(const f of sec.champs){if(!f.k||(f.showIf&&!f.showIf(v)))continue;if(f.t==='liste'){d[f.k].forEach((it,i)=>{const parts=f.champs.map(c=>{const val=fmtVal(c,it[c.k],it);return val?`${c.l} : ${val}`:null;}).filter(Boolean);L.push(`  ${f.sing} ${i+1} — ${parts.join(' · ')||'aucune donnée'}`);});continue;}
      const val=fmtVal(f,d[f.k],d);if(val)L.push(`  ${f.l} : ${val}`);}
    L.push('');}
  const manq=checklist(v).filter(x=>!x.ok);if(manq.length){L.push('MANQUANT');for(const m of manq)L.push('  - '+m.label);L.push('');}
  if(v.synthese){L.push('SYNTHÈSE',v.synthese);}
  return L.join('\n');
}

return {S,ORDER,TAGL,COMM,OPTS_ETAT,OPTS_COMB,esc,isEmpty,fmtDate,uid,nouvelleVisite,ensure,holderPhotos,stripPending,checklist,hasPhoto,score,secState,labelOf,fmtVal,photoFiles,rapportHTML,resumeTexte};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=HC;
if(typeof window!=='undefined')window.HC=HC;
