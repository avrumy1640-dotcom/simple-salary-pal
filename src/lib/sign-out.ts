// Centralised sign-out helper.
// Performs the 4-step canonical sequence to prevent stale cached data leaks
// and 401 flashes from in-flight queries firing after the session is cleared.
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export async function performSignOut(queryClient?: QueryClient) {
  try {
    if (queryClient) {
      await queryClient.cancelQueries();
      queryClient.clear();
    }
  } catch {
    // never block sign-out on cache teardown
  }
  try {
    await supabase.auth.signOut();
  } catch {
    // ignore — local session is gone either way
  }
}
