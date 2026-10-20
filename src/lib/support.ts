// Help & Support contact details, shown on /help and used as the
// destination for the support form. SUPPORT_EMAIL can override the
// address server-side without a code change.
export const SUPPORT_CONTACT = {
  name: "Abdul Rafe",
  role: "Developer",
  email: "abdulrafe.me@gmail.com",
} as const;

export const SUPPORT_TOPICS = [
  { value: "bug", label: "Something isn't working" },
  { value: "question", label: "How do I…?" },
  { value: "access", label: "Login or access problem" },
  { value: "data", label: "Wrong or missing data" },
  { value: "feature", label: "Feature request" },
] as const;

export type SupportTopic = (typeof SUPPORT_TOPICS)[number]["value"];
