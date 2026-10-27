(() => {
  const key = 'oasis-theme';
  const valid = value => ['light', 'dark', 'automatic'].includes(value);
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = 'automatic', installPrompt = null;
  try { const saved = localStorage.getItem(key); if (valid(saved)) preference = saved; } catch {}
  const installed = () => navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  function apply() {
    const theme = preference === 'automatic' ? (system.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101b17' : '#f5f7f5');
    document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', theme === 'dark' ? 'black-translucent' : 'default');
    document.querySelectorAll('[name="oasis-theme"]').forEach(input => { input.checked = input.value === preference; });
  }
  function select(value) {
    if (!valid(value)) return;
    preference = value;
    try { localStorage.setItem(key, value); } catch { window.OasisApp?.toast('O navegador não permitiu salvar o tema. A escolha vale para esta sessão.'); }
    apply();
  }
  if (system.addEventListener) system.addEventListener('change', apply);
  else system.addListener(apply);
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    preference = valid(event.newValue) ? event.newValue : 'automatic'; apply();
  });
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
  window.addEventListener('appinstalled', () => { installPrompt = null; window.OasisApp?.toast('Oasis adicionada aos seus aplicativos.'); });
  document.addEventListener('change', event => { if (event.target.name === 'oasis-theme') select(event.target.value); });
  const icon = name => window.OasisApp?.icon(name) || '';
  function panel() {
    return `<section class="preferences-card"><div class="preferences-title">${icon('palette')}<div><h2>Aparência</h2><p>Escolha como sua Oasis combina com você.</p></div></div><fieldset class="theme-picker"><legend class="visually-hidden">Tema da Oasis</legend>${[['light','Light','sun','Claro'],['dark','Dark','moon','Escuro'],['automatic','Automatic','smartphone','Do dispositivo']].map(([value,label,symbol,description])=>`<label class="theme-option"><input type="radio" name="oasis-theme" value="${value}" ${preference===value?'checked':''}><span class="theme-option-face">${icon(symbol)}<strong>${label}</strong><small>${description}</small></span></label>`).join('')}</fieldset><p class="preference-note">Automatic acompanha as mudanças de tema do dispositivo. Sua escolha fica salva neste aparelho.</p><div class="install-row"><span class="install-symbol">${icon('smartphone')}</span><div><h3>Oasis no seu celular</h3><p>${installed()?'Você está usando a versão instalada.':'Um ícone na Tela de Início. Sem custo.'}</p></div><button type="button" class="secondary-button" data-oasis-install>${installed()?'Ver dicas':'Instalar'}</button></div></section>`;
  }
  function installation() {
    window.OasisApp?.modal('Sua Oasis, sempre à mão','Instale gratuitamente pela Tela de Início do seu celular.',`<div class="install-guide"><span class="install-app-icon"><img src="/logo-oasis.png" alt="Oasis"></span><h3>No iPhone ou iPad</h3><ol><li>Abra o endereço desta instalação no Safari.</li><li>Toque em <strong>Compartilhar</strong> ${icon('share')} e em <strong>Adicionar à Tela de Início</strong>.</li><li>Se aparecer, mantenha <strong>Abrir como App</strong> ativado. Toque em <strong>Adicionar</strong>.</li></ol><p>Depois, abra a Oasis pelo novo ícone. Não precisa instalar o TestFlight.</p><details><summary>No Android</summary><p>No Chrome, abra o menu e escolha <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</p></details><p class="inline-note">A abertura e os recursos de conta precisam de internet. Entre na mesma conta para acessar sua rotina. Os registros de visitante ficam no navegador ou aplicativo onde foram criados e não migram automaticamente.</p><p class="inline-note">Para receber lembretes no iPhone, use iOS 16.4 ou posterior, abra pelo ícone instalado e ative as notificações em Lembretes.</p></div>`);
  }
  document.addEventListener('click', async event => {
    if (event.target.closest('[data-oasis-preferences]')) window.OasisApp?.modal('Do seu jeito','Aparência e instalação da Oasis.',panel());
    if (!event.target.closest('[data-oasis-install]')) return;
    if (installPrompt && !installed()) {
      const prompt = installPrompt; installPrompt = null;
      try { await prompt.prompt(); await prompt.userChoice; } catch { installation(); }
    } else installation();
  });
  window.OasisPreferences = {panel,select,get value(){return preference;}};
  apply();
})();
