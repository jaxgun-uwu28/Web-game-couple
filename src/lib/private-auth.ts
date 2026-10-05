export const privateEmails = [
  "lancerobertmacorol8@gmail.com",
  "elainemaeescosio49@gmail.com",
] as const;

export function isPrivateEmail(email?: string) {
  return privateEmails.some(
    (allowed) => allowed === email?.trim().toLowerCase(),
  );
}
