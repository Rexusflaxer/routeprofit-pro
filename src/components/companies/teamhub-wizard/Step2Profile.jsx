import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function TeamhubStep2Profile({ form, set, company }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Publiek profiel</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Deze gegevens worden getoond wanneer een hoofdaannemer uw bedrijf op de Teamhub-kaart opent.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-1 lg:col-span-2">
          <Label>Introductie</Label>
          <Textarea
            value={form.teamhub_intro || ""}
            onChange={(event) => set("teamhub_intro", event.target.value)}
            rows={3}
            placeholder="Korte omschrijving van specialisaties, werkgebied en inzetbaarheid"
          />
        </div>

        <div className="space-y-1">
          <Label>Contactpersoon</Label>
          <Input
            value={form.teamhub_contact_name || ""}
            onChange={(event) => set("teamhub_contact_name", event.target.value)}
            placeholder="Naam contactpersoon"
          />
        </div>

        <div className="space-y-1">
          <Label>Contactmail</Label>
          <Input
            type="email"
            value={form.teamhub_contact_email || ""}
            onChange={(event) => set("teamhub_contact_email", event.target.value)}
            placeholder={company?.email || "teamhub@example.nl"}
          />
        </div>

        <div className="space-y-1">
          <Label>Contacttelefoon</Label>
          <Input
            value={form.teamhub_contact_phone || ""}
            onChange={(event) => set("teamhub_contact_phone", event.target.value)}
            placeholder={company?.phone || "Telefoonnummer"}
          />
        </div>
      </div>
    </div>
  );
}
