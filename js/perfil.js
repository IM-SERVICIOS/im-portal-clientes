// Perfil - Portal de Clientes IM Servicios Contables
// =====================================================
// Muestra los datos de acceso del usuario (usuarios: id, email, rol)
// y los datos fiscales del/los cliente(s) asociados.
//
// Admin: consulta directo la tabla "clientes" (nombre, rfc, telefono,
// correo, regimen_fiscal, activo).
//
// No-admin: usa "vw_usuarios_clientes" (usuario_id -> cliente_id),
// igual que dashboard.js. Se intenta primero con las columnas
// cliente_telefono/cliente_correo/cliente_regimen_fiscal; si la vista
// todavía no las tiene, se hace un segundo intento solo con las
// columnas confirmadas (cliente_nombre, cliente_rfc, cliente_activo)
// para no romper la página.
// =====================================================

const nombreUsuarioEl       = document.getElementById('nombreUsuario');
const rolUsuarioEl          = document.getElementById('rolUsuario');
const avatarUsuarioEl       = document.getElementById('avatarUsuario');
const dashboardShellEl      = document.getElementById('dashboardShell');
const sidebarOverlayEl      = document.getElementById('sidebarOverlay');
const btnMenuMovilEl        = document.getElementById('btnMenuMovil');
const btnCerrarSesionEl     = document.getElementById('btnCerrarSesion');
const btnCerrarSesionPerfilEl = document.getElementById('btnCerrarSesionPerfil');

const estadoCargaEl         = document.getElementById('estadoCarga');
const perfilCuerpoEl        = document.getElementById('perfilCuerpo');

const perfilCorreoUsuarioEl = document.getElementById('perfilCorreoUsuario');
const perfilRolUsuarioEl    = document.getElementById('perfilRolUsuario');

const selectorClienteWrapEl = document.getElementById('selectorClienteWrap');
const selectorClienteEl     = document.getElementById('selectorClientePerfil');
const perfilFiscalVacioEl   = document.getElementById('perfilFiscalVacio');
const perfilFiscalDatosEl   = document.getElementById('perfilFiscalDatos');

const perfilNombreEl   = document.getElementById('perfilNombre');
const perfilRfcEl      = document.getElementById('perfilRfc');
const perfilCorreoEl   = document.getElementById('perfilCorreo');
const perfilTelefonoEl = document.getElementById('perfilTelefono');
const perfilRegimenEl  = document.getElementById('perfilRegimen');
const perfilEstatusEl  = document.getElementById('perfilEstatus');

let listaClientesFiscal = [];

function generarIniciales(correo) {
  if (typeof correo !== 'string' || !correo.includes('@')) return '··';
  const usuario = correo.split('@')[0];
  const partes = usuario.split(/[.\-_]+/).filter(Boolean);
  return partes.length >= 2 ? (partes[0][0] + partes[1][0]).toUpperCase() : usuario.slice(0, 2).toUpperCase();
}

function esAdmin(rol) {
  return typeof rol === 'string' && rol.trim().toLowerCase().startsWith('admin');
}

function valorOGuion(valor) {
  return (valor === null || valor === undefined || valor === '') ? 'No disponible' : valor;
}

function pintarClienteFiscal(cliente) {
  perfilNombreEl.textContent   = valorOGuion(cliente.nombre);
  perfilRfcEl.textContent      = valorOGuion(cliente.rfc);
  perfilCorreoEl.textContent   = valorOGuion(cliente.correo);
  perfilTelefonoEl.textContent = valorOGuion(cliente.telefono);
  perfilRegimenEl.textContent  = valorOGuion(cliente.regimen_fiscal);
  perfilEstatusEl.textContent  = cliente.activo === false ? 'Inactivo' : 'Activo';
}

function poblarSelectorClientes(clientes) {
  selectorClienteEl.innerHTML = clientes
    .map((c, i) => `<option value="${i}">${c.nombre || 'Sin nombre'}</option>`)
    .join('');
  selectorClienteWrapEl.style.display = clientes.length > 1 ? 'flex' : 'none';
}

