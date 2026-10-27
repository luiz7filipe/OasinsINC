import {planViews} from './plans.js';
import {createFoodDiary} from './food-diary';
import {guestStore,emptyState} from './guest';
import {entryMarkup} from './entry.js';
import { createAuthClient } from 'better-auth/client';
import { twoFactorClient } from 'better-auth/client/plugins';
import QRCode from 'qrcode';

const app=window.OasisApp;
const foodDiary=createFoodDiary(app);
const $=s=>document.querySelector(s),esc=app.escapeHtml,icon=app.icon;
const auth=createAuthClient({plugins:[twoFactorClient()],fetchOptions:{timeout:15000}});
let session=null,status={},mode='login',pendingEmail='',revision=0,reminders=[],saveQueue=Promise.resolve(),saveBlocked=false,configError=false,subscription=null,formBusy=false,turnstileWidget=null;
let audioContext=null,soundEnabled=false;
let accountGeneration=0,pendingSaves=0,stateDay='';
const weekdayNames=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const localDay=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const timezone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Sao_Paulo';
const guest=guestStore({getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>localStorage.removeItem(key)});
let guestActive=false,guestExpiresAt=0;

async function api(path,options={}){
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),...options,headers:{'Content-Type':'application/json',...options.headers}});
  let data;try{data=await response.json();}catch{throw new Error('Não foi possível conectar ao servidor.');}
  if(!response.ok){const error=new Error(data.error||'Não foi possível concluir.');error.status=response.status;if(response.status===401&&session){lock();authScreen('login','Sua sessão expirou. Entre novamente.');}throw error;}
  return data;
}
function authField(label,name,type,extra=''){return `<label class="field">${label}<input name="${name}" type="${type}" required ${extra}></label>`;}
function authScreen(next='welcome',message=''){
  mode=next;document.body.classList.add('app-locked');
  if(turnstileWidget!==null&&window.turnstile)try{window.turnstile.remove(turnstileWidget);}catch{}
  turnstileWidget=null;
  $('#auth-content').innerHTML=entryMarkup({mode:next,message,pendingEmail,status,configError,icon,esc});
  window.lucide?.createIcons();mountCaptcha();
}
function mountCaptcha(){
  if(!status.turnstileSiteKey||!['login','signup','forgot','verify'].includes(mode))return;
  const mount=()=>{if(!$('#captcha-slot'))return;if(turnstileWidget!==null)try{window.turnstile.remove(turnstileWidget);}catch{}turnstileWidget=window.turnstile.render('#captcha-slot',{sitekey:status.turnstileSiteKey,action:'oasis-auth',theme:'light',language:'pt-br'});};
  if(window.turnstile)mount();else{let script=$('#turnstile-script');if(!script){script=document.createElement('script');script.id='turnstile-script';script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.onload=mount;script.onerror=()=>{$('#auth-error').textContent='A proteção de acesso não carregou. Recarregue a página.';};document.head.append(script);}}
}
function captchaHeaders(){const token=window.turnstile&&turnstileWidget!==null?window.turnstile.getResponse(turnstileWidget):'';if(status.turnstileSiteKey&&['login','signup','forgot','verify'].includes(mode)&&!token)throw new Error('Aguarde a verificação de segurança.');return token?{'x-captcha-response':token}:{};}
function authError(error){if(error.status===429)return 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.';if(error.code==='EMAIL_NOT_VERIFIED')return 'Confirme seu e-mail antes de entrar. Você pode reenviar a confirmação.';return 'Não foi possível concluir. Confira os dados e tente novamente.';}
function lock(){guestActive=false;guestExpiresAt=0;document.body.classList.remove('guest-mode');accountGeneration++;session=null;window.oasisSave=null;saveBlocked=false;reminders=[];subscription=null;soundEnabled=false;sounded.clear();$('.profile strong').textContent='Sua rotina';$('.profile small').textContent='Seu espaço de cuidado';$('.profile .avatar').textContent='O';app.load(emptyState());document.body.classList.add('app-locked');document.body.classList.remove('signed-in');if($('#modal').open)$('#modal').close();$('#modal-body').replaceChildren();}
async function enter(){
  const result=await auth.getSession();if(result.error||!result.data?.user?.emailVerified){authScreen('welcome');return;}
  guestActive=false;document.body.classList.remove('guest-mode');session=result.data;const generation=++accountGeneration;const saved=await api('/api/state');revision=saved.revision;saveBlocked=false;stateDay=localDay();let state=saved.state||emptyState();
  if(saved.day!==localDay())state={...state,water:0,meals:[],habits:[false,false,false,false],exercises:[],workoutStarted:false,workoutDone:false,startedAt:null,finishedAt:null};
  window.oasisSave=(snapshot,message)=>{
    const day=stateDay;pendingSaves++;
    saveQueue=saveQueue.then(async()=>{if(saveBlocked||!session||generation!==accountGeneration)return;setSync('Salvando…');try{const result=await api('/api/state',{method:'PUT',body:JSON.stringify({day,state:snapshot,revision})});if(generation!==accountGeneration)return;revision=result.revision;setSync('Conta verificada');if(message)app.toast(message);}catch(error){if(generation!==accountGeneration)return;saveBlocked=true;setSync('Alterações não salvas');app.toast(`${error.message} Seus dados continuam nesta tela. Use Repetir salvamento na sua conta.`);}}).finally(()=>{pendingSaves--;});
  };
  app.load(state);document.body.classList.remove('app-locked');document.body.classList.add('signed-in');setSync('Conta verificada');
  $('.profile strong').textContent=session.user.name;$('.profile small').textContent='Minha conta e segurança';$('.profile .avatar').textContent=session.user.name.slice(0,1).toUpperCase();
  if('serviceWorker' in navigator){try{const reg=await navigator.serviceWorker.register('/sw.js');subscription=await reg.pushManager.getSubscription();}catch{}}
  app.navigate(location.hash.slice(1)||'hoje');await loadReminders();
  if(!saved.state)app.modal('Bem-vindo à sua Oasis','Seu espaço está vazio. Ajuste suas metas conforme o plano que você segue e comece pelo primeiro registro.',`<button class="primary-button full-width" data-action="settings">Ajustar minhas metas</button><button class="secondary-button full-width" data-action="close">Explorar meu espaço</button>`);
}
function enterGuest(){
  lock();const saved=guest.start(localDay());guestActive=true;guestExpiresAt=saved.expiresAt;stateDay=saved.day;
  document.body.classList.remove('app-locked');document.body.classList.add('guest-mode');
  window.oasisSave=(snapshot,message)=>{if(!guestActive)return;if(!guest.read()){expireGuest();return;}try{guest.save(snapshot,stateDay);setSync(guest.persistent?'Visitante · salvo neste aparelho':'Visitante · somente nesta aba');if(message)app.toast(guest.persistent?message:'O navegador bloqueou o armazenamento. Os dados ficam somente nesta aba.');}catch{app.toast('Não foi possível salvar este registro. Confira os valores informados.');}};
  app.load(saved.state);setSync(guest.persistent?'Visitante · salvo neste aparelho':'Visitante · somente nesta aba');$('.profile strong').textContent='Visitante';$('.profile small').textContent='Dados locais por 24 horas';$('.profile .avatar').textContent='V';app.navigate('hoje');
}
function expireGuest(){guest.clear();lock();authScreen('welcome','As 24 horas da sua sessão de visitante terminaram. Você pode começar de novo ou entrar na sua conta.');}
function checkGuest(){if(!guestActive)return;const value=guest.read();if(!value){expireGuest();return;}if(stateDay!==localDay())enterGuest();}
window.addEventListener('focus',checkGuest);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkGuest();});
setInterval(checkGuest,15000);
function setSync(text){$('.demo-label').textContent=text;}
async function loadReminders(){if(!session)return;try{reminders=(await api('/api/reminders')).reminders;if(app.getView()==='lembretes')app.render();}catch(error){app.toast(error.message);}}
function remindersView(){
  if(guestActive)return `<section class="card"><span class="note-icon">${icon('bell-ring')}</span><h1>Lembretes</h1><p class="muted section-copy">As notificações e os horários ficam na sua conta. Entre para receber lembretes nos seus dispositivos.</p><button class="primary-button" data-oasis="login">Entrar na Oasis</button><p class="inline-note">Como visitante, seus registros de água, alimentação, peso e treino ficam somente neste aparelho por 24 horas.</p></section>`;
  const active=reminders.filter(r=>r.enabled).length;
  return `<div class="welcome"><div><div class="eyebrow"></div><h1>Lembretes</h1><p>Escolha os horários para receber avisos.</p></div><button class="primary-button" data-oasis="new-reminder">${icon('plus')}Novo lembrete</button></div><div class="view-grid"><div class="stack"><section class="card reminder-intro"><span class="note-icon">${icon('bell-ring')}</span><div><h2>${active} lembrete${active===1?'':'s'} ativo${active===1?'':'s'}</h2><p class="muted">Horários no seu fuso, dias no seu ritmo.</p></div></section><section class="card"><div class="card-title"><h2>Meus lembretes</h2><span class="tag">${esc(timezone().replaceAll('_',' '))}</span></div>${reminders.length?reminders.map(r=>`<div class="reminder-row"><span class="reminder-icon ${r.kind}">${icon({agua:'droplet',treino:'dumbbell',refeicao:'utensils',sono:'moon',outro:'bell'}[r.kind])}</span><div class="reminder-info"><h3>${esc(r.title)}</h3><p>${r.days.map(d=>weekdayNames[d]).join(' · ')}</p><small>${esc(r.timezone.replaceAll('_',' '))}</small></div><strong class="reminder-time">${r.time}</strong><button class="switch-button ${r.enabled?'on':''}" role="switch" aria-checked="${r.enabled}" aria-label="${r.enabled?'Pausar':'Ativar'} ${esc(r.title)}" data-oasis="toggle-reminder" data-id="${r.id}"><span></span></button><button class="icon-button" data-oasis="edit-reminder" data-id="${r.id}" aria-label="Editar ${esc(r.title)}">${icon('pencil')}</button></div>`).join(''):'<div class="empty-state"><p>Seus lembretes vão aparecer aqui.</p><button class="secondary-button full-width" data-oasis="new-reminder">Criar meu primeiro lembrete</button></div>'}</section></div><div class="stack"><section class="card notification-card"><span class="note-icon">${icon('smartphone')}</span><h2>Notificações neste celular</h2><p class="muted section-copy">Ative as notificações neste dispositivo para receber lembretes com a página fechada.</p><button class="primary-button full-width" data-oasis="${subscription?'disable-push':'enable-push'}">${icon(subscription?'bell-off':'bell-ring')}${subscription?'Desativar neste dispositivo':'Ativar neste dispositivo'}</button>${subscription?'<button class="secondary-button full-width" data-oasis="test-push">Enviar notificação de teste</button>':''}<p class="inline-note">No iPhone, adicione a Oasis à Tela de Início e abra por esse ícone. A entrega e o som dependem das permissões, conexão e ajustes do celular.</p></section><section class="card"><div class="title-with-icon">${icon('volume-2')}<h2>Alarme com a página aberta</h2></div><p class="muted section-copy">Um sinal sonoro discreto enquanto a Oasis estiver aberta e ativa.</p><button class="secondary-button full-width" data-oasis="test-sound">${icon('play')}${soundEnabled?'Testar som novamente':'Ativar e testar som'}</button>${soundEnabled?'<button class="text-action" data-oasis="disable-sound">Desativar som nesta sessão</button>':''}<p class="inline-note">O site não substitui o despertador do celular e não consegue forçar som no modo silencioso ou Não Perturbe.</p></section></div></div>`;
}
function accountView(){
  if(!session)return `<section class="card"><span class="note-icon">${icon('smartphone')}</span><h1>Acesso de visitante</h1><p class="muted section-copy">${guest.persistent?'Seus registros ficam somente neste navegador, sem envio ao banco da Oasis.':'Este navegador bloqueou o armazenamento. Seus registros ficam somente nesta aba.'}</p><div class="detail-stat"><span>Disponível até</span><strong>${esc(new Date(guestExpiresAt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}))}</strong></div><p class="inline-note">O prazo de 24 horas começa na primeira entrada e não aumenta com o uso. Dados vencidos são apagados ao abrir a Oasis novamente. Neste aparelho, outras pessoas com acesso ao mesmo navegador podem ver os registros.</p><button class="primary-button full-width" data-oasis="login">Entrar ou criar conta</button><p class="inline-note">Os registros de visitante não são transferidos automaticamente para uma conta.</p><button class="secondary-button full-width" data-oasis="leave-guest">Voltar para a tela inicial</button><button class="reset-button" data-oasis="clear-guest">Apagar meus dados deste aparelho</button></section>`;
  return `<div class="welcome"><div><div class="eyebrow">SEU ESPAÇO, SOB SEU CONTROLE</div><h1>Conta e segurança.</h1><p>Cuide do seu acesso e dos seus dispositivos.</p></div></div><div class="view-grid"><div class="stack"><section class="card"><div class="account-identity"><span class="avatar">${esc(session.user.name.slice(0,1).toUpperCase())}</span><div><h2>${esc(session.user.name)}</h2><p class="muted">${esc(session.user.email)}</p></div></div><div class="detail-stat"><span>E-mail confirmado</span><span class="security-status">${icon('circle-check')}Verificado</span></div><div class="detail-stat"><span>Autenticação em duas etapas</span><span class="security-status">${session.user.twoFactorEnabled?'Ativada':'Disponível para ativar'}</span></div><p class="muted section-copy">Use um aplicativo autenticador para exigir um código extra ao entrar, além da sua senha.</p><button class="primary-button full-width" data-oasis="${session.user.twoFactorEnabled?'disable-2fa':'setup-2fa'}">${icon('shield-check')}${session.user.twoFactorEnabled?'Gerenciar autenticação':'Ativar proteção em duas etapas'}</button></section><section class="card"><h2>Dispositivos conectados</h2><p class="muted section-copy">Encerre as outras sessões caso tenha usado um dispositivo compartilhado.</p><button class="secondary-button full-width" data-oasis="revoke-sessions">${icon('monitor-x')}Sair dos outros dispositivos</button><button class="secondary-button full-width" data-oasis="logout">${icon('log-out')}Sair desta conta</button></section></div><div class="stack"><section class="card"><span class="note-icon">${icon('lock-keyhole')}</span><h2>Privacidade</h2><p class="muted section-copy">Seus registros ficam vinculados à sua conta, com verificação de acesso no servidor e criptografia adicional dos dados da rotina.</p><p class="inline-note">As notificações na tela bloqueada mostram uma mensagem genérica, sem seu peso, alimentação ou detalhes pessoais.</p></section>${saveBlocked?'<section class="card"><h2>Há alterações não salvas</h2><p class="muted section-copy">Não feche a página. Tente salvar novamente ou recarregue para buscar a versão do servidor.</p><button class="primary-button full-width" data-oasis="retry-save">Repetir salvamento</button><button class="secondary-button full-width" data-oasis="reload-state">Carregar versão do servidor</button></section>':''}<section class="card"><h2>Seus lembretes</h2><p class="muted section-copy">Escolha quando e onde receber notificações.</p><button class="secondary-button full-width" data-view="lembretes">${icon('bell')}Gerenciar lembretes</button></section></div></div>`;
}
const plans=planViews(app);
function moreView(){return `<div class="simple-heading"><h1>Mais</h1></div>${saveBlocked?'<section class="card simple-account-warning"><h2>Alterações não salvas</h2><p class="simple-caption">Abra Conta e segurança abaixo para tentar salvar novamente.</p></section>':''}<section class="card simple-more-links"><button data-action="settings">${icon('target')}<div><strong>Minhas metas</strong><small>Calorias, água e peso</small></div>${icon('chevron-right')}</button><button data-view="lembretes">${icon('bell')}<div><strong>Lembretes</strong><small>Horários e notificações</small></div>${icon('chevron-right')}</button></section><details class="simple-details simple-more-preferences"><summary>Tema e instalação no celular</summary>${window.OasisPreferences?.panel()||''}</details>${app.getState().personalPlan?`<details class="simple-details"><summary>Meus dados e objetivo</summary>${plans.profile()}</details>`:''}<details class="simple-details" ${saveBlocked?'open':''}><summary>${session?'Conta e segurança':'Acesso de visitante'}</summary><div class="simple-account-content">${accountView()}</div></details>`;}
window.OasisUI={openMeal:foodDiary.open,trainingPlan:plans.training,workoutPlan:plans.workout,nutritionPlan:plans.nutrition,profilePlan:plans.profile,reminders:remindersView,account:moreView,onNavigate(view){if(view==='lembretes')void loadReminders();}};
function reminderModal(id){
  if(!session){app.toast('Entre com sua conta para salvar lembretes.');return;}
  const r=reminders.find(r=>r.id===id)||{title:'',time:'09:00',days:[1,2,3,4,5],timezone:timezone(),kind:'agua',enabled:true};
  app.modal(id?'Editar lembrete':'Novo lembrete','Escolha o horário e os dias da semana.',`<form data-oasis-form="reminder" data-id="${id||''}">${app.field('Nome do lembrete','title',r.title,'required maxlength="80" placeholder="Ex.: Fazer uma pausa para beber água"','text')}<div class="form-grid"><label class="field">Tipo<select name="kind">${[['agua','Água'],['treino','Treino'],['refeicao','Refeição'],['sono','Sono'],['outro','Outro']].map(([k,v])=>`<option value="${k}" ${r.kind===k?'selected':''}>${v}</option>`).join('')}</select></label>${app.field('Horário','time',r.time,'required','time')}</div><fieldset class="day-picker"><legend>Repetir nos dias</legend>${weekdayNames.map((d,i)=>`<label><input type="checkbox" name="days" value="${i}" ${r.days.includes(i)?'checked':''}><span>${d}</span></label>`).join('')}</fieldset>${app.field('Fuso horário','timezone',r.timezone,'required list="timezones" maxlength="80"','text')}<datalist id="timezones"><option>America/Sao_Paulo</option><option>America/Manaus</option><option>America/Recife</option><option>America/Rio_Branco</option><option>Europe/Lisbon</option></datalist><p id="reminder-error" class="form-error" role="alert"></p><div class="modal-actions"><button type="button" class="secondary-button" data-action="close">Cancelar</button><button class="primary-button" type="submit">Salvar lembrete</button></div></form>${id?`<button class="reset-button" data-oasis="delete-reminder" data-id="${id}">Excluir este lembrete</button>`:''}`);
}
function bytes(value){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
async function enablePush(){
  if(!session)throw new Error('Entre na sua conta para ativar notificações.');
  if(!status.pushEnabled)throw new Error('As notificações estão sendo configuradas.');
  if(!('Notification' in window)||!('serviceWorker' in navigator)||!('PushManager' in window))throw new Error('Este navegador não oferece notificações. No iPhone, abra a Oasis pela Tela de Início.');
  const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Notificações não autorizadas. Você pode alterar a permissão nos ajustes do navegador.');
  const registration=await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;
  let sub=await registration.pushManager.getSubscription();if(!sub)sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(status.vapidPublicKey)});
  try{await api('/api/push/subscription',{method:'POST',body:JSON.stringify(sub.toJSON())});subscription=sub;}catch(error){await sub.unsubscribe();throw error;}
  app.render();app.toast('Notificações ativadas neste dispositivo.');
}
async function disablePush(){if(subscription){await api('/api/push/subscription',{method:'DELETE',body:JSON.stringify({endpoint:subscription.endpoint})});await subscription.unsubscribe();subscription=null;}app.render();}
function playSound(){if(!audioContext)audioContext=new AudioContext();void audioContext.resume();for(let i=0;i<3;i++){const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),at=audioContext.currentTime+i*.3;oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.frequency.value=i===1?784:659;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.12,at+.03);gain.gain.exponentialRampToValueAtTime(.001,at+.22);oscillator.start(at);oscillator.stop(at+.24);}}
function passwordModal(action){app.modal(action==='setup-2fa'?'Ative sua proteção extra':'Confirme sua identidade','Informe sua senha para alterar a proteção da conta.',`<form data-oasis-form="${action}">${authField('Senha atual','password','password','autocomplete="current-password" maxlength="128"')}<p class="form-error" id="security-error" role="alert"></p><button class="primary-button full-width" type="submit">Continuar</button></form>`);}

