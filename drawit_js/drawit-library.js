/* ============================================================
   DrawIt — "You Draw It"-style chart for Qualtrics surveys
   ------------------------------------------------------------
   Paste this whole file into:
     Look & Feel  →  General  →  Header
   inside a <script>...</script> tag, OR include it from a CDN.

   It exposes a single global: window.DrawIt
   Each question calls window.DrawIt.init(container, config, this)
   See drawit-question-template.js for the per-question wrapper.
   ============================================================ */
(function () {
  'use strict';
  if (window.DrawIt) return;

  function DrawIt(container, opts, qualtrics) {
    this.container = container;
    this.opts = Object.assign({
      qid:                 'drawit',           // unique ID — used as Embedded Data prefix
      title:               '',                 // shown above the chart
      instruction:         'Click and drag across the chart to draw your line.',
      xLabel:              'Year',
      yLabel:              'Value',
      xMin:                1900,
      xMax:                2100,
      xStep:               1,                  // x-axis grid resolution (years per cell)
      yMin:                0,
      yMax:                100,
      yStep:               1,                  // y-axis grid resolution (% per cell)
      xMajorTick:          25,                 // major gridline + label every N x-units
      yMajorTick:          10,                 // major gridline + label every N y-units
      anchor:              null,               // { x: 2025, y: 70 } — fixed known point
      anchorLabel:         null,               // optional override of anchor tooltip text
      // NYT "You Draw It"–inspired defaults
      lineColor:           '#f5b800',          // signature yellow stroke
      lineHaloColor:       '#fdfaf2',          // cream halo behind the stroke (set null to disable)
      anchorColor:         '#bb0c2f',          // dark red anchor dot
      gridColor:           '#ececec',
      backgroundColor:     '#fdfaf2',          // warm cream chart background
      fontFamily:          'Georgia, "Times New Roman", "Cheltenham", serif',
      lineWidth:           4.5,
      // The participant's line is drawn solid up to futureFromX and dashed beyond it.
      // If undefined (default), falls back to anchor.x when an anchor is set.
      // Set to null (or pass null explicitly) to disable dashing entirely.
      futureFromX:         undefined,
      futureLineDash:      [8, 5],          // canvas setLineDash pattern for the "future" segment
      height:              420,
      requireFullCoverage: true,               // require full line before Submit can be clicked
      saveToQualtrics:     true,
      onChange:            null,               // optional callback(snapshot) for demo mode

      // ---- Reveal / Submit flow ----
      // Provide either a CSV URL or an inline array. If neither is set AND
      // showSubmitButton is false, the Submit/Reveal flow is disabled and
      // the Next button enables automatically once the line is complete.
      truthCsvUrl:         null,               // e.g. Qualtrics Library URL with x,y rows
      truthData:           null,               // alternative: [{x: 1900, y: 7}, ...]
      showSubmitButton:    false,              // force submit flow even with no truth data
      submitButtonText:    'Submit my answer',
      truthLineColor:      '#0a3161',          // dark navy contrasts with the yellow user line
      truthLineWidth:      2.75,
      truthLineStyle:      'solid',            // 'solid' or 'dashed'
      truthLabel:          'Real data',
      postRevealMessage:   'The dark line is the real data. Click Next to continue.',
      truthErrorMessage:   'Couldn\u2019t load the real data, but your answer was saved. Click Next to continue.'
    }, opts || {});

    // Enable submit/reveal flow if any truth source or explicit flag is set
    this.useSubmitFlow = !!(this.opts.truthCsvUrl || this.opts.truthData || this.opts.showSubmitButton);
    this.locked        = false;     // becomes true after Submit
    this.submittedAt   = null;      // ms since startTime, or null
    this.truthY        = null;      // length-xCount array of interpolated truth y-values
    this.truthError    = null;

    this.q          = qualtrics || null;
    this.startTime  = Date.now();
    this.events     = [];   // [tMs, xIndex, yValue]  — full event log
    this.editCount  = 0;    // one per mousedown/touchstart, plus +1 per Clear
    this.isDrawing  = false;
    this.lastXIndex = null;

    this.xCount = Math.round((this.opts.xMax - this.opts.xMin) / this.opts.xStep) + 1;
    this.yCount = Math.round((this.opts.yMax - this.opts.yMin) / this.opts.yStep) + 1;
    this.yValues = new Array(this.xCount).fill(null);

    if (this.opts.anchor && typeof this.opts.anchor.x === 'number') {
      this.anchorIndex = Math.round((this.opts.anchor.x - this.opts.xMin) / this.opts.xStep);
      this.anchorY     = this.opts.anchor.y;
      if (this.anchorIndex >= 0 && this.anchorIndex < this.xCount) {
        this.yValues[this.anchorIndex] = this.anchorY;
      }
    } else {
      this.anchorIndex = -1;
    }

    this._setupDOM();
    this._attachEvents();
    this._render();

    if (this.opts.requireFullCoverage) this._setNextButton(false);
  }

  // ------------ DOM scaffold ------------
  DrawIt.prototype._setupDOM = function () {
    var c = this.container;
    c.style.fontFamily = this.opts.fontFamily;
    c.style.userSelect = 'none';
    c.style.color      = '#1a1a1a';

    if (this.opts.title) {
      var t = document.createElement('div');
      t.style.fontSize      = '20px';
      t.style.fontWeight    = '700';
      t.style.lineHeight    = '1.25';
      t.style.marginBottom  = '6px';
      t.style.letterSpacing = '-0.005em';
      t.textContent         = this.opts.title;
      c.appendChild(t);
    }
    if (this.opts.instruction) {
      var inst = document.createElement('div');
      inst.style.fontSize     = '14px';
      inst.style.fontStyle    = 'italic';
      inst.style.color        = '#555';
      inst.style.marginBottom = '10px';
      inst.style.lineHeight   = '1.4';
      inst.textContent        = this.opts.instruction;
      c.appendChild(inst);
    }

    this.canvas = document.createElement('canvas');
    this.canvas.style.touchAction = 'none';
    this.canvas.style.cursor      = 'crosshair';
    this.canvas.style.maxWidth    = '100%';
    this.canvas.style.border      = 'none';
    this.canvas.style.background  = this.opts.backgroundColor;
    this.canvas.style.display     = 'block';
    this.canvas.style.borderRadius = '2px';
    c.appendChild(this.canvas);

    var bar = document.createElement('div');
    bar.style.display       = 'flex';
    bar.style.alignItems    = 'center';
    bar.style.gap           = '12px';
    bar.style.marginTop     = '10px';
    bar.style.flexWrap      = 'wrap';
    bar.style.fontFamily    = this.opts.fontFamily;

    this.statusEl = document.createElement('div');
    this.statusEl.style.fontSize  = '13px';
    this.statusEl.style.fontStyle = 'italic';
    this.statusEl.style.color     = '#666';
    this.statusEl.style.flex      = '1 1 auto';
    bar.appendChild(this.statusEl);

    var self = this;

    // Submit button (only shown when reveal flow is active)
    if (this.useSubmitFlow) {
      this.submitBtn = document.createElement('button');
      this.submitBtn.type        = 'button';
      this.submitBtn.textContent = this.opts.submitButtonText;
      this.submitBtn.disabled    = true;
      this.submitBtn.style.padding      = '8px 18px';
      this.submitBtn.style.fontFamily   = this.opts.fontFamily;
      this.submitBtn.style.fontSize     = '14px';
      this.submitBtn.style.fontStyle    = 'italic';
      this.submitBtn.style.cursor       = 'pointer';
      this.submitBtn.style.border       = 'none';
      this.submitBtn.style.background   = '#1a1a1a';
      this.submitBtn.style.color        = '#fdfaf2';
      this.submitBtn.style.borderRadius = '2px';
      this.submitBtn.style.letterSpacing = '0.02em';
      this.submitBtn.addEventListener('click', function () { self._onSubmit(); });
      bar.appendChild(this.submitBtn);
    }

    this.clearBtn = document.createElement('button');
    this.clearBtn.type        = 'button';
    this.clearBtn.textContent = 'Clear my drawing';
    this.clearBtn.style.padding      = '6px 14px';
    this.clearBtn.style.fontFamily   = this.opts.fontFamily;
    this.clearBtn.style.fontSize     = '13px';
    this.clearBtn.style.fontStyle    = 'italic';
    this.clearBtn.style.cursor       = 'pointer';
    this.clearBtn.style.border       = '1px solid #888';
    this.clearBtn.style.background   = '#fff';
    this.clearBtn.style.color        = '#222';
    this.clearBtn.style.borderRadius = '2px';
    this.clearBtn.addEventListener('click', function () { self.clear(); });
    bar.appendChild(this.clearBtn);

    c.appendChild(bar);

    this._resizeCanvas();
    window.addEventListener('resize', function () {
      self._resizeCanvas();
      self._render();
    });
  };

  DrawIt.prototype._resizeCanvas = function () {
    var rect      = this.container.getBoundingClientRect();
    var cssWidth  = Math.max(320, Math.min(rect.width || 800, 1000));
    var cssHeight = this.opts.height;
    var dpr       = window.devicePixelRatio || 1;
    this.canvas.style.width  = cssWidth  + 'px';
    this.canvas.style.height = cssHeight + 'px';
    this.canvas.width        = Math.round(cssWidth  * dpr);
    this.canvas.height       = Math.round(cssHeight * dpr);
    this.cssWidth  = cssWidth;
    this.cssHeight = cssHeight;
    this.dpr       = dpr;

    this.padL = 64;
    this.padR = 24;
    this.padT = 24;
    this.padB = 50;
    this.chartW = cssWidth  - this.padL - this.padR;
    this.chartH = cssHeight - this.padT - this.padB;
  };

  // ------------ coordinate helpers ------------
  DrawIt.prototype._xToPx     = function (i) { return this.padL + (i / (this.xCount - 1)) * this.chartW; };
  DrawIt.prototype._yToPx     = function (y) {
    var t = (y - this.opts.yMin) / (this.opts.yMax - this.opts.yMin);
    return this.padT + (1 - t) * this.chartH;
  };
  DrawIt.prototype._pxToXIdx  = function (px) {
    var t = (px - this.padL) / this.chartW;
    var i = Math.round(t * (this.xCount - 1));
    return Math.max(0, Math.min(this.xCount - 1, i));
  };
  DrawIt.prototype._pxToY     = function (py) {
    var t = (py - this.padT) / this.chartH;
    var y = this.opts.yMin + (1 - t) * (this.opts.yMax - this.opts.yMin);
    y = Math.round(y / this.opts.yStep) * this.opts.yStep;
    return Math.max(this.opts.yMin, Math.min(this.opts.yMax, y));
  };

  // ------------ rendering ------------
  DrawIt.prototype._render = function () {
    var ctx = this.canvas.getContext('2d');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    var serif = this.opts.fontFamily;

    // cream chart background
    ctx.fillStyle = this.opts.backgroundColor;
    ctx.fillRect(this.padL, this.padT, this.chartW, this.chartH);

    // major gridlines + tick labels (X)
    ctx.font = '12px ' + serif;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var x;
    for (x = this.opts.xMin; x <= this.opts.xMax; x += this.opts.xMajorTick) {
      var i  = Math.round((x - this.opts.xMin) / this.opts.xStep);
      var px = this._xToPx(i);
      ctx.beginPath();
      ctx.moveTo(px, this.padT);
      ctx.lineTo(px, this.padT + this.chartH);
      ctx.strokeStyle = this.opts.gridColor;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#3a3a3a';
      ctx.fillText(String(x), px, this.padT + this.chartH + 8);
    }

    // major gridlines + tick labels (Y)
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    var y;
    for (y = this.opts.yMin; y <= this.opts.yMax; y += this.opts.yMajorTick) {
      var py = this._yToPx(y);
      ctx.beginPath();
      ctx.moveTo(this.padL, py);
      ctx.lineTo(this.padL + this.chartW, py);
      ctx.strokeStyle = this.opts.gridColor;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#3a3a3a';
      ctx.fillText(String(y), this.padL - 10, py);
    }

    // baseline axis lines (left + bottom only, like NYT)
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(this.padL, this.padT);
    ctx.lineTo(this.padL, this.padT + this.chartH);
    ctx.lineTo(this.padL + this.chartW, this.padT + this.chartH);
    ctx.stroke();

    // axis labels
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'italic 13px ' + serif;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(this.opts.xLabel, this.padL + this.chartW / 2, this.padT + this.chartH + 30);

    ctx.save();
    ctx.translate(18, this.padT + this.chartH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'middle';
    ctx.fillText(this.opts.yLabel, 0, 0);
    ctx.restore();

    // ---------- drawn line ----------
    // History portion is solid; "future" portion (x > futureFromX) is dashed.
    // The cream halo behind the line stays solid full-span so the dashes sit
    // in a continuous "lane" instead of strobing.
    var haveLine = false;
    for (var p = 0; p < this.xCount; p++) {
      if (this.yValues[p] != null) { haveLine = true; break; }
    }
    if (haveLine) {
      // Resolve the dash boundary
      var futureFromX = this.opts.futureFromX;
      if (futureFromX === undefined && this.opts.anchor) {
        futureFromX = this.opts.anchor.x;
      }
      var futureIndex = -1;
      if (typeof futureFromX === 'number') {
        futureIndex = Math.round((futureFromX - this.opts.xMin) / this.opts.xStep);
        if (futureIndex < 0 || futureIndex >= this.xCount) futureIndex = -1;
      }

      var drawSegments = function (lineWidth, strokeStyle, startIdx, endIdx, dashPattern) {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth   = lineWidth;
        ctx.lineJoin    = 'round';
        ctx.lineCap     = 'round';
        ctx.setLineDash(dashPattern && dashPattern.length ? dashPattern : []);
        ctx.beginPath();
        var inSeg = false;
        for (var k = startIdx; k <= endIdx; k++) {
          var v = this.yValues[k];
          if (v == null) { inSeg = false; continue; }
          var pxK = this._xToPx(k);
          var pyK = this._yToPx(v);
          if (!inSeg) { ctx.moveTo(pxK, pyK); inSeg = true; }
          else        { ctx.lineTo(pxK, pyK); }
        }
        ctx.stroke();
      }.bind(this);

      // Halo: always solid, full span
      if (this.opts.lineHaloColor) {
        drawSegments(this.opts.lineWidth + 4, this.opts.lineHaloColor, 0, this.xCount - 1, null);
      }

      // Main stroke: solid up to futureIndex, dashed beyond it
      if (futureIndex < 0) {
        drawSegments(this.opts.lineWidth, this.opts.lineColor, 0, this.xCount - 1, null);
      } else {
        drawSegments(this.opts.lineWidth, this.opts.lineColor, 0, futureIndex, null);
        drawSegments(this.opts.lineWidth, this.opts.lineColor,
                     futureIndex, this.xCount - 1, this.opts.futureLineDash);
      }
      ctx.setLineDash([]);
    }

    // ---------- truth line (post-reveal) ----------
    if (this.locked && this.truthY) {
      ctx.save();
      ctx.strokeStyle = this.opts.truthLineColor;
      ctx.lineWidth   = this.opts.truthLineWidth;
      ctx.lineJoin    = 'round';
      ctx.lineCap     = 'round';
      if (this.opts.truthLineStyle === 'dashed') ctx.setLineDash([7, 4]);
      ctx.beginPath();
      var tInSeg  = false;
      var lastIdx = -1;
      for (var tk = 0; tk < this.xCount; tk++) {
        var tv = this.truthY[tk];
        if (tv == null) { tInSeg = false; continue; }
        var tpx = this._xToPx(tk);
        var tpy = this._yToPx(tv);
        if (!tInSeg) { ctx.moveTo(tpx, tpy); tInSeg = true; }
        else         { ctx.lineTo(tpx, tpy); }
        lastIdx = tk;
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // label at the rightmost truth point
      if (lastIdx >= 0) {
        var lx = this._xToPx(lastIdx);
        var ly = this._yToPx(this.truthY[lastIdx]);
        ctx.font         = 'italic 12px ' + serif;
        ctx.fillStyle    = this.opts.truthLineColor;
        ctx.textBaseline = 'middle';
        var lbl  = this.opts.truthLabel;
        var lblW = ctx.measureText(lbl).width;
        var tx2  = lx + 8;
        if (tx2 + lblW > this.padL + this.chartW) {
          ctx.textAlign = 'right';
          tx2 = lx - 8;
        } else {
          ctx.textAlign = 'left';
        }
        // cream backing for legibility
        var bx = ctx.textAlign === 'left' ? tx2 - 4 : tx2 - lblW - 4;
        ctx.save();
        ctx.fillStyle   = this.opts.backgroundColor;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(bx, ly - 9, lblW + 8, 18);
        ctx.restore();
        ctx.fillStyle = this.opts.truthLineColor;
        ctx.fillText(lbl, tx2, ly);
      }
      ctx.restore();
    }

    // ---------- anchor point ----------
    if (this.anchorIndex >= 0) {
      var ax = this._xToPx(this.anchorIndex);
      var ay = this._yToPx(this.anchorY);

      // outer cream halo
      ctx.fillStyle = this.opts.backgroundColor;
      ctx.beginPath();
      ctx.arc(ax, ay, 9, 0, Math.PI * 2);
      ctx.fill();
      // colored dot
      ctx.fillStyle = this.opts.anchorColor;
      ctx.beginPath();
      ctx.arc(ax, ay, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth   = 1.25;
      ctx.stroke();

      var label = this.opts.anchorLabel ||
                  ('Known: ' + this.opts.anchor.x + ', ' + this.opts.anchor.y);
      ctx.font = 'italic 12px ' + serif;
      ctx.textBaseline = 'middle';
      var tx = ax + 12;
      ctx.textAlign = 'left';
      if (tx + ctx.measureText(label).width > this.padL + this.chartW) {
        ctx.textAlign = 'right';
        tx = ax - 12;
      }
      // subtle cream backing so the label is readable over the line
      var metrics = ctx.measureText(label);
      var lblW = metrics.width + 8;
      var lblH = 16;
      var lblX = ctx.textAlign === 'left' ? tx - 4 : tx - lblW + 4;
      ctx.fillStyle = this.opts.backgroundColor;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(lblX, ay - 10 - lblH / 2, lblW, lblH);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#1a1a1a';
      ctx.fillText(label, tx, ay - 10);
    }

    this._updateStatus();
  };

  DrawIt.prototype._updateStatus = function () {
    var filled = 0;
    for (var i = 0; i < this.xCount; i++) if (this.yValues[i] != null) filled++;
    var pct      = Math.round(100 * filled / this.xCount);
    var hasAny   = filled > 0;
    var complete = filled === this.xCount;

    if (this.locked) {
      // Post-reveal: hide Submit and Clear, show post-reveal message, enable Next.
      if (this.submitBtn) this.submitBtn.style.display = 'none';
      if (this.clearBtn)  this.clearBtn.style.display  = 'none';
      this.statusEl.style.color    = '#1a1a1a';
      this.statusEl.style.fontStyle = 'normal';
      this.statusEl.textContent    = this.truthError ? this.opts.truthErrorMessage
                                                     : this.opts.postRevealMessage;
      this._setNextButton(true);
      return;
    }

    var msg = 'Coverage: ' + pct + '%  (' + filled + ' / ' + this.xCount + ')' +
              '  ·  edits: ' + this.editCount;
    if (complete) {
      msg += '  ·  complete \u2713';
      this.statusEl.style.color = '#0a8';
    } else {
      this.statusEl.style.color = '#666';
    }
    this.statusEl.textContent = msg;

    if (this.useSubmitFlow) {
      // Next is always disabled until Submit is clicked. Submit unlocks based on coverage rules.
      this._setNextButton(false);
      if (this.submitBtn) {
        var canSubmit = this.opts.requireFullCoverage ? complete : hasAny;
        this.submitBtn.disabled        = !canSubmit;
        this.submitBtn.style.opacity   = canSubmit ? '1' : '0.45';
        this.submitBtn.style.cursor    = canSubmit ? 'pointer' : 'not-allowed';
      }
    } else {
      // Legacy flow: full coverage enables Next directly.
      if (this.opts.requireFullCoverage) this._setNextButton(complete);
      else this._setNextButton(true);
    }
  };

  DrawIt.prototype._setNextButton = function (enabled) {
    if (!this.q) return;
    try {
      if (enabled && this.q.enableNextButton)  this.q.enableNextButton();
      if (!enabled && this.q.disableNextButton) this.q.disableNextButton();
    } catch (e) { /* no-op outside Qualtrics */ }
  };

  // ------------ pointer handling ------------
  DrawIt.prototype._eventToCanvasPoint = function (e) {
    var rect = this.canvas.getBoundingClientRect();
    var cx, cy;
    if (e.touches && e.touches.length) {
      cx = e.touches[0].clientX - rect.left;
      cy = e.touches[0].clientY - rect.top;
    } else if (e.changedTouches && e.changedTouches.length) {
      cx = e.changedTouches[0].clientX - rect.left;
      cy = e.changedTouches[0].clientY - rect.top;
    } else {
      cx = e.clientX - rect.left;
      cy = e.clientY - rect.top;
    }
    return { px: cx, py: cy };
  };

  DrawIt.prototype._attachEvents = function () {
    var self = this;
    var down = function (e) {
      if (self.locked) return;                        // post-reveal lock
      e.preventDefault();
      self.isDrawing  = true;
      self.editCount += 1;
      self.lastXIndex = null;
      self._handlePointer(e);
    };
    var move = function (e) {
      if (self.locked || !self.isDrawing) return;
      e.preventDefault();
      self._handlePointer(e);
    };
    var up = function () {
      if (!self.isDrawing) return;
      self.isDrawing  = false;
      self.lastXIndex = null;
      self._commit();
    };

    this.canvas.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);

    this.canvas.addEventListener('touchstart',  down, { passive: false });
    this.canvas.addEventListener('touchmove',   move, { passive: false });
    this.canvas.addEventListener('touchend',    up);
    this.canvas.addEventListener('touchcancel', up);
  };

  DrawIt.prototype._handlePointer = function (e) {
    var p    = this._eventToCanvasPoint(e);
    var xIdx = this._pxToXIdx(p.px);
    var yVal = this._pxToY(p.py);

    // bridge any gap between previous mouse sample and current one
    if (this.lastXIndex != null && this.lastXIndex !== xIdx) {
      var lastY = this.yValues[this.lastXIndex];
      if (lastY == null) lastY = yVal;
      var step  = (xIdx > this.lastXIndex) ? 1 : -1;
      var span  = Math.abs(xIdx - this.lastXIndex);
      for (var k = 1; k <= span; k++) {
        var ii = this.lastXIndex + step * k;
        var t  = k / span;
        var interpY = lastY + (yVal - lastY) * t;
        interpY = Math.round(interpY / this.opts.yStep) * this.opts.yStep;
        this._setY(ii, interpY);
      }
    } else {
      this._setY(xIdx, yVal);
    }
    this.lastXIndex = xIdx;
    this._render();
  };

  DrawIt.prototype._setY = function (xIdx, yVal) {
    if (xIdx === this.anchorIndex) return;          // anchor is locked
    if (this.yValues[xIdx] === yVal) return;        // no-op
    this.yValues[xIdx] = yVal;
    this.events.push([Date.now() - this.startTime, xIdx, yVal]);
  };

  // ------------ public API ------------
  DrawIt.prototype.snapshot = function () {
    var filled = 0;
    for (var i = 0; i < this.xCount; i++) if (this.yValues[i] != null) filled++;
    return {
      qid:         this.opts.qid,
      finalY:      this.yValues.slice(),
      events:      this.events,
      editCount:   this.editCount,
      timeMs:      Date.now() - this.startTime,
      complete:    filled === this.xCount,
      coverage:    filled / this.xCount,
      xMin: this.opts.xMin, xMax: this.opts.xMax, xStep: this.opts.xStep,
      yMin: this.opts.yMin, yMax: this.opts.yMax, yStep: this.opts.yStep,
      anchor:      this.opts.anchor || null,
      submittedAt: this.submittedAt,
      revealed:    this.locked,
      truthError:  this.truthError
    };
  };

  // ------------ submit / reveal flow ------------
  DrawIt.prototype._onSubmit = function () {
    if (this.locked) return;
    var filled = 0;
    for (var i = 0; i < this.xCount; i++) if (this.yValues[i] != null) filled++;
    if (this.opts.requireFullCoverage && filled !== this.xCount) return;
    if (filled === 0) return;

    this.locked      = true;
    this.submittedAt = Date.now() - this.startTime;
    this.canvas.style.cursor = 'default';
    this.statusEl.textContent = 'Loading the real data\u2026';
    this.statusEl.style.color = '#1a1a1a';
    this._render();

    var self = this;
    this._loadTruth().then(function () {
      self._render();
      self._updateStatus();   // shows postRevealMessage, enables Next
      self._commit();
    }, function (err) {
      self.truthError = String(err && err.message || err);
      self._updateStatus();   // shows truthErrorMessage, still enables Next
      self._commit();
    });
  };

  DrawIt.prototype._loadTruth = function () {
    var self = this;
    return new Promise(function (resolve, reject) {
      if (self.truthY) return resolve();
      if (Array.isArray(self.opts.truthData) && self.opts.truthData.length) {
        try { self._setTruthFromArray(self.opts.truthData); resolve(); }
        catch (e) { reject(e); }
        return;
      }
      if (typeof self.opts.truthCsvUrl === 'string' && self.opts.truthCsvUrl) {
        if (typeof fetch !== 'function') { reject(new Error('fetch not supported')); return; }
        fetch(self.opts.truthCsvUrl, { credentials: 'same-origin' })
          .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.text();
          })
          .then(function (text) {
            var arr = parseCsv(text);
            if (!arr.length) throw new Error('No numeric rows found in CSV');
            self._setTruthFromArray(arr);
            resolve();
          })
          .catch(reject);
        return;
      }
      // No truth data — Submit was forced (showSubmitButton); just lock without reveal
      resolve();
    });
  };

  DrawIt.prototype._setTruthFromArray = function (arr) {
    var pts = arr.slice().sort(function (a, b) { return a.x - b.x; });
    var truth = new Array(this.xCount).fill(null);
    if (!pts.length) { this.truthY = truth; return; }
    var minX = pts[0].x, maxX = pts[pts.length - 1].x;
    for (var i = 0; i < this.xCount; i++) {
      var xVal = this.opts.xMin + i * this.opts.xStep;
      if (xVal < minX || xVal > maxX) continue;
      // bracketing search
      var hi = 0;
      while (hi < pts.length && pts[hi].x < xVal) hi++;
      if (hi >= pts.length) { truth[i] = pts[pts.length - 1].y; continue; }
      if (pts[hi].x === xVal) { truth[i] = pts[hi].y; continue; }
      if (hi === 0) { truth[i] = pts[0].y; continue; }
      var a = pts[hi - 1], b = pts[hi];
      var t = (xVal - a.x) / (b.x - a.x);
      truth[i] = a.y + (b.y - a.y) * t;
    }
    this.truthY = truth;
  };

  function parseCsv(text) {
    var lines = text.split(/\r?\n/);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var parts = line.split(',');
      if (parts.length < 2) continue;
      var x = Number(parts[0].trim());
      var y = Number(parts[1].trim());
      if (isFinite(x) && isFinite(y)) out.push({ x: x, y: y });
      // non-numeric rows (e.g., header) are silently skipped
    }
    return out;
  }

  DrawIt.prototype.clear = function () {
    this.yValues = new Array(this.xCount).fill(null);
    if (this.anchorIndex >= 0) this.yValues[this.anchorIndex] = this.anchorY;
    this.events.push([Date.now() - this.startTime, -1, -1]);  // -1,-1 marks a Clear action
    this.editCount += 1;
    this._render();
    this._commit();
  };

  DrawIt.prototype._commit = function () {
    var snap = this.snapshot();
    if (typeof this.opts.onChange === 'function') {
      try { this.opts.onChange(snap); } catch (e) { /* ignore */ }
    }
    if (!this.opts.saveToQualtrics) return;
    var SE = window.Qualtrics && window.Qualtrics.SurveyEngine;
    if (!SE || typeof SE.setEmbeddedData !== 'function') return;

    var qid = this.opts.qid;
    // Final positions: comma-separated, one value per x-step (empty string for un-drawn cells)
    SE.setEmbeddedData('drawit_' + qid + '_finalY',
      snap.finalY.map(function (v) { return v == null ? '' : v; }).join(','));
    // Compact event log: [[t, xIdx, y], ...]   (xIdx=-1, y=-1 marks a Clear)
    SE.setEmbeddedData('drawit_' + qid + '_events',    JSON.stringify(snap.events));
    SE.setEmbeddedData('drawit_' + qid + '_editCount', String(snap.editCount));
    SE.setEmbeddedData('drawit_' + qid + '_timeMs',    String(snap.timeMs));
    SE.setEmbeddedData('drawit_' + qid + '_completed', snap.complete ? '1' : '0');
    SE.setEmbeddedData('drawit_' + qid + '_xRange',
      this.opts.xMin + ',' + this.opts.xMax + ',' + this.opts.xStep);
    SE.setEmbeddedData('drawit_' + qid + '_yRange',
      this.opts.yMin + ',' + this.opts.yMax + ',' + this.opts.yStep);
    if (this.opts.anchor) {
      SE.setEmbeddedData('drawit_' + qid + '_anchor',
        this.opts.anchor.x + ',' + this.opts.anchor.y);
    }
    SE.setEmbeddedData('drawit_' + qid + '_revealed',    this.locked ? '1' : '0');
    SE.setEmbeddedData('drawit_' + qid + '_submittedAt',
      this.submittedAt == null ? '' : String(this.submittedAt));
    if (this.truthError) {
      SE.setEmbeddedData('drawit_' + qid + '_truthError', this.truthError);
    }
  };

  // public flush — call from addOnPageSubmit so the latest values are saved on Next click
  DrawIt.prototype.flush = function () { this._commit(); };

  window.DrawIt = {
    init: function (container, options, qualtricsQuestion) {
      return new DrawIt(container, options, qualtricsQuestion);
    }
  };
})();
