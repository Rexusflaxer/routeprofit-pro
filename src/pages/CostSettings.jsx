import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../components/ui-custom/PageHeader";
import CostSettingsForm from "../components/costs/CostSettingsForm";
import { Loader2, CheckCircle2 } from "lucide-react";

export default function CostSettings() {
  const queryClient = useQueryClient();

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ["costSettings"],
    queryFn: () => base44.entities.CostSettings.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.CostSettings.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["costSettings"] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.CostSettings.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["costSettings"] }),
  });

  const handleSave = (data) => {
    if (settings.length > 0) {
      updateMutation.mutate({ id: settings[0].id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overige kosten"
        subtitle="Beheer huisvesting, software en overige bedrijfskosten"
      />
      <CostSettingsForm settings={settings[0]} onSave={handleSave} />
    </div>
  );
}