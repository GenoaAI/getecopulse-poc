/**
 * GetEcoPulse — PDF export
 * Captures the audit results <main> element as a high-resolution WYSIWYG PDF.
 * Uses html2canvas (screenshot) + jsPDF (A4 layout).
 * Dynamically imported to keep the main bundle small.
 */

export async function exportAuditPdf(
  mainEl: HTMLElement,
  address: string,
): Promise<void> {
  // Dynamic imports — never shipped to users who don't click "Export"
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  // ── Capture ─────────────────────────────────────────────────────────────
  const canvas = await html2canvas(mainEl, {
    scale: 2,                    // retina quality
    useCORS: true,               // satellite image (external URL)
    backgroundColor: "#0f172a", // dark background
    logging: false,
    scrollX: 0,
    scrollY: -window.scrollY,    // capture from visible top
  });

  // ── PDF constants (A4 mm) ────────────────────────────────────────────────
  const PAGE_W   = 210;
  const PAGE_H   = 297;
  const MARGIN   = 8;
  const HEADER_H = 15;
  const FOOTER_H = 8;
  const CONTENT_W = PAGE_W - 2 * MARGIN;
  const CONTENT_H = PAGE_H - HEADER_H - FOOTER_H - MARGIN;

  // canvas.width is at 2× scale → divide by 2 for logical pixels
  const PX_PER_MM  = (canvas.width / 2) / CONTENT_W;
  const PAGE_PX_H  = CONTENT_H * PX_PER_MM;          // logical px per content area
  const TOTAL_H_MM = (canvas.height / 2) / PX_PER_MM;
  const PAGE_COUNT = Math.ceil(TOTAL_H_MM / CONTENT_H);

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const dateStr = new Date().toLocaleDateString("fr-FR", {
    year: "numeric", month: "long", day: "numeric",
  });
  const shortAddr = address.length > 72 ? address.slice(0, 69) + "…" : address;
  const fileSlug  = address.split(",")[0].trim().replace(/\s+/g, "_");
  const isoDate   = new Date().toISOString().slice(0, 10);

  // ── Pages ────────────────────────────────────────────────────────────────
  for (let i = 0; i < PAGE_COUNT; i++) {
    if (i > 0) pdf.addPage();

    // Header bar
    pdf.setFillColor(15, 23, 42);
    pdf.rect(0, 0, PAGE_W, HEADER_H, "F");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(190, 242, 100);   // lime-300 (#bef264)
    pdf.text("GetEcoPulse", MARGIN, 9.5);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139);   // slate-500
    pdf.text(shortAddr, MARGIN + 27, 9.5);

    pdf.setTextColor(71, 85, 105);     // slate-600
    pdf.text("Audit énergétique automatisé", PAGE_W - MARGIN, 9.5, { align: "right" });

    // Thin lime separator line
    pdf.setDrawColor(190, 242, 100);
    pdf.setLineWidth(0.3);
    pdf.line(0, HEADER_H, PAGE_W, HEADER_H);

    // Content slice
    const srcY = Math.floor(i * PAGE_PX_H * 2);  // ×2 for canvas 2× scale
    const srcH = Math.min(Math.ceil(PAGE_PX_H * 2), canvas.height - srcY);
    if (srcH <= 0) break;

    const slice = document.createElement("canvas");
    slice.width  = canvas.width;
    slice.height = srcH;
    slice.getContext("2d")!.drawImage(
      canvas, 0, srcY, canvas.width, srcH,
      0, 0, canvas.width, srcH,
    );

    const sliceHmm = (srcH / 2) / PX_PER_MM;
    pdf.addImage(
      slice.toDataURL("image/jpeg", 0.92),
      "JPEG",
      MARGIN,
      HEADER_H + 1,
      CONTENT_W,
      sliceHmm,
    );

    // Footer bar
    pdf.setFillColor(15, 23, 42);
    pdf.rect(0, PAGE_H - FOOTER_H, PAGE_W, FOOTER_H, "F");

    pdf.setDrawColor(30, 41, 59);   // slate-800 separator
    pdf.setLineWidth(0.2);
    pdf.line(0, PAGE_H - FOOTER_H, PAGE_W, PAGE_H - FOOTER_H);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(71, 85, 105);
    pdf.text(`Généré le ${dateStr} — getecopulse.fr`, MARGIN, PAGE_H - 2.5);
    pdf.text(`${i + 1} / ${PAGE_COUNT}`, PAGE_W - MARGIN, PAGE_H - 2.5, { align: "right" });
  }

  pdf.save(`GetEcoPulse_${fileSlug}_${isoDate}.pdf`);
}
