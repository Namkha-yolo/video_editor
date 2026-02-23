import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server uses service role key for admin operations
export const supabase = createClient(supabaseUrl, supabaseServiceKey);