document.addEventListener('submit',async event=>{
  const form=event.target;if(form.id!=='auth-form'&&!form.dataset.oasisForm)return;event.preventDefault();if(formBusy||!form.reportValidity())return;formBusy=true;
  const submit=form.querySelector('[type=submit]');submit.disabled=true;const data=new FormData(form);
  try{
    if(form.id==='auth-form'){
      const headers=captchaHeaders(),email=String(data.get('email')||pendingEmail).trim(),password=String(data.get('password')||'');pendingEmail=email;
      let result;
      if(mode==='signup'&&password!==String(data.get('confirmPassword')||''))throw new Error('As senhas precisam ser iguais.');
      if(mode==='login')result=await auth.signIn.email({email,password,rememberMe:false,fetchOptions:{headers}});
      else if(mode==='signup')result=await auth.signUp.email({name:String(data.get('name')).trim(),email,password,callbackURL:location.origin+'/',fetchOptions:{headers}});
      else if(mode==='verify')result=await auth.sendVerificationEmail({email,callbackURL:location.origin+'/',fetchOptions:{headers}});
      else if(mode==='forgot')result=await auth.requestPasswordReset({email,redirectTo:location.origin+'/?flow=reset',fetchOptions:{headers}});
      else if(mode==='reset')result=await auth.resetPassword({newPassword:password,token:new URLSearchParams(location.search).get('token')||''});
      else if(mode==='totp')result=await auth.twoFactor.verifyTotp({code:String(data.get('code')),trustDevice:false});
      else if(mode==='backup')result=await auth.twoFactor.verifyBackupCode({code:String(data.get('code')),trustDevice:false});
      if(result.error){if(result.error.code==='EMAIL_NOT_VERIFIED'){authScreen('verify','Confirme seu e-mail para continuar.');return;}throw new Error(authError(result.error));}
      if(mode==='signup'||mode==='verify')authScreen('verify','Solicitação recebida. Se o cadastro puder ser confirmado, o e-mail chegará em instantes. Confira também o spam.');
      else if(mode==='forgot')authScreen('login','Se houver uma conta com esse e-mail, você receberá as instruções.');
      else if(mode==='reset'){history.replaceState(null,'','/');authScreen('login','Senha redefinida. Entre novamente.');}
      else if(result.data?.twoFactorRedirect)authScreen('totp');else await enter();
    }else if(form.dataset.oasisForm==='reminder'){
      const days=data.getAll('days').map(Number);if(!days.length)throw new Error('Escolha pelo menos um dia.');
      const id=form.dataset.id;const old=reminders.find(r=>r.id===id);
      await api(id?`/api/reminders/${id}`:'/api/reminders',{method:id?'PUT':'POST',body:JSON.stringify({title:String(data.get('title')).trim(),kind:data.get('kind'),time:data.get('time'),days,timezone:data.get('timezone'),enabled:old?.enabled??true})});
      $('#modal').close();await loadReminders();app.toast('Lembrete salvo na sua conta.');
    }else if(form.dataset.oasisForm==='setup-2fa'){
      const result=await auth.twoFactor.enable({password:String(data.get('password')),method:'totp',issuer:'Oasis'});if(result.error)throw new Error(authError(result.error));
      const qr=await QRCode.toDataURL(result.data.totpURI,{width:220,margin:2});
      app.modal('Conecte seu autenticador','Escaneie o QR code e guarde os códigos de recuperação em um lugar seguro.',`<img class="totp-qr" src="${qr}" alt="QR code para configurar a autenticação Oasis"><details><summary>Não consigo escanear</summary><code class="totp-secret">${esc(new URL(result.data.totpURI).searchParams.get('secret'))}</code></details><div class="backup-codes">${result.data.backupCodes.map(c=>`<code>${esc(c)}</code>`).join('')}</div><p class="field-help">Os códigos de recuperação dão acesso à sua conta. Não os compartilhe.</p><form data-oasis-form="confirm-2fa">${authField('Código do autenticador','code','text','inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code" maxlength="6"')}<p class="form-error" id="security-error" role="alert"></p><button class="primary-button full-width" type="submit">Verificar e ativar</button></form>`);
    }else if(form.dataset.oasisForm==='confirm-2fa'){
      const result=await auth.twoFactor.verifyTotp({code:String(data.get('code')),trustDevice:false});if(result.error)throw new Error(authError(result.error));$('#modal').close();$('#modal-body').replaceChildren();session=(await auth.getSession()).data;app.render();app.toast('Proteção em duas etapas ativada.');
    }else if(form.dataset.oasisForm==='disable-2fa'){
      const result=await auth.twoFactor.disable({password:String(data.get('password'))});if(result.error)throw new Error(authError(result.error));$('#modal').close();session=(await auth.getSession()).data;app.render();app.toast('Proteção em duas etapas desativada.');
    }
  }catch(error){const el=form.id==='auth-form'?$('#auth-error'):$('#reminder-error')||$('#security-error');if(el)el.textContent=error.message;else app.toast(error.message);if(turnstileWidget!==null&&window.turnstile)window.turnstile.reset(turnstileWidget);}
  finally{formBusy=false;if(submit.isConnected)submit.disabled=false;}
});

