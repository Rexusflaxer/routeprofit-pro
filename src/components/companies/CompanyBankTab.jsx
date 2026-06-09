import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Edit, CreditCard, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { prepareBankAccountSensitiveData } from "@/lib/sensitiveFields";

const DELETE_PASSWORD = "verwijder";
const EMPTY = { company_id: "", account_type: "normal", iban: "", account_holder_name: "", bank_name: "", bic: "", is_default: false, is_default_for_invoicing: false, is_default_for_payroll: false, status: "active", notes: "" };

function DeleteConfirmBar({ label, onConfirm, onCancel, isPending }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const handleConfirm = () => {
    if (password !== DELETE_PASSWORD) { setError(`Typ "${DELETE_PASSWORD}" om te bevestigen`); return; }
    onConfirm();
  };
  return (
    <div className="border-b border-destructive/20 bg-destructive/5 p-4">
      <div className="flex items-start gap-3 mb-3">
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-foreground">Rekening verwijderen?</p>
          <p className="text-xs text-muted-foreground mt-0.5"><strong>{label}</strong> wordt verwijderd.</p>
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground block">Typ <strong className="text-foreground font-mono">{DELETE_PASSWORD}</strong> om te bevestigen:</label>
        <div className="flex gap-2">
          <Input value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} placeholder={DELETE_PASSWORD} className={`h-8 text-sm font-mono max-w-[200px] ${error ? "border-destructive" : ""}`} onKeyDown={(e) => e.key === "Enter" && handleConfirm()} autoFocus />
          <Button variant="destructive" size="sm" onClick={handleConfirm} disabled={isPending}><Trash2 className="w-3.5 h-3.5 mr-1" />{isPending ? "Verwijderen..." : "Verwijderen"}</Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>Annuleren</Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}

export default function CompanyBankTab({ companies }) {
  const companyId = companies[0]?.id || "";
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [deleteId, setDeleteId] = useState(null);
  const queryClient = useQueryClient();

  const { data: accounts = [] } = useQuery({
    queryKey: ["company-bank-accounts", companyId],
    queryFn: () => base44.entities.CompanyBankAccount.filter({ company_id: companyId }),
    enabled: !!companyId,
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const prepared = await prepareBankAccountSensitiveData(data, { owner_type: "company", owner_id: companyId, company_id: companyId, source_entity: "CompanyBankAccount" });
      return editing ? base44.entities.CompanyBankAccount.update(editing, prepared) : base44.entities.CompanyBankAccount.create({ ...prepared, company_id: companyId });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["company-bank-accounts", companyId] }); setDialogOpen(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CompanyBankAccount.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["company-bank-accounts", companyId] }); setDeleteId(null); },
  });

  const openNew = () => { setEditing(null); setForm({ ...EMPTY, company_id: companyId }); setDialogOpen(true); };
  const openEdit = (acc) => { setEditing(acc.id); setForm(acc); setDialogOpen(true); };
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const accToDelete = accounts.find(a => a.id === deleteId);

  return (
    <div className="flex flex-col h-full">

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteId && accToDelete && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
            <DeleteConfirmBar
              label={accToDelete.iban_masked || accToDelete.iban}
              onConfirm={() => deleteMutation.mutate(deleteId)}
              onCancel={() => setDeleteId(null)}
              isPending={deleteMutation.isPending}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table header */}
      <div className="flex items-center px-4 py-2 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="flex-1">IBAN / Rekening</span>
        <span className="w-28 shrink-0">Type</span>
        <span className="w-20 shrink-0">Status</span>
        {!deleteId && (
          <Button size="sm" variant="outline" onClick={openNew} className="h-6 px-2 text-xs font-medium normal-case tracking-normal">
            <Plus className="w-3 h-3 mr-1" /> Rekening toevoegen
          </Button>
        )}
      </div>

      {accounts.length === 0 && (
        <p className="px-4 py-3 text-sm text-muted-foreground">Nog geen rekeningen voor dit bedrijf.</p>
      )}

      <div className="divide-y divide-border">
        {accounts.map(acc => (
          <div key={acc.id} className="flex items-center px-4 py-3 group hover:bg-accent/30 transition-colors">
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <div className={`p-1.5 rounded ${acc.account_type === "g_account" ? "bg-amber-50 dark:bg-amber-950" : "bg-blue-50 dark:bg-blue-950"}`}>
                <CreditCard className={`w-3.5 h-3.5 ${acc.account_type === "g_account" ? "text-amber-600" : "text-blue-600"}`} />
              </div>
              <div>
                <span className="text-sm font-medium text-foreground">{acc.iban_masked || acc.iban}</span>
                {acc.account_holder_name && <span className="text-xs text-muted-foreground ml-2">{acc.account_holder_name}</span>}
                {acc.is_default && <Badge className="ml-2 text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0">Standaard</Badge>}
                {acc.account_type === "g_account" && (
                  <span className="ml-2 text-xs text-amber-600 flex items-center gap-1 inline-flex"><AlertTriangle className="w-3 h-3" /> G-rekening</span>
                )}
              </div>
            </div>
            <div className="w-28 shrink-0">
              <Badge variant={acc.account_type === "g_account" ? "outline" : "secondary"} className={`text-xs ${acc.account_type === "g_account" ? "border-amber-400 text-amber-700" : ""}`}>
                {acc.account_type === "g_account" ? "G-rekening" : "Normaal"}
              </Badge>
            </div>
            <div className="w-20 shrink-0 text-xs text-muted-foreground capitalize">{acc.status || "actief"}</div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(acc)} title="Bewerken"><Edit className="w-3.5 h-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteId(acc.id)} title="Verwijderen"><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
        ))}
      </div>

      {/* Edit/Add dialog (unchanged logic) */}
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
                <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1">Een G-rekening is een geblokkeerde rekening voor afdracht van loonheffingen en btw bij inleners- of ketenaansprakelijkheid.</p>
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
              <Button onClick={() => saveMutation.mutate(form)} disabled={!form.iban || saveMutation.isPending}>{saveMutation.isPending ? "Opslaan..." : "Opslaan"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}