import { NextResponse, type NextRequest } from "next/server";

/**
 * Password protection for the dashboard and its APIs.
 * Set DASHBOARD_PASSWORD in the hosting environment to turn it on (any username works).
 * Webhooks from the phone line, Telegram and Calendly carry their own secrets and stay open.
 */
const OPEN = [/^\/api\/vaani\/webhook\//, /^\/api\/telegram\/webhook\//, /^\/api\/calendly\/webhook$/, /^\/api\/calls\/inbound$/, /^\/api\/health$/, /^\/api\/calendly\/sync$/];

export function middleware(req: NextRequest) {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) return NextResponse.next();
  if (OPEN.some((r) => r.test(req.nextUrl.pathname))) return NextResponse.next();
  const h = req.headers.get("authorization") ?? "";
  if (h.startsWith("Basic ")) {
    try {
      const [, given] = atob(h.slice(6)).split(/:(.*)/s);
      if (given === pw) return NextResponse.next();
    } catch { /* fall through */ }
  }
  return new NextResponse("Sign in required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Aangan", charset="UTF-8"' } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
