// =====================================================
// Configuración de Supabase
// =====================================================
// Reemplaza estos dos valores con los de tu proyecto:
// Supabase → Project Settings → API
//   - "Project URL"      → SUPABASE_URL
//   - "anon public" key  → SUPABASE_ANON_KEY
//
// Estos valores NO son secretos: están protegidos por las
// políticas de seguridad (RLS) que se configuran en Supabase,
// no por mantenerlos ocultos. Aun así, solo deben usarse junto
// con RLS habilitado (ver sql/configurar_seguridad.sql).
// =====================================================

const SUPABASE_URL = "https://kqbimejfubmsffcacnkg.supabase.co";
const SUPABASE_ANON_KEY = 'sb_publishable_3iC4_HFsjA4J-q8IBdC9Ag_sRzjY4Cj';

// El CDN expone window.supabase; .createClient() devuelve
// la instancia que usarán todos los módulos del portal.
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
