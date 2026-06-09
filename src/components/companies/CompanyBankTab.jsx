import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Edit, CreditCard, AlertTriangle } from "lucide-react";
import { prepareBankAccountSensitiveData } from "@/lib/sensitiveFields";

const EMPTY = { company_id: "", account_type: "normal", iban: "", account_holder_name: "", bank_name: "", bic: "", is_default: false, is_default_for_invoicing: false, is_default_for_payroll: false, status: "active", notes: "" };

export default function CompanyBankTab({ companies }) {
  const companyId = companies[0]?.id || "";
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const queryClient = useQueryClient();

  const { data: accounts = [] } = useQuery({
    queryKey: ["company-bank-accounts", companyId],
    queryFn: () => base44.entities.CompanyBankAccount.filter({ company_id: companyId }),
    enabled: !!companyId,
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const prepared = await prepareBankAccountSensitiveData(data, {
        owner_type: "company",
        owner_id: companyId,
        company_id: companyId,
        source_entity: "CompanyBankAccount"
      });
      return editing
        ? base44.entities.CompanyBankAccount.update(editing, prepared)
        : base44.entities.CompanyBankAccount.create({ ...prepared, company_id: companyId });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["company-bank-accounts", companyId] }); setDialogOpen(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CompanyBankAccount.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-bank-accounts", companyId] }),
  });

  const openNew = () => { setEditing(null); setForm({ ...EMPTY, company_id: companyId }); setDialogOpen(true); };
  const openEdit = (acc) => { setEditing(acc.id); setForm(acc); setDialogOpen(true); };
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      {/* Header met knop */}
      <div className="bg-muted/40 border-b border-border px-6 py-4 rounded-t-xl flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Bank / G-rekeningen</h2>
        <Button size="sm" onClick={openNew}>
          <Plus className="w-4 h-4 mr-1" />Rekening toevoegen
        </Button>
      </div>

      {/* Content */}
      <div className="p-6 space-y-3">
        {accounts.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">Nog geen rekeningen voor dit bedrijf.</p>
        )}

        {accounts.map(acc => (
          <Card key={acc.id} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-start gap-3">
              <div className={`p-2 rounded-lg ${acc.account_type === "g_account" ? "bg-amber-50" : "bg-blue-50"}`}>
                <CreditCard className={`w-5 h-5 ${acc.account_type === "g_account" ? "text-amber-600" : "text-blue-600"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{acc.iban_masked || acc.iban}</span>
                  <Badge variant={acc.account_type === "g_account" ? "outline" : "secondary"} className={acc.account_type === "g_account" ? "border-amber-400 text-amber-700" : ""}>
                    {acc.account_type === "g_account" ? "G-rekening" : "Normale rekening"}
                  </Badge>
                  {acc.is_default && <Badge className="bg-green-100 text-green-800 text-xs">Standaard</Badge>}
                  {acc.status !== "active" && <Badge variant="outline" className="text-xs">{acc.status}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{acc.account_holder_name || acc.bank_name || ""}</p>
                {acc.account_type === "g_account" && (
                  <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> G-rekening voor loonheffingen/btw bij inleners- of ketenaansprakelijkheid
                  </p>
                )}
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => openEdit(acc)}><Edit className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => { if (confirm("Rekening verwijderen?")) deleteMutation.mutate(acc.id); }}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Rekening bewerken" : "Rekening toevoegen"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={form.account_type} onValueChange={v => set("account_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normale rekening</SelectItem>
                  <SelectItem value="g_account">G-rekening</SelectItem>
                </SelectContent>
              </Select>
              {form.account_type === "g_account" && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1">
                  Een G-rekening is een geblokkeerde rekening voor afdracht van loonheffingen en btw bij inleners- of ketenaansprakelijkheid.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1"><Label>IBAN *</Label><Input value={form.iban} onChange={e => set("iban", e.target.value)} placeholder="NL00 BANK 0000 0000 00" /></div>
              <div className="space-y-1"><Label>Rekeninghouder</Label><Input value={form.account_holder_name || ""} onChange={e => set("account_holder_name", e.target.value)} /></div>
              <div className="space-y-1"><Label>Bank</Label><Input value={form.bank_name || ""} onChange={e => set("bank_name", e.target.value)} /></div>
              <div className="space-y-1"><Label>BIC</Label><Input value={form.bic || ""} onChange={e => set("bic", e.target.value)} /></div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => set("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Actief</SelectItem>
                    <SelectItem value="inactive">Inactief</SelectItem>
                    <SelectItem value="pending">In behandeling</SelectItem>
                    <SelectItem value="archived">Gearchiveerd</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              {[["is_default", "Standaardrekening"], ["is_default_for_invoicing", "Standaard voor facturatie"], ["is_default_for_payroll", "Standaard voor salarisbetaling"]].map(([field, label]) => (
                <div key={field} className="flex items-center gap-2">
                  <Switch checked={!!form[field]} onCheckedChange={v => set(field, v)} />
                  <span className="text-sm">{label}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuleren</Button>
              <Button onClick={() => saveMutation.mutate(form)} disabled={!form.iban}>Opslaan</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
