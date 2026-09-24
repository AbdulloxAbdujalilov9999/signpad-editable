# Lease Agreement — Sign Pad

A single static page that shows the truck lease agreement exactly as-is and lets the lessee
(Adam L Ramon) draw a signature directly on the blank **Signature** line on page 2. Nothing
else in the document is touched — the signature is stamped onto a copy of the original PDF
entirely in the browser (via pdf-lib), and the file is never uploaded anywhere.

## Run it locally
```bash
npx serve public
# or: python3 -m http.server 8000 --directory public
```

## Deploy (Vercel)
Import this GitHub repo in the Vercel dashboard (or run `npx vercel --prod`). No build step,
no environment variables — `public/` is served as-is.

## How it works
- `public/lease-base.pdf` — the original lease, unmodified.
- `public/js/signature.js` — a small dependency-free signature pad (vector strokes, exports a
  cropped transparent PNG).
- `public/js/app.js` — renders both pages with pdf.js, positions the signature pad exactly over
  the blank Signature line on page 2 (coordinates `362,455 → 519,479` in PDF points), and on
  submit uses pdf-lib to embed the signature PNG into a fresh copy of the original PDF and
  triggers a download.
- `public/vendor/` — pdf.js and pdf-lib, vendored so no build step is needed.
