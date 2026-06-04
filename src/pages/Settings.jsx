import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, MapPin, Plus, Edit, Trash2, Save, X } from "lucide-react";

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
  });

  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const addressTimeoutRef = useRef(null);

  const handleAddressChange = (value) => {
    setOfficeForm(prev => ({ ...prev, address: value }));
    
    if (addressTimeoutRef.current) {
      clearTimeout(addressTimeoutRef.current);
    }

    if (value.length >= 3) {
      addressTimeoutRef.current = setTimeout(async () => {
        setLoadingAddress(true);
        try {
          const { data } = await base44.functions.invoke('searchAddress', { query: value });
          setAddressSuggestions(data.suggestions || []);
          setShowSuggestions(true);
        } catch (error) {
          console.error('Error fetching address suggestions:', error);
        } finally {
          setLoadingAddress(false);
        }
      }, 300);
    } else {
      setAddressSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectAddress = (suggestion) => {
    setOfficeForm(prev => ({
      ...prev,
      address: suggestion.address,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
    }));
    setShowSuggestions(false);
    setAddressSuggestions([]);
  };

  useEffect(() => {
    return () => {
      if (addressTimeoutRef.current) {
        clearTimeout(addressTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Instellingen</h1>
        <p className="text-sm text-muted-foreground mt-1">Beheer bedrijfsgegevens en kantoren</p>
      </div>

      {/* Bedrijfsgegevens */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-muted-foreground" />
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
                <p className="text-xs text-muted-foreground mb-1">Bedrijfsnaam</p>
                <p className="text-sm font-medium">{companySetting.company_name || "-"}</p>
                </div>
                <div>
                <p className="text-xs text-muted-foreground mb-1">KVK nummer</p>
                <p className="text-sm font-medium">{companySetting.kvk_number || "-"}</p>
                </div>
                <div>
                <p className="text-xs text-muted-foreground mb-1">Adres</p>
                <p className="text-sm font-medium">{companySetting.address || "-"}</p>
                </div>
                <div>
                <p className="text-xs text-muted-foreground mb-1">BTW nummer</p>
                <p className="text-sm font-medium">{companySetting.btw_number || "-"}</p>
                </div>
                <div>
                <p className="text-xs text-muted-foreground mb-1">Postcode & Plaats</p>
                <p className="text-sm font-medium">{companySetting.postal_code || "-"} {companySetting.city || "-"}</p>
                </div>
                <div>
                <p className="text-xs text-muted-foreground mb-1">Contact</p>
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
              <MapPin className="w-5 h-5 text-muted-foreground" />
              Kantoren
            </CardTitle>
            <Button size="sm" onClick={() => {
              setOfficeForm({ name: "", address: "", latitude: null, longitude: null });
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
                  <div className="space-y-2">
                    <Label>Naam kantoor *</Label>
                    <Input value={officeForm.name} onChange={(e) => setOfficeForm({ ...officeForm, name: e.target.value })} placeholder="Bijv. Hoofdkantoor" required />
                  </div>
                  <div className="space-y-2 relative">
                    <Label>Adres *</Label>
                    <Input 
                      value={officeForm.address} 
                      onChange={(e) => handleAddressChange(e.target.value)}
                      placeholder="Bijv. Stationsplein 1, Amsterdam"
                      required
                      autoComplete="off"
                    />
                    {loadingAddress && (
                      <div className="absolute right-3 top-9 text-slate-400">
                        <div className="animate-spin h-4 w-4 border-2 border-slate-300 border-t-slate-600 rounded-full" />
                      </div>
                    )}
                    {showSuggestions && addressSuggestions.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {addressSuggestions.map((suggestion, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => selectAddress(suggestion)}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-start gap-2 border-b border-slate-100 last:border-0"
                          >
                            <MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                            <span className="text-slate-700">{suggestion.address}</span>
                          </button>
                        ))}
                      </div>
                    )}
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
              <div key={office.id} className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg border border-border">
                <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{office.name}</p>
                  <p className="text-xs text-muted-foreground">{office.address}</p>
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
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">Nog geen kantoren toegevoegd</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}