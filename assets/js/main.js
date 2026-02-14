// Panorama Municipal - main.js (login + bootstrap) - SAFE
// Deve ser carregado com: <script type="module" src="assets/js/main.js"></script>

function $(id){ return document.getElementById(id); }

function setAuthed(){
  try{ sessionStorage.setItem('pm_auth','1'); }catch(_e){}
  document.documentElement.classList.add('auth-ok');
}

function clearAuthed(){
  try{ sessionStorage.removeItem('pm_auth'); }catch(_e){}
  document.documentElement.classList.remove('auth-ok');
}

function isAuthed(){
  try{ return sessionStorage.getItem('pm_auth') === '1'; }catch(_e){ return false; }
}

async function startApp(setError){
  try{
    const mod = await import('./app/init.js');
    if(typeof mod.initApp !== 'function') throw new Error('initApp() não encontrado em ./app/init.js');
    mod.initApp();
  }catch(err){
    console.error('[Panorama Municipal] Falha ao iniciar app:', err);
    setError?.('Falha ao iniciar o painel. Abra o Console (F12) para ver o erro.');
    clearAuthed();
    throw err;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const user = $('loginUser');
  const pass = $('loginPass');
  const err  = $('loginError');
  const btn  = $('btnLogin');

  const setError = (msg='') => { if(err) err.textContent = msg; };

  // Se não existir tela de login no HTML, inicia direto
  if(!user || !pass || !btn){
    setAuthed();
    startApp(setError);
    return;
  }

  // Se já está autenticado, entra direto
  if(isAuthed()){
    document.documentElement.classList.add('auth-ok');
    startApp(setError);
    return;
  }

  const attempt = async () => {
    const u = String(user.value || '').trim();
    const p = String(pass.value || '').trim();

    // admin/admin ou qualquer par não vazio
    const ok = (u === 'admin' && p === 'admin') || (u.length > 0 && p.length > 0);
    if(!ok){
      setError('Usuário ou senha inválidos.');
      return;
    }

    setError('');
    setAuthed();
    await startApp(setError);
  };

  btn.addEventListener('click', (ev) => { ev.preventDefault(); attempt(); });
  pass.addEventListener('keydown', (ev) => { if(ev.key === 'Enter') attempt(); });
  user.addEventListener('keydown', (ev) => { if(ev.key === 'Enter') attempt(); });
});
