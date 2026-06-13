import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, X } from "lucide-react";
import WizardStep1Company from "./wizard/WizardStep1Company";

function deriveRelationshipType(personnel) {
  return personnel.relationship_type || (personnel.employee_type === "zzp" ? "self_employed" : "employee");
}

function normalizePersonnelPayload(form) {
  const relationshipType = deriveRelationshipType(form);
  return {
    ...form,
    name: form.name || "",
    employee_type: form.employee_type || (relationshipType === "self_employed" ? "zzp" : "loondienst"),
    relationship_type: relationshipType,
    profile_data_policy: form.profile_data_policy || (relationshipType === "self_employed" ? "profile_wins_after_acceptance" : "local_only"),
    profile_conflict_status: form.profile_conflict_status || "none",
    local_organization_copy_retained: form.local_organization_copy_retained !== false,
    status: form.status || "draft",
    hr_completeness_status: form.hr_completeness_status || "incomplete",
    country: form.country || "Nederland",
    is_active: form.status ? !["inactive", "archived"].includes(form.status) : true,
  };
}

export default function PersonnelWizard({ initialValues = {}, onClose, onSaved }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    status: "draft",
    employee_type: "loondienst",
    relationship_type: "employee",
    profile_data_policy: "local_only",
    profile_conflict_status: "none",
    local_organization_copy_retained: true,
    country: "Nederland",
    ...initialValues,
  });

  const onChange = (field, value) => setForm(current => ({ ...current, [field]: value }));

  const saveMutation = useMutation({
    mutationFn: async () => base44.entities.Personnel.create(normalizePersonnelPayload(form)),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["personnel"] });
      onSaved?.(created?.id);
      onClose();
    },
  });

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="border-b border-border pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Personeelsprofiel aanmaken</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <WizardStep1Company form={form} onChange={onChange} />
      </CardContent>
      <div className="flex items-center justify-between border-t border-border px-6 py-4">
        <Button variant="outline" onClick={onClose}>Annuleren</Button>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          <Save className="mr-1 h-4 w-4" />{saveMutation.isPending ? "Aanmaken..." : "Profiel aanmaken"}
        </Button>
      </div>
    </Card>
  );
}
