import { jwtVerify, type JWTVerifyGetKey } from "jose";

export interface Identity {
  email: string;
  displayName: string;
  demo: boolean;
}
export function developmentIdentity(
  env: Record<string, string | undefined>,
): Identity | null {
  if (env.DEV_AUTH_ENABLED !== "true") return null;
  if (env.NODE_ENV !== "development")
    throw new Error("Development identity is forbidden outside development");
  return { email: "alex@example.invalid", displayName: "Alex", demo: true };
}
export function authConfiguration(env: Record<string, string | undefined>) {
  const issuer = env.CF_ACCESS_ISSUER?.replace(/\/$/, "");
  if (!issuer || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer))
    throw new Error("Invalid Access issuer");
  const audience = env.CF_ACCESS_AUDIENCE?.trim();
  const users = (env.AUTH_USER_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (
    !audience ||
    users.length !== 2 ||
    new Set(users).size !== 2 ||
    users.some((s) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
  )
    throw new Error("Configure an audience and exactly two users");
  return { issuer, audience, users };
}
export async function verifyIdentity(
  token: string,
  key: JWTVerifyGetKey,
  config: ReturnType<typeof authConfiguration>,
): Promise<Identity> {
  const { payload } = await jwtVerify(token, key, {
    issuer: config.issuer,
    audience: config.audience,
    algorithms: ["RS256"],
    requiredClaims: ["exp", "iat", "sub", "email"],
  });
  if (
    typeof payload.email !== "string" ||
    !config.users.includes(payload.email.toLowerCase())
  )
    throw new Error("Unauthorised user");
  const email = payload.email.toLowerCase();
  return { email, displayName: email.split("@")[0], demo: false };
}
