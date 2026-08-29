// Avisos - Portal de Clientes IM Servicios Contables
// =====================================================
// No existe todavía una tabla de notificaciones en Supabase.
// Esta página solo verifica sesión, muestra los datos del
// usuario y presenta el estado vacío. Cuando exista la tabla
// real, aquí se agregará la consulta correspondiente.
// =====================================================

const nombreUsuarioEl   = document.getElementById('nombreUsuario');
const rolUsuarioEl      = document.getElementById('rolUsuario');
const avatarUsuarioEl   = document.getElementById('avatarUsuario');
const dashboardShellEl  = document.getElementById('dashboardShell');
const sidebarOverlayEl  = document.getElementById('sidebarOverlay');
const btnMenuMovilEl    = document.getElementById('btnMenuMovil');
const btnCerrarSesionEl = document.getElementById('btnCerrarSesion');
const estadoCargaEl     = document.getElementById('estadoCarga');
const avisosVacioEl     = document.getElementById('avisosVacio');

function generarIniciales(correo) {
  if (!correo || !correo.includes('@')) return '··';
  const partes = correo.split('@')[0].split(/[.\-_]+/).filter(Boolean);
  return partes.length >= 2 ? (partes[0][0] + partes[1][0]).toUpperCase() : correo.slice(0, 2).toUpperCase();
}

async function inicializar() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return;
  }

  const { data: usuario, error } = await supabaseClient
    .from('usuarios')
    .select('id, email, rol')
    .eq('auth_user_id', session.user.id)
    .single();

  estadoCargaEl.style.display = 'none';

  if (error || !usuario) {
    avisosVacioEl.style.display = 'block';
    return;
  }

  nombreUsuarioEl.textContent = usuario.email;
  rolUsuarioEl.textContent    = usuario.rol;
  if (avatarUsuarioEl) avatarUsuarioEl.textContent = generarIniciales(usuario.email);

  const esAdministrador = typeof usuario.rol === 'string' && usuario.rol.trim().toLowerCase() === 'admin';
  if (dashboardShellEl) dashboardShellEl.classList.toggle('es-admin', esAdministrador);

  // Sin tabla de notificaciones aún: se muestra el estado vacío.
  avisosVacioEl.style.display = 'block';
}

async function cerrarSesion() {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
}

if (btnCerrarSesionEl) btnCerrarSesionEl.addEventListener('click', cerrarSesion);
if (btnMenuMovilEl)    btnMenuMovilEl.addEventListener('click', () => dashboardShellEl.classList.toggle('menu-abierto'));
if (sidebarOverlayEl)  sidebarOverlayEl.addEventListener('click', () => dashboardShellEl.classList.remove('menu-abierto'));

inicializar();
