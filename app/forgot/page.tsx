import { redirect } from "next/navigation";

/** Public alias for /forgot-password (D6b — bare /forgot must not auth-gate). */
export default function ForgotAliasPage() {
  redirect("/forgot-password");
}
