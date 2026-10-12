import { beforeAll, describe, expect, it } from "vitest";
import type { PostgrestResponse, SupabaseClient } from "@supabase/supabase-js";

import { createTestUser, expectRlsDenied, jpegFixture, webpFixture } from "./helpers";

import { PG_ERROR } from "@/lib/constants/db-error-codes";
import { NOTE_IMAGES_BUCKET } from "@/lib/images/limits";
import type { Campaign, Note, NoteImage, NoteType, Relation } from "@/types";

/*
 * Per table x operation RLS / grant matrix. Row-level denial is silent in PostgREST: an
 * update/delete that RLS filters out returns no error and zero rows, so those cells assert the
 * outcome (empty `.select()`, then an owner re-read) and only column-grant cells assert 42501.
 *
 * Fixtures: "shared" rows are seeded once and never mutated (select, owner-denied and tenant-B
 * cells). Every owner insert/update/delete cell creates its own disposable target. All seeding
 * goes through the owner's anon-key client.
 */

interface Tenant {
  client: SupabaseClient;
  userId: string;
  campaignId: string;
}

let a: Tenant;
let b: Tenant;
let npcTypeId: string;

// Shared, never mutated.
let sharedNoteOne: Note;
let sharedNoteTwo: Note;
let sharedRelation: Relation;
let sharedType: NoteType;
let sharedImage: NoteImage;
let sharedImagePath: string;
let sharedImageBytes: number;

