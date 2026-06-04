import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, Building2, AlertCircle } from "lucide-react";
import CompanyForm from "@/components/companies/CompanyForm";
import HoldingStructureTab from "@/components/companies/HoldingStructureTab";
import LocationsTab from "@/components/companies/LocationsTab";
import CaoCatalogTab from "@/components/companies/CaoCatalogTab";
import CompanyBankTab from "@/components/companies/CompanyBankTab";

const ROLE_LABELS = {
  holding: "Holding", operating_company: "Werkmaatschappij",
  sole_proprietor: "Eenmanszaak", other: "Overig",
};

const ACTIVITY_LABELS = {
  private_security: "Particuliere beveiliging", event_hospitality_security: "Evenementen/horeca",
  object_security: "Objectbeveiliging", mobile_surveillance: "Mobiele surveillance",
  alarm_center: "Alarmcentrale", video_surveillance_center: "Videotoezicht",
  security_installation: "Beveiligingsinstallaties", traffic_controller: "Verkeersregelaars",
  fire_watch: "Brandwacht", bhv: "BHV", private_investigation: "Recherche",
  reception_host: "Receptie/host", other: "Overig",
};

const STATUS_COLORS = {
  active: "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-300",
  inactive: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  archived: "bg-red-50 text-red-600 dark:bg-red-900 dark:text-red-300",
};

export default function Companies() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [migrateLoading, setMigrateLoading] = useState(false);
  const queryClient = useQueryClient();

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: () => base44.entities.Company.list(),
  });

  const { data: caoConfigurations = [] } = useQuery({
    queryKey: ["cao-configurations"],
    queryFn: () => base44.entities.CAOConfiguration.list(),
  });

  const { data: companySettings = [] } = useQuery({
    queryKey: ["companySettings"],
    queryFn: () => base44.entities.CompanySettings.list(),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => editingCompany?.id
      ? base44.entities.Company.update(editingCompany.id, data)
      : base44.entities.Company.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      setDialogOpen(false);
      setEditingCompany(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Company.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["companies"] }),
  });

  const handleMigrateFromSettings = async () => {
    const settings = companySettings[0];
    if (!settings) return;
    setMigrateLoading(true);
    await base44.entities.Company.create({
      display_name: settings.company_name || "Mijn Bedrijf",
      legal_name: settings.company_name || "Mijn Bedrijf",
      kvk_number: settings.kvk_number || null,
      btw_number: settings.btw_number || null,
      postal_code: settings.postal_code || null,
      city: settings.city || null,
      phone: settings.phone || null,
      email: settings.email || null,
      status: "active",
      company_role: "operating_company",
      activities: ["private_security"],
      country: "Nederland",
    });
    queryClient.invalidateQueries({ queryKey: ["companies"] });
    setMigrateLoading(false);
  };

  const openNew = () => { setEditingCompany(null); setDialogOpen(true); };
  const openEdit = (c) => { setEditingCompany(c); setDialogOpen(true); };

  const getCaoName = (id) => {
    const cao = caoConfigurations.find(c => c.id === id);
    return cao ? (cao.display_name || cao.name) : null;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bedrijven</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Beheer juridische entiteiten, holdings en vestigingen</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 mr-1" /> Bedrijf toevoegen
        </Button>
      </div>

      {/* Migration banner */}
      {companies.length === 0 && companySettings.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 p-4">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">Nog geen bedrijven aangemaakt</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Er zijn bestaande instellingen beschikbaar ({companySettings[0].company_name}). Je kunt dit omzetten naar een eerste bedrijf.
            </p>
          </div>
          <Button size="sm" variant="outline" className="border-amber-400 text-amber-800 hover:bg-amber-100 shrink-0" onClick={handleMigrateFromSettings} disabled={migrateLoading}>
            {migrateLoading ? "Bezig..." : "Maak bedrijf uit huidige instellingen"}
          </Button>
        </div>
      )}

      <Tabs defaultValue="companies">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="companies">Bedrijven</TabsTrigger>
          <TabsTrigger value="holding">Holdingstructuur</TabsTrigger>
          <TabsTrigger value="locations">Vestigingen</TabsTrigger>
          <TabsTrigger value="cao">CAO-catalogus</TabsTrigger>
          <TabsTrigger value="bank">Bank / G-rekeningen</TabsTrigger>
        </TabsList>

        {/* BEDRIJVEN TAB */}
        <TabsContent value="companies" className="pt-4">
          {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">Laden...</p>}
          {!isLoading && companies.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              <Building2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm">Geen bedrijven aangemaakt.</p>
              <Button className="mt-4" size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" />Eerste bedrijf toevoegen</Button>
            </div>
          )}
          {companies.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Bedrijf</TableHead>
                    <TableHead>KvK</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Activiteiten</TableHead>
                    <TableHead>CAO</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.map(company => (
                    <TableRow key={company.id} className="hover:bg-muted/20">
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm text-foreground">{company.display_name}</p>
                          {company.trade_name && company.trade_name !== company.display_name && (
                            <p className="text-xs text-muted-foreground">{company.trade_name}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{company.kvk_number || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{ROLE_LABELS[company.company_role] || company.company_role}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(company.activities || []).slice(0, 2).map(a => (
                            <span key={a} className="text-xs bg-muted text-foreground px-1.5 py-0.5 rounded">{ACTIVITY_LABELS[a] || a}</span>
                          ))}
                          {(company.activities || []).length > 2 && (
                            <span className="text-xs text-muted-foreground">+{(company.activities || []).length - 2}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {company.default_cao_configuration_id ? getCaoName(company.default_cao_configuration_id) : "—"}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[company.status] || "bg-slate-100 text-slate-600"}`}>
                          {company.status === "active" ? "Actief" : company.status === "inactive" ? "Inactief" : "Gearchiveerd"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(company)}><Edit className="w-4 h-4" /></Button>
                          <Button size="icon" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => { if (confirm(`${company.display_name} verwijderen?`)) deleteMutation.mutate(company.id); }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="holding" className="pt-4">
          <HoldingStructureTab companies={companies} />
        </TabsContent>

        <TabsContent value="locations" className="pt-4">
          <LocationsTab companies={companies} />
        </TabsContent>

        <TabsContent value="cao" className="pt-4">
          <CaoCatalogTab />
        </TabsContent>

        <TabsContent value="bank" className="pt-4">
          {companies.length === 0
            ? <p className="text-sm text-muted-foreground py-8 text-center">Voeg eerst een bedrijf toe.</p>
            : <CompanyBankTab companies={companies} />}
        </TabsContent>
      </Tabs>

      {/* Company form dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) setEditingCompany(null); }}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCompany ? `${editingCompany.display_name} bewerken` : "Nieuw bedrijf"}</DialogTitle>
          </DialogHeader>
          <CompanyForm
            company={editingCompany}
            companies={companies}
            caoConfigurations={caoConfigurations}
            onSave={(data) => saveMutation.mutate(data)}
            onCancel={() => { setDialogOpen(false); setEditingCompany(null); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}