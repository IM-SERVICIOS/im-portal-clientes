// =====================================================
// Dashboard - Portal de Clientes IM Servicios Contables
// =====================================================

const nombreUsuarioEl = document.getElementById('nombreUsuario');
const rolUsuarioEl = document.getElementById('rolUsuario');
const estadoCargaEl = document.getElementById('estadoCarga');
const clientesGridEl = document.getElementById('clientesGrid');

// Elementos del panel "Resumen de tu operación"
const kpiClientesActivosEl = document.getElementById('kpiClientesActivos');
const kpiDeclaracionesEl = document.getElementById('kpiDeclaraciones');
const kpiHonorariosEl = document.getElementById('kpiHonorarios');
const kpiPendientesEl = document.getElementById('kpiPendientes');
const pendienteDeclaracionesEl = document.getElementById('pendienteDeclaraciones');
const pendienteDocumentosEl = document.getElementById('pendienteDocumentos');

function formatearMoneda(numero) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(numero || 0);
}

// Comparación robusta de estatus: ignora mayúsculas/acentos/espacios extra,
// igual que esAdmin(), para que no se rompa por variaciones de captura.
function estatusEs(valor, esperado) {
  return typeof valor === 'string' && valor.trim().toUpperCase() === esperado.toUpperCase();
}

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

// Llena el panel "Resumen de tu operación" con datos reales de
// declaraciones y honorarios, filtrados a los clientes que el
// usuario puede ver (ya resueltos por cargarDashboard()).
async function cargarResumenOperativo(clientes) {
  kpiClientesActivosEl.textContent = clientes.length;

  if (clientes.length === 0) {
    kpiDeclaracionesEl.textContent = '0';
    kpiHonorariosEl.textContent = formatearMoneda(0);
    kpiPendientesEl.textContent = '0';
    pendienteDeclaracionesEl.textContent = '0';
    pendienteDocumentosEl.textContent = '0';
    return;
  }

  const idsClientes = clientes.map(c => c.id);

  // Declaraciones de estos clientes
  const { data: declaraciones, error: errorDeclaraciones } = await supabaseClient
    .from('declaraciones')
    .select('id, estatus_sat')
    .in('cliente_id', idsClientes);

  if (errorDeclaraciones) {
    console.error('Error cargando declaraciones:', errorDeclaraciones);
    kpiDeclaracionesEl.textContent = '—';
    kpiPendientesEl.textContent = '—';
    pendienteDeclaracionesEl.textContent = '—';
  } else {
    const totalDeclaraciones = declaraciones.length;
    const declaracionesPendientes = declaraciones.filter(d => estatusEs(d.estatus_sat, 'PENDIENTE')).length;

    kpiDeclaracionesEl.textContent = totalDeclaraciones;
    kpiPendientesEl.textContent = declaracionesPendientes;
    pendienteDeclaracionesEl.textContent = declaracionesPendientes;
  }

  // Honorarios de estos clientes
  const { data: honorarios, error: errorHonorarios } = await supabaseClient
    .from('honorarios')
    .select('importe, estatus_pago')
    .in('cliente_id', idsClientes);

  if (errorHonorarios) {
    console.error('Error cargando honorarios:', errorHonorarios);
    kpiHonorariosEl.textContent = '—';
  } else {
    const porCobrar = honorarios
      .filter(h => estatusEs(h.estatus_pago, 'FALTA PAGO'))
      .reduce((suma, h) => suma + Number(h.importe || 0), 0);

    kpiHonorariosEl.textContent = formatearMoneda(porCobrar);
  }

  // Documentos de estos clientes
  // Nota: la tabla "documentos" solo registra archivos ya subidos,
  // no tiene un estatus de "pendiente por entregar". Por ahora este
  // número muestra el total de documentos subidos para estos clientes.
  const { data: documentos, error: errorDocumentos } = await supabaseClient
    .from('documentos')
    .select('id')
    .in('cliente_id', idsClientes);

  if (errorDocumentos) {
    console.error('Error cargando documentos:', errorDocumentos);
    pendienteDocumentosEl.textContent = '—';
  } else {
    pendienteDocumentosEl.textContent = documentos.length;
  }
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

  // El resumen operativo se calcula sobre los mismos clientes que
  // el usuario puede ver, sin importar si es admin o no.
  cargarResumenOperativo(clientes);

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

