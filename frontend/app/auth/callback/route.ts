import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      error: "NOT_IMPLEMENTED",
      message: "GitHub authentication is not available yet.",
    },
    { status: 501 },
  );
}
