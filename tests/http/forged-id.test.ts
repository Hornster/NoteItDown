import { beforeAll, describe, expect, it } from "vitest";
import type { PostgrestSingleResponse, SupabaseClient } from "@supabase/supabase-js";

import { HTTP_STATUS } from "@/lib/constants/http-status";
import { LAST_CAMPAIGN_COOKIE } from "@/lib/campaign-cookie";
import { commitImage, listNoteImages, prepareUpload } from "@/lib/services/note-images";
import { createCampaign, getCampaign, renameCampaign } from "@/lib/services/campaigns";
import { getNote } from "@/lib/services/notes";
import type { Note } from "@/types";

import { webpFixture } from "../integration/helpers";
import { createTestUser } from "../support/test-user";
import { expectApiNotFound, expectBodyLacks } from "./support/assertions";
import { send, type Jar } from "./support/client";
import { signInJar } from "./support/session";

// Auth budget (test-plan.md §6.3): exactly 4 auth calls in this file — 2 signUps (createTestUser) and
// 2 signins (signInJar), once per tenant in beforeAll.

interface Tenant {
  client: SupabaseClient;
  userId: string;
  campaignId: string;
}

const RUN = crypto.randomUUID();
const A_CAMPAIGN_NAME = `Forged-A-primary-${RUN}`;
const A_CAMPAIGN2_NAME = `Forged-A-secondary-${RUN}`;
const A_NOTE_NAME = `Forged-A-note-${RUN}`;
const A_NOTE_CONTENT = `Forged-A-secret-content-${RUN}`;
const A_IMAGE_ALT = `Forged-A-image-alt-${RUN}`;

let a: Tenant;
let b: Tenant;
let aJar: Jar;
let bJar: Jar;
let campaign2Id = "";
let noteA = "";
let note2 = "";
let imageA = "";

/** Strings that identify A's data; none may appear in a response served to B. */
const secrets = [A_CAMPAIGN_NAME, A_CAMPAIGN2_NAME, A_NOTE_NAME, A_NOTE_CONTENT, A_IMAGE_ALT];

async function createNoteVia(client: SupabaseClient, campaignId: string, name: string, content: string) {
  const response: PostgrestSingleResponse<Note> = await client.rpc("create_note", {
    p_campaign_id: campaignId,
    p_name: name,
    p_content: content,
    p_new_type_name: "NPC",
  });
  if (response.error) throw new Error(`seed note failed: ${response.error.message}`);
  return response.data;
}

beforeAll(async () => {
  const userA = await createTestUser();
  const userB = await createTestUser();
  a = userA;
  b = userB;
  aJar = await signInJar(userA);
  bJar = await signInJar(userB);

  const renamed = await renameCampaign(a.client, a.campaignId, A_CAMPAIGN_NAME);
  if (!renamed.success) throw new Error("seed: renaming A's campaign failed");
  const second = await createCampaign(a.client, a.userId, A_CAMPAIGN2_NAME);
  if (!second.success) throw new Error("seed: creating A's second campaign failed");
  campaign2Id = second.campaign.id;

  noteA = (await createNoteVia(a.client, a.campaignId, A_NOTE_NAME, A_NOTE_CONTENT)).id;
  note2 = (await createNoteVia(a.client, campaign2Id, `Forged-A-note2-${RUN}`, "second campaign note")).id;

  const prepared = await prepareUpload(a.client, a.userId, a.campaignId, noteA, {
    mime: "image/webp",
    with_thumbnail: false,
  });
  if (!prepared.success) throw new Error(`seed: prepareUpload failed: ${prepared.reason}`);
  const put = await fetch(prepared.upload.image.signed_url, {
    method: "PUT",
    body: webpFixture(),
    headers: { "Content-Type": "image/webp" },
  });
  expect(put.status).toBe(HTTP_STATUS.OK);
  const committed = await commitImage(a.client, a.userId, a.campaignId, noteA, {
    path: prepared.upload.image.path,
    thumb_path: null,
    width: 1,
    height: 1,
    thumb_width: null,
    thumb_height: null,
    alt_text: A_IMAGE_ALT,
  });
  if (!committed.success) throw new Error(`seed: commitImage failed: ${committed.reason}`);
  imageA = committed.image.id;
});

