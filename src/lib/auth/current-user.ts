import "server-only";
import { headers, cookies } from "next/headers";
import { createRemoteJWKSet } from "jose";
import {
  authConfiguration,
  developmentIdentity,
  verifyIdentity,
} from "./verify";
let keySet: ReturnType<typeof createRemoteJWKSet> | undefined;
export async function currentUser() {
  const demo = developmentIdentity(process.env);
  if (demo) {
    const chosen = (await cookies()).get("estate-demo-user")?.value;
    return chosen === "jamie"
      ? { email: "jamie@example.invalid", displayName: "Jamie", demo: true }
      : demo;
  }
  const config = authConfiguration(process.env);
  const token = (await headers()).get("cf-access-jwt-assertion");
  if (!token) throw new Error("Access authentication required");
  keySet ??= createRemoteJWKSet(
    new URL(`${config.issuer}/cdn-cgi/access/certs`),
  );
  return verifyIdentity(token, keySet, config);
}
// Every future data operation and file route must call this guard independently.
