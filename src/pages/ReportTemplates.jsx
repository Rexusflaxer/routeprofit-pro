import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "../components/ui-custom/PageHeader";

export default function ReportTemplates() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", task_type: "", description: "", fields: "[]", is_active: true });
  const { data: templates = [] } = useQuery({ queryKey: ["report-templates"], queryFn: () => base44.entities.ReportTemplate.list() });
  const saveMutation = useMutation({ mutationFn: data => base44.entities.ReportTemplate.create(data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["report-templates"] }); setForm({ name: "", task_type: "", description: "", fields: "[]", is_active: true }); } });
  const save = () => saveMutation.mutate({ ...form, fields: JSON.parse(form.fields || "[]") });
  return <div className="space-y-6"><PageHeader title="Rapportagetemplates" subtitle="Beheer mobiele formulieren per taaktype" /><div className="bg-white border rounded-xl p-4 space-y-3"><Input placeholder="Naam" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><Input placeholder="Taaktype" value={form.task_type} onChange={e=>setForm({...form,task_type:e.target.value})}/><Textarea placeholder="Velden JSON" rows={7} value={form.fields} onChange={e=>setForm({...form,fields:e.target.value})}/><Button onClick={save}>Template opslaan</Button></div><div className="grid gap-3">{templates.map(t=><div key={t.id} className="bg-white border rounded-xl p-4"><p className="font-semibold">{t.name}</p><p className="text-sm text-slate-500">{t.task_type}</p></div>)}</div></div>;
}