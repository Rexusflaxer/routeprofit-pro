import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Building2, Check, Clock, Mail, Phone, Save, Users } from "lucide-react";
import {
  TEAMHUB_SERVICE_OPTIONS,
  getEffectiveWpbrLicenseType,
  getTeamhubServiceDisabledReason,
  getWpbrLicenseLabel,
  isTeamhubServiceAllowedForLicense,
  sanitizeTeamhubServiceTypes,
} from "@/lib/teamhubServiceRules";
import TeamhubRegionPicker from "./TeamhubRegionPicker";

function getInitialForm(company) {
  const serviceTypes = Array.isArray(company?.teamhub_service_types) && company.teamhub_service_types.length > 0
    ? company.teamhub_service_types
    : (company?.activities || []);

  return {
    teamhub_enabled: company?.teamhub_enabled === true,
    teamhub_intro: company?.teamhub_intro || "",
    teamhub_contact_name: company?.teamhub_contact_name || "",
    teamhub_contact_email: company?.teamhub_contact_email || "",
    teamhub_contact_phone: company?.teamhub_contact_phone || "",
    teamhub_service_types: serviceTypes,
    teamhub_regions: Array.isArray(company?.teamhub_regions) ? company.teamhub_regions : [],
  };
}

export default function TeamhubTab({ companyId, company }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => getInitialForm(company));

  const { data: wpbrLicenses = [] } = useQuery({
    queryKey: ["wpbr-licenses", companyId],
    queryFn: () => base44.entities.CompanyWpbrLicense.filter({ company_id: companyId }, "-created_date"),
    enabled: !!companyId,
  });

  const effectiveWpbrLicenseType = getEffectiveWpbrLicenseType(company, wpbrLicenses);

  useEffect(() => {
    setForm(getInitialForm(company));
  }, [company?.id]);

  useEffect(() => {
    setForm(current => {
      const sanitized = sanitizeTeamhubServiceTypes(effectiveWpbrLicenseType, current.teamhub_service_types || []);
      if (sanitized.length === (current.teamhub_service_types || []).length) return current;
      return { ...current, teamhub_service_types: sanitized };
    });
  }, [effectiveWpbrLicenseType, company?.id]);

  const saveMutation = useMutation({
    mutationFn: (payload) => base44.entities.Company.update(companyId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });

  const set = (field, value) => {
    setForm(current => ({ ...current, [field]: value }));
  };

  const toggleService = (key) => {
    if (!isTeamhubServiceAllowedForLicense(effectiveWpbrLicenseType, key)) return;
    const current = form.teamhub_service_types || [];
    set(
      "teamhub_service_types",
      current.includes(key) ? current.filter(item => item !== key) : [...current, key]
    );
  };

  const save = () => {
    saveMutation.mutate({
      teamhub_enabled: form.teamhub_enabled === true,
      teamhub_intro: form.teamhub_intro?.trim() || null,
      teamhub_contact_name: form.teamhub_contact_name?.trim() || null,
      teamhub_contact_email: form.teamhub_contact_email?.trim() || null,
      teamhub_contact_phone: form.teamhub_contact_phone?.trim() || null,
      teamhub_service_types: sanitizeTeamhubServiceTypes(effectiveWpbrLicenseType, form.teamhub_service_types || []),
      teamhub_regions: form.teamhub_regions || [],
    });
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Users className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">LOQ Teamhub</p>
              {form.teamhub_enabled ? (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Zichtbaar</Badge>
              ) : (
                <Badge variant="secondary">Niet zichtbaar</Badge>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">Onderaannemersprofiel voor diensten van hoofdaannemers</p>
          </div>
        </div>
        <Button size="sm" onClick={save} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? (
            <>
              <Clock className="mr-1 h-4 w-4" /> Opslaan...
            </>
          ) : saveMutation.isSuccess ? (
            <>
              <Check className="mr-1 h-4 w-4" /> Opgeslagen
            </>
          ) : (
            <>
              <Save className="mr-1 h-4 w-4" /> Opslaan
            </>
          )}
        </Button>
      </div>

      <div className="space-y-5 p-4">
        <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-background p-4">
          <div className="min-w-0">
            <Label className="text-sm font-semibold">Weergeven in LOQ Teamhub</Label>
            <p className="mt-1 text-xs text-muted-foreground">Publiceer dit bedrijfsprofiel als beschikbare onderaannemer.</p>
          </div>
          <Switch checked={form.teamhub_enabled} onCheckedChange={checked => set("teamhub_enabled", checked)} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label>Publieke introductie</Label>
            <Textarea
              value={form.teamhub_intro}
              onChange={e => set("teamhub_intro", e.target.value)}
              rows={5}
              placeholder="Korte omschrijving van specialisaties, werkgebied en inzetbaarheid"
            />
          </div>

          <div className="space-y-3 rounded-md border border-border p-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Label className="font-semibold">Publiek contact</Label>
            </div>
            <div className="space-y-2">
              <Input
                value={form.teamhub_contact_name}
                onChange={e => set("teamhub_contact_name", e.target.value)}
                placeholder="Contactpersoon"
              />
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  value={form.teamhub_contact_email}
                  onChange={e => set("teamhub_contact_email", e.target.value)}
                  placeholder={company?.email || "teamhub@bedrijf.nl"}
                  className="pl-9"
                />
              </div>
              <div className="relative">
                <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={form.teamhub_contact_phone}
                  onChange={e => set("teamhub_contact_phone", e.target.value)}
                  placeholder={company?.phone || "Telefoonnummer"}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Label>Diensten</Label>
          <p className="text-xs text-muted-foreground">
            Selectie op basis van vergunning: {effectiveWpbrLicenseType ? `${effectiveWpbrLicenseType} - ${getWpbrLicenseLabel(effectiveWpbrLicenseType)}` : "geen actieve WPBR-vergunning gevonden"}.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {TEAMHUB_SERVICE_OPTIONS.map(activity => {
              const allowed = isTeamhubServiceAllowedForLicense(effectiveWpbrLicenseType, activity.key);
              const disabledReason = getTeamhubServiceDisabledReason(effectiveWpbrLicenseType, activity.key);
              return (
              <label
                key={activity.key}
                title={disabledReason}
                className={`flex items-start gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm ${allowed ? "cursor-pointer hover:bg-accent/50" : "cursor-not-allowed opacity-55"}`}
              >
                <Checkbox
                  checked={(form.teamhub_service_types || []).includes(activity.key)}
                  disabled={!allowed}
                  onCheckedChange={() => toggleService(activity.key)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block">{activity.label}</span>
                  {!allowed && <span className="block text-[11px] leading-4 text-muted-foreground">{disabledReason}</span>}
                </span>
              </label>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <Label>Werkregio's</Label>
          <TeamhubRegionPicker
            value={form.teamhub_regions}
            onChange={regions => set("teamhub_regions", regions)}
          />
        </div>
      </div>
    </div>
  );
}