interface ApiRow {
  name: string;
  method: string;
  path: () => string;
  json?: () => unknown;
}

const noteBody = () => ({ name: "Hijacked", content: "hijacked content", type: { kind: "new", name: "NPC" } });
const commitBody = (campaignId: string, noteId: string) => ({
  path: `${b.userId}/${campaignId}/${noteId}/${crypto.randomUUID()}.webp`,
  thumb_path: null,
  width: 1,
  height: 1,
  thumb_width: null,
  thumb_height: null,
  alt_text: null,
});

/** Note and image API rows for a given (campaign, note) pair, bodies schema-valid for the caller B. */
function noteAndImageRows(label: string, campaign: () => string, note: () => string): ApiRow[] {
  const base = () => `/api/campaigns/${campaign()}/notes/${note()}`;
  return [
    { name: `${label} PATCH note`, method: "PATCH", path: base, json: noteBody },
    { name: `${label} DELETE note`, method: "DELETE", path: base },
    {
      name: `${label} POST images/uploads`,
      method: "POST",
      path: () => `${base()}/images/uploads`,
      json: () => ({ mime: "image/webp", with_thumbnail: false }),
    },
    {
      name: `${label} POST images`,
      method: "POST",
      path: () => `${base()}/images`,
      json: () => commitBody(campaign(), note()),
    },
    { name: `${label} GET image`, method: "GET", path: () => `${base()}/images/${imageA}` },
    {
      name: `${label} PATCH image`,
      method: "PATCH",
      path: () => `${base()}/images/${imageA}`,
      json: () => ({ alt_text: "hijacked alt" }),
    },
    { name: `${label} DELETE image`, method: "DELETE", path: () => `${base()}/images/${imageA}` },
  ];
}

function sendRow(row: ApiRow, jar: Jar) {
  const json = row.json?.();
  return send(row.path(), json === undefined ? { method: row.method, jar } : { method: row.method, jar, json });
}

describe("positive control", () => {
  it("A's own jar is served A's note page", async () => {
    const res = await send(`/campaigns/${a.campaignId}/notes/${noteA}`, { jar: aJar });
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body).toContain(A_NOTE_NAME);
  });
});

describe("1.13 B's session on A's ids: pages", () => {
  const pages = [
    ["/campaigns/{A}", (c: string) => `/campaigns/${c}`],
    ["/campaigns/{A}/edit", (c: string) => `/campaigns/${c}/edit`],
    ["/campaigns/{A}/map", (c: string) => `/campaigns/${c}/map`],
    ["/campaigns/{A}/notes/new", (c: string) => `/campaigns/${c}/notes/new`],
    ["/campaigns/{A}/notes/{noteA}", (c: string) => `/campaigns/${c}/notes/${noteA}`],
    ["/campaigns/{A}/notes/{noteA}/edit", (c: string) => `/campaigns/${c}/notes/${noteA}/edit`],
  ] as const;

  it.each(pages)("GET %s is 404 without leaking A's data", async (_path, build) => {
    const res = await send(build(a.campaignId), { jar: bJar.clone() });
    expect(res.status).toBe(HTTP_STATUS.NOT_FOUND);
    expectBodyLacks(res, secrets);
  });

  it("GET /notes/<noteA> is 404 without leaking A's data", async () => {
    const res = await send(`/notes/${noteA}`, { jar: bJar.clone() });
    expect(res.status).toBe(HTTP_STATUS.NOT_FOUND);
    expectBodyLacks(res, secrets);
  });
});

describe("1.13 B's session on A's ids: APIs", () => {
  const rows: ApiRow[] = [
    {
      name: "PATCH campaign",
      method: "PATCH",
      path: () => `/api/campaigns/${a.campaignId}`,
      json: () => ({ name: "Hijacked campaign" }),
    },
    {
      name: "POST note",
      method: "POST",
      path: () => `/api/campaigns/${a.campaignId}/notes`,
      json: noteBody,
    },
    ...noteAndImageRows(
      "A/A",
      () => a.campaignId,
      () => noteA,
    ),
  ];

  it.each(rows.map((r) => [r.name, r] as const))("%s is 404 JSON", async (_name, row) => {
    const res = await sendRow(row, bJar.clone());
    expectApiNotFound(res);
    expectBodyLacks(res, secrets);
  });
});

