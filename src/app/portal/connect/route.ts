"use server";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import jwt from "jsonwebtoken";
import {
  normalizeEthiopianPhoneStrict,
  normalizePhoneNumber,
} from "@/lib/utils";
import { shouldUseSecureCookies } from "@/lib/cookie";

const JWT_SECRET = process.env.JWT_SECRET;
const VALIDATE_TOKEN_URL = process.env.VALIDATE_TOKEN_URL;
const COOKIE_MAX_AGE = 60 * 60 * 24; // 1 day

function createAuthErrorResponse(message: string, status: number) {
  return NextResponse.json(
    {
      status: "error",
      message,
    },
    { status },
  );
}

function getSafeReturnTo(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get("returnTo");

  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) {
    return "/";
  }

  return returnTo;
}

export async function GET(req: NextRequest) {
  const returnTo = getSafeReturnTo(req);

  if (!VALIDATE_TOKEN_URL || !JWT_SECRET) {
    console.error(
      "[PORTAL_CONNECT] Server is missing VALIDATE_TOKEN_URL or JWT_SECRET environment variables.",
    );
    return createAuthErrorResponse(
      "Server is missing VALIDATE_TOKEN_URL or JWT_SECRET environment variables.",
      500,
    );
  }

  const authHeader = req.headers.get("authorization");

  if (!authHeader) {
    console.warn(
      "[PORTAL_CONNECT] Authorization header is missing from the request.",
    );
    return createAuthErrorResponse(
      "Authorization header is missing from the request.",
      401,
    );
  }

  if (!authHeader.startsWith("Bearer ")) {
    console.warn("[PORTAL_CONNECT] Authorization header is malformed.");
    return createAuthErrorResponse(
      "Authorization header is malformed. It must start with Bearer.",
      401,
    );
  }

  try {
    const secure = shouldUseSecureCookies();
    const superAppToken = authHeader.substring(7);
    const externalResponse = await fetch(VALIDATE_TOKEN_URL, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const raw = await externalResponse.text();
    let responseData: any = null;

    try {
      responseData = raw ? JSON.parse(raw) : null;
    } catch {
      throw new Error("Token validation service returned invalid JSON.");
    }

    if (!externalResponse.ok) {
      const errorBody =
        responseData?.message || "Failed to validate SuperApp token.";
      return createAuthErrorResponse(
        `Token validation failed with status ${externalResponse.status}: ${errorBody}`,
        externalResponse.status === 401 || externalResponse.status === 403
          ? 401
          : 502,
      );
    }

    let phoneNumber: string;
    try {
      phoneNumber = normalizeEthiopianPhoneStrict(responseData.phone);
    } catch {
      // Fall back to permissive normalization for legacy tokens, but still require
      // a valid normalized local format before proceeding.
      const maybe = normalizePhoneNumber(responseData.phone);
      if (!maybe)
        throw new Error("Phone number not found in token validation response.");
      phoneNumber = normalizeEthiopianPhoneStrict(maybe);
    }

    if (!phoneNumber) {
      throw new Error("Phone number not found in token validation response.");
    }

    const response = NextResponse.redirect(new URL(returnTo, req.url));

    response.cookies.set("superapp_token", superAppToken, {
      httpOnly: true,
      secure,
      sameSite: "strict",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });

    const user = await prisma.user.findUnique({
      where: { phoneNumber },
    });

    const internalUserId = user ? user.id : `guest_${phoneNumber}`;
    const internalTokenPayload: any = {
      userId: internalUserId,
      phoneNumber: phoneNumber,
      isGuest: true,
      type: "access",
    };

    const internalToken = jwt.sign(internalTokenPayload, JWT_SECRET, {
      expiresIn: "15m",
    });

    response.cookies.set("auth_token", internalToken, {
      httpOnly: true,
      secure,
      sameSite: "strict",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });

    response.cookies.set("phone_number", phoneNumber, {
      httpOnly: false,
      secure,
      sameSite: "strict",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });

    return response;
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "SuperApp login failed.";
    console.error("[PORTAL_CONNECT] Error during SuperApp login:", message);
    return createAuthErrorResponse(message, 502);
  }
}
