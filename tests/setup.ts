import { vi } from "vitest";
import { mockDb, supabaseAdminMock } from "@/test/supabase-mock";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: supabaseAdminMock,
}));

export { mockDb };