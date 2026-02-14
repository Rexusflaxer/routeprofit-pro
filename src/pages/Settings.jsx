import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Building2, MapPin, Plus, Edit, Trash2, Save, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

export default function Settings() {
  const [editingSettings, setEditingSettings] = useState(false);
  const [editingOffice, setEditingOffice] = useState(null);
  const [showOfficeForm, setShowOfficeForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: settings = [] } = useQuery({
    queryKey: ["companySettings"],
    queryFn: () => base44.entities.CompanySettings.list(),
  });

  const { data: offices = [] } = useQuery({
    queryKey: ["offices"],
    queryFn: () => base44.entities.Office.list(),
  });

  const companySetting = settings[0] || {};

  const saveSettingsMutation = useMutation({
    mutationFn: (data) => {
      if (companySetting.id) {
        return base44.entities.CompanySettings.update(companySetting.id, data);
      } else {
        return base44.entities.CompanySettings.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companySettings"] });
      setEditingSettings(false);
    },
  });

  const saveOfficeMutation = useMutation({
    mutationFn: ({ id, data }) => {
      if (id) {
        return base44.entities.Office.update(id, data);
      } else {
        return base44.entities.Office.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["offices"] });
      setEditingOffice(null);
      setShowOfficeForm(false);
    },
  });

  const deleteOfficeMutation = useMutation({
    mutationFn: (id) => base44.entities.Office.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["offices"] });
    },
  });

  const [settingsForm, setSettingsForm] = useState(companySetting);
  const [officeForm, setOfficeForm] = useState({
    name: "",
    address: "",
    latitude: null,
    longitude: null,
    is_default_start: false,
    is_default_end: false,
    notes: "",
  });

  const handleSearchAddress = async (address) => {
    if (!address) return;
    try {
      const response = await base44.functions.invoke("searchAddress", { address });
      if (response.data?.latitude && response.data?.longitude) {
        setOfficeForm(prev => ({
          ...prev,
          latitude: response.data.latitude,
          longitude: response.data.longitude,
        }));
      }
    } catch (error) {
      console.error("Fout bij zoeken adres:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Instellingen</h1>
        <p className="text-sm text-slate-500 mt-1">Beheer bedrijfsgegevens en kantoren</p>
      </div>

      {/* Bedrijfsgegevens */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-slate-600" />
              Bedrijfsgegevens
            </CardTitle>
            {!editingSettings ? (
              <Button size="sm" variant="outline" onClick={() => {
                setSettingsForm(companySetting);
                setEditingSettings(true);
              }}>
                <Edit className="w-4 h-4 mr-1" /> Bewerken
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditingSettings(false)}>
                  <X className="w-4 h-4 mr-1" /> Annuleren
                </Button>
                <Button size="sm" onClick={() => saveSettingsMutation.mutate(settingsForm)}>
                  <Save className="w-4 h-4 mr-1" /> Opslaan
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editingSettings ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bedrijfsnaam</Label>
                <Input value={settingsForm.company_name || ""} onChange={(e) => setSettingsForm({ ...settingsForm, company_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>KVK nummer</Label>
                <Input value={settingsForm.kvk_number || ""} onChange={(e) => setSettingsForm({ ...settingsForm, kvk_number: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Adres</Label>
                <Input value={settingsForm.address || ""} onChange={(e) => setSettingsForm({ ...settingsForm, address: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>BTW nummer</Label>
                <Input value={settingsForm.btw_number || ""} onChange={(e) => setSettingsForm({ ...settingsForm, btw_number: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Postcode</Label>
                <Input value={settingsForm.postal_code || ""} onChange={(e) => setSettingsForm({ ...settingsForm, postal_code: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Telefoonnummer</Label>
                <Input value={settingsForm.phone || ""} onChange={(e) => setSettingsForm({ ...settingsForm, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Plaats</Label>
                <Input value={settingsForm.city || ""} onChange={(e) => setSettingsForm({ ...settingsForm, city: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>E-mailadres</Label>
                <Input type="email" value={settingsForm.email || ""} onChange={(e) => setSettingsForm({ ...settingsForm, email: e.target.value })} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-slate-500 mb-1">Bedrijfsnaam</p>
                <p className="text-sm font-medium">{companySetting.company_name || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">KVK nummer</p>
                <p className="text-sm font-medium">{companySetting.kvk_number || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Adres</p>
                <p className="text-sm font-medium">{companySetting.address || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">BTW nummer</p>
                <p className="text-sm font-medium">{companySetting.btw_number || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Postcode & Plaats</p>
                <p className="text-sm font-medium">{companySetting.postal_code || "-"} {companySetting.city || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Contact</p>
                <p className="text-sm font-medium">{companySetting.phone || "-"}</p>
                <p className="text-sm font-medium">{companySetting.email || "-"}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Kantoren */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-slate-600" />
              Kantoren
            </CardTitle>
            <Button size="sm" onClick={() => {
              setOfficeForm({ name: "", address: "", latitude: null, longitude: null, is_default_start: false, is_default_end: false, notes: "" });
              setEditingOffice(null);
              setShowOfficeForm(true);
            }}>
              <Plus className="w-4 h-4 mr-1" /> Kantoor toevoegen
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showOfficeForm && (
            <Card className="mb-4 border-2 border-slate-200">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Naam kantoor *</Label>
                      <Input value={officeForm.name} onChange={(e) => setOfficeForm({ ...officeForm, name: e.target.value })} placeholder="Bijv. Hoofdkantoor" />
                    </div>
                    <div className="space-y-2">
                      <Label>Adres *</Label>
                      <Input 
                        value={officeForm.address} 
                        onChange={(e) => setOfficeForm({ ...officeForm, address: e.target.value })}
                        onBlur={(e) => handleSearchAddress(e.target.value)}
                        placeholder="Straat 123, 1234AB Plaats"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Latitude</Label>
                      <Input type="number" step="0.000001" value={officeForm.latitude || ""} onChange={(e) => setOfficeForm({ ...officeForm, latitude: parseFloat(e.target.value) })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Longitude</Label>
                      <Input type="number" step="0.000001" value={officeForm.longitude || ""} onChange={(e) => setOfficeForm({ ...officeForm, longitude: parseFloat(e.target.value) })} />
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={officeForm.is_default_start} onCheckedChange={(checked) => setOfficeForm({ ...officeForm, is_default_start: checked })} />
                      <span className="text-sm">Standaard startlocatie</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={officeForm.is_default_end} onCheckedChange={(checked) => setOfficeForm({ ...officeForm, is_default_end: checked })} />
                      <span className="text-sm">Standaard eindlocatie</span>
                    </label>
                  </div>
                  <div className="space-y-2">
                    <Label>Opmerkingen</Label>
                    <Textarea value={officeForm.notes || ""} onChange={(e) => setOfficeForm({ ...officeForm, notes: e.target.value })} rows={2} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => { setShowOfficeForm(false); setEditingOffice(null); }}>
                      <X className="w-4 h-4 mr-1" /> Annuleren
                    </Button>
                    <Button onClick={() => saveOfficeMutation.mutate({ id: editingOffice, data: officeForm })}>
                      <Save className="w-4 h-4 mr-1" /> Opslaan
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {offices.map(office => (
              <div key={office.id} className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <MapPin className="w-5 h-5 text-slate-500 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{office.name}</p>
                  <p className="text-xs text-slate-500">{office.address}</p>
                  {office.notes && <p className="text-xs text-slate-400 mt-1">{office.notes}</p>}
                  <div className="flex gap-2 mt-2">
                    {office.is_default_start && (
                      <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">Standaard start</span>
                    )}
                    {office.is_default_end && (
                      <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">Standaard eind</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => {
                    setOfficeForm(office);
                    setEditingOffice(office.id);
                    setShowOfficeForm(true);
                  }}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => {
                    if (confirm("Weet je zeker dat je dit kantoor wilt verwijderen?")) {
                      deleteOfficeMutation.mutate(office.id);
                    }
                  }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
            {offices.length === 0 && !showOfficeForm && (
              <div className="text-center py-8 text-slate-500">
                <p className="text-sm">Nog geen kantoren toegevoegd</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}