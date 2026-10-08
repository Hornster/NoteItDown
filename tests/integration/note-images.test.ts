import { beforeAll, describe, expect, it } from "vitest";
import type { PostgrestSingleResponse, SupabaseClient } from "@supabase/supabase-js";

import { createTestNote, createTestUser, jpegFixture, webpFixture } from "./helpers";

import { DB_CONSTRAINT } from "@/lib/constants/db-constraints";
import { PG_ERROR } from "@/lib/constants/db-error-codes";
import { HTTP_STATUS } from "@/lib/constants/http-status";
import { MAX_IMAGE_BYTES, NOTE_IMAGES_BUCKET } from "@/lib/images/limits";
import { deleteNote } from "@/lib/services/notes";
import {
  commitImage,
  getImageUrls,
  listNoteImages,
  prepareUpload,
  removeNoteFolder,
  toImageViews,
} from "@/lib/services/note-images";
import type { Note } from "@/types";

interface Tenant {
  client: SupabaseClient;
  userId: string;
  campaignId: string;
}

let a: Tenant;
let b: Tenant;

beforeAll(async () => {
  a = await createTestUser();
  b = await createTestUser();
});

function objectPath(tenant: Tenant, campaignId: string, noteId: string, suffix = ".webp"): string {
  return `${tenant.userId}/${campaignId}/${noteId}/${crypto.randomUUID()}${suffix}`;
}

function rowFor(tenant: Tenant, note: Note, position: number, overrides: Record<string, unknown> = {}) {
  return {
    campaign_id: note.campaign_id,
    note_id: note.id,
    position,
    path: objectPath(tenant, note.campaign_id, note.id),
    thumb_path: null,
    mime: "image/webp",
    width: 100,
    height: 100,
    thumb_width: null,
    thumb_height: null,
    byte_size: 1000,
    alt_text: null,
    ...overrides,
  };
}

// Storage reports a policy denial as HTTP 400 with body statusCode "403"; asserting the message
// proves the policy fired rather than some unrelated (network, MIME) failure.
function expectRlsDenied(error: unknown) {
  expect(error).toMatchObject({ statusCode: String(HTTP_STATUS.FORBIDDEN) });
  expect((error as Error).message).toMatch(/row-level security/);
}

async function upload(client: SupabaseClient, path: string, body: Uint8Array = webpFixture()) {
  return client.storage.from(NOTE_IMAGES_BUCKET).upload(path, body, { contentType: "image/webp" });
}