/** A short unique suffix so fixture names never collide and never share a whole word. */
function uniq(prefix: string): string {
  return `${prefix}${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
}

function unwrap<T>(response: PostgrestResponse<T>, what: string): T[] {
  if (response.error) {
    throw new Error(`${what}: ${response.error.message}`);
  }
  return response.data;
}

async function insertNote(client: SupabaseClient, campaignId: string, typeId: string, content = ""): Promise<Note> {
  const rows = unwrap<Note>(
    await client
      .from("notes")
      .insert({ campaign_id: campaignId, type_id: typeId, name: uniq("Note"), content })
      .select(),
    "insertNote",
  );
  return rows[0];
}

async function insertCampaign(tenant: Tenant): Promise<Campaign> {
  const rows = unwrap<Campaign>(
    await tenant.client
      .from("campaigns")
      .insert({ owner_id: tenant.userId, name: uniq("Camp") })
      .select(),
    "insertCampaign",
  );
  return rows[0];
}

/** Two notes with empty content and unrelated names: no auto-detected relation between them. */
async function insertUnrelatedPair(): Promise<{ lo: Note; hi: Note }> {
  const first = await insertNote(a.client, a.campaignId, npcTypeId);
  const second = await insertNote(a.client, a.campaignId, npcTypeId);
  return first.id < second.id ? { lo: first, hi: second } : { lo: second, hi: first };
}

async function insertPairRelation(client: SupabaseClient, lo: Note, hi: Note): Promise<Relation> {
  const rows = unwrap<Relation>(
    await client.from("relations").insert({ campaign_id: lo.campaign_id, note_a_id: lo.id, note_b_id: hi.id }).select(),
    "insertPairRelation",
  );
  return rows[0];
}

async function readRows<T>(client: SupabaseClient, table: string, id: string): Promise<T[]> {
  return unwrap<T>(await client.from(table).select("*").eq("id", id), `read ${table}`);
}

/** Owner re-read that first proves the row still exists. */
async function expectStillThere<T>(table: string, id: string): Promise<T> {
  const rows = await readRows<T>(a.client, table, id);
  expect(rows).toHaveLength(1);
  return rows[0];
}

beforeAll(async () => {
  a = await createTestUser();
  b = await createTestUser();

  const types = unwrap<NoteType>(
    await a.client.from("note_types").select("*").eq("campaign_id", a.campaignId).ilike("name", "npc"),
    "find npc type",
  );
  npcTypeId = types[0].id;

  // Two notes where the second mentions the first, so the trigger stores one relation.
  sharedNoteOne = await insertNote(a.client, a.campaignId, npcTypeId);
  sharedNoteTwo = await insertNote(a.client, a.campaignId, npcTypeId, `Spoke with ${sharedNoteOne.name} yesterday.`);
  const relations = unwrap<Relation>(
    await a.client.from("relations").select("*").eq("campaign_id", a.campaignId),
    "seed relation",
  );
  expect(relations).toHaveLength(1);
  sharedRelation = relations[0];

  sharedType = unwrap<NoteType>(
    await a.client
      .from("note_types")
      .insert({ campaign_id: a.campaignId, name: uniq("Type") })
      .select(),
    "seed type",
  )[0];

  // A real storage object plus its note_images row, for the alt_text and upsert cells.
  sharedImagePath = `${a.userId}/${a.campaignId}/${sharedNoteOne.id}/${crypto.randomUUID()}.webp`;
  const bytes = webpFixture();
  sharedImageBytes = bytes.byteLength;
  const uploaded = await a.client.storage
    .from(NOTE_IMAGES_BUCKET)
    .upload(sharedImagePath, bytes, { contentType: "image/webp" });
  expect(uploaded.error).toBeNull();
  sharedImage = unwrap<NoteImage>(
    await a.client
      .from("note_images")
      .insert({
        campaign_id: a.campaignId,
        note_id: sharedNoteOne.id,
        position: 0,
        path: sharedImagePath,
        thumb_path: null,
        mime: "image/webp",
        width: 1,
        height: 1,
        thumb_width: null,
        thumb_height: null,
        byte_size: sharedImageBytes,
        alt_text: "original alt",
      })
      .select(),
    "seed image",
  )[0];
});

interface Cell {
  name: string;
  run: () => Promise<void>;
}

describe("owner keeps CRUD on existing rows (3.2)", () => {
  const cells: Cell[] = [
    {
      name: "campaigns: select",
      run: async () => {
        const rows = await readRows<Campaign>(a.client, "campaigns", a.campaignId);
        expect(rows).toHaveLength(1);
      },
    },
    {
      name: "campaigns: insert",
      run: async () => {
        const campaign = await insertCampaign(a);
        expect(campaign.owner_id).toBe(a.userId);
      },
    },
    {
      name: "campaigns: update granted column (name)",
      run: async () => {
        const campaign = await insertCampaign(a);
        const newName = uniq("Renamed");
        const updated = unwrap<Campaign>(
          await a.client.from("campaigns").update({ name: newName }).eq("id", campaign.id).select(),
          "update campaign",
        );
        expect(updated).toHaveLength(1);
        expect((await expectStillThere<Campaign>("campaigns", campaign.id)).name).toBe(newName);
      },
    },
    {
      name: "campaigns: delete",
      run: async () => {
        const campaign = await insertCampaign(a);
        const deleted = unwrap<Campaign>(
          await a.client.from("campaigns").delete().eq("id", campaign.id).select(),
          "delete campaign",
        );
        expect(deleted).toHaveLength(1);
        expect(await readRows<Campaign>(a.client, "campaigns", campaign.id)).toEqual([]);
      },
    },
    {
      name: "notes: select",
      run: async () => {
        const rows = unwrap<Note>(
          await a.client.from("notes").select("*").in("id", [sharedNoteOne.id, sharedNoteTwo.id]),
          "select notes",
        );
        expect(rows).toHaveLength(2);
      },
    },
    {
      name: "notes: insert",
      run: async () => {
        const note = await insertNote(a.client, a.campaignId, npcTypeId, "inserted body");
        expect((await expectStillThere<Note>("notes", note.id)).content).toBe("inserted body");
      },
    },
    {
      name: "notes: update granted columns (name, content, type_id)",
      run: async () => {
        const note = await insertNote(a.client, a.campaignId, npcTypeId);
        const placeType = unwrap<NoteType>(
          await a.client.from("note_types").select("*").eq("campaign_id", a.campaignId).ilike("name", "place"),
          "find place type",
        )[0];
        const newName = uniq("Edited");
        const updated = unwrap<Note>(
          await a.client
            .from("notes")
            .update({ name: newName, content: "edited body", type_id: placeType.id })
            .eq("id", note.id)
            .select(),
          "update note",
        );
        expect(updated).toHaveLength(1);
        const reread = await expectStillThere<Note>("notes", note.id);
        expect([reread.name, reread.content, reread.type_id]).toEqual([newName, "edited body", placeType.id]);
      },
    },
    {
      name: "notes: delete",
      run: async () => {
        const note = await insertNote(a.client, a.campaignId, npcTypeId);
        const deleted = unwrap<Note>(await a.client.from("notes").delete().eq("id", note.id).select(), "delete note");
        expect(deleted).toHaveLength(1);
        expect(await readRows<Note>(a.client, "notes", note.id)).toEqual([]);
      },
    },
    {
      name: "relations: select",
      run: async () => {
        const rows = await readRows<Relation>(a.client, "relations", sharedRelation.id);
        expect(rows).toHaveLength(1);
      },
    },
    {
      name: "relations: insert (unrelated pair)",
      run: async () => {
        const { lo, hi } = await insertUnrelatedPair();
        const relation = await insertPairRelation(a.client, lo, hi);
        expect([relation.note_a_id, relation.note_b_id]).toEqual([lo.id, hi.id]);
        await expectStillThere<Relation>("relations", relation.id);
      },
    },
    {
      name: "relations: delete (unrelated pair)",
      run: async () => {
        const { lo, hi } = await insertUnrelatedPair();
        const relation = await insertPairRelation(a.client, lo, hi);
        await expectStillThere<Relation>("relations", relation.id);
        const deleted = unwrap<Relation>(
          await a.client.from("relations").delete().eq("id", relation.id).select(),
          "delete relation",
        );
        expect(deleted).toHaveLength(1);
        expect(await readRows<Relation>(a.client, "relations", relation.id)).toEqual([]);
      },
    },
    {
      name: "note_types: select",
      run: async () => {
        expect(await readRows<NoteType>(a.client, "note_types", sharedType.id)).toHaveLength(1);
      },
    },
    {
      name: "note_types: insert (custom, non-predefined)",
      run: async () => {
        const rows = unwrap<NoteType>(
          await a.client
            .from("note_types")
            .insert({ campaign_id: a.campaignId, name: uniq("Type") })
            .select(),
          "insert type",
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].is_predefined).toBe(false);
      },
    },
    {
      name: "note_images: update granted column (alt_text)",
      run: async () => {
        const note = await insertNote(a.client, a.campaignId, npcTypeId);
        const row = unwrap<NoteImage>(
          await a.client
            .from("note_images")
            .insert({
              campaign_id: a.campaignId,
              note_id: note.id,
              position: 0,
              path: `${a.userId}/${a.campaignId}/${note.id}/${crypto.randomUUID()}.webp`,
              thumb_path: null,
              mime: "image/webp",
              width: 1,
              height: 1,
              thumb_width: null,
              thumb_height: null,
              byte_size: 10,
              alt_text: "before",
            })
            .select(),
          "insert image row",
        )[0];
        const updated = unwrap<NoteImage>(
          await a.client.from("note_images").update({ alt_text: "after" }).eq("id", row.id).select(),
          "update alt_text",
        );
        expect(updated).toHaveLength(1);
        expect((await expectStillThere<NoteImage>("note_images", row.id)).alt_text).toBe("after");
      },
    },
  ];

  it.each(cells)("$name", async ({ run }) => {
    await run();
  });
});

describe("owner-denied operations stay denied (3.3)", () => {
  const cells: Cell[] = [
    {
      name: "campaigns.owner_id update -> 42501, owner unchanged",
      run: async () => {
        const { error } = await a.client.from("campaigns").update({ owner_id: b.userId }).eq("id", a.campaignId);
        expect(error?.code).toBe(PG_ERROR.INSUFFICIENT_PRIVILEGE);
        expect((await expectStillThere<Campaign>("campaigns", a.campaignId)).owner_id).toBe(a.userId);
      },
    },
    {
      name: "notes.campaign_id update -> 42501, note not re-parented",
      run: async () => {
        const other = await insertCampaign(a);
        const { error } = await a.client.from("notes").update({ campaign_id: other.id }).eq("id", sharedNoteOne.id);
        expect(error?.code).toBe(PG_ERROR.INSUFFICIENT_PRIVILEGE);
        expect((await expectStillThere<Note>("notes", sharedNoteOne.id)).campaign_id).toBe(a.campaignId);
      },
    },
    {
      name: "relations update (no UPDATE policy) -> zero rows, unchanged",
      run: async () => {
        const before = await expectStillThere<Relation>("relations", sharedRelation.id);
        const updated = unwrap<Relation>(
          await a.client
            .from("relations")
            .update({ created_at: new Date(0).toISOString() })
            .eq("id", sharedRelation.id)
            .select(),
          "update relation",
        );
        expect(updated).toEqual([]);
        expect(await expectStillThere<Relation>("relations", sharedRelation.id)).toEqual(before);
      },
    },
    {
      name: "note_types update (no UPDATE policy) -> zero rows, unchanged",
      run: async () => {
        const before = await expectStillThere<NoteType>("note_types", sharedType.id);
        const updated = unwrap<NoteType>(
          await a.client
            .from("note_types")
            .update({ name: uniq("Hijack") })
            .eq("id", sharedType.id)
            .select(),
          "update type",
        );
        expect(updated).toEqual([]);
        expect(await expectStillThere<NoteType>("note_types", sharedType.id)).toEqual(before);
      },
    },
    {
      name: "note_types delete (no DELETE policy) -> zero rows, unchanged",
      run: async () => {
        const before = await expectStillThere<NoteType>("note_types", sharedType.id);
        const deleted = unwrap<NoteType>(
          await a.client.from("note_types").delete().eq("id", sharedType.id).select(),
          "delete type",
        );
        expect(deleted).toEqual([]);
        expect(await expectStillThere<NoteType>("note_types", sharedType.id)).toEqual(before);
      },
    },
    {
      name: "storage upsert over the owner's own object is denied, object unchanged",
      run: async () => {
        const bucket = a.client.storage.from(NOTE_IMAGES_BUCKET);
        const before = await bucket.info(sharedImagePath);
        expect(before.error).toBeNull();

        const result = await bucket.upload(sharedImagePath, jpegFixture(), {
          contentType: "image/jpeg",
          upsert: true,
        });
        expectRlsDenied(result.error);

        const after = await bucket.info(sharedImagePath);
        expect(after.error).toBeNull();
        expect(after.data?.size).toBe(sharedImageBytes);
        expect(after.data?.contentType).toBe("image/webp");
      },
    },
  ];

  it.each(cells)("$name", async ({ run }) => {
    await run();
  });
});

describe("tenant B gets nothing on direct table access (3.1)", () => {
  async function expectNoteUnchanged(): Promise<void> {
    const note = await expectStillThere<Note>("notes", sharedNoteTwo.id);
    expect(note.name).toBe(sharedNoteTwo.name);
    expect(note.content).toBe(sharedNoteTwo.content);
  }

  const cells: Cell[] = [
    {
      name: "insert into A's campaign: notes -> 42501",
      run: async () => {
        const name = uniq("Intruder");
        const { error } = await b.client
          .from("notes")
          .insert({ campaign_id: a.campaignId, type_id: npcTypeId, name, content: "" });
        expect(error?.code).toBe(PG_ERROR.INSUFFICIENT_PRIVILEGE);
        expect(unwrap<Note>(await a.client.from("notes").select("*").eq("name", name), "recheck")).toEqual([]);
      },
    },
    {
      name: "insert into A's campaign: relations -> 42501",
      run: async () => {
        const [lo, hi] = [sharedNoteOne, sharedNoteTwo].sort((x, y) => (x.id < y.id ? -1 : 1));
        const { error } = await b.client
          .from("relations")
          .insert({ campaign_id: a.campaignId, note_a_id: lo.id, note_b_id: hi.id });
        expect(error?.code).toBe(PG_ERROR.INSUFFICIENT_PRIVILEGE);
      },
    },
    {
      name: "insert into A's campaign: note_types -> 42501",
      run: async () => {
        const name = uniq("Intruder");
        const { error } = await b.client.from("note_types").insert({ campaign_id: a.campaignId, name });
        expect(error?.code).toBe(PG_ERROR.INSUFFICIENT_PRIVILEGE);
        expect(unwrap<NoteType>(await a.client.from("note_types").select("*").eq("name", name), "recheck")).toEqual([]);
      },
    },
    {
      name: "update A's campaign -> zero rows, A's name unchanged",
      run: async () => {
        const before = await expectStillThere<Campaign>("campaigns", a.campaignId);
        const updated = unwrap<Campaign>(
          await b.client
            .from("campaigns")
            .update({ name: uniq("Hijack") })
            .eq("id", a.campaignId)
            .select(),
          "B update campaign",
        );
        expect(updated).toEqual([]);
        expect((await expectStillThere<Campaign>("campaigns", a.campaignId)).name).toBe(before.name);
      },
    },
    {
      name: "delete A's campaign -> zero rows, campaign still there",
      run: async () => {
        const deleted = unwrap<Campaign>(
          await b.client.from("campaigns").delete().eq("id", a.campaignId).select(),
          "B delete campaign",
        );
        expect(deleted).toEqual([]);
        await expectStillThere<Campaign>("campaigns", a.campaignId);
      },
    },
    {
      name: "update A's note -> zero rows, name/content unchanged",
      run: async () => {
        await expectNoteUnchanged();
        const updated = unwrap<Note>(
          await b.client
            .from("notes")
            .update({ name: uniq("Hijack"), content: "hijacked" })
            .eq("id", sharedNoteTwo.id)
            .select(),
          "B update note",
        );
        expect(updated).toEqual([]);
        await expectNoteUnchanged();
      },
    },
    {
      name: "delete A's note -> zero rows, note still there",
      run: async () => {
        const deleted = unwrap<Note>(
          await b.client.from("notes").delete().eq("id", sharedNoteTwo.id).select(),
          "B delete note",
        );
        expect(deleted).toEqual([]);
        await expectNoteUnchanged();
      },
    },
    {
      name: "update A's relation -> zero rows, unchanged",
      run: async () => {
        const before = await expectStillThere<Relation>("relations", sharedRelation.id);
        const updated = unwrap<Relation>(
          await b.client
            .from("relations")
            .update({ created_at: new Date(0).toISOString() })
            .eq("id", sharedRelation.id)
            .select(),
          "B update relation",
        );
        expect(updated).toEqual([]);
        expect(await expectStillThere<Relation>("relations", sharedRelation.id)).toEqual(before);
      },
    },
    {
      name: "delete A's relation -> zero rows, relation still there",
      run: async () => {
        const deleted = unwrap<Relation>(
          await b.client.from("relations").delete().eq("id", sharedRelation.id).select(),
          "B delete relation",
        );
        expect(deleted).toEqual([]);
        await expectStillThere<Relation>("relations", sharedRelation.id);
      },
    },
  ];

  it.each(cells)("$name", async ({ run }) => {
    await run();
  });

  it("the shared note_images row is untouched by the matrix (alt_text still original)", async () => {
    // sharedImage is only ever read here; the alt_text cell uses its own disposable row.
    expect((await expectStillThere<NoteImage>("note_images", sharedImage.id)).alt_text).toBe("original alt");
  });
});
