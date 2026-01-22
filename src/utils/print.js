// print.js — FINAL TRUE-CENTERED ENGINE (FIXED BROWSER MARGINS)

const PRINT_HOST_ID = "admindesk-print-host";
const PRINT_STYLE_ID = "admindesk-print-style";

export const printElement = (element) => {
  if (!element) return console.warn("printElement: No element supplied.");

  const cleanup = () => {
    const prev = document.getElementById(PRINT_HOST_ID);
    if (prev) prev.remove();
  };
  cleanup();

  const host = document.createElement("div");
  host.id = PRINT_HOST_ID;
  host.style.position = "absolute";
  host.style.top = "0";
  host.style.left = "0";
  host.style.width = "100%";
  host.style.background = "#fff";
  host.style.zIndex = "9999999";
  host.style.display = "none";

  const clone = element.cloneNode(true);

  // Remove all scrollbars + height limits
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
    el.classList.remove("overflow-auto", "overflow-y-auto", "overflow-x-auto");
  });

  host.appendChild(clone);
  document.body.appendChild(host);

  // Detect orientation automatically
  // Always use landscape for report print
  const isLandscape = true;
  const pageWidthMm = 297;
  const innerWidth = `${pageWidthMm - 20}mm`;
  const pageOrientation = "landscape";

  let style = document.getElementById(PRINT_STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = PRINT_STYLE_ID;
  }

  style.textContent = `
    @media print {

      /* Remove ALL browser margins completely */
      @page {
        margin: 0 !important;
        size: A4 ${pageOrientation} !important;
      }

      body > *:not(#${PRINT_HOST_ID}) {
        display: none !important;
      }

      #${PRINT_HOST_ID} {
        display: block !important;
        background: #fff !important;
        overflow: visible !important;

        /* Physical page width */
        width: ${pageWidthMm}mm !important;
        height: auto !important;

        /* INTERNAL REAL MARGIN (10mm on each side) */
        padding: 10mm !important;

        /* Center everything inside page */
        box-sizing: border-box !important;
      }

      /* Content wrapper: stays centered */
      #${PRINT_HOST_ID} .print-area {
        width: 100% !important;
        max-width: ${innerWidth} !important;      
        margin-left: auto !important;
        margin-right: auto !important;
        padding: 0 !important;
      }

      /* Table layout */
      #${PRINT_HOST_ID} table {
        width: 100% !important;
        border-collapse: collapse !important;
        table-layout: fixed !important;
        margin: 0 auto !important;
      }

      #${PRINT_HOST_ID} th,
      #${PRINT_HOST_ID} td {
        line-height: 1.1 !important;
        word-break: break-word !important;
        white-space: normal !important;
        padding: 2px 3px !important;
      }

      tr {
        page-break-inside: avoid !important;
      }

      /* Landscape table special formatting */
      #${PRINT_HOST_ID} .all-employees-report table,
      #${PRINT_HOST_ID} .report-wide table {
        font-size: 9px !important;
        width: ${innerWidth} !important;
      }

      /* Name column width (wider for print) */
      #${PRINT_HOST_ID} .name-col {
        width: 60mm !important;
        max-width: 60mm !important;
        min-width: 40mm !important;
        white-space: normal !important;
        word-break: break-word !important;
      }

      .no-print {
        display: none !important;
      }

      /* Hide columns with print-hide class in print/PDF */
      .print-hide {
        display: none !important;
      }
    }
  `;

  document.head.appendChild(style);

  const afterPrint = () => {
    window.removeEventListener("afterprint", afterPrint);
    setTimeout(cleanup, 200);
  };
  window.addEventListener("afterprint", afterPrint);

  window.print();
  setTimeout(afterPrint, 2000);
};