selectorClienteEl.addEventListener('change', () => {
  const cliente = listaClientesFiscal[Number(selectorClienteEl.value)];
  if (cliente) pintarClienteFiscal(cliente);
});

async function cargarClientesFiscalesAdmin() {
  const { data, error } = await supabaseClient
    .from('clientes')
    .select('id, nombre, rfc, telefono, correo, regimen_fiscal, activo')
    .eq('activo', true)
    .order('nombre');

  if (error) {
    console.error('Error cargando clientes (admin) en Perfil:', error);
    return [];
  }
  return data || [];
}

async function cargarClientesFiscalesUsuario(usuarioId) {
  // Intento ampliado: incluye teléfono, correo y régimen fiscal si la
  // vista ya los expone.
  let { data, error } = await supabaseClient
    .from('vw_usuarios_clientes')
    .select('cliente_id, cliente_nombre, cliente_rfc, cliente_telefono, cliente_correo, cliente_regimen_fiscal, cliente_activo')
    .eq('usuario_id', usuarioId);

  if (error) {
    // Respaldo: solo las columnas ya confirmadas en la vista.
    const basica = await supabaseClient
      .from('vw_usuarios_clientes')
      .select('cliente_id, cliente_nombre, cliente_rfc, cliente_activo')
      .eq('usuario_id', usuarioId);
    data = basica.data;
    error = basica.error;
  }

  if (error) {
    console.error('Error cargando clientes asociados en Perfil:', error);
    return [];
  }

  return (data || [])
    .filter(c => c.cliente_id !== null)
    .map(c => ({
      id: c.cliente_id,
      nombre: c.cliente_nombre,
      rfc: c.cliente_rfc || null,
      telefono: c.cliente_telefono || null,
      correo: c.cliente_correo || null,
      regimen_fiscal: c.cliente_regimen_fiscal || null,
      activo: c.cliente_activo,
    }));
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
    estadoCargaEl.style.display = 'block';
    estadoCargaEl.textContent = 'No se pudo cargar tu perfil. Contacta a un administrador.';
    return;
  }

  perfilCuerpoEl.style.display = 'block';

  // Mi cuenta
  nombreUsuarioEl.textContent = usuario.email;
  rolUsuarioEl.textContent    = usuario.rol;
  perfilCorreoUsuarioEl.textContent = usuario.email;
  perfilRolUsuarioEl.textContent    = usuario.rol;
  if (avatarUsuarioEl) avatarUsuarioEl.textContent = generarIniciales(usuario.email);

  const usuarioEsAdmin = esAdmin(usuario.rol);
  if (dashboardShellEl) dashboardShellEl.classList.toggle('es-admin', usuarioEsAdmin);

  // Datos fiscales
  listaClientesFiscal = usuarioEsAdmin
    ? await cargarClientesFiscalesAdmin()
    : await cargarClientesFiscalesUsuario(usuario.id);

  if (listaClientesFiscal.length === 0) {
    perfilFiscalVacioEl.style.display = 'block';
    perfilFiscalDatosEl.style.display = 'none';
    return;
  }

  perfilFiscalVacioEl.style.display = 'none';
  perfilFiscalDatosEl.style.display = 'grid';
  poblarSelectorClientes(listaClientesFiscal);
  pintarClienteFiscal(listaClientesFiscal[0]);
}

async function cerrarSesion() {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
}

if (btnCerrarSesionEl)       btnCerrarSesionEl.addEventListener('click', cerrarSesion);
if (btnCerrarSesionPerfilEl) btnCerrarSesionPerfilEl.addEventListener('click', cerrarSesion);
if (btnMenuMovilEl)          btnMenuMovilEl.addEventListener('click', () => dashboardShellEl.classList.toggle('menu-abierto'));
if (sidebarOverlayEl)        sidebarOverlayEl.addEventListener('click', () => dashboardShellEl.classList.remove('menu-abierto'));

inicializar();
