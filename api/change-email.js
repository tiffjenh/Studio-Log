/**
 * Vercel Serverless Function — /api/change-email
 *
 * Changes a user's auth email using the Supabase Admin API.
 * Requires:
 *   - SUPABASE_SERVICE_ROLE_KEY env var in Vercel
 *   - VITE_SUPABASE_URL env var
 *   - Authorization header with the user's current access token
 *   - POST body { newEmail }
 */

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: "Server not configured for email changes" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authorization" });
  }
  const accessToken = authHeader.replace("Bearer ", "");

  const { newEmail } = req.body || {};
  if (!newEmail || typeof newEmail !== "string") {
    return res.status(400).json({ error: "Missing newEmail" });
  }

  try {
    // Create a client with the user's access token to verify identity
    const userClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !user) {
      return res.status(401).json({ error: "Invalid session" });
    }

    // Use admin client to directly change the email (bypasses email verification)
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, {
      email: newEmail.trim(),
      email_confirm: true, // Mark as confirmed immediately
    });

    if (updateError) {
      console.error("Admin updateUser error:", updateError);
      return res.status(400).json({ error: updateError.message });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("change-email error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
