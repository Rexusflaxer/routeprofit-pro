import React, { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Edit2, MapPin, Users, Zap, Globe } from "lucide-react";
import { getCompanyLocationLabel } from "@/lib/companyLocationScope";
import { getTeamhubServicesByKeys, getWpbrLicenseLabel } from "@/lib/teamhubServiceRules";

export default function TeamhubSummary({ form, company, selectableTeamhubLocations, effectiveWpbrLicenseType, onEdit }) {
  const selectedLocation = useMemo(
    () => selectableTeamhubLocations.find((loc) => loc.id === form.teamhub_public_location_id),
    [form.teamhub_public_location_id, selectableTeamhubLocations]
  );

  const selectedServices = useMemo(
    () => getTeamhubServicesByKeys(form.teamhub_service_types || []),
    [form.teamhub_service_types]
  );

  const selectedRegions = form.teamhub_regions || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Teamhub instellingen</h3>
          <p className="mt-1 text-sm text-muted-foreground">Overzicht van uw instellingen</p>
        </div>
        <Button variant="outline" size="sm" onClick={onEdit} className="gap-2">
          <Edit2 className="h-4 w-4" />
          Bewerken
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Visibility */}
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-blue-100 p-2 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <Globe className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Zichtbaarheid</p>
              <div className="mt-2 flex items-center gap-2">
                {form.teamhub_enabled ? (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                    Zichtbaar
                  </Badge>
                ) : (
                  <Badge variant="secondary">Niet zichtbaar</Badge>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Location */}
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-amber-100 p-2 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
              <MapPin className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Vestiging</p>
              {selectedLocation ? (
                <p className="mt-2 truncate text-sm font-medium">{getCompanyLocationLabel(selectedLocation)}</p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Geen vestiging geselecteerd</p>
              )}
            </div>
          </div>
        </Card>

        {/* Services */}
        <Card className="p-4 md:col-span-2">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-purple-100 p-2 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
              <Zap className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Diensten ({selectedServices.length})
              </p>
              {selectedServices.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedServices.map((service) => (
                    <Badge key={service.key} variant="secondary" className="text-xs">
                      {service.label}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Geen diensten geselecteerd</p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Vergunning: {effectiveWpbrLicenseType ? `${effectiveWpbrLicenseType} - ${getWpbrLicenseLabel(effectiveWpbrLicenseType)}` : "Geen"}
              </p>
            </div>
          </div>
        </Card>

        {/* Regions */}
        <Card className="p-4 md:col-span-2">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-green-100 p-2 text-green-600 dark:bg-green-900/30 dark:text-green-400">
              <Users className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Werkgebied ({selectedRegions.length})
              </p>
              {selectedRegions.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedRegions.map((region) => (
                    <Badge key={region.id} variant="secondary" className="text-xs">
                      {region.label || region.city}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Geen regio's geselecteerd</p>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}