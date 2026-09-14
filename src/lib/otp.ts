import { randomInt, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import LoginOtp from "@/models/LoginOtp";
import { sendOtpEmail } from "@/lib/mailer";
import type { Types } from "mongoose";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
// The session ticket only has to survive the moment between "OTP verified
// in the browser" and "the resulting signIn() call reaches authorize()" —
// a couple of minutes is generous, not a real usability constraint.
const TICKET_TTL_MS = 2 * 60 * 1000;

function generateCode(): string {
  // 6 digits, zero-padded — randomInt's upper bound is exclusive.
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

// Issue a new OTP for a user and email it. An earlier pending code for
// this user is simply superseded — verify() only ever looks at the most
// recent unconsumed one, so an old code stops being useful once a new one
// is issued, even though it isn't explicitly deleted.
export async function issueOtp(userId: Types.ObjectId, email: string): Promise<void> {
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);

  await LoginOtp.create({
    userId,
    codeHash,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  await sendOtpEmail(email, code);
}

export type OtpVerifyResult =
  | { ok: true; sessionTicket: string }
  | { ok: false; reason: "invalid" | "expired" | "too_many_attempts" | "none_pending" };

// Verify a submitted code against the most recent unconsumed, unexpired
// OTP for this user. On success, mints a one-time session ticket (and
// marks the code consumed so it can't be reused) that the caller hands to
// NextAuth's authorize() to actually complete sign-in. On a wrong guess,
// increments the attempt counter so a code can only be brute-forced
// MAX_ATTEMPTS times before it's dead.
export async function verifyOtp(userId: Types.ObjectId, submittedCode: string): Promise<OtpVerifyResult> {
  const pending = await LoginOtp.findOne({ userId, consumedAt: null }).sort({ createdAt: -1 }).exec();

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

// Redeem a session ticket exactly once. Called from NextAuth's authorize()
// after the password check passes, in place of re-verifying the OTP code
// itself — the ticket already proves the code was checked correctly, and
// a fresh, unconsumed match on this user is the only thing that lets
// authorize() actually mint a session.
export async function redeemSessionTicket(userId: Types.ObjectId, ticket: string): Promise<boolean> {
  const record = await LoginOtp.findOne({ userId, sessionTicket: ticket, ticketConsumedAt: null }).exec();
  if (!record) return false;
  if (record.consumedAt && Date.now() - record.consumedAt.getTime() > TICKET_TTL_MS) return false;

  record.ticketConsumedAt = new Date();
  await record.save();
  return true;
}
