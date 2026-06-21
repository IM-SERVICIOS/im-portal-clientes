// =====================================================
// Honorarios - Portal de Clientes IM Servicios Contables
// =====================================================
// Columnas reales de la tabla "honorarios":
//   cliente_id, concepto, monto, fuera_presupuesto,
//   fecha_remision, estatus_pago
// (no existen "ejercicio", "mes", "importe" ni "fecha_pago")
// =====================================================

const nombreUsuarioEl = document.getElementById('nombreUsuario');
const rolUsuarioEl = document.getElementById('rolUsuario');
const estadoCargaEl = document.getElementById('estadoCarga');
const contenidoEl = document.getElementById('contenidoHonorarios');

const kpiTotalEl = document.getElementById('kpiTotalHonorarios');
const kpiCobradoEl = document.getElementById('kpiCobrado');
const kpiPorCobrarEl = document.getElementById('kpiPorCobrar');
const kpiClientesAdeudoEl = document.getElementById('kpiClientesAdeudo');

const filtroClienteEl = document.getElementById('filtroCliente');
const filtroEstatusEl = document.getElementById('filtroEstatus');
const tablaBodyEl = document.getElementById('tablaHonorariosBody');

// Estado en memoria: se carga una sola vez y los filtros solo
// vuelven a pintar la tabla, sin volver a consultar Supabase.
let honorariosCargados = [];
let clientesMapa = {}; // { id: nombre }

function formatearMoneda(numero) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(numero || 0);
}

function formatearFecha(fecha) {
  if (!fecha) return '—';
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });
}

// "Pagado" se compara sin importar mayúsculas/espacios: tu dato real
// usa "Pendiente" para lo no pagado, así que cualquier valor que no
// sea exactamente "pagado" (ignorando mayúsculas) se trata como
// pendiente de cobro.
function esPagado(estatusPago) {
  return typeof estatusPago === 'string' && estatusPago.trim().toLowerCase() === 'pagado';
}

function esAdmin(rol) {
  return typeof rol === 'string' && rol.trim().toLowerCase().startsWith('admin');
}

function mostrarError(texto) {
  estadoCargaEl.textContent = texto;
  estadoCargaEl.classList.add('estado-error');
}

function poblarFiltroClientes(clientes) {
  clientes
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .forEach(c => {
      const opcion = document.createElement('option');
      opcion.value = String(c.id);
      opcion.textContent = c.nombre;
      filtroClienteEl.appendChild(opcion);
    });
}

function calcularKpis(honorarios) {
  const total = honorarios.length;

  const cobrado = honorarios
    .filter(h => esPagado(h.estatus_pago))
    .reduce((suma, h) => suma + Number(h.monto || 0), 0);

  const pendientes = honorarios.filter(h => !esPagado(h.estatus_pago));
  const porCobrar = pendientes.reduce((suma, h) => suma + Number(h.monto || 0), 0);

  const clientesConAdeudo = new Set(pendientes.map(h => h.cliente_id)).size;

  kpiTotalEl.textContent = total;
  kpiCobradoEl.textContent = formatearMoneda(cobrado);
  kpiPorCobrarEl.textContent = formatearMoneda(porCobrar);
  kpiClientesAdeudoEl.textContent = clientesConAdeudo;
}

