import React, { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Building2, Check, Clock, Mail, Phone, Save, Users } from "lucide-react";
import TeamhubRegionPicker from "./TeamhubRegionPicker";

const ACTIVITY_LABELS = {
  private_security: "Particuliere beveiliging",
  event_hospitality_security: "Evenementen/horeca",
  object_security: "Objectbeveiliging",
  mobile_surveillance: "Mobiele surveillance",
  alarm_center: "Alarmcentrale",
  video_surveillance_center: "Videotoezicht",
  security_installation: "Beveiligingsinstallaties",
  traffic_controller: "Verkeersregelaars",
  fire_watch: "Brandwacht",
  bhv: "BHV",
  private_investigation: "Recherche",
  reception_host: "Receptie/host",
  other: "Overig",
};

const ACTIVITIES = Object.entries(ACTIVITY_LABELS).map(([key, label]) => ({ key, label }));

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
    teamhub_capacity_note: company?.teamhub_capacity_note || "",
    teamhub_available_from: company?.teamhub_available_from || "",
    teamhub_min_notice_hours: company?.teamhub_min_notice_hours ?? "",
    teamhub_regions: Array.isArray(company?.teamhub_regions) ? company.teamhub_regions : [],
  };
}

export default function TeamhubTab({ companyId, company }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => getInitialForm(company));

  useEffect(() => {
    setForm(getInitialForm(company));
  }, [company?.id]);

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
      teamhub_service_types: form.teamhub_service_types || [],
      teamhub_capacity_note: form.teamhub_capacity_note?.trim() || null,
      teamhub_available_from: form.teamhub_available_from || null,
      teamhub_min_notice_hours: form.teamhub_min_notice_hours === "" ? null : Number(form.teamhub_min_notice_hours),
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
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ACTIVITIES.map(activity => (
              <label
                key={activity.key}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-accent/50"
              >
                <Checkbox
                  checked={(form.teamhub_service_types || []).includes(activity.key)}
                  onCheckedChange={() => toggleService(activity.key)}
                />
                <span>{activity.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_240px_240px]">
          <div className="space-y-2">
            <Label>Capaciteit en beschikbaarheid</Label>
            <Textarea
              value={form.teamhub_capacity_note}
              onChange={e => set("teamhub_capacity_note", e.target.value)}
              rows={3}
              placeholder="Bijvoorbeeld nachtdiensten, weekenden, vaste objectbeveiliging of ad-hoc inzet"
            />
          </div>
          <div className="space-y-2">
            <Label>Beschikbaar vanaf</Label>
            <Input
              type="date"
              value={form.teamhub_available_from}
              onChange={e => set("teamhub_available_from", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Minimale aanlooptijd</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={form.teamhub_min_notice_hours}
              onChange={e => set("teamhub_min_notice_hours", e.target.value)}
              placeholder="Uren"
            />
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
