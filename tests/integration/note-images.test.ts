import { beforeAll, describe, expect, it } from "vitest";
import type { PostgrestSingleResponse, SupabaseClient } from "@supabase/supabase-js";

import { createTestNote, createTestUser, jpegFixture, webpFixture } from "./helpers";

import { MAX_IMAGE_BYTES, NOTE_IMAGES_BUCKET } from "@/lib/images/limits";
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

async function upload(client: SupabaseClient, path: string, body: Uint8Array = webpFixture()) {
  return client.storage.from(NOTE_IMAGES_BUCKET).upload(path, body, { contentType: "image/webp" });
}

describe("note_images table", () => {
  it("holds the 2-image cap: a third position and a duplicate position both fail", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    expect((await a.client.from("note_images").insert(rowFor(a, note, 0))).error).toBeNull();
    expect((await a.client.from("note_images").insert(rowFor(a, note, 1))).error).toBeNull();

    const third = await a.client.from("note_images").insert(rowFor(a, note, 2));
    expect(third.error?.code).toBe("23514");

    const duplicate = await a.client.from("note_images").insert(rowFor(a, note, 0));
    expect(duplicate.error?.code).toBe("23505");
    expect(duplicate.error?.message).toContain("note_images_note_position_key");
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
    expect(result.error?.code).toBe("23503");
    expect(result.error?.message).toContain("note_images_note_same_campaign_fkey");
  });

  it("rejects a path whose segments do not match the row (path-shape check)", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const wrongNote = await a.client
      .from("note_images")
      .insert(rowFor(a, note, 0, { path: objectPath(a, a.campaignId, crypto.randomUUID()) }));
    expect(wrongNote.error?.code).toBe("23514");

    const wrongThumb = await a.client.from("note_images").insert(
      rowFor(a, note, 0, {
        thumb_path: objectPath(a, crypto.randomUUID(), note.id, "-thumb.webp"),
        thumb_width: 10,
        thumb_height: 10,
      }),
    );
    expect(wrongThumb.error?.code).toBe("23514");
  });

  it("rejects inconsistent thumbnail nullability", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const result = await a.client
      .from("note_images")
      .insert(rowFor(a, note, 0, { thumb_path: objectPath(a, a.campaignId, note.id, "-thumb.webp") }));
    expect(result.error?.code).toBe("23514");
  });

  it("rejects an insert whose path belongs to another user's folder", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const result = await a.client
      .from("note_images")
      .insert(rowFor(a, note, 0, { path: objectPath(b, a.campaignId, note.id) }));
    expect(result.error?.code).toBe("42501");
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
    expect(blank.error?.code).toBe("23514");

    const path = await a.client
      .from("note_images")
      .update({ path: objectPath(a, a.campaignId, note.id) })
      .eq("id", id);
    expect(path.error?.code).toBe("42501");
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
    expect(intoAFolder.error).not.toBeNull();

    const underANote = await upload(b.client, objectPath(b, b.campaignId, note.id));
    expect(underANote.error).not.toBeNull();
  });

  it("blocks tenant B from signing upload URLs for the same two paths", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const bucket = b.client.storage.from(NOTE_IMAGES_BUCKET);
    expect((await bucket.createSignedUploadUrl(objectPath(a, a.campaignId, note.id))).error).not.toBeNull();
    expect((await bucket.createSignedUploadUrl(objectPath(b, b.campaignId, note.id))).error).not.toBeNull();
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
    expect(result.status).toBe(200);
  });

  it("rejects a body over the bucket size limit (HTTP 400, body statusCode 413)", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const target = await signed(note);
    const result = await put(target.signedUrl, new Uint8Array(MAX_IMAGE_BYTES + 1), "image/webp");
    expect(result.status).toBe(400);
    expect(result.body.statusCode).toBe("413");
  });

  it("rejects a disallowed content type (HTTP 400, body statusCode 415)", async () => {
    const note = await createTestNote(a.client, a.campaignId);
    const target = await signed(note);
    const result = await put(target.signedUrl, webpFixture(), "image/png");
    expect(result.status).toBe(400);
    expect(result.body.statusCode).toBe("415");
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
      expect(response.status).toBe(200);
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
      expect((await fetch(urls.urls.url)).status).toBe(200);
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
    expect(put.status).toBe(200);

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
});

// Not covered here: commit with an oversized or disallowed-type object. The signed-upload
// assertions above show the bucket rejects both before the object exists, so no anon-key
// client can create one. validateUploadedObject's unit tests cover that guard.
