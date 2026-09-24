/*
 * Signature pad.
 * - Strokes are stored as vectors in a fixed logical space (600 x 200), so resizing / rotating the phone
 *   never clears or distorts the signature.
 * - Pointer Events: one code path for touch, pen and mouse.
 * - Export crops to the ink and keeps the aspect ratio, so the PDF never receives a stretched image.
 */
(function (root) {
  const LW = 600; // logical width
  const LH = 200; // logical height
  const PEN = 3.2; // logical pen width

  function drawStrokes(ctx, strokes, scale, offX, offY) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0a0a0a';
    ctx.fillStyle = '#0a0a0a';
    ctx.lineWidth = PEN * scale;
    strokes.forEach((s) => {
      const p = (i) => [(s[i][0] - offX) * scale, (s[i][1] - offY) * scale];
      if (s.length === 1) {
        const [x, y] = p(0);
        ctx.beginPath();
        ctx.arc(x, y, (PEN * scale) / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.beginPath();
      let [x0, y0] = p(0);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < s.length - 1; i++) {
        const [x1, y1] = p(i);
        const [x2, y2] = p(i + 1);
        ctx.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2); // smooth through midpoints
      }
      const [xl, yl] = p(s.length - 1);
      ctx.lineTo(xl, yl);
      ctx.stroke();
    });
  }

  function bounds(strokes) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    strokes.forEach((s) => s.forEach(([x, y]) => {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }));
    return x0 === Infinity ? null : { x0, y0, x1, y1 };
  }

  /** Render strokes to a cropped transparent PNG data URL (or null when empty). */
  function toPNG(strokes) {
    const b = bounds(strokes);
    if (!b) return null;
    const pad = 8;
    const w = Math.max(b.x1 - b.x0, 1) + pad * 2;
    const h = Math.max(b.y1 - b.y0, 1) + pad * 2;
    const scale = Math.min(2.5, 1000 / w, 300 / h);
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * scale);
    c.height = Math.ceil(h * scale);
    drawStrokes(c.getContext('2d'), strokes, scale, b.x0 - pad, b.y0 - pad);
    return c.toDataURL('image/png');
  }

  class SignaturePad {
    constructor(canvas, { strokes = [], onChange, onStart } = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.strokes = strokes;
      this.onChange = onChange || (() => {});
      this.onStart = onStart || (() => {});
      this.active = null;
      this.fit = this.fit.bind(this);
      canvas.addEventListener('pointerdown', (e) => this.down(e));
      canvas.addEventListener('pointermove', (e) => this.move(e));
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => canvas.addEventListener(t, (e) => this.up(e)));
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      if (typeof ResizeObserver !== 'undefined') {
        this.ro = new ResizeObserver(this.fit);
        this.ro.observe(canvas);
      } else {
        window.addEventListener('resize', this.fit);
      }
      this.fit();
    }

    fit() {
      const r = this.canvas.getBoundingClientRect();
      if (!r.width) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const w = Math.round(r.width * dpr);
      const h = Math.round((r.width * LH * dpr) / LW);
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      this.redraw();
    }

    redraw() {
      const { ctx, canvas } = this;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawStrokes(ctx, this.strokes, canvas.width / LW, 0, 0);
    }

    point(e) {
      const r = this.canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) * LW) / r.width;
      const y = ((e.clientY - r.top) * LH) / r.height;
      return [Math.round(Math.max(0, Math.min(LW, x)) * 10) / 10, Math.round(Math.max(0, Math.min(LH, y)) * 10) / 10];
    }

    down(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      this.active = [this.point(e)];
      this.strokes.push(this.active);
      this.onStart();
      this.redraw();
    }

    move(e) {
      if (!this.active) return;
      e.preventDefault();
      const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
      (events.length ? events : [e]).forEach((ev) => {
        const p = this.point(ev);
        const last = this.active[this.active.length - 1];
        if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) >= 0.8) this.active.push(p);
      });
      this.redraw();
    }

    up() {
      if (!this.active) return;
      this.active = null;
      this.onChange(this.strokes);
    }

    setStrokes(strokes) {
      this.strokes = strokes;
      this.redraw();
    }

    clear() {
      this.strokes = [];
      this.redraw();
      this.onChange(this.strokes);
    }

    destroy() {
      if (this.ro) this.ro.disconnect();
      else window.removeEventListener('resize', this.fit);
    }
  }

  root.RSSignaturePad = { SignaturePad, toPNG, bounds };
})(window);
