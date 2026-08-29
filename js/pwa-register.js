// Registro del Service Worker — Portal de Clientes IM Servicios Contables
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('service-worker.js')
      .catch((error) => console.error('No se pudo registrar el Service Worker:', error));
  });
}
