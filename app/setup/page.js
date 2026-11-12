export const dynamic = "force-dynamic";

const HTML = `
<style>
.setup{max-width:720px;margin:0 auto;padding:20px 16px 60px}
.setup h1{font-size:24px;margin:8px 0 4px}.setup .lead{color:var(--muted);margin:0 0 18px}
.step{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:14px;box-shadow:var(--shadow)}
.step h2{font-size:17px;margin:0 0 6px;display:flex;align-items:center;gap:10px}
.step .num{width:26px;height:26px;border-radius:50%;background:var(--navy);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:13px;flex:0 0 auto}
.step.ok .num{background:var(--ok)}
.step ol{padding-left:20px;margin:6px 0 10px;color:var(--fg)}.step li{margin:4px 0}
.step .f{margin-top:10px}
.copy{display:flex;gap:8px;align-items:center;background:var(--surface2);border-radius:8px;padding:8px 10px;font-family:var(--mono);font-size:13px;word-break:break-all}
.copy button{flex:0 0 auto}
.msg{margin-top:10px;font-size:14px}.msg.err{color:var(--bad)}.msg.ok{color:var(--ok)}
.setup .actions{margin-top:16px}
</style>
<div class="setup">
  <div class="eyebrow" style="font-family:var(--mono);font-size:12px;color:var(--accent);letter-spacing:.06em;text-transform:uppercase">Mise en service</div>
  <h1>Visite technique HeatConnect</h1>
  <p class="lead">Trois clés à créer, une seule fois, puis l'application est prête pour toute l'équipe. Chaque étape prend quelques minutes. Les clés sont vérifiées, enregistrées dans Vercel et l'application redémarre toute seule.</p>
  <div id="status" class="msg"></div>

  <div class="step" id="s-vercel">
    <h2><span class="num">0</span> Relier l'application à Vercel</h2>
    <ol>
      <li>Ouvrez <a href="https://vercel.com/account/settings/tokens" target="_blank" rel="noopener">vercel.com/account/settings/tokens</a>.</li>
      <li>« Create », nom « HeatConnect Visite », portée « Full Account », expiration « No Expiration » (ou 1 an), puis copiez le jeton ci-dessous. Il permet à cette page d'enregistrer les clés suivantes à votre place.</li>
    </ol>
    <div class="f"><div class="fl">Jeton Vercel</div><input class="inp" id="v_token" placeholder="vcp_… ou chaîne de 24 caractères" autocomplete="off"></div>
    <div class="actions"><button class="btn primary" type="button" id="b_vercel">Vérifier et relier Vercel</button></div>
    <div class="msg" id="m_vercel"></div>
  </div>

  <div class="step" id="s-google">
    <h2><span class="num">1</span> Connexion Google (Drive et Gmail)</h2>
    <ol>
      <li>Ouvrez <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">console.cloud.google.com/apis/credentials</a> avec votre compte First Block. Si on vous demande un projet, créez-en un nommé « HeatConnect Visite ».</li>
      <li>Activez les API : <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener">Google Drive API</a> et <a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noopener">Gmail API</a> (bouton « Activer »).</li>
      <li>Menu « Écran de consentement OAuth » (ou « Google Auth Platform » > Audience) : choisissez <b>Interne</b>, nom « HeatConnect Visite », votre courriel comme contact, enregistrez.</li>
      <li>Revenez dans « Identifiants » > « Créer des identifiants » > « ID client OAuth » > type <b>Application Web</b>, nom « HeatConnect Visite ». Dans « URI de redirection autorisés », collez exactement :</li>
    </ol>
    <div class="copy"><span id="redirect">…</span><button class="btn sm" type="button" data-copy="redirect">Copier</button></div>
    <ol start="5"><li>Cliquez « Créer », puis copiez l'ID client et le secret client ci-dessous.</li></ol>
    <div class="f"><div class="fl">ID client</div><input class="inp" id="g_id" placeholder="123456789-abc.apps.googleusercontent.com" autocomplete="off"></div>
    <div class="f"><div class="fl">Secret client</div><input class="inp" id="g_secret" placeholder="GOCSPX-…" autocomplete="off"></div>
    <div class="actions"><button class="btn primary" type="button" id="b_google">Enregistrer Google</button></div>
    <div class="msg" id="m_google"></div>
  </div>

  <div class="step" id="s-anthropic">
    <h2><span class="num">2</span> Claude (lecture des photos, préremplissage, synthèse)</h2>
    <ol>
      <li>Ouvrez <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener">platform.claude.com/settings/keys</a> (compte First Block, avec facturation active).</li>
      <li>« Create Key », nom « HeatConnect Visite », copiez la clé (elle commence par sk-ant-).</li>
    </ol>
    <div class="f"><div class="fl">Clé API Anthropic</div><input class="inp" id="a_key" placeholder="sk-ant-…" autocomplete="off"></div>
    <div class="actions"><button class="btn primary" type="button" id="b_anthropic">Vérifier et enregistrer Claude</button></div>
    <div class="msg" id="m_anthropic"></div>
  </div>

  <div class="step" id="s-zoho">
    <h2><span class="num">3</span> Zoho CRM (opportunités, immeubles, notes)</h2>
    <ol>
      <li>Ouvrez <a href="https://api-console.zoho.com/" target="_blank" rel="noopener">api-console.zoho.com</a> avec un compte administrateur Zoho de First Block.</li>
      <li>« Add Client » > <b>Self Client</b> > Create. Onglet « Client Secret » : copiez l'ID et le secret ci-dessous.</li>
      <li>Onglet « Generate Code » : portée (scope) exactement :</li>
    </ol>
    <div class="copy"><span id="scope">ZohoCRM.modules.ALL,ZohoCRM.settings.READ,ZohoCRM.org.READ</span><button class="btn sm" type="button" data-copy="scope">Copier</button></div>
    <ol start="4"><li>Durée « 10 minutes », description « HeatConnect Visite », Create, copiez le code, puis cliquez « Enregistrer Zoho » <b>dans les 10 minutes</b>.</li></ol>
    <div class="f"><div class="fl">Client ID</div><input class="inp" id="z_id" placeholder="1000.XXXX" autocomplete="off"></div>
    <div class="f"><div class="fl">Client Secret</div><input class="inp" id="z_secret" autocomplete="off"></div>
    <div class="f"><div class="fl">Code généré</div><input class="inp" id="z_code" placeholder="1000.xxxx.yyyy" autocomplete="off"></div>
    <div class="actions"><button class="btn primary" type="button" id="b_zoho">Vérifier et enregistrer Zoho</button></div>
    <div class="msg" id="m_zoho"></div>
  </div>

  <div class="step" id="s-fin">
    <h2><span class="num">4</span> Terminer</h2>
    <p style="margin:0 0 10px;color:var(--muted)">Quand les trois étapes sont vertes, cliquez ici : le lien de mise en service est désactivé et l'application redémarre avec sa configuration finale. Attendez une minute, puis ouvrez l'application et connectez-vous avec Google.</p>
    <div class="actions"><button class="btn accent" type="button" id="b_fin">Terminer la mise en service</button> <a class="btn" href="/">Ouvrir l'application</a></div>
    <div class="msg" id="m_fin"></div>
  </div>
</div>
<script>
(function(){
  const key=new URLSearchParams(location.search).get('key')||'';
  const $=s=>document.querySelector(s);
  const api=async(method,body)=>{const r=await fetch('/api/setup'+(key?'?key='+encodeURIComponent(key):''),{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||('Erreur '+r.status));return j;};
  const msg=(id,t,cls)=>{const e=$('#m_'+id);e.textContent=t;e.className='msg '+(cls||'');};
  const mark=(id,ok)=>{$('#s-'+id).classList.toggle('ok',!!ok);};
  document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{const t=$('#'+b.dataset.copy).textContent;try{await navigator.clipboard.writeText(t);b.textContent='Copié';setTimeout(()=>b.textContent='Copier',1500);}catch(e){}});
  async function load(){try{const s=await api('GET');$('#redirect').textContent=s.redirectUri;mark('vercel',s.vercel);mark('google',s.configured.google);mark('anthropic',s.configured.anthropic);mark('zoho',s.configured.zoho);$('#status').textContent=s.vercel?'':'Commencez par l’étape 0 : tant que Vercel n’est pas relié, les clés ne peuvent pas être enregistrées automatiquement.';}
    catch(e){$('#status').textContent='Accès refusé : ce lien de mise en service n’est plus valide.';$('#status').className='msg err';}}
  const run=async(id,body,btn)=>{btn.disabled=true;msg(id,'Vérification…');try{const r=await api('POST',body);msg(id,'Enregistré'+(r.redeployed?' ; l’application redémarre (environ une minute).':'.'),'ok');mark(id,true);}catch(e){msg(id,e.message,'err');}finally{btn.disabled=false;}};
  $('#b_vercel').onclick=e=>run('vercel',{vercel:{token:$('#v_token').value}},e.currentTarget);
  $('#b_google').onclick=e=>run('google',{google:{id:$('#g_id').value,secret:$('#g_secret').value}},e.currentTarget);
  $('#b_anthropic').onclick=e=>run('anthropic',{anthropic:{key:$('#a_key').value}},e.currentTarget);
  $('#b_zoho').onclick=e=>run('zoho',{zoho:{clientId:$('#z_id').value,clientSecret:$('#z_secret').value,code:$('#z_code').value}},e.currentTarget);
  $('#b_fin').onclick=async e=>{e.currentTarget.disabled=true;msg('fin','Finalisation…');try{await api('POST',{finish:true,driveRoot:'__DRIVE_ROOT__'});msg('fin','Mise en service terminée. Attendez une minute, puis ouvrez l’application.','ok');}catch(err){msg('fin',err.message,'err');e.currentTarget.disabled=false;}};
  load();
})();
</script>`;

export default function SetupPage() {
  const html = HTML.replace("__DRIVE_ROOT__", process.env.DRIVE_ROOT_FOLDER_ID || "");
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
