// =====================================================
// Declaraciones - Portal de Clientes IM Servicios Contables
// =====================================================
// Esta página funciona en dos modos:
//  - Sin ?cliente_id en la URL (clic en "Declaraciones" del menú):
//    muestra TODAS las declaraciones de los clientes permitidos,
//    con KPIs y filtros.
//  - Con ?cliente_id=X en la URL (clic en "Ver detalle" de un
//    cliente): muestra el heatmap de cumplimiento de ese cliente.
// =====================================================

const tituloPaginaEl = document.getElementById('tituloPagina');
const subtituloPaginaEl = document.getElementById('subtituloPagina');
const usuarioInfoBoxEl = document.getElementById('usuarioInfoBox');
const nombreUsuarioEl = document.getElementById('nombreUsuario');
const rolUsuarioEl = document.getElementById('rolUsuario');
const volverLinkEl = document.getElementById('volverLink');
const badgeCumplimientoEl = document.getElementById('badgeCumplimiento');
const estadoCargaEl = document.getElementById('estadoCarga');

// Modo general
const modoGeneralEl = document.getElementById('modoGeneral');
const kpiTotalDeclaracionesEl = document.getElementById('kpiTotalDeclaraciones');
const kpiPresentadasEl = document.getElementById('kpiPresentadas');
const kpiPendientesDeclaracionesEl = document.getElementById('kpiPendientesDeclaraciones');
const kpiCumplimientoGeneralEl = document.getElementById('kpiCumplimientoGeneral');
const filtroClienteEl = document.getElementById('filtroCliente');
const filtroEstatusEl = document.getElementById('filtroEstatus');
const tablaGeneralBodyEl = document.getElementById('tablaGeneralBody');

// Modo cliente específico
const heatmapCardEl = document.getElementById('heatmapCard');
const heatmapGridEl = document.getElementById('heatmapGrid');
const tablaCardEl = document.getElementById('tablaCard');
const tablaDeclaracionesBodyEl = document.getElementById('tablaDeclaracionesBody');

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// La columna "mes" en Supabase guarda el nombre del mes en español
// (ej. "Abril"), no un número. Estas dos funciones normalizan ese
// valor para poder ordenar, agrupar y comparar correctamente, sin
// importar si en algún registro llegara a guardarse como número.
const NOMBRE_MES_A_NUMERO = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12
};

function mesANumero(valor) {
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'string') {
    const limpio = valor.trim();
    const comoNumero = Number(limpio);
    if (!Number.isNaN(comoNumero) && limpio !== '') return comoNumero;
    return NOMBRE_MES_A_NUMERO[limpio.toLowerCase()] || null;
  }
  return null;
}

function nombreMes(valor) {
  const numero = mesANumero(valor);
  if (numero && MESES_LARGO[numero - 1]) {
    const nombre = MESES_LARGO[numero - 1];
    return nombre.charAt(0).toUpperCase() + nombre.slice(1);
  }
  return typeof valor === 'string' && valor.trim() !== '' ? valor : '—';
}

let declaracionesGenerales = [];
let clientesMapa = {};

function formatearMoneda(numero) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(numero || 0);
}

function esPresentada(estatus) {
  return typeof estatus === 'string' && estatus.trim().toLowerCase().includes('presentad');
}

function esAdmin(rol) {
  return typeof rol === 'string' && rol.trim().toLowerCase().startsWith('admin');
}

function mostrarError(texto) {
  estadoCargaEl.textContent = texto;
  estadoCargaEl.classList.add('estado-error');
}

// ---------------------------------------------------------
// MODO GENERAL
// ---------------------------------------------------------

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

function calcularKpisGenerales(declaraciones) {
  const total = declaraciones.length;
  const presentadas = declaraciones.filter(d => esPresentada(d.estatus_sat)).length;
  const pendientes = total - presentadas;
  const porcentaje = total > 0 ? Math.round((presentadas / total) * 100) : 0;

  kpiTotalDeclaracionesEl.textContent = total;
  kpiPresentadasEl.textContent = presentadas;
  kpiPendientesDeclaracionesEl.textContent = pendientes;
  kpiCumplimientoGeneralEl.textContent = `${porcentaje}%`;
}

