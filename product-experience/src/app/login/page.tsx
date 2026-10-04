import ClientLoginForm from "./ClientLoginForm";

export const dynamic = "force-dynamic";

export default function ClientLoginPage() {
  const enabled = process.env.CLIENT_LOGIN_ENABLED === "1"
    && Boolean(process.env.SUPABASE_URL?.trim())
    && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
    && Boolean(process.env.SUPABASE_ANON_KEY?.trim())
    && Boolean(process.env.PUBLIC_APP_URL?.trim());
  return <ClientLoginForm enabled={enabled} />;
}