describe("note_images table", () => {
  it("holds the 2-image cap: a third position and a duplicate position both fail", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    expect((await a.client.from("note_images").insert(rowFor(a, note, 0))).error).toBeNull();
    expect((await a.client.from("note_images").insert(rowFor(a, note, 1))).error).toBeNull();

    const third = await a.client.from("note_images").insert(rowFor(a, note, 2));
    expect(third.error?.code).toBe(PG_ERROR.CHECK_VIOLATION);

    const duplicate = await a.client.from("note_images").insert(rowFor(a, note, 0));
    expect(duplicate.error?.code).toBe(PG_ERROR.UNIQUE_VIOLATION);
    expect(duplicate.error?.message).toContain(DB_CONSTRAINT.NOTE_IMAGES_NOTE_POSITION_KEY);
  });

  it("rejects a campaign_id/note_id mismatch (composite FK)", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const { data, error }: PostgrestSingleResponse<{ id: string }> = await a.client
      .from("campaigns")
      .insert({ owner_id: a.userId, name: `Second ${crypto.randomUUID().slice(0, 8)}` })
      .select("id")
      .single();
    if (error) {
      throw new Error(`failed to create second campaign: ${error.message}`);
    }
    const secondCampaignId = data.id;

    const result = await a.client
      .from("note_images")
      .insert(rowFor(a, note, 0, { campaign_id: secondCampaignId, path: objectPath(a, secondCampaignId, note.id) }));
    expect(result.error?.code).toBe(PG_ERROR.FOREIGN_KEY_VIOLATION);
    expect(result.error?.message).toContain(DB_CONSTRAINT.NOTE_IMAGES_NOTE_SAME_CAMPAIGN_FKEY);
  });

  it("rejects a path whose segments do not match the row (path-shape check)", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const wrongNote = await a.client
      .from("note_images")
      .insert(rowFor(a, note, 0, { path: objectPath(a, a.campaignId, crypto.randomUUID()) }));
    expect(wrongNote.error?.code).toBe(PG_ERROR.CHECK_VIOLATION);

    const wrongThumb = await a.client.from("note_images").insert(
      rowFor(a, note, 0, {
        thumb_path: objectPath(a, crypto.randomUUID(), note.id, "-thumb.webp"),
        thumb_width: 10,
        thumb_height: 10,
      }),
    );
    expect(wrongThumb.error?.code).toBe(PG_ERROR.CHECK_VIOLATION);
  });

  it("rejects inconsistent thumbnail nullability", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const result = await a.client
      .from("note_images")
      .insert(rowFor(a, note, 0, { thumb_path: objectPath(a, a.campaignId, note.id, "-thumb.webp") }));
    expect(result.error?.code).toBe(PG_ERROR.CHECK_VIOLATION);
  });

  it("rejects an insert whose path belongs to another user's folder", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const result = await a.client
      .from("note_images")
      .insert(rowFor(a, note, 0, { path: objectPath(b, a.campaignId, note.id) }));
    expect(result.error?.code).toBe(PG_ERROR.INSUFFICIENT_PRIVILEGE);
  });

  it("rejects an insert whose thumb_path belongs to another user's folder", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const result = await a.client.from("note_images").insert(
      rowFor(a, note, 0, {
        thumb_path: objectPath(b, a.campaignId, note.id, "-thumb.webp"),
        thumb_width: 50,
        thumb_height: 50,
      }),
    );
    expect(result.error?.code).toBe(PG_ERROR.INSUFFICIENT_PRIVILEGE);
  });

  it("allows updating only alt_text", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const row = rowFor(a, note, 0);
    const { data, error } = await a.client.from("note_images").insert(row).select("id").single();
    expect(error).toBeNull();
    const id = (data as { id: string }).id;

    const alt = await a.client.from("note_images").update({ alt_text: "A map" }).eq("id", id).select("alt_text");
    expect(alt.error).toBeNull();
    expect(alt.data).toEqual([{ alt_text: "A map" }]);

    const blank = await a.client.from("note_images").update({ alt_text: "   " }).eq("id", id);
    expect(blank.error?.code).toBe(PG_ERROR.CHECK_VIOLATION);

    const path = await a.client
      .from("note_images")
      .update({ path: objectPath(a, a.campaignId, note.id) })
      .eq("id", id);
    expect(path.error?.code).toBe(PG_ERROR.INSUFFICIENT_PRIVILEGE);
  });

  it("hides rows from other tenants and cascades when the note is deleted", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    expect((await a.client.from("note_images").insert(rowFor(a, note, 0))).error).toBeNull();

    const foreign = await b.client.from("note_images").select("id").eq("note_id", note.id);
    expect(foreign.data).toEqual([]);

    const foreignDelete = await b.client.from("note_images").delete().eq("note_id", note.id).select("id");
    expect(foreignDelete.data).toEqual([]);

    const del = await a.client.from("notes").delete().eq("id", note.id);
    expect(del.error).toBeNull();
    const after = await a.client.from("note_images").select("id").eq("note_id", note.id);
    expect(after.data).toEqual([]);
  });
});