describe("1.14 mixed ids", () => {
  it.each([
    ["page note", (c: string) => `/campaigns/${c}/notes/${noteA}`],
    ["page note edit", (c: string) => `/campaigns/${c}/notes/${noteA}/edit`],
  ])("B's own campaign with A's note: %s is 404", async (_name, build) => {
    const res = await send(build(b.campaignId), { jar: bJar.clone() });
    expect(res.status).toBe(HTTP_STATUS.NOT_FOUND);
    expectBodyLacks(res, secrets);
  });

  const bMixed = noteAndImageRows(
    "B/A",
    () => b.campaignId,
    () => noteA,
  );
  it.each(bMixed.map((r) => [r.name, r] as const))("%s is 404 JSON", async (_name, row) => {
    const res = await sendRow(row, bJar.clone());
    expectApiNotFound(res);
    expectBodyLacks(res, secrets);
  });

  // A's own note requested under A's other campaign: ownership passes, so only the
  // note-to-campaign check can answer 404. Only A's note name/content must be absent (A's campaign names
  // legitimately appear in A's own Topbar).
  const noteSecrets = [A_NOTE_NAME, A_NOTE_CONTENT, A_IMAGE_ALT];

  it.each([
    ["page note", (c: string) => `/campaigns/${c}/notes/${noteA}`],
    ["page note edit", (c: string) => `/campaigns/${c}/notes/${noteA}/edit`],
  ])("A's note under A's other campaign: %s is 404", async (_name, build) => {
    const res = await send(build(campaign2Id), { jar: aJar.clone() });
    expect(res.status).toBe(HTTP_STATUS.NOT_FOUND);
    expectBodyLacks(res, noteSecrets);
  });

  it("A's note under A's other campaign: PATCH note is 404 JSON", async () => {
    const res = await send(`/api/campaigns/${campaign2Id}/notes/${noteA}`, {
      method: "PATCH",
      jar: aJar.clone(),
      json: noteBody(),
    });
    expectApiNotFound(res);
  });

  it("A's note under A's other campaign: GET image is 404 JSON", async () => {
    const res = await send(`/api/campaigns/${campaign2Id}/notes/${noteA}/images/${imageA}`, { jar: aJar.clone() });
    expectApiNotFound(res);
  });

  it("A's second-campaign note is served under its own campaign (control)", async () => {
    const res = await send(`/campaigns/${campaign2Id}/notes/${note2}`, { jar: aJar.clone() });
    expect(res.status).toBe(HTTP_STATUS.OK);
  });
});

describe("1.2 forged last_campaign_id cookie (route level)", () => {
  it.each([
    ["/dashboard", (c: string) => `/campaigns/${c}`],
    ["/map", (c: string) => `/campaigns/${c}/map`],
    ["/notes/new", (c: string) => `/campaigns/${c}/notes/new`],
    ["/campaigns", (c: string) => `/campaigns/${c}`],
  ])("GET %s redirects B to B's own campaign", async (path, expected) => {
    const jar = bJar.clone();
    jar.set(LAST_CAMPAIGN_COOKIE, a.campaignId);
    expect(jar.header()).toContain(`${LAST_CAMPAIGN_COOKIE}=${a.campaignId}`);

    const res = await send(path, { jar });
    expect(res.status).toBe(302);
    expect(res.location).toBe(expected(b.campaignId));
    expect(res.body).not.toContain(a.campaignId);
  });
});

describe("A's data is unchanged after every forged write", () => {
  it("campaign, note and image rows still hold A's original values", async () => {
    const campaign = await getCampaign(a.client, a.campaignId);
    expect(campaign?.name).toBe(A_CAMPAIGN_NAME);

    const note = await getNote(a.client, noteA);
    expect(note?.name).toBe(A_NOTE_NAME);
    expect(note?.content).toBe(A_NOTE_CONTENT);
    expect(note?.campaign_id).toBe(a.campaignId);

    const images = await listNoteImages(a.client, noteA);
    expect(images).toHaveLength(1);
    expect(images[0]?.id).toBe(imageA);
    expect(images[0]?.alt_text).toBe(A_IMAGE_ALT);

    expect((await getNote(a.client, note2))?.campaign_id).toBe(campaign2Id);
  });
});
