// print.js — TRUE-CENTERED PRINT ENGINE (MULTI-REPORT SAFE)

const PRINT_HOST_ID = "admindesk-print-host";
const PRINT_STYLE_ID = "admindesk-print-style";

export const printElement = (element, options = {}) => {
  if (!element) {
    console.warn("printElement: No element supplied.");
    return;
  }

  // -----------------------------
  // OPTIONS (BACKWARD COMPATIBLE)
  // -----------------------------
  const {
    orientation = "landscape", // default SAME as your current code
    pageSize = "A4",
    marginMm = 10,
    autoDetect = false, // keep false to avoid changing current behavior
  } = options;

  // -----------------------------
  // CLEANUP PREVIOUS PRINT HOST
  // -----------------------------
  const cleanup = () => {
    const prev = document.getElementById(PRINT_HOST_ID);
    if (prev) prev.remove();
  };
  cleanup();

  // -----------------------------
  // CREATE PRINT HOST
  // -----------------------------
  const host = document.createElement("div");
  host.id = PRINT_HOST_ID;
  host.style.position = "absolute";
  host.style.top = "0";
  host.style.left = "0";
  host.style.width = "100%";
  host.style.background = "#fff";
  host.style.zIndex = "9999999";
  host.style.display = "none";

  // -----------------------------
  // CLONE CONTENT
  // -----------------------------
  const clone = element.cloneNode(true);

  // Remove scrollbars & height locks
  clone.querySelectorAll("*").forEach((el) => {
    const cs = window.getComputedStyle(el);

    if (
      cs.overflow === "auto" ||
      cs.overflow === "scroll" ||
      cs.overflowX === "auto" ||
      cs.overflowY === "auto"
    ) {
      el.style.overflow = "visible";
      el.style.height = "auto";
      el.style.maxHeight = "none";
    }

    if (cs.maxHeight && cs.maxHeight !== "none") {
      el.style.maxHeight = "none";
      el.style.height = "auto";
    }

    el.classList.remove(
      "overflow-auto",
      "overflow-y-auto",
      "overflow-x-auto"
    );
  });

  host.appendChild(clone);
  document.body.appendChild(host);

  // -----------------------------
  // ORIENTATION LOGIC
  // -----------------------------
  let finalOrientation = orientation;

  if (autoDetect) {
    const tables = clone.querySelectorAll("table");
    const hasWideTable = Array.from(tables).some(
      (t) => t.scrollWidth > t.clientWidth * 1.15
    );
    finalOrientation = hasWideTable ? "landscape" : "portrait";
  }

  const pageWidthMm = finalOrientation === "landscape" ? 297 : 210;
  const innerWidthMm = pageWidthMm - marginMm * 2;

  // -----------------------------
  // STYLE INJECTION
  // -----------------------------
  let style = document.getElementById(PRINT_STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = PRINT_STYLE_ID;
  }

  style.textContent = `
    @media print {

      /* Page setup */
      @page {
        margin: 0 !important;
        size: ${pageSize} ${finalOrientation} !important;
      }

      html, body {
        zoom: 1 !important;
        -webkit-text-size-adjust: 100% !important;
      }

      /* Hide everything except print host */
      body > *:not(#${PRINT_HOST_ID}) {
        display: none !important;
      }

      /* Print host */
      #${PRINT_HOST_ID} {
        display: block !important;
        background: #fff !important;
        overflow: visible !important;

        width: ${pageWidthMm}mm !important;
        height: auto !important;

        padding: ${marginMm}mm !important;
        box-sizing: border-box !important;
      }

      /* Center content */
      #${PRINT_HOST_ID} .print-area {
        width: 100% !important;
        max-width: ${innerWidthMm}mm !important;
        margin-left: auto !important;
        margin-right: auto !important;
        padding: 0 !important;
      }

      /* Tables */
      #${PRINT_HOST_ID} table {
        width: 100% !important;
        border-collapse: collapse !important;
        table-layout: fixed !important;
        margin: 0 auto !important;
      }

      #${PRINT_HOST_ID} th,
      #${PRINT_HOST_ID} td {
        line-height: 1.2 !important;
        word-break: break-word !important;
        white-space: normal !important;
        padding: 2.5mm 3mm !important;
      }

      tr {
        page-break-inside: avoid !important;
      }

      /* Optional wide-report tuning */
      #${PRINT_HOST_ID} .report-wide table,
      #${PRINT_HOST_ID} .all-employees-report table {
        font-size: 3.6mm !important;
        width: ${innerWidthMm}mm !important;
      }

      /* Name column */
      #${PRINT_HOST_ID} .name-col {
        width: 60mm !important;
        max-width: 60mm !important;
        min-width: 40mm !important;
      }

      .no-print,
      .print-hide {
        display: none !important;
      }
    }
  `;

  document.head.appendChild(style);

  // -----------------------------
  // PRINT + CLEANUP
  // -----------------------------
  const afterPrint = () => {
    window.removeEventListener("afterprint", afterPrint);
    setTimeout(cleanup, 200);
  };

  window.addEventListener("afterprint", afterPrint);
  window.print();
  setTimeout(afterPrint, 2000);
};
