import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, XCircle, ExternalLink } from "lucide-react";

export default function CaoCatalogTab() {
  const { data: caos = [], isLoading } = useQuery({
    queryKey: ["cao-configurations"],
    queryFn: () => base44.entities.CAOConfiguration.list(),
  });

  if (isLoading) return <div className="py-8 text-center text-sm text-slate-400">Laden...</div>;

  return (
    <div className="space-y-3">
      {caos.length === 0 && (
        <p className="text-sm text-slate-400 py-8 text-center">Geen CAO-configuraties gevonden.</p>
      )}
      {caos.map(cao => (
        <Card key={cao.id} className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-slate-900">{cao.display_name || cao.name}</span>
                  {cao.version_label && <Badge variant="outline" className="text-xs">{cao.version_label}</Badge>}
                  {cao.cao_key && <code className="text-xs text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{cao.cao_key}</code>}
                </div>
                {cao.sector && <p className="text-xs text-slate-500 mt-0.5">Sector: {cao.sector}</p>}
                {cao.registration_number && <p className="text-xs text-slate-400">Registratienr.: {cao.registration_number}</p>}
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  {cao.valid_from && <span className="text-xs text-slate-400">Geldig van: {cao.valid_from}</span>}
                  {cao.valid_until && <span className="text-xs text-slate-400">tot: {cao.valid_until}</span>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex items-center gap-1.5">
                  {cao.is_active
                    ? <><CheckCircle className="w-4 h-4 text-green-500" /><span className="text-xs text-green-700">Actief</span></>
                    : <><XCircle className="w-4 h-4 text-slate-400" /><span className="text-xs text-slate-500">Inactief</span></>}
                </div>
                <div className="flex items-center gap-1.5">
                  {cao.is_payroll_ready
                    ? <><CheckCircle className="w-4 h-4 text-blue-500" /><span className="text-xs text-blue-700">Loonklaar</span></>
                    : <><XCircle className="w-4 h-4 text-slate-300" /><span className="text-xs text-slate-400">Niet loonklaar</span></>}
                </div>
                {cao.source_url && (
                  <a href={cao.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 flex items-center gap-1 hover:underline">
                    <ExternalLink className="w-3 h-3" />Bron
                  </a>
                )}
              </div>
            </div>
            {cao.notes && <p className="text-xs text-slate-500 mt-2 border-t pt-2">{cao.notes}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}