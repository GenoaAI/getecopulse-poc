/**
 * GetEcoPulse — PDF export (react-pdf/renderer)
 *
 * Generates a vector A4 PDF client-side using @react-pdf/renderer.
 * • No html2canvas / jsPDF — text is selectable, fonts are crisp.
 * • Satellite image is pre-fetched as a base64 data URI to avoid CORS
 *   issues inside the renderer's internal fetch.
 * • Dynamic imports keep the renderer (~1 MB) out of the initial bundle.
 * • Must be called from a client-side event handler (never during SSR).
 */

import { createElement } from "react";
import type { AuditResult } from "@/lib/api";

// ── Helper: URL → base64 data URI ────────────────────────────────────────────

async function fetchAsDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror   = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ── Main export function ──────────────────────────────────────────────────────

export async function exportAuditPdf(
  audit:      AuditResult,
  diag:       AuditResult["diagnostic"],
  nafCode:    string,
  isRealData: boolean,
): Promise<void> {
  // ── 1. Pre-fetch satellite image ─────────────────────────────────────────
  const satelliteDataUri = (audit as any).satellite_image_data_uri || (audit.satellite_image_url
    ? await fetchAsDataUri(audit.satellite_image_url)
    : null);

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
