import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPair, SignJWT } from "jose";
import {
  authConfiguration,
  developmentIdentity,
  verifyIdentity,
} from "../src/lib/auth/verify";
const config = {
  issuer: "https://example.cloudflareaccess.com",
  audience: "estate",
  users: ["alex@example.com", "jamie@example.com"],
};
const keys = generateKeyPair("RS256");
async function token(overrides: Record<string, unknown> = {}) {
  return new SignJWT({ email: "alex@example.com", ...overrides })
    .setProtectedHeader({ alg: "RS256" })
    .setSubject("user-1")
    .setIssuedAt()
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setExpirationTime("5m")
    .sign((await keys).privateKey);
}
test("valid signed identity is accepted", async () => {
  const identity = await verifyIdentity(
    await token(),
    async () => (await keys).publicKey,
    config,
  );
  assert.equal(identity.email, "alex@example.com");
  assert.equal(identity.demo, false);
});
test("non-allowlisted identity is rejected", async () => {
  await assert.rejects(
    verifyIdentity(
      await token({ email: "other@example.com" }),
      async () => (await keys).publicKey,
      config,
    ),
  );
});
test("wrong audience and issuer are rejected", async () => {
  for (const invalid of [
    { ...config, audience: "other" },
    { ...config, issuer: "https://other.cloudflareaccess.com" },
  ])
    await assert.rejects(
      verifyIdentity(
        await token(),
        async () => (await keys).publicKey,
        invalid,
      ),
    );
});
test("forged signature, missing JWT, and email-only claims fail", async () => {
  const forged = await generateKeyPair("RS256");
  await assert.rejects(
    verifyIdentity(await token(), async () => forged.publicKey, config),
  );
  for (const value of ["", "alex@example.com"])
    await assert.rejects(
      verifyIdentity(value, async () => (await keys).publicKey, config),
    );
});
test("expired and expiry-less JWTs fail", async () => {
  for (const expiry of [undefined, 1]) {
    let jwt = new SignJWT({ email: "alex@example.com" })
      .setProtectedHeader({ alg: "RS256" })
      .setSubject("user-1")
      .setIssuedAt()
      .setIssuer(config.issuer)
      .setAudience(config.audience);
    if (expiry !== undefined) jwt = jwt.setExpirationTime(expiry);
    await assert.rejects(
      verifyIdentity(
        await jwt.sign((await keys).privateKey),
        async () => (await keys).publicKey,
        config,
      ),
    );
  }
});
test("mock identity requires explicit development mode", () => {
  assert.equal(developmentIdentity({ NODE_ENV: "development" }), null);
  assert.equal(
    developmentIdentity({ NODE_ENV: "development", DEV_AUTH_ENABLED: "true" })
      ?.demo,
    true,
  );
  for (const mode of ["production", "test", undefined])
    assert.throws(() =>
      developmentIdentity({ NODE_ENV: mode, DEV_AUTH_ENABLED: "true" }),
    );
});
test("configuration requires two distinct users and a trusted issuer format", () => {
  const env = {
    CF_ACCESS_ISSUER: config.issuer,
    CF_ACCESS_AUDIENCE: config.audience,
    AUTH_USER_EMAILS: config.users.join(","),
  };
  assert.deepEqual(authConfiguration(env), config);
  for (const users of [
    "",
    "alex@example.com",
    "alex@example.com,Alex@example.com",
  ])
    assert.throws(() => authConfiguration({ ...env, AUTH_USER_EMAILS: users }));
  assert.throws(() =>
    authConfiguration({ ...env, CF_ACCESS_ISSUER: "http://localhost" }),
  );
});