function renderTabla() {
  const clienteSeleccionado = filtroClienteEl.value;
  const estatusSeleccionado = filtroEstatusEl.value;

  let filtrados = honorariosCargados;

  if (clienteSeleccionado !== 'todos') {
    filtrados = filtrados.filter(h => String(h.cliente_id) === clienteSeleccionado);
  }

  if (estatusSeleccionado === 'pagado') {
    filtrados = filtrados.filter(h => esPagado(h.estatus_pago));
  } else if (estatusSeleccionado === 'pendiente') {
    filtrados = filtrados.filter(h => !esPagado(h.estatus_pago));
  }

  // Más reciente primero, según la fecha en que se remitió el cargo
  filtrados = [...filtrados].sort((a, b) => {
    const fechaA = a.fecha_remision ? new Date(a.fecha_remision).getTime() : 0;
    const fechaB = b.fecha_remision ? new Date(b.fecha_remision).getTime() : 0;
    return fechaB - fechaA;
  });

  tablaBodyEl.innerHTML = '';

  if (filtrados.length === 0) {
    const fila = document.createElement('tr');
    const celda = document.createElement('td');
    celda.colSpan = 6;
    celda.className = 'estado-vacio';
    celda.textContent = 'No hay honorarios que coincidan con este filtro.';
    fila.appendChild(celda);
    tablaBodyEl.appendChild(fila);
    return;
  }

  filtrados.forEach(h => {
    const fila = document.createElement('tr');

    const tdCliente = document.createElement('td');
    tdCliente.textContent = clientesMapa[h.cliente_id] || `Cliente ${h.cliente_id}`;

    const tdConcepto = document.createElement('td');
    tdConcepto.textContent = h.concepto || '—';

    const tdMonto = document.createElement('td');
    tdMonto.textContent = formatearMoneda(h.monto);

    const tdTipo = document.createElement('td');
    if (h.fuera_presupuesto) {
      const tipoPill = document.createElement('span');
      tipoPill.className = 'estatus-pill fuera-presupuesto';
      tipoPill.textContent = 'Fuera de presupuesto';
      tdTipo.appendChild(tipoPill);
    } else {
      tdTipo.textContent = '—';
    }

    const tdEstatus = document.createElement('td');
    const pill = document.createElement('span');
    const pagado = esPagado(h.estatus_pago);
    pill.className = `estatus-pill ${pagado ? 'pagado' : 'falta-pago'}`;
    pill.textContent = h.estatus_pago || 'Sin estatus';
    tdEstatus.appendChild(pill);

    const tdFecha = document.createElement('td');
    tdFecha.textContent = formatearFecha(h.fecha_remision);

    fila.append(tdCliente, tdConcepto, tdMonto, tdTipo, tdEstatus, tdFecha);
    tablaBodyEl.appendChild(fila);
  });
}

async function cargarHonorarios() {
  // 1. Confirmar sesión activa
  const { data: sesionData } = await supabaseClient.auth.getSession();
  const session = sesionData.session;

  if (!session) {
    window.location.href = 'index.html';
    return;
  }

  // 2. Obtener usuario y rol
  const { data: usuario, error: errorUsuario } = await supabaseClient
    .from('usuarios')
    .select('id, email, rol')
    .eq('auth_user_id', session.user.id)
    .single();

  if (errorUsuario || !usuario) {
    mostrarError('No se encontró tu cuenta en el sistema. Contacta al administrador.');
    return;
  }

  nombreUsuarioEl.textContent = usuario.email;
  rolUsuarioEl.textContent = usuario.rol;

  // 3. Obtener clientes permitidos (mismo patrón que dashboard.js)
  let clientes = [];

  if (esAdmin(usuario.rol)) {
    const { data, error } = await supabaseClient
      .from('clientes')
      .select('id, nombre')
      .eq('activo', true);

    if (error) {
      mostrarError(`No se pudieron cargar tus clientes: ${error.message || 'error desconocido'}`);
      return;
    }
    clientes = data;
  } else {
    const { data, error } = await supabaseClient
      .from('vw_usuarios_clientes')
      .select('cliente_id, cliente_nombre')
      .eq('usuario_id', usuario.id);

    if (error) {
      mostrarError(`No se pudieron cargar tus clientes asignados: ${error.message || 'error desconocido'}`);
      return;
    }
    clientes = (data || [])
      .filter(c => c.cliente_id !== null)
      .map(c => ({ id: c.cliente_id, nombre: c.cliente_nombre }));
  }

  if (clientes.length === 0) {
    estadoCargaEl.style.display = 'none';
    contenidoEl.style.display = 'block';
    calcularKpis([]);
    renderTabla();
    return;
  }

  clientesMapa = {};
  clientes.forEach(c => { clientesMapa[c.id] = c.nombre; });
  poblarFiltroClientes(clientes);

  // 4. Obtener honorarios de esos clientes (columnas reales)
  const idsClientes = clientes.map(c => c.id);

  const { data: honorarios, error: errorHonorarios } = await supabaseClient
    .from('honorarios')
    .select('cliente_id, concepto, monto, fuera_presupuesto, fecha_remision, estatus_pago')
    .in('cliente_id', idsClientes);

  if (errorHonorarios) {
    console.error('Error cargando honorarios:', errorHonorarios);
    mostrarError(`No se pudieron cargar los honorarios: ${errorHonorarios.message || 'error desconocido'}`);
    return;
  }

  honorariosCargados = honorarios || [];

  // 5. Mostrar resultado
  estadoCargaEl.style.display = 'none';
  contenidoEl.style.display = 'block';

  calcularKpis(honorariosCargados);
  renderTabla();
}

filtroClienteEl.addEventListener('change', renderTabla);
filtroEstatusEl.addEventListener('change', renderTabla);

document.getElementById('btnCerrarSesion').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});

cargarHonorarios().catch((err) => {
  console.error(err);
  mostrarError(`Ocurrió un error al cargar los honorarios: ${err.message || 'error desconocido'}`);
});
