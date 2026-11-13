import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const hasRealConfiguration = Boolean(
  supabaseUrl
  && supabasePublishableKey
  && !supabaseUrl.includes("your-project-id")
  && !supabasePublishableKey.includes("your-publishable-key"),
);

export const supabase = hasRealConfiguration
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        persistSession: true,
      },
    })
  : null;
