# Client-side image compression: research notes

_Compiled October 2026. Browser support and package status change over time, so re-check the sources below before relying on specific version numbers._

## Goal

Compress user-uploaded images in the browser before upload:

- Output under a byte budget (2.4 MB)
- Strip EXIF and other metadata
- Convert to WebP

Decision: use a hand-written `createImageBitmap` → canvas → `convertToBlob('image/webp')` pipeline (`compress-to-webp.js`) instead of the `browser-image-compression` npm package.

---

## 1. `browser-image-compression` (npm)

### Security

- Snyk lists **no known vulnerabilities** for versions 2.0.2, 1.0.17 or 0.0.4.
- **Maintenance is the real concern.** The latest release is **2.0.2 (March 2023)**. Snyk rates maintenance as _Inactive_: one maintainer, 44 open issues and 13 open PRs at the time of checking. Future vulnerabilities may not get patched promptly.
- **Supply-chain detail.** Web Worker mode is on by default (`useWebWorker: true`). The worker imports the library from an **unpinned jsDelivr URL** by default (`libURL`), so your page runs third-party CDN code at runtime even if you installed the package from npm. Mitigation: set `libURL` to a self-hosted copy.

### Compatibility issues

**iOS: blank (black or white) output images.** This is the most common issue category.

| Issue | Details |
|---|---|
| #116 | Images over 30 MB produced a white image on iPhone Safari. Fixed in 1.0.16. |
| #165 / #166 | Black output on iPad (iOS 16). Fixed in a later release. |
| #169 | Black output on Chrome for iOS. The max canvas there was 4096 × 4096. |
| #190 | On 2.0.2, bulk uploads of more than ~10 images gave black images on iPhone 12/13 (iOS 16.4.1). Suspected cause is browser memory limits. Workaround: compress sequentially, not in parallel. |
| #205 | On 2.0.2, images over 10 MB came out black on some iPads (iOS 15.7.7, 16.4.1). |

**Other compatibility notes:**

- **CSP.** Worker mode requires `script-src 'self' blob: https://cdn.jsdelivr.net`. The CDN entry isn't needed if `libURL` is self-hosted.
- **Web worker fallback.** Non-blocking compression needs OffscreenCanvas; without it the library falls back to the main thread.
- **Internet Explorer.** v2 dropped core-js, so IE needs polyfills or v1.
- **Older iOS Safari.** One user hit `ReferenceError: Can't find variable: globalThis` (#110).

**Recommendations if using it anyway:** pin the version, self-host the worker script via `libURL`, set `maxWidthOrHeight` to 4096 or lower, compress batches sequentially, and test on real iOS devices.

**Alternatives with more active maintenance:** `@uppy/compressor`, Compressor.js.

---

## 2. Hand-written pipeline: gotchas and decisions

### Safari cannot encode WebP

- Per caniuse, Safari (desktop and iOS) through **26.5** does not support `image/webp` in `OffscreenCanvas.convertToBlob` or `HTMLCanvasElement.toBlob`. Safari _decodes_ WebP fine (since Safari 14).
- **It fails silently.** Requesting an unsupported type returns a valid **PNG** instead. A PNG named `.webp` goes upstream, usually far over the size budget.
- **Mitigation.** Always check `blob.type === 'image/webp'` after encoding. Then pick a fallback:
  1. A WASM libwebp encoder, e.g. `@jsquash/webp`. Slower per encode, so use fewer quality-search steps or a smaller max dimension.
  2. JPEG on Safari. Canvas JPEG output also has no metadata.
  3. Server-side conversion to WebP.

### EXIF stripping and orientation

- Canvas re-encoding outputs pixels only, so EXIF, GPS, XMP and the ICC profile are all dropped.
- **Bake in orientation first.** Use `createImageBitmap(file, { imageOrientation: 'from-image' })`. This is the spec default, but set it explicitly for older engines. Otherwise phone photos can end up sideways once the orientation tag is gone.

### Dimensions and canvas limits

- **Cap the output canvas** at about 4096 px on the longest side to stay within iOS canvas limits. These limits are the root cause of most of the library's black-image bugs.
- **Don't rely on `createImageBitmap`'s `resizeWidth` / `resizeHeight` / `resizeQuality`.** Support varies across engines; for example, Firefox only added resize support in version 98. Decode at full size, then scale with `drawImage` and `imageSmoothingQuality = 'high'`.
- **WebP format maximum** is 16,383 px per side.

### Hitting the byte budget

- Quality doesn't map predictably to file size, so a search is needed:
  1. Try max quality.
  2. If that's too big, try min quality.
  3. If min quality fits, binary-search between the two.
  4. If even min quality is too big, downscale the dimensions and repeat.
- **Cap quality at about 0.9.** At quality 1.0, Chrome switches WebP to lossless encoding, which produces very large files.
- **Define "MB" consistently with the backend.** 2.4 × 1024² (2,516,582 bytes) and 2,400,000 bytes are different limits. A mismatch lets files pass on the client and then get rejected by the server.

### What gets lost

- **Color profile.** The ICC profile is dropped and the browser converts to sRGB. Wide-gamut (Display P3) photos lose some saturation, which is usually acceptable for uploads.
- **Animation.** Animated GIF/WebP flatten to the first frame.
- **Undecodable formats.** HEIC decodes only where the browser supports it (in practice Safari). Elsewhere `createImageBitmap` rejects, so handle the error and show a message.

### Memory and performance

- Run the pipeline in a Web Worker. `createImageBitmap` and `OffscreenCanvas` are available in workers.
- Process files **one at a time**.
- Call `bitmap.close()` when done, and release canvases (`canvas.width = canvas.height = 0`). iOS is strict about memory.

### Server side

Client-side stripping is a convenience, not a guarantee: anyone can bypass the front end and upload originals. If metadata removal matters for privacy, also validate the file type and size and strip metadata on the server.

---

## Sources

- Snyk Advisor, browser-image-compression: https://dev.snyk.io/advisor/npm-package/browser-image-compression
  - Snyk is moving this data to Snyk Security DB.
- browser-image-compression repo and README (CSP, `libURL`, OffscreenCanvas): https://github.com/Donaldcwl/browser-image-compression
- GitHub issues, browser-image-compression:
  - #110: https://github.com/Donaldcwl/browser-image-compression/issues/110
  - #116: https://github.com/Donaldcwl/browser-image-compression/issues/116
  - #165: https://github.com/Donaldcwl/browser-image-compression/issues/165
  - #169: https://github.com/Donaldcwl/browser-image-compression/issues/169
  - #190: https://github.com/Donaldcwl/browser-image-compression/issues/190
  - #205: https://github.com/Donaldcwl/browser-image-compression/issues/205
- caniuse, `convertToBlob` WebP support: https://caniuse.com/mdn-api_offscreencanvas_converttoblob_option_type_parameter_webp
- caniuse, `createImageBitmap`: https://caniuse.com/createimagebitmap
- MDN, `createImageBitmap()`: https://developer.mozilla.org/docs/Web/API/CreateImageBitmap
- MDN, OffscreenCanvas browser compatibility: https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas#browser_compatibility
- "Ask canvas for a WebP in Safari and you silently get a PNG" (DEV Community): https://dev.to/harshit_katheria/ask-canvas-for-a-webp-in-safari-and-you-silently-get-a-png-5hn6
- Firefox `createImageBitmap` resize support (bug 1733559): https://bugzil.la/1733559
