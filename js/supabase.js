// =====================================================
// supabase.js — Configuración del cliente Supabase
// Portal de Clientes · IM Servicios Contables
// =====================================================
// IMPORTANTE:
//   - Esta variable DEBE llamarse supabaseClient (no supabase)
//     para no colisionar con el namespace global del CDN.
//   - Todos los archivos JS del portal (dashboard.js,
//     honorarios.js, declaraciones.js) usan supabaseClient.
//   - Este archivo debe cargarse DESPUÉS del CDN de Supabase
//     y ANTES que cualquier otro script del portal.
// =====================================================

const SUPABASE_URL  = "https://kqbimejfubmsffcacnkg.supabase.co";
const SUPABASE_ANON = 'sb_publishable_3iC4_HFsjA4J-q8IBdC9Ag_sRzjY4Cj';

// El CDN expone window.supabase; .createClient() devuelve
// la instancia que usarán todos los módulos del portal.
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

