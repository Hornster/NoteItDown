/** Typed errors of the browser image pipeline; the picker maps each one to an inline message. */

/** The browser could not decode the file (any decode failure, including HEIC outside Safari). */
export class UnsupportedImageError extends Error {
  constructor(message = "Unsupported or corrupt image.") {
    super(message);
    this.name = "UnsupportedImageError";
  }
}

/** The image could not be brought under the size ceiling at the minimum dimension. */
export class ImageTooLargeError extends Error {
  constructor(message = "Image cannot be compressed under the size ceiling.") {
    super(message);
    this.name = "ImageTooLargeError";
  }
}

/** The browser failed: blank canvas, missing OffscreenCanvas or `from-image` support, encoder failure. */
export class BrowserImageError extends Error {
  constructor(message = "The browser failed to process the image.") {
    super(message);
    this.name = "BrowserImageError";
  }
}

/** The file looks like HEIC and conversion is not available yet. Removed when Phase 5 lands. */
export class HeicNotSupportedYetError extends Error {
  constructor(message = "HEIC images are not supported yet.") {
    super(message);
    this.name = "HeicNotSupportedYetError";
  }
}

/** A prepare, PUT or commit step failed. `message` is safe to show to the user. */
export class ImageUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageUploadError";
  }
}
