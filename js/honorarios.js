// =====================================================
// Honorarios - Portal de Clientes IM Servicios Contables
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

const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

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

// Valores confirmados en la base de datos: "PAGADO" / "FALTA PAGO"
function esPagado(estatusPago) {
  return typeof estatusPago === 'string' && estatusPago.trim().toUpperCase() === 'PAGADO';
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
    .reduce((suma, h) => suma + Number(h.importe || 0), 0);

  const pendientes = honorarios.filter(h => !esPagado(h.estatus_pago));
  const porCobrar = pendientes.reduce((suma, h) => suma + Number(h.importe || 0), 0);

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
  } else if (estatusSeleccionado === 'falta_pago') {
    filtrados = filtrados.filter(h => !esPagado(h.estatus_pago));
  }

  filtrados = [...filtrados].sort((a, b) => {
    if (a.ejercicio !== b.ejercicio) return b.ejercicio - a.ejercicio;
    return b.mes - a.mes;
  });

  tablaBodyEl.innerHTML = '';

  if (filtrados.length === 0) {
    const fila = document.createElement('tr');
    const celda = document.createElement('td');
    celda.colSpan = 5;
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

    const tdPeriodo = document.createElement('td');
    tdPeriodo.textContent = `${MESES_LARGO[h.mes - 1] || h.mes} ${h.ejercicio}`;

    const tdImporte = document.createElement('td');
    tdImporte.textContent = formatearMoneda(h.importe);

    const tdEstatus = document.createElement('td');
    const pill = document.createElement('span');
    const pagado = esPagado(h.estatus_pago);
    pill.className = `estatus-pill ${pagado ? 'pagado' : 'falta-pago'}`;
    pill.textContent = h.estatus_pago || 'Sin estatus';
    tdEstatus.appendChild(pill);

    const tdFecha = document.createElement('td');
    tdFecha.textContent = pagado ? formatearFecha(h.fecha_pago) : '—';

    fila.append(tdCliente, tdPeriodo, tdImporte, tdEstatus, tdFecha);
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
      mostrarError('No se pudieron cargar tus clientes.');
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

  // 4. Obtener honorarios de esos clientes
  const idsClientes = clientes.map(c => c.id);

  const { data: honorarios, error: errorHonorarios } = await supabaseClient
    .from('honorarios')
    .select('cliente_id, ejercicio, mes, importe, estatus_pago, fecha_pago')
    .in('cliente_id', idsClientes);

  if (errorHonorarios) {
    mostrarError('No se pudieron cargar los honorarios.');
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
  mostrarError('Ocurrió un error al cargar los honorarios. Revisa la consola para más detalles.');
});