function renderTablaGeneral() {
  const clienteSeleccionado = filtroClienteEl.value;
  const estatusSeleccionado = filtroEstatusEl.value;

  let filtradas = declaracionesGenerales;

  if (clienteSeleccionado !== 'todos') {
    filtradas = filtradas.filter(d => String(d.cliente_id) === clienteSeleccionado);
  }

  if (estatusSeleccionado === 'presentada') {
    filtradas = filtradas.filter(d => esPresentada(d.estatus_sat));
  } else if (estatusSeleccionado === 'pendiente') {
    filtradas = filtradas.filter(d => !esPresentada(d.estatus_sat));
  }

  filtradas = [...filtradas].sort((a, b) => {
    if (a.ejercicio !== b.ejercicio) return b.ejercicio - a.ejercicio;
    return mesANumero(b.mes) - mesANumero(a.mes);
  });

  tablaGeneralBodyEl.innerHTML = '';

  if (filtradas.length === 0) {
    const fila = document.createElement('tr');
    const celda = document.createElement('td');
    celda.colSpan = 6;
    celda.className = 'estado-vacio';
    celda.textContent = 'No hay declaraciones que coincidan con este filtro.';
    fila.appendChild(celda);
    tablaGeneralBodyEl.appendChild(fila);
    return;
  }

  filtradas.forEach(d => {
    const fila = document.createElement('tr');

    const tdCliente = document.createElement('td');
    tdCliente.textContent = clientesMapa[d.cliente_id] || `Cliente ${d.cliente_id}`;

    const tdPeriodo = document.createElement('td');
    tdPeriodo.textContent = `${nombreMes(d.mes)} ${d.ejercicio}`;

    const tdTipo = document.createElement('td');
    tdTipo.textContent = d.tipo_declaracion || '—';

    const tdIsr = document.createElement('td');
    tdIsr.textContent = formatearMoneda(d.isr);

    const tdIva = document.createElement('td');
    tdIva.textContent = formatearMoneda(d.iva);

    const tdEstatus = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = `estatus-pill ${esPresentada(d.estatus_sat) ? 'verde' : 'gris'}`;
    pill.textContent = d.estatus_sat || 'Sin estatus';
    tdEstatus.appendChild(pill);

    fila.append(tdCliente, tdPeriodo, tdTipo, tdIsr, tdIva, tdEstatus);
    tablaGeneralBodyEl.appendChild(fila);
  });
}

async function cargarModoGeneral(usuario) {
  tituloPaginaEl.textContent = 'Declaraciones';
  subtituloPaginaEl.textContent = 'Todas las declaraciones de tus clientes';
  usuarioInfoBoxEl.style.display = 'flex';
  nombreUsuarioEl.textContent = usuario.email;
  rolUsuarioEl.textContent = usuario.rol;

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

  estadoCargaEl.style.display = 'none';
  modoGeneralEl.style.display = 'block';

  if (clientes.length === 0) {
    calcularKpisGenerales([]);
    renderTablaGeneral();
    return;
  }

  clientesMapa = {};
  clientes.forEach(c => { clientesMapa[c.id] = c.nombre; });
  poblarFiltroClientes(clientes);

  const idsClientes = clientes.map(c => c.id);

  const { data: declaraciones, error: errorDeclaraciones } = await supabaseClient
    .from('declaraciones')
    .select('cliente_id, ejercicio, mes, tipo_declaracion, isr, iva, estatus_sat')
    .in('cliente_id', idsClientes);

  if (errorDeclaraciones) {
    mostrarError('No se pudieron cargar las declaraciones.');
    return;
  }

  declaracionesGenerales = declaraciones || [];
  calcularKpisGenerales(declaracionesGenerales);
  renderTablaGeneral();
}

// ---------------------------------------------------------
// MODO CLIENTE ESPECÍFICO
// ---------------------------------------------------------

function crearCelda(year, mesIndex, entradas) {
  const celda = document.createElement('div');
  celda.className = 'heatmap-celda';

  const total = entradas.length;
  const presentadas = entradas.filter(d => esPresentada(d.estatus_sat)).length;

  let estado = 'gris';
  if (total > 0 && presentadas === total) {
    estado = 'verde';
  } else if (presentadas > 0 && presentadas < total) {
    estado = 'amarillo';
  }
  celda.classList.add(estado);

  const nombreMesActual = MESES_LARGO[mesIndex];
  celda.title = total === 0
    ? `${nombreMesActual} ${year}: sin declaración registrada`
    : `${nombreMesActual} ${year}: ${presentadas}/${total} presentadas`;

  return celda;
}

function renderHeatmap(declaraciones) {
  // Agrupar por "ejercicio-mes", usando el número de mes normalizado
  // (la columna real guarda el nombre, ej. "Abril").
  const mapa = {};
  declaraciones.forEach(d => {
    const numeroMes = mesANumero(d.mes);
    if (!numeroMes) return;
    const clave = `${d.ejercicio}-${numeroMes}`;
    if (!mapa[clave]) mapa[clave] = [];
    mapa[clave].push(d);
  });

  const anioActual = new Date().getFullYear();
  const aniosConDatos = declaraciones.map(d => Number(d.ejercicio)).filter(n => !Number.isNaN(n));

  const anioMin = aniosConDatos.length ? Math.min(...aniosConDatos, anioActual) : anioActual;
  const anioMax = aniosConDatos.length ? Math.max(...aniosConDatos, anioActual) : anioActual;

  heatmapGridEl.innerHTML = '';

  heatmapGridEl.appendChild(document.createElement('div'));
  MESES.forEach(mes => {
    const header = document.createElement('div');
    header.className = 'heatmap-mes-header';
    header.textContent = mes;
    heatmapGridEl.appendChild(header);
  });

  let totalGlobal = 0;
  let presentadasGlobal = 0;

  for (let year = anioMin; year <= anioMax; year++) {
    const labelAnio = document.createElement('div');
    labelAnio.className = 'heatmap-anio-label';
    labelAnio.textContent = year;
    heatmapGridEl.appendChild(labelAnio);

    for (let mes = 1; mes <= 12; mes++) {
      const entradas = mapa[`${year}-${mes}`] || [];
      totalGlobal += entradas.length;
      presentadasGlobal += entradas.filter(d => esPresentada(d.estatus_sat)).length;
      heatmapGridEl.appendChild(crearCelda(year, mes - 1, entradas));
    }
  }

  badgeCumplimientoEl.style.display = 'inline-block';
  badgeCumplimientoEl.classList.remove('amarillo', 'gris');

  if (totalGlobal === 0) {
    badgeCumplimientoEl.textContent = 'Sin declaraciones registradas';
    badgeCumplimientoEl.classList.add('gris');
  } else {
    const porcentaje = Math.round((presentadasGlobal / totalGlobal) * 100);
    badgeCumplimientoEl.textContent = `${porcentaje}% al corriente`;
    if (porcentaje > 0 && porcentaje < 100) {
      badgeCumplimientoEl.classList.add('amarillo');
    } else if (porcentaje === 0) {
      badgeCumplimientoEl.classList.add('gris');
    }
  }
}

