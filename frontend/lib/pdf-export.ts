/**
 * GetEcoPulse — PDF export (react-pdf/renderer)
 *
 * Generates a vector A4 PDF client-side using @react-pdf/renderer.
 * • No html2canvas / jsPDF — text is selectable, fonts are crisp.
 * • Dynamic imports keep the renderer (~1 MB) out of the initial bundle.
 * • Must be called from a client-side event handler (never during SSR).
 *
 * Image strategy:
 *   1. Pass satellite_image_url (HTTP) directly to react-pdf — it fetches it
 *      natively with CORS. Mapbox and Supabase Storage both allow CORS.
 *   2. If no URL: convert satellite_image_data_uri to a same-origin blob: URL
 *      so react-pdf can fetch it (fetch("data:...") silently fails in
 *      @react-pdf/renderer v4 browser builds; fetch("blob:...") works).
 */

import { createElement } from "react";
import type { AuditResult } from "@/lib/api";

// ── Main export function ──────────────────────────────────────────────────────

export async function exportAuditPdf(
  audit:      AuditResult,
  diag:       AuditResult["diagnostic"],
  nafCode:    string,
  isRealData: boolean,
): Promise<void> {
  // ── 1. Resolve satellite image source ────────────────────────────────────
  let satelliteDataUri: string | null = null;
  let blobToRevoke: string | null = null;

  if (audit.satellite_image_url) {
    // react-pdf fetches HTTP URLs natively — CORS is fine for Mapbox/Supabase.
    satelliteDataUri = audit.satellite_image_url;
  } else if (audit.satellite_image_data_uri) {
    // No HTTP URL: convert data URI → blob: URL so react-pdf can fetch it.
    try {
      const dataUri = audit.satellite_image_data_uri;
      const [header, b64] = dataUri.split(",");
      const mime = header.match(/data:([^;]+)/)?.[1] ?? "image/png";
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: mime });
      satelliteDataUri = URL.createObjectURL(blob);
      blobToRevoke = satelliteDataUri;
    } catch {
      // fall through — image will be absent from PDF
    }
  }

  // ── 2. Dynamic imports (deferred until user clicks "Export") ─────────────
  const [{ pdf }, { default: AuditPdfDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/AuditPdfDocument"),
  ]);

  // ── 3. Render to Blob ─────────────────────────────────────────────────────
  const element = createElement(AuditPdfDocument, {
    audit,
    diag,
    nafCode,
    isRealData,
    satelliteDataUri,
  });

  // AuditPdfDocument renders a <Document> as its root, satisfying react-pdf's
  // requirement.  Cast here because createElement infers AuditPdfProps, not
  // DocumentProps, even though the runtime element is identical.
  const blob = await pdf(element as Parameters<typeof pdf>[0]).toBlob();

  // Clean up blob URL created for the image (if any)
  if (blobToRevoke) URL.revokeObjectURL(blobToRevoke);

  // ── 4. Trigger browser download ───────────────────────────────────────────
  const isoDate  = new Date().toISOString().slice(0, 10);
  const fileSlug = audit.address.split(",")[0].trim().replace(/\s+/g, "_");
  const filename = `GetEcoPulse_Audit_${isoDate}_${fileSlug}.pdf`;

  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  // Small delay before revoking so the download dialog has time to open
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
