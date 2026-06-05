import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  RefreshCw, CheckCircle, XCircle, AlertTriangle, ExternalLink,
  Clock, FileText, Shield, Play, Search
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import CAOBronnenTab from "@/components/cao/CAOBronnenTab";
import CAOImportRunsTab from "@/components/cao/CAOImportRunsTab";
import CAOWijzigingenTab from "@/components/cao/CAOWijzigingenTab";
import CAORegelsTab from "@/components/cao/CAORegelsTab";
import CAOActiefTab from "@/components/cao/CAOActiefTab";
import CAOPayrollTestTab from "@/components/cao/CAOPayrollTestTab";
import CAOCoverageDashboard from "@/components/cao/CAOCoverageDashboard";
import { BarChart2 } from "lucide-react";

export default function CAOBeheer() {
  const [activeTab, setActiveTab] = useState("coverage");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: pendingReviews = [] } = useQuery({
    queryKey: ["cao-change-reviews-pending"],
    queryFn: () => base44.entities.CAOChangeReview.filter({ status: "pending" })
  });

  const checkSourcesMutation = useMutation({
    mutationFn: () => base44.functions.invoke("checkCaoSources", { action: "check", force: false }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["cao-sources"] });
      queryClient.invalidateQueries({ queryKey: ["cao-import-runs"] });
      toast({
        title: "Broncontrole voltooid",
        description: res.data?.summary || "Controle afgerond."
      });
    },
    onError: (err) => toast({ title: "Fout", description: err.message, variant: "destructive" })
  });

  const extractMutation = useMutation({
    mutationFn: () => base44.functions.invoke("extractCaoParameters", {}),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["cao-configurations"] });
      queryClient.invalidateQueries({ queryKey: ["cao-change-reviews-pending"] });
      toast({
        title: "Extractie voltooid",
        description: `Configuratie aangemaakt: ${res.data?.version_label}. Goedkeuring vereist.`
      });
    },
    onError: (err) => toast({ title: "Fout", description: err.message, variant: "destructive" })
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CAO Beheer</h1>
          <p className="text-sm text-muted-foreground mt-1">
            CAO Particuliere Beveiliging — bronbewaking, versiebeheer en payroll-parameters
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {pendingReviews.length > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="w-3 h-3" />
              {pendingReviews.length} openstaande wijzigingen
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => checkSourcesMutation.mutate()}
            disabled={checkSourcesMutation.isPending}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${checkSourcesMutation.isPending ? "animate-spin" : ""}`} />
            Controleer bronnen
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => extractMutation.mutate()}
            disabled={extractMutation.isPending}
            className="gap-2"
          >
            <Play className="w-4 h-4" />
            Extraheer 2026 parameters
          </Button>
        </div>
      </div>

      <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800">
        <Shield className="w-4 h-4 text-amber-600" />
        <AlertDescription className="text-amber-800 dark:text-amber-200 text-sm">
          Geen enkele CAO-wijziging wordt automatisch actief. Elke update vereist expliciete goedkeuring.
        </AlertDescription>
      </Alert>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="coverage" className="gap-1.5">
            <BarChart2 className="w-3.5 h-3.5" />Coverage
          </TabsTrigger>
          <TabsTrigger value="bronnen" className="gap-1.5">
            <FileText className="w-3.5 h-3.5" />Bronnen
          </TabsTrigger>
          <TabsTrigger value="runs" className="gap-1.5">
            <Clock className="w-3.5 h-3.5" />Import runs
          </TabsTrigger>
          <TabsTrigger value="wijzigingen" className="gap-1.5 relative">
            <AlertTriangle className="w-3.5 h-3.5" />
            Wijzigingen
            {pendingReviews.length > 0 && (
              <span className="ml-1 bg-destructive text-destructive-foreground text-xs rounded-full px-1.5 py-0.5">
                {pendingReviews.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="regels" className="gap-1.5">
            <Search className="w-3.5 h-3.5" />CAO-regels
          </TabsTrigger>
          <TabsTrigger value="actief" className="gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" />Actieve configuratie
          </TabsTrigger>
          <TabsTrigger value="test" className="gap-1.5">
            <Play className="w-3.5 h-3.5" />Payroll test
          </TabsTrigger>
        </TabsList>

        <TabsContent value="coverage" className="mt-4">
          <CAOCoverageDashboard />
        </TabsContent>
        <TabsContent value="bronnen" className="mt-4">
          <CAOBronnenTab />
        </TabsContent>
        <TabsContent value="runs" className="mt-4">
          <CAOImportRunsTab />
        </TabsContent>
        <TabsContent value="wijzigingen" className="mt-4">
          <CAOWijzigingenTab />
        </TabsContent>
        <TabsContent value="regels" className="mt-4">
          <CAORegelsTab />
        </TabsContent>
        <TabsContent value="actief" className="mt-4">
          <CAOActiefTab />
        </TabsContent>
        <TabsContent value="test" className="mt-4">
          <CAOPayrollTestTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}