(() => {
  const splash = document.getElementById('splash-screen');
  const content = document.getElementById('auth-content');
  const started = Date.now();
  let complete = false;
  splash.hidden = false;

  function fail() {
    if (complete) return;
    complete = true;
    clearTimeout(deadline);
    splash.hidden = true;
    document.body.classList.add('app-locked');
    content.innerHTML = '<div class="entry-welcome-brand"><img class="entry-logo" src="/logo-oasis.png" alt="Oasis"><span class="entry-wordmark">oasis</span></div><div class="entry-welcome-bottom"><h1>Vamos tentar de novo?</h1><p class="entry-description">Não foi possível abrir sua Oasis. Confira sua conexão e tente novamente. Seus registros salvos continuam guardados.</p><a class="primary-button full-width" href="/">Tentar novamente</a></div>';
  }
  const deadline = setTimeout(fail, 20000);
  window.OasisStartup = {
    fail,
    finish() {
      if (complete) return;
      complete = true;
      clearTimeout(deadline);
      if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => {});
      setTimeout(() => {
        splash.classList.add('leaving');
        setTimeout(() => { splash.hidden = true; }, 250);
      }, Math.max(0, 850 - (Date.now() - started)));
    },
  };
  function script(src, module = false) {
    return new Promise((resolve, reject) => {
      const element = document.createElement('script');
      if (module) element.type = 'module';
      element.src = src;
      element.onload = resolve;
      element.onerror = reject;
      document.head.append(element);
    });
  }
  // The account module consumes OasisApp, so it must start after app.js executes.
  void script('/lucide.min.js').then(() => window.lucide?.createIcons()).catch(() => {});
  void script('/app.js?v=20260911-8')
    .then(() => {
      if (!window.OasisApp) throw new Error('Application did not initialize');
      return script('/account.js?v=20260911-8', true);
    })
    .catch(fail);
})();
