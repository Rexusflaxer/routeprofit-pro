import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, ExternalLink, Shield, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const STATUS_COLORS = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  pending_review: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  draft: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
};

const STATUS_LABELS = {
  active: "Actief", pending_review: "Review vereist", draft: "Concept",
  archived: "Gearchiveerd", rejected: "Afgewezen"
};

export default function CAOActiefTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ["cao-configurations"],
    queryFn: () => base44.entities.CAOConfiguration.list("-valid_from")
  });

  const approveMutation = useMutation({
    mutationFn: (id) => base44.functions.invoke("approveCaoConfiguration", {
      cao_configuration_id: id,
      action: "approve"
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["cao-configurations"] });
      toast({ title: "Configuratie geactiveerd", description: res.data?.message });
    },
    onError: (err) => toast({ title: "Fout bij activeren", description: err.message, variant: "destructive" })
  });

  if (isLoading) return <div className="text-sm text-muted-foreground py-6 text-center">Laden...</div>;

  const active = configs.filter(c => c.status === "active");
  const pendingReview = configs.filter(c => c.status === "pending_review" || c.status === "draft");

  return (
    <div className="space-y-6">
      {active.map(cao => (
        <Card key={cao.id} className="border-green-200 dark:border-green-900">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <CardTitle className="text-base">{cao.name}</CardTitle>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS.active}`}>
                Actief
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">Geldig van</span>
                <p className="font-medium">{cao.valid_from || "–"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Geldig tot</span>
                <p className="font-medium">{cao.valid_until || "–"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Versie</span>
                <p className="font-medium">{cao.version_label || "–"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Goedgekeurd door</span>
                <p className="font-medium">{cao.approved_by_name || "–"}</p>
              </div>
            </div>

            {/* Toeslagen */}
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">Toeslagen</p>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
                {[
                  { label: "Avond", value: cao.surcharge_evening, unit: "%" },
                  { label: "Nacht", value: cao.surcharge_night, unit: "%" },
                  { label: "Weekend", value: cao.surcharge_weekend, unit: "%" },
                  { label: "Feestdag", value: cao.surcharge_holiday, unit: "%" },
                  { label: "Oudjaar 16+", value: cao.surcharge_new_years_eve_after_16, unit: "%" },
                  { label: "Vakantiegeld", value: cao.vacation_allowance, unit: "%" }
                ].map(item => (
                  <div key={item.label} className="bg-muted rounded p-2 text-center">
                    <p className="text-muted-foreground">{item.label}</p>
                    <p className="font-semibold text-foreground">{item.value}{item.unit}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Loonperiodes */}
            {cao.pay_periods?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-foreground mb-2">
                  Loonperiodes ({cao.pay_periods.length})
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-1 text-xs">
                  {cao.pay_periods.map(p => (
                    <div
                      key={p.period_number}
                      className={`rounded p-1.5 ${p.is_extra_period ? 'bg-amber-100 dark:bg-amber-900/20' : 'bg-muted'}`}
                    >
                      <span className="font-mono font-semibold">P{p.period_number}</span>
                      <span className="text-muted-foreground ml-1">{p.start_date}</span>
                      {p.is_extra_period && <span className="ml-1 text-amber-600">*</span>}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">* Periode 14 = extra periode</p>
              </div>
            )}

            {cao.source_url && (
              <a href={cao.source_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                <ExternalLink className="w-3 h-3" />Officiële CAO-pagina
              </a>
            )}
          </CardContent>
        </Card>
      ))}

      {pendingReview.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Wacht op goedkeuring ({pendingReview.length})
          </h3>
          {pendingReview.map(cao => (
            <Card key={cao.id} className="border-amber-200 dark:border-amber-800">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{cao.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[cao.status]}`}>
                        {STATUS_LABELS[cao.status]}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Geldig: {cao.valid_from || "?"} t/m {cao.valid_until || "?"}
                    </p>
                    {cao.change_summary && (
                      <p className="text-xs text-foreground mt-1">{cao.change_summary}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-xs text-amber-600">
                      <Shield className="w-3.5 h-3.5" />
                      Goedkeuring vereist
                    </div>
                    <Button
                      size="sm"
                      onClick={() => approveMutation.mutate(cao.id)}
                      disabled={approveMutation.isPending}
                      className="gap-1"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Activeren
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {configs.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">Geen CAO-configuraties gevonden.</p>
        </div>
      )}
    </div>
  );
}