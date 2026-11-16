import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.VALIDATE_TOKEN_URL;
  try {
    const r = await fetch(url!, { cache: "no-store" });
    return NextResponse.json({ url, reachable: true, status: r.status });
  } catch (e: any) {
    return NextResponse.json({
      url,
      reachable: false,
      message: e?.message,
      cause: e?.cause?.code || e?.cause?.message || String(e?.cause),
    });
  }
}