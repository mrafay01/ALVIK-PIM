import { randomInt, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import LoginOtp from "@/models/LoginOtp";
import { sendOtpEmail } from "@/lib/mailer";
import type { Types } from "mongoose";
import type { OtpPurpose } from "@/lib/enums";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
// The session ticket only has to survive the moment between "OTP verified
// in the browser" and the guarded action actually running (NextAuth's
// authorize() for login; the relevant PATCH route for everything else) —
// a couple of minutes is generous, not a real usability constraint.
const TICKET_TTL_MS = 2 * 60 * 1000;

function generateCode(): string {
  // 6 digits, zero-padded — randomInt's upper bound is exclusive.
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

// Issue a new OTP for a user and email it. An earlier pending code for
// this user *and this purpose* is simply superseded — verify() only ever
// looks at the most recent unconsumed one for that (userId, purpose) pair,
// so an old code stops being useful once a new one for the same purpose is
// issued, even though it isn't explicitly deleted. A pending code for a
// *different* purpose (e.g. a login OTP mid-flight) is untouched.
//
// `targetEmail` is set for change_email only: the code is sent to the new
// address being verified, not to `email` at all — callers pass the
// account's current email as `email` only for purposes where that's where
// the code should land (login, change_password, admin_reset).
export async function issueOtp(
  userId: Types.ObjectId,
  email: string,
  purpose: OtpPurpose = "login",
  targetEmail?: string
): Promise<void> {
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);

  await LoginOtp.create({
    userId,
    purpose,
    targetEmail: targetEmail ?? null,
    codeHash,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  await sendOtpEmail(email, code);
}

export type OtpVerifyResult =
  | { ok: true; sessionTicket: string }
  | { ok: false; reason: "invalid" | "expired" | "too_many_attempts" | "none_pending" };

// Verify a submitted code against the most recent unconsumed, unexpired
// OTP issued for this (userId, purpose) pair. On success, mints a one-time
// session ticket (and marks the code consumed so it can't be reused) that
// the caller hands to whatever action this code was gating. On a wrong
// guess, increments the attempt counter so a code can only be brute-forced
// MAX_ATTEMPTS times before it's dead.
export async function verifyOtp(
  userId: Types.ObjectId,
  submittedCode: string,
  purpose: OtpPurpose = "login"
): Promise<OtpVerifyResult> {
  const pending = await LoginOtp.findOne({ userId, purpose, consumedAt: null }).sort({ createdAt: -1 }).exec();

  if (!pending) return { ok: false, reason: "none_pending" };
  if (pending.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (pending.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };

  const valid = await bcrypt.compare(submittedCode, pending.codeHash);
  if (!valid) {
    pending.attempts += 1;
    await pending.save();
    return { ok: false, reason: pending.attempts >= MAX_ATTEMPTS ? "too_many_attempts" : "invalid" };
  }

  const sessionTicket = randomBytes(24).toString("hex");
  pending.consumedAt = new Date();
  pending.sessionTicket = sessionTicket;
  await pending.save();
  return { ok: true, sessionTicket };
}

// Redeem a session ticket exactly once, scoped to the purpose it was
// issued for — a login ticket can't be replayed to authorize a password
// reset, and vice versa. Called from NextAuth's authorize() for login, or
// from the relevant PATCH route for the account-security actions, in place
// of re-verifying the OTP code itself: the ticket already proves the code
// was checked correctly, and a fresh, unconsumed match on this
// (user, purpose) is the only thing that lets the action proceed.
export async function redeemSessionTicket(
  userId: Types.ObjectId,
  ticket: string,
  purpose: OtpPurpose = "login"
): Promise<boolean> {
  const record = await LoginOtp.findOne({ userId, purpose, sessionTicket: ticket, ticketConsumedAt: null }).exec();
  if (!record) return false;
  if (record.consumedAt && Date.now() - record.consumedAt.getTime() > TICKET_TTL_MS) return false;

  record.ticketConsumedAt = new Date();
  await record.save();
  return true;
}

// change_email only: the new address a verified ticket was actually issued
// for — the PATCH route needs this to know which email to write, since the
// client only ever sends back an opaque ticket, never the raw new-email
// text (which would let a tampered request apply a different address than
// the one the code was actually sent to and verified for).
export async function getVerifiedTargetEmail(
  userId: Types.ObjectId,
  ticket: string
): Promise<string | null> {
  const record = await LoginOtp.findOne({
    userId,
    purpose: "change_email",
    sessionTicket: ticket,
    ticketConsumedAt: { $ne: null },
  }).exec();
  if (!record) return null;
  return record.targetEmail ?? null;
}
