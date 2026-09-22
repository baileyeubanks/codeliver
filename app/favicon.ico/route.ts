import { NextResponse } from "next/server";

// Browsers still probe /favicon.ico by convention; the brand mark lives in
// app/icon.png, so redirect instead of 404ing every page load.
export function GET(request: Request) {
  return NextResponse.redirect(new URL("/icon.png", request.url), { status: 308 });
}
