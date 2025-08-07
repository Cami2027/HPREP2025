import * as functions from "firebase-functions";
import admin from "firebase-admin";
import sgMail from "@sendgrid/mail";

admin.initializeApp();
const db = admin.firestore();

// ----- Config -----
const FROM_EMAIL = process.env.FROM_EMAIL || functions.params.defineString("FROM_EMAIL").value();
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || functions.params.defineString("SENDGRID_API_KEY").value();
if (SENDGRID_API_KEY) sgMail.setApiKey(SENDGRID_API_KEY);

// Helper: minimal email validator
function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }

// Helper: is caller admin? (checks custom claim first, then optional Firestore role)
async function callerIsAdmin(context, appId) {
  if (!context.auth) return false;
  if (context.auth.token?.admin === true) return true;
  // Optional fallback to role doc if you use that approach
  const doc = await db.doc(`artifacts/${appId}/users/${context.auth.uid}`).get();
  return doc.exists && doc.get("role") === "admin";
}

// Helper: naive rate limit per UID/IP/email (tighten as needed)
async function rateLimit(key, windowSec = 300, maxCount = 5) {
  const now = Date.now();
  const ref = db.collection("_rate/password_resets").doc(Buffer.from(key).toString("base64").slice(0, 500));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : { hits: [] };
    const fresh = data.hits.filter((t) => now - t < windowSec * 1000);
    if (fresh.length >= maxCount) {
      throw new functions.https.HttpsError("resource-exhausted", "Too many requests, try again later.");
    }
    fresh.push(now);
    tx.set(ref, { hits: fresh }, { merge: true });
  });
}

// 1) Self-serve: user requests a password reset email
// data: { appId: string, email: string, continueUrl?: string }
export const requestPasswordReset = functions.https.onCall(async (data, context) => {
  const { appId, email, continueUrl } = data || {};
  if (!email || !isEmail(email) || !appId) {
    throw new functions.https.HttpsError("invalid-argument", "appId and a valid email are required.");
  }

  // Rate limit by email + IP (if available)
  const ip = context.rawRequest?.ip || "noip";
  await rateLimit(`self:${email}:${ip}`);

  // Generate the Firebase password reset link
  const actionCodeSettings = {
    url: continueUrl || "https://your-app.example.com/login",
    handleCodeInApp: true
  };
  let link;
  try {
    link = await admin.auth().generatePasswordResetLink(email, actionCodeSettings);
  } catch (e) {
    // Don’t leak user existence; treat as success
    if (e.code === "auth/user-not-found") return { ok: true };
    throw new functions.https.HttpsError("internal", e.message);
  }

  if (!SENDGRID_API_KEY) {
    // If you don’t configure email, just return the link (useful for local testing)
    return { ok: true, link };
  }

  // Send via SendGrid
  await sgMail.send({
    to: email,
    from: FROM_EMAIL,
    subject: "Reset your password",
    text: `Click the link to reset your password: ${link}`,
    html: `<p>Click the link to reset your password:</p><p><a href="${link}">${link}</a></p>`
  });

  return { ok: true };
});

// 2) Admin-initiated reset
// Modes:
//   - "link"  : email a reset link to the target user
//   - "temp"  : set a temporary password and revoke sessions
// data: { appId: string, email: string, mode?: "link"|"temp", tempPassword?: string, continueUrl?: string }
export const adminResetPassword = functions.https.onCall(async (data, context) => {
  const { appId, email, mode = "link", tempPassword, continueUrl } = data || {};
  if (!appId || !email || !isEmail(email)) {
    throw new functions.https.HttpsError("invalid-argument", "appId and a valid email are required.");
  }
  if (!(await callerIsAdmin(context, appId))) {
    throw new functions.https.HttpsError("permission-denied", "Admin privileges required.");
  }

  const user = await admin.auth().getUserByEmail(email);

  if (mode === "temp") {
    if (!tempPassword || tempPassword.length < 8) {
      throw new functions.https.HttpsError("invalid-argument", "Provide a tempPassword (>= 8 chars).");
    }
    await admin.auth().updateUser(user.uid, { password: tempPassword });
    await admin.auth().revokeRefreshTokens(user.uid); // force re-auth everywhere

    // Optionally notify via email
    if (SENDGRID_API_KEY) {
      await sgMail.send({
        to: email,
        from: FROM_EMAIL,
        subject: "Temporary password issued",
        text: `A temporary password was set by an administrator.\nTemporary password: ${tempPassword}\nPlease sign in and change it immediately.`,
        html: `<p>A temporary password was set by an administrator.</p><p><b>Temporary password:</b> ${tempPassword}</p><p>Please sign in and change it immediately.</p>`
      });
    }

    return { ok: true, mode: "temp" };
  }

  // Default: send a password reset link
  const actionCodeSettings = {
    url: continueUrl || "https://your-app.example.com/login",
    handleCodeInApp: true
  };
  const link = await admin.auth().generatePasswordResetLink(email, actionCodeSettings);

  if (!SENDGRID_API_KEY) return { ok: true, mode: "link", link };

  await sgMail.send({
    to: email,
    from: FROM_EMAIL,
    subject: "Reset your password",
    text: `Click to reset your password: ${link}`,
    html: `<p>Click to reset your password:</p><p><a href="${link}">${link}</a></p>`
  });

  return { ok: true, mode: "link" };
});
