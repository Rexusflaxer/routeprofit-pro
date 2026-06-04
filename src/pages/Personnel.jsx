import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Users, Search, Pencil, Trash2, Calculator, AlertTriangle, Clock } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import PageHeader from "../components/ui-custom/PageHeader";
import EmptyState from "../components/ui-custom/EmptyState";
import PersonnelWizard from "../components/personnel/PersonnelWizard";
import CostCalculator from "../components/personnel/CostCalculator";

const STATUS_COLORS = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  onboarding: "bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-300",
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-800 dark:text-emerald-300",
  inactive: "bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-300",
  archived: "bg-red-50 text-red-600 dark:bg-red-900 dark:text-red-300",
};
const STATUS_LABELS = { draft: "Concept", onboarding: "Onboarding", active: "Actief", inactive: "Inactief", archived: "Gearchiveerd" };
const HR_COLORS = { complete: "bg-emerald-100 text-emerald-700 dark:bg-emerald-800 dark:text-emerald-300", needs_review: "bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-300", incomplete: "bg-red-50 text-red-600 dark:bg-red-900 dark:text-red-300" };
const HR_LABELS = { complete: "Volledig", needs_review: "Beoordeling", incomplete: "Onvolledig" };

function getExpiryBadge(dateStr) {
  if (!dateStr) return null;
  const diff = (new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 text-xs">Verlopen</Badge>;
  if (diff <= 30) return <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 text-xs">Verloopt &lt;30d</Badge>;
  if (diff <= 60) return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 text-xs">Verloopt &lt;60d</Badge>;
  return null;
}

export default function Personnel() {
  const [showWizard, setShowWizard] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedForCalc, setSelectedForCalc] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterFunction, setFilterFunction] = useState("all");
  const queryClient = useQueryClient();

  const { data: personnel = [] } = useQuery({ queryKey: ["personnel"], queryFn: () => base44.entities.Personnel.list() });
  const { data: companies = [] } = useQuery({ queryKey: ["companies"], queryFn: () => base44.entities.Company.list() });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Personnel.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["personnel"] }),
  });

  const openEdit = (p) => { setEditing(p); setShowWizard(true); };
  const openNew = () => { setEditing(null); setShowWizard(true); };

  const filtered = personnel.filter(p => {
    const matchSearch = !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.email?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || (p.status || "draft") === filterStatus || (filterStatus === "active" && p.is_active && !p.status);
    const matchFn = filterFunction === "all" || p.function_type === filterFunction;
    return matchSearch && matchStatus && matchFn;
  });

  const getCompanyName = (id) => companies.find(c => c.id === id)?.display_name || "—";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Personeel"
        subtitle="HR-dossiers, compliance en medewerkersbeheer"
        actions={
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-1" /> Nieuwe medewerker
          </Button>
        }
      />

      <AnimatePresence>
        {showWizard && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <PersonnelWizard person={editing} onClose={() => { setShowWizard(false); setEditing(null); }} />
          </motion.div>
        )}
      </AnimatePresence>

      {!showWizard && (
        <Tabs defaultValue="list">
          <TabsList>
            <TabsTrigger value="list">Overzicht</TabsTrigger>
            <TabsTrigger value="costs">Kostenberekening</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4 pt-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Zoeken op naam of e-mail…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle statussen</SelectItem>
                  <SelectItem value="active">Actief</SelectItem>
                  <SelectItem value="onboarding">Onboarding</SelectItem>
                  <SelectItem value="draft">Concept</SelectItem>
                  <SelectItem value="inactive">Inactief</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterFunction} onValueChange={setFilterFunction}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Functie" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle functies</SelectItem>
                  <SelectItem value="surveillant">Surveillant</SelectItem>
                  <SelectItem value="binnendienst">Binnendienst</SelectItem>
                  <SelectItem value="planner">Planner</SelectItem>
                  <SelectItem value="verkeersregelaar">Verkeersregelaar</SelectItem>
                  <SelectItem value="brandwacht">Brandwacht</SelectItem>
                  <SelectItem value="other">Overig</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filtered.length === 0 && !showWizard && (
              <EmptyState icon={Users} title="Geen medewerkers" description="Voeg uw eerste medewerker toe via de wizard." actionLabel="Medewerker toevoegen" onAction={openNew} />
            )}

            {filtered.length > 0 && (
              <div className="rounded-xl border border-border overflow-x-auto shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Naam</TableHead>
                      <TableHead>Bedrijf</TableHead>
                      <TableHead>Functie</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>HR-status</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Compliance</TableHead>
                      <TableHead className="text-right">Acties</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(p => {
                      const hrStatus = p.hr_completeness_status || "incomplete";
                      const status = p.status || (p.is_active !== false ? "active" : "inactive");
                      return (
                        <TableRow key={p.id} className="hover:bg-muted/20 transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {p.photo_file_url ? (
                                <img src={p.photo_file_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 border border-border" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                                  {p.name?.[0]?.toUpperCase() || "?"}
                                </div>
                              )}
                              <div>
                                <p className="font-medium text-sm text-foreground">{p.name || "—"}</p>
                                {p.email && <p className="text-xs text-muted-foreground">{p.email}</p>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{p.primary_company_id ? getCompanyName(p.primary_company_id) : "—"}</TableCell>
                          <TableCell className="text-sm capitalize">{p.function_type || "—"}</TableCell>
                          <TableCell>
                            <Badge className={p.employee_type === "zzp" ? "bg-purple-100 text-purple-700 dark:bg-purple-800 dark:text-purple-300" : "bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-300"}>
                              {p.employee_type === "zzp" ? "ZZP" : "Loondienst"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${HR_COLORS[hrStatus] || HR_COLORS.incomplete}`}>
                              {HR_LABELS[hrStatus] || "Onvolledig"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[status] || STATUS_COLORS.draft}`}>
                              {STATUS_LABELS[status] || status}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 flex-wrap">
                              {p.wpbr_status === "approved" && <Badge className="bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-300 text-xs">Wpbr ✓</Badge>}
                              {p.wpbr_required && p.wpbr_status !== "approved" && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-300 text-xs"><AlertTriangle className="w-2.5 h-2.5 mr-0.5" />Wpbr</Badge>}
                              {getExpiryBadge(p.wpbr_permission_valid_until)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => { setSelectedForCalc(p); }} className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                <Calculator className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => openEdit(p)} className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => { if (confirm(`${p.name} verwijderen?`)) deleteMutation.mutate(p.id); }} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="costs" className="pt-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Selecteer medewerker</p>
                {personnel.map(p => (
                  <button key={p.id} type="button" onClick={() => setSelectedForCalc(p)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-colors ${selectedForCalc?.id === p.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/50"}`}>
                    {p.name}
                  </button>
                ))}
              </div>
              <div className="lg:col-span-2">
                {selectedForCalc ? (
                  <CostCalculator personnel={selectedForCalc} />
                ) : (
                  <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">Selecteer een medewerker om kosten te berekenen</CardContent></Card>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}