describe("storage.objects policies", () => {
  it("lets the owner upload under their own note", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const result = await upload(a.client, objectPath(a, a.campaignId, note.id));
    expect(result.error).toBeNull();
  });

  it("blocks tenant B from uploading into A's folder or under A's note id", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const intoAFolder = await upload(b.client, objectPath(a, a.campaignId, note.id));
    expectRlsDenied(intoAFolder.error);

    const underANote = await upload(b.client, objectPath(b, b.campaignId, note.id));
    expectRlsDenied(underANote.error);
  });

  it("blocks uploading under the owner's own note paired with another of their campaigns", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const other = await a.client
      .from("campaigns")
      .insert({ owner_id: a.userId, name: `Other ${crypto.randomUUID()}` })
      .select("id")
      .single<{ id: string }>();
    expect(other.error).toBeNull();
    const result = await upload(a.client, objectPath(a, other.data?.id ?? "", note.id));
    expectRlsDenied(result.error);
  });

  it("blocks tenant B from signing upload URLs for the same two paths", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const bucket = b.client.storage.from(NOTE_IMAGES_BUCKET);
    expectRlsDenied((await bucket.createSignedUploadUrl(objectPath(a, a.campaignId, note.id))).error);
    expectRlsDenied((await bucket.createSignedUploadUrl(objectPath(b, b.campaignId, note.id))).error);
  });

  it("blocks tenant B from listing, signing or removing A's objects", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const path = objectPath(a, a.campaignId, note.id);
    expect((await upload(a.client, path)).error).toBeNull();

    const folder = `${a.userId}/${a.campaignId}/${note.id}`;
    const bBucket = b.client.storage.from(NOTE_IMAGES_BUCKET);

    const listed = await bBucket.list(folder);
    expect(listed.data ?? []).toEqual([]);

    expect((await bBucket.createSignedUrl(path, 60)).error).not.toBeNull();

    const removed = await bBucket.remove([path]);
    expect(removed.data ?? []).toEqual([]);

    const stillThere = await a.client.storage.from(NOTE_IMAGES_BUCKET).list(folder);
    expect(stillThere.data?.length).toBe(1);
  });

  it("lets A remove its own objects after the note row is gone", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const path = objectPath(a, a.campaignId, note.id);
    expect((await upload(a.client, path)).error).toBeNull();

    expect((await a.client.from("notes").delete().eq("id", note.id)).error).toBeNull();

    const bucket = a.client.storage.from(NOTE_IMAGES_BUCKET);
    const removed = await bucket.remove([path]);
    expect(removed.error).toBeNull();
    expect(removed.data).toHaveLength(1);
    const listed = await bucket.list(`${a.userId}/${a.campaignId}/${note.id}`);
    expect(listed.data).toEqual([]);
  });
});

describe("signed upload behaviour (observed against local Supabase)", () => {
  async function signed(note: Note) {
    const { data, error } = await a.client.storage
      .from(NOTE_IMAGES_BUCKET)
      .createSignedUploadUrl(objectPath(a, a.campaignId, note.id));
    if (error) {
      throw new Error(`createSignedUploadUrl failed: ${error.message}`);
    }
    return data;
  }

  async function put(url: string, body: Uint8Array<ArrayBuffer>, contentType: string) {
    const response = await fetch(url, { method: "PUT", body, headers: { "Content-Type": contentType } });
    const text = await response.text();
    return { status: response.status, body: JSON.parse(text) as Record<string, unknown> };
  }

  it("accepts a bare fetch PUT without an apikey header", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const target = await signed(note);
    const result = await put(target.signedUrl, webpFixture(), "image/webp");
    expect(result.status).toBe(HTTP_STATUS.OK);
  });

  it("rejects a body over the bucket size limit (HTTP 400, body statusCode 413)", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const target = await signed(note);
    const result = await put(target.signedUrl, new Uint8Array(MAX_IMAGE_BYTES + 1), "image/webp");
    expect(result.status).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(result.body.statusCode).toBe(String(HTTP_STATUS.PAYLOAD_TOO_LARGE));
  });

  it("rejects a disallowed content type (HTTP 400, body statusCode 415)", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const target = await signed(note);
    const result = await put(target.signedUrl, webpFixture(), "image/png");
    expect(result.status).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(result.body.statusCode).toBe(String(HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE));
  });
});

