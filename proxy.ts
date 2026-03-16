import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabasePublicUrl } from "@/lib/public-env";

const PUBLIC_ROUTES = [
  "/login",
  "/signup",
  "/auth/callback",
  "/api/auth",
  "/api/health",
  "/api/review", // public review API
  "/review/", // public review portal
  "/download/", // public download links
];

const CANONICAL_HOST = "deliver.contentco-op.com";
const LEGACY_HOSTS = new Set(["co-deliver.contentco-op.com", "codeliver.contentco-op.com"]);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host")?.toLowerCase();

  if (host && LEGACY_HOSTS.has(host)) {
    const url = new URL(
      `${req.nextUrl.pathname}${req.nextUrl.search}`,
      `${(req.headers.get("x-forwarded-proto") || "https").replace(/:$/, "")}://${CANONICAL_HOST}`,
    );
    return NextResponse.redirect(url, 308);
  }

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  const res = NextResponse.next();

  const supabase = createServerClient(getSupabasePublicUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
