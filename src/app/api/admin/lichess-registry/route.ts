import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

function isAdminEmail(email: string | undefined) {
  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return email ? adminEmails.includes(email.toLowerCase()) : false;
}

async function verifyAdminToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const idToken = authHeader.slice(7);
  if (!idToken) return null;

  try {
    const { getAuth } = await import("firebase-admin/auth");
    const { getApps, initializeApp, cert } = await import("firebase-admin/app");

    // Only set up if not already initialized
    if (!getApps()[0]) {
      const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
      if (!process.env.FIREBASE_ADMIN_PROJECT_ID || !process.env.FIREBASE_ADMIN_CLIENT_EMAIL || !privateKey) {
        console.error("Missing Firebase Admin environment variables.");
        return null;
      }

      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey
        })
      });
    }

    const decoded = await getAuth().verifyIdToken(idToken);
    if (!isAdminEmail(decoded.email)) return null;
    return decoded;
  } catch (error) {
    console.error("Auth verification failed:", error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyAdminToken(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = getAdminDb();
    const snapshot = await db.doc("sync_config/lichess").get();

    if (!snapshot.exists) {
      return NextResponse.json({ tournamentIds: [], creatorUsernames: [] });
    }

    const data = snapshot.data() ?? {};
    return NextResponse.json({
      tournamentIds: Array.isArray(data.tournamentIds) ? data.tournamentIds : [],
      creatorUsernames: Array.isArray(data.creatorUsernames) ? data.creatorUsernames : []
    });
  } catch (error) {
    console.error("Registry GET failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await verifyAdminToken(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { tournamentIds, creatorUsernames } = body || {};

    const safeTournamentIds = Array.isArray(tournamentIds)
      ? tournamentIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim())
      : [];
    const safeCreatorUsernames = Array.isArray(creatorUsernames)
      ? creatorUsernames
          .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
          .map((u) => u.trim().toLowerCase())
      : [];

    const db = getAdminDb();
    await db.doc("sync_config/lichess").set(
      { tournamentIds: safeTournamentIds, creatorUsernames: safeCreatorUsernames },
      { merge: true }
    );

    return NextResponse.json({ ok: true, tournamentIds: safeTournamentIds, creatorUsernames: safeCreatorUsernames });
  } catch (error) {
    console.error("Registry PUT failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
