import { NextResponse } from "next/server";

import {
  INACCORD_BUILD_NUMBER,
  INACCORD_INTERNAL_VERSION,
  INACCORD_VERSION_LABEL,
} from "@/lib/build-version";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json({
    version: INACCORD_INTERNAL_VERSION,
    displayVersion: INACCORD_VERSION_LABEL,
    buildNumber: INACCORD_BUILD_NUMBER,
  });
}
