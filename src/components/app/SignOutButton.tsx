"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="flex items-center gap-2 w-full mt-2.5 px-2.5 py-1.5 bg-transparent border-0 rounded-sm text-ink-faint text-[0.78rem] font-body cursor-pointer text-left"
    >
      <LogOut size={14} />
      Sign out
    </button>
  );
}
