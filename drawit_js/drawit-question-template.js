/* ============================================================
   DrawIt — per-question template
   ------------------------------------------------------------
   Use one of these blocks per "Draw It" question in your survey.
   Steps:
     1.  Add a Descriptive Text question to your block.
     2.  Click the gear  →  "Add JavaScript".
     3.  Replace the editor's contents with this whole template.
     4.  Edit the CONFIG section (qid, title, anchor, axes...).
     5.  Save.

   Requires drawit-library.js to be loaded once at the survey level
   (Look & Feel → General → Header). See DrawIt-Qualtrics-Setup.md.
   ============================================================ */

Qualtrics.SurveyEngine.addOnload(function () {
    /* ---------------- CONFIG (edit these per question) -------- */
    var CONFIG = {
        // unique short ID for this question — used as the prefix for all
        // Embedded Data fields (e.g. drawit_overweight_finalY).
        qid: 'overweight_us',

        title:       'Estimate the percentage of US adults who are overweight (BMI \u2265 25), 1900\u20132100',
        instruction: 'Click and drag across the chart to draw your estimate. Drawing over a section replaces it. The red dot is a known data point and can\u2019t be moved.',

        xLabel: 'Year',
        yLabel: '% of US adults',

        // Axis range and grid resolution
        xMin: 1900, xMax: 2100, xStep: 1,    // 1 cell per year  (201 columns)
        yMin: 0,    yMax: 100,  yStep: 1,    // 1 cell per %     (101 rows)

        // Major gridline + label spacing
        xMajorTick: 25,
        yMajorTick: 10,

        // The fixed anchor point (set to null to omit)
        anchor: { x: 2025, y: 73 },

        // Optional override — defaults to "Known: <x>, <y>"
        anchorLabel: 'Known: 73% in 2025',

        // Behavior
        requireFullCoverage: true,   // require full line before Submit can be clicked
        height: 420,                 // chart height in pixels

        // ------- Real-data reveal (optional) -------
        // Provide ONE of:
        //   truthCsvUrl   : URL to a CSV in your Qualtrics Graphics Library
        //                   (rows of   year,value   — header row optional).
        //   truthData     : inline array, e.g. [{x:1960,y:45},{x:1970,y:47},...]
        // If you set either, a "Submit my answer" button appears. After they click
        // it, their drawing locks and the real data is overlaid in dark navy.
        // Leave both null/undefined to use the original "Next enables on full coverage" flow.
        truthCsvUrl: null,
        // truthCsvUrl: 'https://yourorg.qualtrics.com/CP/File.php?F=F_xxxxxxxxxxxxxxxxx',

        truthData: null,
        // truthData: [{x:1960,y:45},{x:1970,y:47},{x:1980,y:50}, /* ... */ ],

        truthLineColor: '#0a3161',   // dark navy contrasts the user's yellow line
        truthLineStyle: 'solid',     // 'solid' or 'dashed'
        truthLabel:     'Real data',
        submitButtonText:  'Submit my answer',
        postRevealMessage: 'The dark line is the real data. Click Next to continue.'
    };
    /* ---------------------------------------------------------- */

    var host = document.createElement('div');
    host.style.marginTop = '12px';
    this.getQuestionContainer().appendChild(host);

    // store the instance on the question so other handlers can access it
    this.drawit = window.DrawIt.init(host, CONFIG, this);
});

Qualtrics.SurveyEngine.addOnPageSubmit(function () {
    // Final flush — guarantees the latest snapshot is in Embedded Data
    if (this.drawit && typeof this.drawit.flush === 'function') this.drawit.flush();
});

Qualtrics.SurveyEngine.addOnUnload(function () {
    // Belt and suspenders for back-button / page navigation
    if (this.drawit && typeof this.drawit.flush === 'function') this.drawit.flush();
});
