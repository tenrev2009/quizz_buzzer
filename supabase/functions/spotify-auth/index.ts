import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SPOTIFY_CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID")!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function getSupabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function getUserId(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.sub || null;
  } catch {
    return null;
  }
}

async function handleCallback(req: Request): Promise<Response> {
  const { code, redirect_uri } = await req.json();
  if (!code || !redirect_uri) {
    return new Response(
      JSON.stringify({ error: "Missing code or redirect_uri" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const userId = getUserId(req);
  if (!userId) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return new Response(
      JSON.stringify({ error: "Spotify token exchange failed", details: err }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const tokenData = await tokenRes.json();
  const { access_token, refresh_token, expires_in } = tokenData;

  const meRes = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const meData = await meRes.json();

  const supabase = getSupabaseAdmin();
  const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

  const { error: upsertError } = await supabase
    .from("spotify_tokens")
    .upsert({
      user_id: userId,
      access_token,
      refresh_token,
      expires_at: expiresAt,
      spotify_user_id: meData.id,
      product: meData.product || "free",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

  if (upsertError) {
    return new Response(
      JSON.stringify({ error: "Failed to save tokens", details: upsertError.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, product: meData.product || "free", spotify_user_id: meData.id }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleRefresh(req: Request): Promise<Response> {
  const userId = getUserId(req);
  if (!userId) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: tokenRow, error } = await supabase
    .from("spotify_tokens")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !tokenRow) {
    return new Response(
      JSON.stringify({ error: "No Spotify connection found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokenRow.refresh_token,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return new Response(
      JSON.stringify({ error: "Spotify refresh failed", details: err }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const tokenData = await tokenRes.json();
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  await supabase
    .from("spotify_tokens")
    .update({
      access_token: tokenData.access_token,
      expires_at: expiresAt,
      ...(tokenData.refresh_token ? { refresh_token: tokenData.refresh_token } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return new Response(
    JSON.stringify({ access_token: tokenData.access_token, expires_at: expiresAt }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleGetToken(req: Request): Promise<Response> {
  const userId = getUserId(req);
  if (!userId) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: tokenRow, error } = await supabase
    .from("spotify_tokens")
    .select("access_token, expires_at, product, refresh_token")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !tokenRow) {
    return new Response(
      JSON.stringify({ error: "Not connected" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const now = new Date();
  const expiresAt = new Date(tokenRow.expires_at);

  if (expiresAt <= new Date(now.getTime() + 60_000)) {
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`)}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokenRow.refresh_token,
      }),
    });

    if (tokenRes.ok) {
      const tokenData = await tokenRes.json();
      const newExpires = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
      await supabase
        .from("spotify_tokens")
        .update({
          access_token: tokenData.access_token,
          expires_at: newExpires,
          ...(tokenData.refresh_token ? { refresh_token: tokenData.refresh_token } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      return new Response(
        JSON.stringify({ access_token: tokenData.access_token, expires_at: newExpires, product: tokenRow.product }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  return new Response(
    JSON.stringify({ access_token: tokenRow.access_token, expires_at: tokenRow.expires_at, product: tokenRow.product }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/spotify-auth/, "");

    if (req.method === "POST" && path === "/callback") {
      return await handleCallback(req);
    }
    if (req.method === "POST" && path === "/refresh") {
      return await handleRefresh(req);
    }
    if (req.method === "GET" && path === "/token") {
      return await handleGetToken(req);
    }

    return new Response(
      JSON.stringify({ error: "Not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
