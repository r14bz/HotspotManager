import { createClient as createSupabaseClient } from "@supabase/supabase-js"

// Client server-side memakai SERVICE ROLE key, yang melewati RLS.
// Key ini HANYA boleh ada di environment variable server (Vercel),
// jangan pernah pakai awalan NEXT_PUBLIC_ dan jangan import file ini
// dari komponen client ("use client").
//
// Semua tabel dikunci dengan RLS tanpa policy (lihat migrasi 006),
// jadi anon key tidak bisa mengakses data sama sekali. Otorisasi
// aplikasi dilakukan oleh middleware (cek cookie admin_session).
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diset"
    )
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
