import { ImageUploadError } from "@/lib/images/errors";
import { HTTP_STATUS } from "@/lib/http-status";
import { imageLabel, MESSAGES } from "@/lib/messages";
import type {
  ApiError,
  CommitImageCommand,
  EncodedImage,
  ImageChanges,
  ImageFailure,
  PendingImage,
  PrepareUploadCommand,
  PrepareUploadResponse,
  UpdateImageCommand,
} from "@/types";

/** Injected so `applyImageChanges` can be unit-tested without a network. */
export interface ImageApi {
  deleteImage: (noteId: string, imageId: string) => Promise<void>;
  updateAlt: (noteId: string, imageId: string, altText: string | null) => Promise<void>;
  uploadPending: (noteId: string, pending: PendingImage) => Promise<void>;
}

function reasonOf(error: unknown): string {
  return error instanceof ImageUploadError ? error.message : MESSAGES.GENERIC_IMAGE_ERROR;
}

/**
 * Applies the held image changes after the note write: DELETE removed images (frees positions), then
 * PATCH changed alt texts, then upload added images. Never stops at the first failure.
 */
export async function applyImageChanges(noteId: string, changes: ImageChanges, api: ImageApi): Promise<ImageFailure[]> {
  const failures: ImageFailure[] = [];
  const labelOf = (id: string) => changes.labels?.[id] ?? MESSAGES.IMAGE_LABEL_FALLBACK;

  for (const id of changes.removedIds) {
    try {
      await api.deleteImage(noteId, id);
    } catch (error) {
      failures.push({ label: labelOf(id), reason: reasonOf(error) });
    }
  }

  for (const [id, altText] of Object.entries(changes.altEdits)) {
    try {
      await api.updateAlt(noteId, id, altText);
    } catch (error) {
      failures.push({ label: labelOf(id), reason: reasonOf(error) });
    }
  }

  let index = 0;
  for (const pending of changes.added) {
    index += 1;
    try {
      await api.uploadPending(noteId, pending);
    } catch (error) {
      failures.push({ label: pending.fileName || imageLabel(index), reason: reasonOf(error) });
    }
  }

  return failures;
}

async function errorMessageOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as Partial<ApiError>;
    if (typeof body.error === "string") return body.error;
  } catch {
    // Not JSON: fall through to the generic message.
  }
  return MESSAGES.GENERIC_IMAGE_ERROR;
}

async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ImageUploadError(MESSAGES.NETWORK_ERROR);
  }
}

async function sendJson(url: string, method: string, body?: unknown): Promise<Response> {
  const response = await send(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new ImageUploadError(await errorMessageOf(response));
  return response;
}

async function putObject(signedUrl: string, encoded: EncodedImage): Promise<void> {
  // The signed URL's token is enough: no `apikey` header is needed (contract-surfaces, Phase 1 findings).
  const response = await send(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": encoded.type },
    body: encoded.blob,
  });
  if (!response.ok) throw new ImageUploadError(MESSAGES.IMAGE_UPLOAD_FAILED);
}

/** Prepare, PUT the image (and thumbnail), then commit. Throws `ImageUploadError` on any failed step. */
export async function uploadPendingImage(campaignId: string, noteId: string, pending: PendingImage): Promise<void> {
  const processed = pending.processed;
  if (!processed) throw new ImageUploadError(MESSAGES.IMAGE_UPLOAD_FAILED);
  const base = `/api/campaigns/${campaignId}/notes/${noteId}/images`;

  const prepareBody: PrepareUploadCommand = {
    mime: processed.image.type,
    with_thumbnail: processed.thumbnail !== null,
  };
  const prepared = (await (await sendJson(`${base}/uploads`, "POST", prepareBody)).json()) as PrepareUploadResponse;

  await putObject(prepared.image.signed_url, processed.image);
  if (processed.thumbnail && prepared.thumbnail) {
    await putObject(prepared.thumbnail.signed_url, processed.thumbnail);
  }

  const alt = pending.alt_text.trim();
  const commitBody: CommitImageCommand = {
    path: prepared.image.path,
    thumb_path: processed.thumbnail && prepared.thumbnail ? prepared.thumbnail.path : null,
    width: processed.image.width,
    height: processed.image.height,
    thumb_width: processed.thumbnail && prepared.thumbnail ? processed.thumbnail.width : null,
    thumb_height: processed.thumbnail && prepared.thumbnail ? processed.thumbnail.height : null,
    alt_text: alt === "" ? null : alt,
  };
  await sendJson(base, "POST", commitBody);
}

/** The real, fetch-based API for one campaign. */
export function createImageApi(campaignId: string): ImageApi {
  const item = (noteId: string, imageId: string) => `/api/campaigns/${campaignId}/notes/${noteId}/images/${imageId}`;
  return {
    deleteImage: async (noteId, imageId) => {
      const response = await send(item(noteId, imageId), { method: "DELETE" });
      // Already gone (e.g. deleted in another tab): the save's goal is reached. The note PATCH just
      // succeeded, so a 404 here can only mean the image, not the note.
      if (response.ok || response.status === HTTP_STATUS.NOT_FOUND) return;
      throw new ImageUploadError(await errorMessageOf(response));
    },
    updateAlt: async (noteId, imageId, altText) => {
      const body: UpdateImageCommand = { alt_text: altText };
      await sendJson(item(noteId, imageId), "PATCH", body);
    },
    uploadPending: (noteId, pending) => uploadPendingImage(campaignId, noteId, pending),
  };
}