function renderTablaCliente(declaraciones) {
  tablaDeclaracionesBodyEl.innerHTML = '';

  if (declaraciones.length === 0) {
    const fila = document.createElement('tr');
    const celda = document.createElement('td');
    celda.colSpan = 5;
    celda.className = 'estado-vacio';
    celda.textContent = 'No hay declaraciones registradas para este cliente.';
    fila.appendChild(celda);
    tablaDeclaracionesBodyEl.appendChild(fila);
    return;
  }

  const ordenadas = [...declaraciones].sort((a, b) => {
    if (a.ejercicio !== b.ejercicio) return b.ejercicio - a.ejercicio;
    return mesANumero(b.mes) - mesANumero(a.mes);
  });

  ordenadas.forEach(d => {
    const fila = document.createElement('tr');

    const tdPeriodo = document.createElement('td');
    tdPeriodo.textContent = `${nombreMes(d.mes)} ${d.ejercicio}`;

    const tdTipo = document.createElement('td');
    tdTipo.textContent = d.tipo_declaracion || '—';

    const tdIsr = document.createElement('td');
    tdIsr.textContent = formatearMoneda(d.isr);

    const tdIva = document.createElement('td');
    tdIva.textContent = formatearMoneda(d.iva);

    const tdEstatus = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = `estatus-pill ${esPresentada(d.estatus_sat) ? 'verde' : 'gris'}`;
    pill.textContent = d.estatus_sat || 'Sin estatus';
    tdEstatus.appendChild(pill);

    fila.append(tdPeriodo, tdTipo, tdIsr, tdIva, tdEstatus);
    tablaDeclaracionesBodyEl.appendChild(fila);
  });
}

async function cargarModoCliente(clienteId) {
  const { data: cliente, error: errorCliente } = await supabaseClient
    .from('clientes')
    .select('id, nombre, rfc')
    .eq('id', clienteId)
    .single();

  if (errorCliente || !cliente) {
    mostrarError('No tienes acceso a este cliente o no existe.');
    return;
  }

  volverLinkEl.style.display = 'inline-block';
  usuarioInfoBoxEl.style.display = 'none';
  tituloPaginaEl.textContent = cliente.nombre;
  subtituloPaginaEl.textContent = cliente.rfc ? `RFC: ${cliente.rfc}` : '';

  const { data: declaraciones, error: errorDeclaraciones } = await supabaseClient
    .from('declaraciones')
    .select('ejercicio, mes, tipo_declaracion, isr, iva, estatus_sat')
    .eq('cliente_id', clienteId);

  if (errorDeclaraciones) {
    mostrarError('No se pudieron cargar las declaraciones de este cliente.');
    return;
  }

  estadoCargaEl.style.display = 'none';
  heatmapCardEl.style.display = 'block';
  tablaCardEl.style.display = 'block';

  renderHeatmap(declaraciones || []);
  renderTablaCliente(declaraciones || []);
}

// ---------------------------------------------------------
// PUNTO DE ENTRADA
// ---------------------------------------------------------

async function iniciar() {
  const { data: sesionData } = await supabaseClient.auth.getSession();
  if (!sesionData.session) {
    window.location.href = 'index.html';
    return;
  }

  const { data: usuario, error: errorUsuario } = await supabaseClient
    .from('usuarios')
    .select('id, email, rol')
    .eq('auth_user_id', sesionData.session.user.id)
    .single();

  if (errorUsuario || !usuario) {
    mostrarError('No se encontró tu cuenta en el sistema. Contacta al administrador.');
    return;
  }

  const clienteId = new URLSearchParams(window.location.search).get('cliente_id');

  if (clienteId) {
    await cargarModoCliente(clienteId);
  } else {
    await cargarModoGeneral(usuario);
  }
}

filtroClienteEl.addEventListener('change', renderTablaGeneral);
filtroEstatusEl.addEventListener('change', renderTablaGeneral);

document.getElementById('btnCerrarSesion').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});

iniciar().catch((err) => {
  console.error(err);
  mostrarError('Ocurrió un error al cargar la información. Revisa la consola para más detalles.');
});

