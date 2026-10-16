import { randomInt, randomBytes } from "crypto";
import { NextResponse } from "next/server";
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

export class OtpDeliveryError extends Error {}

// Shared 502 for every route that emails a code, so a mail-server outage
// reads the same everywhere instead of surfacing as a bare 500.
export function otpDeliveryFailed(): NextResponse {
  return NextResponse.json(
    { error: "We couldn't send the verification email. Try again in a moment, or contact your administrator." },
    { status: 502 }
  );
}

// Issue a new OTP for a user and email it. An earlier pending code for
// this user *and this purpose* is simply superseded — verify() only ever
// looks at the most recent unconsumed one for that (userId, purpose) pair,
// so an old code stops being useful once a new one for the same purpose is
// issued. A pending code for a *different* purpose is untouched.
//
// `targetEmail` is set for change_email only: the code is sent to the new
// address being verified.
export async function issueOtp(
  userId: Types.ObjectId,
  email: string,
  purpose: OtpPurpose = "login",
  targetEmail?: string
): Promise<void> {
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);

  const record = await LoginOtp.create({
    userId,
    purpose,
    targetEmail: targetEmail ?? null,
    codeHash,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  try {
    await sendOtpEmail(email, code);
  } catch (err) {
    // A code nobody received must not stay "most recent" — it would make
    // an earlier, actually-delivered code unusable.
    await LoginOtp.deleteOne({ _id: record._id }).catch(() => undefined);
    throw new OtpDeliveryError(err instanceof Error ? err.message : String(err));
  }
}

export type OtpVerifyResult =
  | { ok: true; sessionTicket: string }
  | { ok: false; reason: "invalid" | "expired" | "too_many_attempts" | "none_pending" };

// Verify a submitted code against the most recent unconsumed, unexpired OTP
// for this (userId, purpose). On success, mints a one-time session ticket.
//
// Both writes are atomic, conditional updates rather than read-modify-save:
//   - a wrong guess claims an attempt with $inc guarded by attempts < MAX,
//     so parallel guesses can't each read "0 attempts" and exceed the cap;
//   - a right guess consumes the code with a filter on consumedAt: null, so
//     two parallel correct submissions can't both mint a ticket.
export async function verifyOtp(
  userId: Types.ObjectId,
  submittedCode: string,
  purpose: OtpPurpose = "login"
): Promise<OtpVerifyResult> {
  const pending = await LoginOtp.findOne({ userId, purpose, consumedAt: null })
    .sort({ createdAt: -1 })
    .lean();

  if (!pending) return { ok: false, reason: "none_pending" };
  if (pending.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };

  // Claim one attempt before comparing — the slot is spent whether or not
  // the guess is right, which is what makes the cap hold under concurrency.
  const claimed = await LoginOtp.findOneAndUpdate(
    { _id: pending._id, consumedAt: null, attempts: { $lt: MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { new: true }
  ).lean();
  if (!claimed) return { ok: false, reason: "too_many_attempts" };

  const valid = await bcrypt.compare(submittedCode, pending.codeHash);
  if (!valid) {
    return { ok: false, reason: claimed.attempts >= MAX_ATTEMPTS ? "too_many_attempts" : "invalid" };
  }

  const sessionTicket = randomBytes(24).toString("hex");
  const consumed = await LoginOtp.findOneAndUpdate(
    { _id: pending._id, consumedAt: null },
    { $set: { consumedAt: new Date(), sessionTicket } },
    { new: true }
  ).lean();
  // Lost a race with a parallel correct submission — that one got the ticket.
  if (!consumed) return { ok: false, reason: "none_pending" };
  return { ok: true, sessionTicket };
}

// Redeem a session ticket exactly once, scoped to the purpose it was issued
// for. A single atomic update: the filter requires the ticket to be
// unredeemed and still within its TTL, so two parallel redemptions of the
// same ticket can't both succeed.
export async function redeemSessionTicket(
  userId: Types.ObjectId,
  ticket: string,
  purpose: OtpPurpose = "login"
): Promise<boolean> {
  if (!ticket) return false;
  const redeemed = await LoginOtp.findOneAndUpdate(
    {
      userId,
      purpose,
      sessionTicket: ticket,
      ticketConsumedAt: null,
      consumedAt: { $gte: new Date(Date.now() - TICKET_TTL_MS) },
    },
    { $set: { ticketConsumedAt: new Date() } }
  ).lean();
  return !!redeemed;
}

// change_email only: the new address a verified ticket was actually issued
// for — the PATCH route needs this to know which email to write, since the
// client only ever sends back an opaque ticket, never the raw new-email text.
export async function getVerifiedTargetEmail(
  userId: Types.ObjectId,
  ticket: string
): Promise<string | null> {
  const record = await LoginOtp.findOne({
    userId,
    purpose: "change_email",
    sessionTicket: ticket,
    ticketConsumedAt: { $ne: null },
  }).lean();
  if (!record) return null;
  return record.targetEmail ?? null;
}
