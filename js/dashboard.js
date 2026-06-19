// =====================================================
// Dashboard - Portal de Clientes IM Servicios Contables
// =====================================================

const nombreUsuarioEl = document.getElementById('nombreUsuario');
const rolUsuarioEl = document.getElementById('rolUsuario');
const estadoCargaEl = document.getElementById('estadoCarga');
const clientesGridEl = document.getElementById('clientesGrid');

// Un rol "es admin" si empieza con "admin", sin distinguir mayúsculas.
// Esto cubre tanto "admin" como "administración" (o cualquier variante)
// sin depender de que el texto exacto en la base de datos coincida.
function esAdmin(rol) {
  return typeof rol === 'string' && rol.trim().toLowerCase().startsWith('admin');
}

function crearTarjetaCliente(cliente) {
  const card = document.createElement('div');
  card.className = 'cliente-card';

  const nombre = document.createElement('h3');
  nombre.textContent = cliente.nombre || 'Sin nombre';

  const rfc = document.createElement('p');
  rfc.className = 'cliente-rfc';
  rfc.textContent = cliente.rfc ? `RFC: ${cliente.rfc}` : '';

  const boton = document.createElement('button');
  boton.textContent = 'Ver detalle';
  boton.addEventListener('click', () => {
    window.location.href = `declaraciones.html?cliente_id=${encodeURIComponent(cliente.id)}`;
  });

  card.append(nombre, rfc, boton);
  return card;
}

function mostrarError(texto) {
  estadoCargaEl.textContent = texto;
  estadoCargaEl.classList.add('estado-error');
}

async function cargarDashboard() {
  // 1. Confirmar que hay una sesión activa
  const { data: sesionData } = await supabaseClient.auth.getSession();
  const session = sesionData.session;

  if (!session) {
    window.location.href = 'index.html';
    return;
  }

  const authUserId = session.user.id;

  // 2. Buscar el registro en "usuarios" vinculado a este auth_user_id
  const { data: usuario, error: errorUsuario } = await supabaseClient
    .from('usuarios')
    .select('id, email, rol')
    .eq('auth_user_id', authUserId)
    .single();

  if (errorUsuario || !usuario) {
    mostrarError('No se encontró tu cuenta en el sistema. Contacta al administrador.');
    return;
  }

  nombreUsuarioEl.textContent = usuario.email;
  rolUsuarioEl.textContent = usuario.rol;

  // 3. Obtener los clientes que le corresponden según su rol
  let clientes = [];

  if (esAdmin(usuario.rol)) {
    const { data, error } = await supabaseClient
      .from('clientes')
      .select('id, nombre, rfc')
      .eq('activo', true)
      .order('nombre');

    if (error) {
      mostrarError('No se pudieron cargar los clientes.');
      return;
    }
    clientes = data;
  } else {
    const { data, error } = await supabaseClient
      .from('vw_usuarios_clientes')
      .select('cliente_id, cliente_nombre')
      .eq('usuario_id', usuario.id);

    if (error) {
      mostrarError('No se pudieron cargar tus clientes asignados.');
      return;
    }
    clientes = (data || [])
      .filter(c => c.cliente_id !== null)
      .map(c => ({ id: c.cliente_id, nombre: c.cliente_nombre, rfc: null }));
  }

  // 4. Mostrar resultado
  estadoCargaEl.style.display = 'none';

  if (clientes.length === 0) {
    clientesGridEl.innerHTML = '';
    const vacio = document.createElement('p');
    vacio.className = 'estado-vacio';
    vacio.textContent = 'No tienes clientes asignados todavía.';
    clientesGridEl.appendChild(vacio);
    return;
  }

  clientesGridEl.innerHTML = '';
  clientes.forEach(c => clientesGridEl.appendChild(crearTarjetaCliente(c)));
}

document.getElementById('btnCerrarSesion').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});

cargarDashboard();
