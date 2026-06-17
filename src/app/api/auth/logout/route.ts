import { NextResponse } from "next/server";import { clearAuth } from "@/server/auth";export async function POST(){const res=NextResponse.json({ok:true});clearAuth(res);return res}
