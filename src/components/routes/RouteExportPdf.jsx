import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import jsPDF from "jspdf";

const WEEKDAY_LABELS = {
  1: "Maandag", 2: "Dinsdag", 3: "Woensdag", 4: "Donderdag",
  5: "Vrijdag", 6: "Zaterdag", 7: "Zondag"
};

function formatMinutes(minutes) {
  if (!minutes && minutes !== 0) return "–";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}u ${m}min` : `${h}u`;
}

export default function RouteExportPdf({ route, optimizedRoute }) {
  const [loading, setLoading] = useState(false);

  const generatePdf = async () => {
    if (!optimizedRoute) return;
    setLoading(true);

    try {
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 15;
      const contentW = pageW - margin * 2;
      let y = margin;

      const checkNewPage = (neededHeight = 10) => {
        if (y + neededHeight > pageH - margin) {
          doc.addPage();
          y = margin;
          drawPageHeader();
        }
      };

      const drawPageHeader = () => {
        doc.setFillColor(30, 30, 46);
        doc.rect(0, 0, pageW, 12, "F");
        doc.setFontSize(8);
        doc.setTextColor(180, 180, 200);
        doc.text(`RouteCalc – ${route.name}`, margin, 8);
        doc.text(`Gegenereerd op ${new Date().toLocaleDateString("nl-NL")}`, pageW - margin, 8, { align: "right" });
        doc.setTextColor(0, 0, 0);
      };

      // === HEADER ===
      doc.setFillColor(30, 30, 46);
      doc.rect(0, 0, pageW, 40, "F");

      doc.setFontSize(20);
      doc.setTextColor(255, 255, 255);
      doc.setFont(undefined, "bold");
      doc.text("Routerapport", margin, 18);

      doc.setFontSize(13);
      doc.setFont(undefined, "normal");
      doc.setTextColor(200, 200, 220);
      doc.text(route.name, margin, 27);

      const weekdayLabel = (route.weekdays || []).map(d => WEEKDAY_LABELS[d]).join(", ");
      doc.setFontSize(9);
      doc.setTextColor(160, 160, 190);
      doc.text(`${weekdayLabel} · ${route.time_window_start} – ${route.time_window_end}`, margin, 34);

      doc.setFontSize(9);
      doc.text(`Gegenereerd op ${new Date().toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" })}`, pageW - margin, 34, { align: "right" });

      y = 50;
      doc.setTextColor(0, 0, 0);

      // === SAMENVATTING ===
      doc.setFillColor(245, 247, 250);
      doc.roundedRect(margin, y, contentW, 30, 3, 3, "F");

      doc.setFontSize(10);
      doc.setFont(undefined, "bold");
      doc.setTextColor(30, 30, 46);
      doc.text("Samenvatting", margin + 5, y + 8);

      const cols = optimizedRoute.alarm_standby ? 5 : 4;
      const colW = contentW / cols;
      const summaryItems = [
        { label: "Totale diensttijd", value: formatMinutes(optimizedRoute.actual_shift_minutes ?? optimizedRoute.total_route_time ?? optimizedRoute.stats?.total_route_minutes) },
        { label: "Reistijd", value: formatMinutes(optimizedRoute.total_travel_time ?? optimizedRoute.stats?.total_travel_minutes) },
        { label: "Taaktijd", value: formatMinutes(optimizedRoute.total_service_time ?? optimizedRoute.stats?.total_service_minutes) },
        { label: "Afstand", value: `${optimizedRoute.total_distance_km ?? optimizedRoute.stats?.total_distance_km ?? 0} km` },
      ];
      if (optimizedRoute.alarm_standby) {
        summaryItems.push({ label: "Alarmdienst", value: formatMinutes(optimizedRoute.total_alarm_standby_time) });
      }

      doc.setFont(undefined, "normal");
      summaryItems.forEach((item, i) => {
        const cx = margin + 5 + i * colW;
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 120);
        doc.text(item.label, cx, y + 16);
        doc.setFontSize(11);
        doc.setFont(undefined, "bold");
        doc.setTextColor(30, 30, 46);
        doc.text(item.value, cx, y + 24);
        doc.setFont(undefined, "normal");
      });

      y += 38;

      // Taken teller badges
      const opgenomenCount = optimizedRoute.tasks_optimized || 0;
      const overgeslagenCount = optimizedRoute.tasks_skipped || 0;

      doc.setFillColor(220, 252, 231);
      doc.roundedRect(margin, y, (contentW / 2) - 3, 12, 2, 2, "F");
      doc.setFontSize(9);
      doc.setFont(undefined, "bold");
      doc.setTextColor(22, 101, 52);
      doc.text(`✓  ${opgenomenCount} taken opgenomen`, margin + 5, y + 8);

      if (overgeslagenCount > 0) {
        doc.setFillColor(255, 237, 213);
        doc.roundedRect(margin + contentW / 2 + 3, y, (contentW / 2) - 3, 12, 2, 2, "F");
        doc.setTextColor(154, 52, 18);
        doc.text(`⚠  ${overgeslagenCount} taken niet opgenomen`, margin + contentW / 2 + 8, y + 8);
      }

      doc.setFont(undefined, "normal");
      doc.setTextColor(0, 0, 0);
      y += 20;

      // === ROUTEVOLGORDE ===
      doc.setFontSize(12);
      doc.setFont(undefined, "bold");
      doc.setTextColor(30, 30, 46);
      checkNewPage(20);
      doc.text("Optimale volgorde", margin, y);
      y += 8;

      const stops = optimizedRoute.optimized_order || [];
      let stopIndex = 0;

      for (const item of stops) {
        if (item.is_alarm_standby) {
          checkNewPage(22);
          doc.setFillColor(255, 251, 235);
          doc.roundedRect(margin, y, contentW, 18, 2, 2, "F");
          doc.setDrawColor(251, 191, 36);
          doc.setLineWidth(0.8);
          doc.roundedRect(margin, y, contentW, 18, 2, 2, "S");
          doc.setLineWidth(0.2);

          doc.setFontSize(9);
          doc.setFont(undefined, "bold");
          doc.setTextColor(92, 60, 0);
          doc.text("🚨  Alarmdienst", margin + 5, y + 7);
          doc.setFont(undefined, "normal");
          doc.setTextColor(120, 80, 0);
          doc.text(`${item.arrival_time} – ${item.departure_time}  ·  ${item.duration_minutes} min`, margin + 5, y + 13);
          y += 22;
          continue;
        }

        if (item.is_start || item.is_end) {
          checkNewPage(16);
          doc.setFillColor(241, 245, 249);
          doc.roundedRect(margin, y, contentW, 12, 2, 2, "F");
          doc.setFontSize(8);
          doc.setFont(undefined, "bold");
          doc.setTextColor(71, 85, 105);
          const label = item.is_start ? "▶  START" : "■  EIND";
          doc.text(`${label}: ${item.name.replace("START: ", "").replace("EIND: ", "")}`, margin + 5, y + 5);
          doc.setFont(undefined, "normal");
          doc.text(`Aankomst: ${item.arrival_time}`, margin + 5, y + 10);
          y += 16;
          continue;
        }

        // Reistijd indicator
        if (stopIndex > 0 && item.travel_time_minutes > 0) {
          checkNewPage(8);
          doc.setFillColor(219, 234, 254);
          doc.roundedRect(margin + 20, y, contentW - 40, 6, 2, 2, "F");
          doc.setFontSize(7);
          doc.setTextColor(37, 99, 235);
          doc.text(`➤  Reistijd: ${item.travel_time_minutes} min${item.distance_km ? `  ·  ${item.distance_km} km` : ""}`, pageW / 2, y + 4, { align: "center" });
          y += 8;
        }

        // Wachttijd indicator
        if (item.waiting_time > 0) {
          checkNewPage(8);
          if (optimizedRoute.alarm_standby) {
            doc.setFillColor(255, 251, 235);
            doc.setFontSize(7);
            doc.setTextColor(92, 60, 0);
          } else {
            doc.setFillColor(220, 252, 231);
            doc.setFontSize(7);
            doc.setTextColor(22, 101, 52);
          }
          doc.roundedRect(margin + 20, y, contentW - 40, 6, 2, 2, "F");
          const wachtLabel = optimizedRoute.alarm_standby ? "🚨 Alarmdienst" : "⏱ Vrije tijd";
          doc.text(`${wachtLabel}: ${item.waiting_time} min  (${item.arrival_time} – ${item.actual_start_time})`, pageW / 2, y + 4, { align: "center" });
          y += 8;
        }

        // Stop kaart
        checkNewPage(30);
        doc.setFillColor(249, 250, 251);
        doc.roundedRect(margin, y, contentW, 26, 2, 2, "F");
        doc.setFillColor(37, 99, 235);
        doc.circle(margin + 6, y + 8, 4, "F");
        doc.setFontSize(8);
        doc.setFont(undefined, "bold");
        doc.setTextColor(255, 255, 255);
        doc.text(String(stopIndex + 1), margin + 6, y + 10, { align: "center" });

        doc.setFontSize(9);
        doc.setFont(undefined, "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(item.name, margin + 14, y + 8);

        doc.setFont(undefined, "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        const addressLines = doc.splitTextToSize(item.address || "", contentW - 60);
        doc.text(addressLines[0] || "", margin + 14, y + 14);

        if (item.task_type) {
          doc.setFillColor(226, 232, 240);
          const typeW = doc.getTextWidth(item.task_type) + 4;
          doc.roundedRect(margin + 14, y + 17, typeW, 5, 1, 1, "F");
          doc.setFontSize(6.5);
          doc.setTextColor(71, 85, 105);
          doc.text(item.task_type, margin + 16, y + 21);
        }

        // Tijden rechts
        const rightX = margin + contentW - 5;
        doc.setFontSize(7.5);
        doc.setFont(undefined, "bold");
        doc.setTextColor(30, 30, 46);
        doc.text(`Aankomst: ${item.arrival_time}`, rightX, y + 8, { align: "right" });
        doc.setFont(undefined, "normal");
        doc.setTextColor(100, 116, 139);
        doc.text(`Venster: ${item.time_window_start} – ${item.time_window_end}`, rightX, y + 14, { align: "right" });
        doc.text(`Duur: ${item.duration_minutes} min  ·  Vertrek: ${item.departure_time}`, rightX, y + 20, { align: "right" });

        y += 30;
        stopIndex++;
      }

      // Late/vroeg meldingen
      if (optimizedRoute.finished_late) {
        checkNewPage(14);
        doc.setFillColor(254, 226, 226);
        doc.roundedRect(margin, y, contentW, 10, 2, 2, "F");
        doc.setFontSize(8);
        doc.setFont(undefined, "bold");
        doc.setTextColor(153, 27, 27);
        doc.text(`⚠  Route loopt uit: ${optimizedRoute.late_by_minutes} minuten na het tijdsvenster`, margin + 5, y + 7);
        doc.setFont(undefined, "normal");
        y += 14;
      }
      if (optimizedRoute.finished_early) {
        checkNewPage(14);
        doc.setFillColor(219, 234, 254);
        doc.roundedRect(margin, y, contentW, 10, 2, 2, "F");
        doc.setFontSize(8);
        doc.setFont(undefined, "bold");
        doc.setTextColor(30, 64, 175);
        doc.text(`ℹ  Route eerder klaar: ${optimizedRoute.early_by_minutes} minuten voor het einde van het tijdsvenster`, margin + 5, y + 7);
        doc.setFont(undefined, "normal");
        y += 14;
      }

      // === NIET OPGENOMEN TAKEN ===
      const skipped = optimizedRoute.skipped_tasks || [];
      if (skipped.length > 0) {
        checkNewPage(20);
        y += 6;

        doc.setFillColor(30, 30, 46);
        doc.rect(margin, y, contentW, 14, "F");
        doc.setFontSize(11);
        doc.setFont(undefined, "bold");
        doc.setTextColor(255, 255, 255);
        doc.text(`Niet opgenomen taken  (${skipped.length})`, margin + 5, y + 10);
        y += 18;

        doc.setFontSize(8.5);
        doc.setFont(undefined, "normal");
        doc.setTextColor(60, 60, 80);
        const introText = "De volgende taken konden niet worden ingepland vanwege tijdsbeperkingen. Per taak staat aangegeven waarom en welk advies er is.";
        const introLines = doc.splitTextToSize(introText, contentW);
        checkNewPage(introLines.length * 5 + 4);
        doc.text(introLines, margin, y);
        y += introLines.length * 5 + 6;

        skipped.forEach((skipped, idx) => {
          const estimatedHeight = 20 + (skipped.reason ? Math.ceil(skipped.reason.length / 85) * 5 : 0) + (skipped.advice ? Math.ceil(skipped.advice.length / 85) * 5 : 0) + (skipped.conflicts?.length ? skipped.conflicts.length * 6 : 0) + 10;
          checkNewPage(estimatedHeight);

          // Header van de overgeslagen taak
          doc.setFillColor(255, 237, 213);
          doc.roundedRect(margin, y, contentW, 12, 2, 2, "F");
          doc.setDrawColor(251, 146, 60);
          doc.setLineWidth(0.5);
          doc.roundedRect(margin, y, contentW, 12, 2, 2, "S");
          doc.setLineWidth(0.2);

          doc.setFillColor(234, 88, 12);
          doc.circle(margin + 6, y + 6, 4, "F");
          doc.setFontSize(8);
          doc.setFont(undefined, "bold");
          doc.setTextColor(255, 255, 255);
          doc.text(String(idx + 1), margin + 6, y + 8, { align: "center" });

          doc.setFontSize(9);
          doc.setFont(undefined, "bold");
          doc.setTextColor(124, 45, 18);
          doc.text(skipped.name, margin + 14, y + 7);

          doc.setFont(undefined, "normal");
          doc.setFontSize(8);
          doc.setTextColor(154, 52, 18);
          doc.text(`Tijdvenster: ${skipped.time_window}`, margin + contentW - 5, y + 7, { align: "right" });

          y += 14;

          // Reden
          if (skipped.reason) {
            checkNewPage(20);
            doc.setFillColor(255, 247, 237);
            const reasonLines = doc.splitTextToSize(skipped.reason, contentW - 12);
            const reasonH = reasonLines.length * 5 + 8;
            doc.roundedRect(margin, y, contentW, reasonH, 1, 1, "F");
            doc.setFontSize(7.5);
            doc.setFont(undefined, "bold");
            doc.setTextColor(154, 52, 18);
            doc.text("Reden:", margin + 5, y + 6);
            doc.setFont(undefined, "normal");
            doc.setTextColor(92, 40, 10);
            doc.text(reasonLines, margin + 5, y + 12);
            y += reasonH + 3;
          }

          // Conflicten
          if (skipped.conflicts && skipped.conflicts.length > 0) {
            checkNewPage(10 + skipped.conflicts.length * 7);
            doc.setFillColor(254, 242, 220);
            const conflictsH = skipped.conflicts.length * 7 + 10;
            doc.roundedRect(margin, y, contentW, conflictsH, 1, 1, "F");
            doc.setFontSize(7.5);
            doc.setFont(undefined, "bold");
            doc.setTextColor(120, 53, 15);
            doc.text("Conflicten:", margin + 5, y + 6);
            doc.setFont(undefined, "normal");
            skipped.conflicts.forEach((conflict, ci) => {
              const conflictLine = `• ${conflict.name}: gepland ${conflict.planned_time}${conflict.time_window ? `  ·  venster ${conflict.time_window}` : ""}`;
              const cLines = doc.splitTextToSize(conflictLine, contentW - 12);
              doc.setTextColor(92, 40, 10);
              doc.text(cLines, margin + 8, y + 12 + ci * 7);
            });
            y += conflictsH + 3;
          }

          // Advies
          if (skipped.advice) {
            checkNewPage(20);
            doc.setFillColor(240, 253, 244);
            const adviceLines = doc.splitTextToSize(skipped.advice, contentW - 12);
            const adviceH = adviceLines.length * 5 + 8;
            doc.roundedRect(margin, y, contentW, adviceH, 1, 1, "F");
            doc.setDrawColor(134, 239, 172);
            doc.setLineWidth(0.5);
            doc.roundedRect(margin, y, contentW, adviceH, 1, 1, "S");
            doc.setLineWidth(0.2);
            doc.setFontSize(7.5);
            doc.setFont(undefined, "bold");
            doc.setTextColor(21, 128, 61);
            doc.text("Advies:", margin + 5, y + 6);
            doc.setFont(undefined, "normal");
            doc.setTextColor(20, 83, 45);
            doc.text(adviceLines, margin + 5, y + 12);
            y += adviceH + 3;
          }

          y += 6;
        });
      }

      // === FOOTER op elke pagina ===
      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 170);
        doc.text(`Pagina ${p} van ${totalPages}`, pageW / 2, pageH - 8, { align: "center" });
        doc.text("RouteCalc – Surveillance Planner", margin, pageH - 8);
      }

      const filename = `route-${route.name.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(filename);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={generatePdf}
      disabled={loading || !optimizedRoute}
    >
      {loading ? (
        <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Exporteren...</>
      ) : (
        <><FileDown className="w-4 h-4 mr-1" /> PDF exporteren</>
      )}
    </Button>
  );
}