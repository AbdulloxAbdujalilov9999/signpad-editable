(function () {
  'use strict';

  var PDF_URL = 'lease-base.pdf';
  var PAGE_W = 612; // US Letter, points
  var PAGE_H = 792;

  // Signature box on page 2, in PDF points, top-left origin (matches pdf.js viewport space at scale 1).
  // Sized to match the Carrier's own signature on the left (roughly 46pt tall), so the pad is
  // comfortable to draw in and the stamped signature looks like a natural signature, not a thin sliver.
  var BOX = { x0: 360, y0: 454, x1: 519, y1: 497 };

  var statusEl = document.getElementById('statusEl');
  var downloadBtn = document.getElementById('downloadBtn');
  var shareBtn = document.getElementById('shareBtn');
  var clearBtn = document.getElementById('clearBtn');
  var agreeBox = document.getElementById('agreeBox');
  var sigBox = document.getElementById('sigBox');
  var sigCanvas = document.getElementById('sigCanvas');
  var wrap2 = document.getElementById('pageWrap2');

  var originalBytes = null; // pristine copy, only ever cloned before handing to a library
  var pad = null;
  var hasInk = false;

  function setStatus(msg, kind) {
    statusEl.textContent = msg || '';
    statusEl.className = 'status' + (kind ? ' ' + kind : '');
  }

  function updateDownloadEnabled() {
    downloadBtn.disabled = !(hasInk && agreeBox.checked);
  }

  async function fetchBytes() {
    var res = await fetch(PDF_URL);
    if (!res.ok) throw new Error('Could not load the lease PDF (' + res.status + ')');
    var buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }

  async function renderPage(pdfDoc, pageNum, canvas) {
    var page = await pdfDoc.getPage(pageNum);
    var baseViewport = page.getViewport({ scale: 1 });
    var cssWidth = canvas.parentElement.clientWidth;
    var scale = cssWidth / baseViewport.width;
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    var viewport = page.getViewport({ scale: scale * dpr });

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = Math.ceil(viewport.height / dpr) + 'px';

    var ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;

    return scale; // CSS px per PDF point, for positioning overlays
  }

  function positionSigBox(scale) {
    sigBox.style.left = (BOX.x0 * scale) + 'px';
    sigBox.style.top = (BOX.y0 * scale) + 'px';
    sigBox.style.width = ((BOX.x1 - BOX.x0) * scale) + 'px';
    sigBox.style.height = ((BOX.y1 - BOX.y0) * scale) + 'px';
  }

  function dataUrlToBytes(dataUrl) {
    var base64 = dataUrl.split(',')[1];
    var bin = atob(base64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  async function buildSignedPdf() {
    var png = window.RSSignaturePad.toPNG(pad.strokes);
    if (!png) throw new Error('empty signature');
    var pngBytes = dataUrlToBytes(png);

    var PDFDocument = window.PDFLib.PDFDocument;
    var doc = await PDFDocument.load(originalBytes.slice());
    var image = await doc.embedPng(pngBytes);

    var boxW = BOX.x1 - BOX.x0;
    var boxH = BOX.y1 - BOX.y0;
    var boxBottomY = PAGE_H - BOX.y1; // convert top-based box to pdf-lib's bottom-up coordinate space

    var fitScale = Math.min(boxW / image.width, boxH / image.height);
    var drawW = image.width * fitScale;
    var drawH = image.height * fitScale;
    var drawX = BOX.x0 + (boxW - drawW) / 2;
    var drawY = boxBottomY + (boxH - drawH) / 2;

    var pages = doc.getPages();
    pages[1].drawImage(image, { x: drawX, y: drawY, width: drawW, height: drawH });

    return await doc.save();
  }

  async function onDownload() {
    downloadBtn.disabled = true;
    setStatus('Building your signed PDF…');
    try {
      var bytes = await buildSignedPdf();
      var blob = new Blob([bytes], { type: 'application/pdf' });
      var fileName = 'Lease Agreement - Signed by Adam L Ramon.pdf';

      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 30000);

      setStatus('Signed and downloaded. Everything else in the document is unchanged.', 'ok');

      if (navigator.canShare && window.File) {
        try {
          var file = new File([blob], fileName, { type: 'application/pdf' });
          if (navigator.canShare({ files: [file] })) {
            shareBtn.hidden = false;
            shareBtn.onclick = function () {
              navigator.share({ files: [file], title: fileName }).catch(function () {});
            };
          }
        } catch (_) { /* share not supported, ignore */ }
      }
    } catch (err) {
      console.error(err);
      setStatus('Something went wrong building the PDF. Please try again.', 'err');
    } finally {
      updateDownloadEnabled();
    }
  }

  async function init() {
    setStatus('Loading the lease…');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';

    originalBytes = await fetchBytes();
    var pdfDoc = await window.pdfjsLib.getDocument({ data: originalBytes.slice(), isEvalSupported: false }).promise;

    await renderPage(pdfDoc, 1, document.getElementById('pageCanvas1'));
    var scale2 = await renderPage(pdfDoc, 2, document.getElementById('pageCanvas2'));
    positionSigBox(scale2);

    pad = new window.RSSignaturePad.SignaturePad(sigCanvas, {
      onChange: function (strokes) {
        hasInk = strokes.length > 0;
        updateDownloadEnabled();
      },
    });

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(async function () {
        var s = await renderPage(pdfDoc, 2, document.getElementById('pageCanvas2'));
        positionSigBox(s);
        pad.fit();
        await renderPage(pdfDoc, 1, document.getElementById('pageCanvas1'));
      }, 150);
    });

    clearBtn.addEventListener('click', function () { pad.clear(); });
    agreeBox.addEventListener('change', updateDownloadEnabled);
    downloadBtn.addEventListener('click', onDownload);

    setStatus('');
  }

  init().catch(function (err) {
    console.error(err);
    setStatus('Could not load the lease PDF. Please reload the page.', 'err');
  });
})();
