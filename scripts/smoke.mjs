// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const email = `smoke-${Date.now()}@example.com`;
const password = "Smoke-Test-Passw0rd!";
const jar = new Map();

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(response) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired) jar.delete(name.trim());
    else jar.set(name.trim(), rest.join("="));
  }
}

async function request(path, { method = "GET", form, json } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(json ? { "Content-Type": "application/json" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : json ? JSON.stringify(json) : undefined,
  });
  storeCookies(response);
  return { status: response.status, location: response.headers.get("location") ?? "" };
}

let dashboardLocation = "";

const steps = [
  ["home renders", () => request("/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ["map redirects anonymous user", () => request("/map"), { status: 302, location: "/auth/signin" }],
  [
    "signup creates account",
    () => request("/api/auth/signup", { method: "POST", form: { email, password } }),
    { status: 302, location: "/auth/confirm-email" },
  ],
  [
    "signin rejects wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong" } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "signin accepts correct password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/" },
  ],
  [
    "dashboard redirects signed-in user to their campaign",
    async () => {
      const result = await request("/dashboard");
      dashboardLocation = result.location;
      return result;
    },
    { status: 302, location: "/campaigns/" },
  ],
  ["campaign page renders for signed-in user", () => request(dashboardLocation), { status: 200 }],
  [
    "map redirects signed-in user to their campaign's map",
    () => request("/map"),
    { status: 302, location: "/campaigns/" },
  ],
  ["unknown campaign id 404s", () => request("/campaigns/00000000-0000-0000-0000-000000000000"), { status: 404 }],
  ["malformed campaign id 404s", () => request("/campaigns/not-a-uuid"), { status: 404 }],
  [
    "new-note redirects signed-in user to their campaign's form",
    () => request("/notes/new"),
    { status: 302, location: "/campaigns/" },
  ],
  ["unknown legacy note id 404s", () => request("/notes/00000000-0000-0000-0000-000000000000"), { status: 404 }],
  [
    "create-campaign API creates a campaign",
    () => request("/api/campaigns", { method: "POST", json: { name: "Smoke campaign" } }),
    { status: 201 },
  ],
  [
    "rename-campaign API 404s a malformed id",
    () => request("/api/campaigns/not-a-uuid", { method: "PATCH", json: { name: "Renamed" } }),
    { status: 404 },
  ],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  [
    "campaigns route redirects anonymous user",
    () => request("/campaigns/00000000-0000-0000-0000-000000000000"),
    { status: 302, location: "/auth/signin" },
  ],
];

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined || actual.location.startsWith(expected.location));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.location ?? ""}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
