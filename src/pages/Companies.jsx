import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Building2, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import CompanyForm from "@/components/companies/CompanyForm";
import { attachManagedFilesToOwner, updateManagedFileSource } from "@/lib/managedFiles";

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: () => base44.entities.Company.list(),
  });

  const selectedCaoConfigurationIds = [...new Set(companies
    .map(company => company.default_cao_configuration_id)
    .filter(Boolean))];

  const { data: caoConfigurations = [] } = useQuery({
    queryKey: ["cao-configuration-options", selectedCaoConfigurationIds],
    queryFn: async () => {
      const { data } = await base44.functions.invoke("listCaoConfigurationOptions", {
        include_ids: selectedCaoConfigurationIds,
      });
      return data?.options || [];
    },
  });

  const { data: companySettings = [] } = useQuery({
    queryKey: ["companySettings"],
    queryFn: () => base44.entities.CompanySettings.list(),
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const { _managed_file_upload_session_id, ...companyData } = data;
      const created = await base44.entities.Company.create(companyData);
      let attachedFiles = [];
      if (_managed_file_upload_session_id) {
        attachedFiles = await attachManagedFilesToOwner({
          uploadSessionId: _managed_file_upload_session_id,
          ownerType: "company",
          ownerId: created.id,
          companyId: created.id,
          ownerLabel: created.display_name || created.legal_name || "Bedrijf"
        });
      }
      const attachedById = Object.fromEntries(attachedFiles.map((file) => [file.id, file]));
      const filePatch = {};
      if (created.logo_file_id && attachedById[created.logo_file_id]) {
        filePatch.logo_download_filename = attachedById[created.logo_file_id].download_filename;
        filePatch.logo_logical_path = attachedById[created.logo_file_id].logical_path;
      }
      if (created.letterhead_file_id && attachedById[created.letterhead_file_id]) {
        filePatch.letterhead_download_filename = attachedById[created.letterhead_file_id].download_filename;
        filePatch.letterhead_logical_path = attachedById[created.letterhead_file_id].logical_path;
      }
      await Promise.all([
        created.logo_file_id ? updateManagedFileSource(created.logo_file_id, { owner_id: created.id, company_id: created.id, source_entity_id: created.id }) : null,
        created.letterhead_file_id ? updateManagedFileSource(created.letterhead_file_id, { owner_id: created.id, company_id: created.id, source_entity_id: created.id }) : null,
        Object.keys(filePatch).length ? base44.entities.Company.update(created.id, filePatch) : null
      ].filter(Boolean));
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      setDialogOpen(false);
      setEditingCompany(null);
    },
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

  const getCaoName = (id) => {
    const cao = caoConfigurations.find(c => c.id === id);
    return cao ? (cao.label || cao.display_name || cao.name) : null;
  };

  // Groepeer bedrijven: holdings bovenaan, dan hun werkmaatschappijen, dan zelfstandige bedrijven
  const getGroupedCompanies = () => {
    const holdings = companies.filter(c => c.company_role === "holding");
    const subsidiaries = companies.filter(c => c.holding_company_id);
    const independents = companies.filter(c => c.company_role !== "holding" && !c.holding_company_id);
    const result = [];
    for (const holding of holdings) {
      result.push({ company: holding, isChild: false });
      const children = subsidiaries.filter(c => c.holding_company_id === holding.id);
      for (const child of children) result.push({ company: child, isChild: true });
    }
    // Subsidiaries zonder bekende holding
    const orphanSubsidiaries = subsidiaries.filter(c => !holdings.find(h => h.id === c.holding_company_id));
    for (const c of orphanSubsidiaries) result.push({ company: c, isChild: false });
    for (const c of independents) result.push({ company: c, isChild: false });
    return result;
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {getGroupedCompanies().map(({ company, isChild }) => (
                <TableRow
                  key={company.id}
                  className={`cursor-pointer transition-colors ${isChild ? "bg-muted/10 hover:bg-accent" : "hover:bg-accent"}`}
                  onClick={() => navigate(`/CompanyDetail?id=${company.id}`)}
                >
                  <TableCell>
                    <div className={`flex items-center gap-2 ${isChild ? "pl-6 border-l-2 border-muted ml-1" : ""}`}>
                      {company.logo_file_url
                        ? <img src={company.logo_file_url} alt="logo" className="w-7 h-7 rounded object-contain bg-white border border-border p-0.5 shrink-0" />
                        : <div className="w-7 h-7 rounded bg-muted flex items-center justify-center shrink-0"><Building2 className="w-3.5 h-3.5 text-muted-foreground" /></div>
                      }
                      <div>
                        <p className="font-medium text-sm text-foreground">{company.display_name}</p>
                        {company.trade_name && company.trade_name !== company.display_name && (
                          <p className="text-xs text-muted-foreground">{company.trade_name}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{company.kvk_number || "—"}</TableCell>
                  <TableCell>
                    <span className="text-xs bg-muted text-foreground px-2 py-1 rounded font-medium">{ROLE_LABELS[company.company_role] || company.company_role}</span>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Company form dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) setEditingCompany(null); }}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nieuw bedrijf</DialogTitle>
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