import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink, CheckCircle, AlertTriangle, XCircle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

const STATUS_CONFIG = {
  active: { label: "Actief", icon: CheckCircle, color: "text-green-600" },
  changed: { label: "Gewijzigd", icon: AlertTriangle, color: "text-amber-600" },
  unreachable: { label: "Niet bereikbaar", icon: XCircle, color: "text-red-500" },
  archived: { label: "Gearchiveerd", icon: Clock, color: "text-muted-foreground" }
};

const SOURCE_TYPE_LABELS = {
  cao_page: "Hoofdpagina",
  cao_pdf: "CAO PDF",
  wage_table_pdf: "Loontabel PDF",
  pay_periods_pdf: "Loonperiodes PDF",
  fonds_cao_pdf: "Fonds-CAO PDF",
  faq_page: "FAQ",
  sociale_commissie_pdf: "Sociale Commissie",
  other: "Overig"
};

export default function CAOBronnenTab() {
  const { data: sources = [], isLoading } = useQuery({
    queryKey: ["cao-sources"],
    queryFn: () => base44.entities.CAOSourceDocument.list("-last_checked_at")
  });

  if (isLoading) return <div className="text-sm text-muted-foreground py-6 text-center">Laden...</div>;

  if (sources.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">Nog geen bronnen gecontroleerd.</p>
        <p className="text-xs mt-1">Gebruik "Controleer bronnen" om te starten.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sources.map(source => {
        const statusCfg = STATUS_CONFIG[source.status] || STATUS_CONFIG.active;
        const StatusIcon = statusCfg.icon;
        return (
          <Card key={source.id} className={`border ${source.status === 'changed' ? 'border-amber-300 dark:border-amber-700' : ''}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-foreground">{source.title}</span>
                    <Badge variant="outline" className="text-xs">
                      {SOURCE_TYPE_LABELS[source.source_type] || source.source_type}
                    </Badge>
                    <div className={`flex items-center gap-1 text-xs ${statusCfg.color}`}>
                      <StatusIcon className="w-3.5 h-3.5" />
                      {statusCfg.label}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-muted-foreground">
                    {source.last_checked_at && (
                      <span>
                        Gecontroleerd: {formatDistanceToNow(new Date(source.last_checked_at), { addSuffix: true, locale: nl })}
                      </span>
                    )}
                    {source.last_changed_at && (
                      <span className="text-amber-600">
                        Gewijzigd: {formatDistanceToNow(new Date(source.last_changed_at), { addSuffix: true, locale: nl })}
                      </span>
                    )}
                  </div>
                  {source.content_hash && (
                    <p className="text-xs text-muted-foreground mt-1 font-mono">
                      Hash: {source.content_hash.slice(0, 16)}…
                    </p>
                  )}
                  {source.extraction_error && (
                    <p className="text-xs text-red-500 mt-1">Fout: {source.extraction_error}</p>
                  )}
                </div>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-600 hover:underline shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Bekijk bron
                </a>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}