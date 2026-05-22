/**
 * GetEcoPulse — PDF export
 * Captures the off-screen PrintableReport element as a high-resolution WYSIWYG PDF.
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

  const pages = Array.from(mainEl.children) as HTMLElement[];
  if (pages.length === 0) return;

  // ── PDF constants (A4 mm) ────────────────────────────────────────────────
  const PAGE_W   = 210;
  const PAGE_H   = 297;
  const MARGIN   = 8;
  const HEADER_H = 15;
  const FOOTER_H = 8;
  const CONTENT_W = PAGE_W - 2 * MARGIN;

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const dateStr = new Date().toLocaleDateString("fr-FR", {
    year: "numeric", month: "long", day: "numeric",
  });
  const shortAddr = address.length > 72 ? address.slice(0, 69) + "…" : address;
  const fileSlug  = address.split(",")[0].trim().replace(/\s+/g, "_");
  const isoDate   = new Date().toISOString().slice(0, 10);

  // ── Pages Loop ───────────────────────────────────────────────────────────
  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage();

    const pageEl = pages[i];
    const canvas = await html2canvas(pageEl, {
      scale: 2,                    // retina quality
      useCORS: true,               // satellite image (external URL)
      backgroundColor: "#ffffff",  // force white background capture
      logging: false,
      scrollX: 0,
      scrollY: 0,
    });

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

    // Draw page image content
    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    const imgHeight = (canvas.height / canvas.width) * CONTENT_W;

    pdf.addImage(
      imgData,
      "JPEG",
      MARGIN,
      HEADER_H + 1,
      CONTENT_W,
      imgHeight,
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
    pdf.text(`${i + 1} / ${pages.length}`, PAGE_W - MARGIN, PAGE_H - 2.5, { align: "right" });
  }

  pdf.save(`GetEcoPulse_Audit_${isoDate}_${fileSlug}.pdf`);
}