describe("note-images service flow", () => {
  async function prepareAndPut(note: Note, withThumbnail: boolean) {
    const prepared = await prepareUpload(a.client, a.userId, a.campaignId, note.id, {
      mime: "image/webp",
      with_thumbnail: withThumbnail,
    });
    if (!prepared.success) {
      throw new Error(`prepareUpload failed: ${prepared.reason}`);
    }
    const { image, thumbnail } = prepared.upload;
    for (const target of [image, thumbnail]) {
      if (!target) {
        continue;
      }
      const response = await fetch(target.signed_url, {
        method: "PUT",
        body: webpFixture(),
        headers: { "Content-Type": "image/webp" },
      });
      expect(response.status).toBe(HTTP_STATUS.OK);
    }
    return prepared.upload;
  }

  it("prepare -> PUT -> commit gives one row and a view with a thumb_url", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const upload = await prepareAndPut(note, true);

    const committed = await commitImage(a.client, a.userId, a.campaignId, note.id, {
      path: upload.image.path,
      thumb_path: upload.thumbnail?.path ?? null,
      width: 1000,
      height: 800,
      thumb_width: 512,
      thumb_height: 410,
      alt_text: "A castle",
    });
    expect(committed.success).toBe(true);
    expect(committed.success && committed.image.position).toBe(0);

    const images = await listNoteImages(a.client, note.id);
    expect(images).toHaveLength(1);
    expect(images[0]?.byte_size).toBeGreaterThan(0);

    const views = await toImageViews(a.client, images);
    expect(views).toHaveLength(1);
    expect(views[0]?.thumb_url).toMatch(/^http/);
    expect(views[0]?.alt_text).toBe("A castle");

    const urls = await getImageUrls(a.client, a.campaignId, note.id, images[0]?.id ?? "");
    expect(urls.success).toBe(true);
    if (urls.success) {
      expect((await fetch(urls.urls.url)).status).toBe(HTTP_STATUS.OK);
    }
  });

  it("commits a JPEG (Safari fallback) with a .jpg path", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const prepared = await prepareUpload(a.client, a.userId, a.campaignId, note.id, {
      mime: "image/jpeg",
      with_thumbnail: false,
    });
    if (!prepared.success) {
      throw new Error(`prepareUpload failed: ${prepared.reason}`);
    }
    expect(prepared.upload.image.path.endsWith(".jpg")).toBe(true);
    const put = await fetch(prepared.upload.image.signed_url, {
      method: "PUT",
      body: jpegFixture(),
      headers: { "Content-Type": "image/jpeg" },
    });
    expect(put.status).toBe(HTTP_STATUS.OK);

    const committed = await commitImage(a.client, a.userId, a.campaignId, note.id, {
      path: prepared.upload.image.path,
      thumb_path: null,
      width: 1,
      height: 1,
      thumb_width: null,
      thumb_height: null,
      alt_text: null,
    });
    expect(committed.success).toBe(true);
    expect((await listNoteImages(a.client, note.id))[0]?.mime).toBe("image/jpeg");
  });

  it("stops at two images: a third prepare gives limit_reached", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    for (let i = 0; i < 2; i++) {
      const upload = await prepareAndPut(note, false);
      const committed = await commitImage(a.client, a.userId, a.campaignId, note.id, {
        path: upload.image.path,
        thumb_path: null,
        width: 10,
        height: 10,
        thumb_width: null,
        thumb_height: null,
        alt_text: null,
      });
      expect(committed.success && committed.image.position).toBe(i);
    }
    const third = await prepareUpload(a.client, a.userId, a.campaignId, note.id, {
      mime: "image/webp",
      with_thumbnail: false,
    });
    expect(third).toMatchObject({ success: false, reason: "limit_reached" });
  });

  it("a replayed commit fails without removing the committed image's objects", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const bucket = a.client.storage.from(NOTE_IMAGES_BUCKET);
    const commitOf = (upload: Awaited<ReturnType<typeof prepareAndPut>>) =>
      commitImage(a.client, a.userId, a.campaignId, note.id, {
        path: upload.image.path,
        thumb_path: upload.thumbnail?.path ?? null,
        width: 1000,
        height: 800,
        thumb_width: upload.thumbnail ? 512 : null,
        thumb_height: upload.thumbnail ? 410 : null,
        alt_text: null,
      });
    const expectStored = async (upload: Awaited<ReturnType<typeof prepareAndPut>>) => {
      expect((await bucket.info(upload.image.path)).error).toBeNull();
      expect((await bucket.info(upload.thumbnail?.path ?? "")).error).toBeNull();
    };

    const first = await prepareAndPut(note, true);
    expect((await commitOf(first)).success).toBe(true);

    // One image on the note: the replay hits the unique path constraint.
    expect((await commitOf(first)).success).toBe(false);
    await expectStored(first);

    // Two images on the note: the replay finds no free position.
    const second = await prepareAndPut(note, true);
    expect((await commitOf(second)).success).toBe(true);
    expect(await commitOf(first)).toMatchObject({ success: false, reason: "limit_reached" });
    await expectStored(first);
    await expectStored(second);
    expect(await listNoteImages(a.client, note.id)).toHaveLength(2);
  });

  it("rejects prepare for another tenant's note", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const result = await prepareUpload(b.client, b.userId, a.campaignId, note.id, {
      mime: "image/webp",
      with_thumbnail: false,
    });
    expect(result).toMatchObject({ success: false, reason: "not_found" });
  });

  it("commit with a foreign path gives invalid_upload", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const result = await commitImage(a.client, a.userId, a.campaignId, note.id, {
      path: objectPath(b, b.campaignId, note.id),
      thumb_path: null,
      width: 10,
      height: 10,
      thumb_width: null,
      thumb_height: null,
      alt_text: null,
    });
    expect(result).toMatchObject({ success: false, reason: "invalid_upload" });
  });

  it("commit of a path that was never uploaded gives invalid_upload", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const prepared = await prepareUpload(a.client, a.userId, a.campaignId, note.id, {
      mime: "image/jpeg",
      with_thumbnail: false,
    });
    if (!prepared.success) {
      throw new Error("prepare failed");
    }
    const result = await commitImage(a.client, a.userId, a.campaignId, note.id, {
      path: prepared.upload.image.path,
      thumb_path: null,
      width: 10,
      height: 10,
      thumb_width: null,
      thumb_height: null,
      alt_text: null,
    });
    expect(result).toMatchObject({ success: false, reason: "invalid_upload" });
  });

  it("removeNoteFolder empties the prefix", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    await prepareAndPut(note, true);
    const folder = `${a.userId}/${a.campaignId}/${note.id}`;
    const bucket = a.client.storage.from(NOTE_IMAGES_BUCKET);
    expect((await bucket.list(folder)).data?.length).toBe(2);

    await removeNoteFolder(a.client, a.userId, a.campaignId, note.id);
    expect((await bucket.list(folder)).data).toEqual([]);
  });

  it("deleteNote then removeNoteFolder leaves no objects under the note prefix", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    await prepareAndPut(note, true);
    const folder = `${a.userId}/${a.campaignId}/${note.id}`;
    const bucket = a.client.storage.from(NOTE_IMAGES_BUCKET);
    expect((await bucket.list(folder)).data?.length).toBe(2);

    const deleted = await deleteNote(a.client, a.campaignId, note.id);
    expect(deleted.success).toBe(true);
    await removeNoteFolder(a.client, a.userId, a.campaignId, note.id);
    expect((await bucket.list(folder)).data).toEqual([]);
  });
});

// Not covered here: commit with an oversized or disallowed-type object. The signed-upload
// assertions above show the bucket rejects both before the object exists, so no anon-key
// client can create one. validateUploadedObject's unit tests cover that guard.