document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-oasis]');if(!button||button.disabled)return;const action=button.dataset.oasis;
  try{
    if(['welcome','login','signup','verify','forgot','backup'].includes(action)){authScreen(action);return;}
    if(action==='guest'||action==='demo'){enterGuest();return;}
    if(action==='leave-guest'){lock();authScreen('welcome');return;}
    if(action==='clear-guest'){app.modal('Apagar os registros de visitante?','Água, alimentação, peso e treino deste visitante serão apagados deste aparelho.',`<div class="modal-actions"><button class="secondary-button" data-action="close">Cancelar</button><button class="primary-button" data-oasis="confirm-clear-guest">Apagar registros</button></div>`);return;}
    if(action==='confirm-clear-guest'){guest.clear();lock();authScreen('welcome','Seus registros locais foram apagados.');return;}
    if(action==='google'){if(!status.googleEnabled)throw new Error('O login com Google ainda está sendo ativado. Você pode continuar como visitante.');button.disabled=true;const result=await auth.signIn.social({provider:'google',callbackURL:location.origin+'/',errorCallbackURL:location.origin+'/?flow=google-error'});if(result.error)throw new Error(authError(result.error));return;}
    if(action==='new-reminder'||action==='edit-reminder'){reminderModal(button.dataset.id);return;}
    if(action==='toggle-reminder'){const r=reminders.find(r=>r.id===button.dataset.id);const {id,nextAt,...data}=r;await api(`/api/reminders/${id}`,{method:'PUT',body:JSON.stringify({...data,enabled:!data.enabled})});await loadReminders();return;}
    if(action==='delete-reminder'){const id=button.dataset.id;app.modal('Excluir este lembrete?','Você pode criar outro lembrete quando quiser.',`<div class="modal-actions"><button class="secondary-button" data-action="close">Cancelar</button><button class="primary-button" data-oasis="confirm-delete-reminder" data-id="${id}">Excluir lembrete</button></div>`);return;}
    if(action==='confirm-delete-reminder'){await api(`/api/reminders/${button.dataset.id}`,{method:'DELETE'});$('#modal').close();await loadReminders();return;}
    if(action==='enable-push'){button.disabled=true;await enablePush();return;}
    if(action==='disable-push'){await disablePush();app.toast('Notificações desativadas neste dispositivo.');return;}
    if(action==='test-push'){await api('/api/push/test',{method:'POST',body:JSON.stringify({endpoint:subscription?.endpoint})});app.toast('Teste enviado. Confira as notificações do dispositivo.');return;}
    if(action==='test-sound'){playSound();soundEnabled=true;app.render();return;}
    if(action==='disable-sound'){soundEnabled=false;app.render();return;}
    if(action==='setup-2fa'||action==='disable-2fa'){passwordModal(action);return;}
    if(action==='revoke-sessions'){const result=await auth.revokeOtherSessions();if(result.error)throw new Error(authError(result.error));app.toast('As outras sessões foram encerradas.');return;}
    if(action==='logout'){await saveQueue;if(saveBlocked)throw new Error('Salve as alterações pendentes antes de sair ou carregue a versão do servidor.');if(subscription)await disablePush();const result=await auth.signOut();if(result.error)throw new Error(authError(result.error));lock();authScreen('login','Você saiu da sua conta.');return;}
    if(action==='retry-save'){saveBlocked=false;window.oasisSave(app.getState(),'Registros salvos.');return;}
    if(action==='reload-state'){app.modal('Carregar os registros do servidor?','As alterações ainda não salvas nesta tela serão descartadas.',`<div class="modal-actions"><button class="secondary-button" data-action="close">Cancelar</button><button class="primary-button" data-oasis="confirm-reload">Carregar registros</button></div>`);return;}
    if(action==='confirm-reload'){$('#modal').close();await enter();}
  }catch(error){const feedback=$('#google-feedback');if(action==='google'&&feedback)feedback.textContent=error.message;else app.toast(error.message);}finally{if(button.isConnected)button.disabled=false;}
});
const sounded=new Set();
setInterval(()=>{if(!session||!soundEnabled||document.visibilityState!=='visible')return;const now=Date.now();for(const r of reminders){if(!r.enabled||now<r.nextAt||now-r.nextAt>90000||sounded.has(`${r.id}:${r.nextAt}`))continue;sounded.add(`${r.id}:${r.nextAt}`);playSound();app.toast('Você tem um cuidado agendado. Confira seus lembretes.');void loadReminders();}},15000);
window.addEventListener('beforeunload',event=>{if((saveBlocked||pendingSaves>0)&&session){event.preventDefault();event.returnValue='';}});
setInterval(()=>{if(session&&stateDay!==localDay()&&!pendingSaves&&!saveBlocked)void enter();},30000);
$('#modal').addEventListener('close',()=>{if($('#modal-body').querySelector('.totp-qr'))$('#modal-body').replaceChildren();});
async function boot(){guest.read();try{status=await api('/api/status');const params=new URLSearchParams(location.search);if(params.get('flow')==='google-error'){history.replaceState(null,'','/');authScreen('login','O acesso com Google não foi concluído. Tente novamente ou use outra forma de entrada.');return;}if(params.get('flow')==='reset'){authScreen('reset',params.get('error')?'Este link está inválido ou expirou. Solicite outro.':'');return;}await enter();if(!session&&guest.read())enterGuest();}catch{configError=true;authScreen('welcome');}}
void boot().then(()=>window.OasisStartup.finish()).catch(()=>window.OasisStartup.fail());
