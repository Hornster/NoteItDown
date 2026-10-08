/** Postgres constraint names the services and tests match on (see the note_images migration). */
export const DB_CONSTRAINT = {
  NOTE_IMAGES_NOTE_POSITION_KEY: "note_images_note_position_key",
  NOTE_IMAGES_NOTE_SAME_CAMPAIGN_FKEY: "note_images_note_same_campaign_fkey",
} as const;
