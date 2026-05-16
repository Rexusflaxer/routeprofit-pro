import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { X, Save, MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import TaskList from "./TaskList";
import CustomerSelect from "../ui-custom/CustomerSelect";
import TaskSpacingGroupsEditor, { expandTaskSpacingGroups, normalizeTaskSpacingGroups, validateTaskSpacingGroups } from "./TaskSpacingGroupsEditor";

export default function ObjectForm({ object, onSave, onCancel }) {
  const [form, setForm] = useState(object || {
    object_code: "",
    customer_id: "",
    name: "",
    address: "",
    notes: "",
    task_spacing_groups: [],
    task_spacing_rules: [],
    parking_instruction: "",
    entry_instruction: "",
    walking_instruction: "",
    access_instruction: "",
    alarm_instruction: "",
    key_instruction: "",
    object_notes: "",
    safety_notes: "",
    last_incident_notes: "",
    object_map_url: "",
    parking_point_latitude: null,
    parking_point_longitude: null,
    entry_point_latitude: null,
    entry_point_longitude: null,
    show_on_mobile_map: true,
    is_active_customer_object: true,
    mobile_map_priority: 0,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list(),
  });

  const { data: objectTasks = [] } = useQuery({
    queryKey: ["object-task-types", object?.id],
    queryFn: () => object?.id ? base44.entities.Task.filter({ object_id: object.id }) : [],
    enabled: !!object?.id,
  });

  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const addressTimeoutRef = useRef(null);

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleAddressChange = (value) => {
    handleChange("address", value);
    
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
    setForm(prev => ({
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

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.customer_id) {
      alert("Selecteer een klant voor dit object");
      return;
    }
    const normalizedGroups = normalizeTaskSpacingGroups(form.task_spacing_groups || []);
    const groupErrors = validateTaskSpacingGroups(normalizedGroups);
    if (groupErrors.length) {
      alert(groupErrors[0]);
      return;
    }
    const taskSpacingGroups = normalizedGroups.filter(group => (group.task_types || []).length >= 2 && Number(group.min_minutes) > 0);
    onSave({
      ...form,
      task_spacing_groups: taskSpacingGroups,
      task_spacing_rules: expandTaskSpacingGroups(taskSpacingGroups),
    });
  };

  return (
    <div className="space-y-6">
    <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Klant *</Label>
              {customers.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-500 bg-slate-50 rounded-lg">Geen klanten gevonden. Voeg eerst een klant toe.</div>
              ) : (
                <CustomerSelect customers={customers} value={form.customer_id} onValueChange={(v) => handleChange("customer_id", v)} placeholder="Selecteer een klant" />
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Objectcode</Label>
                <Input value={form.object_code || ""} onChange={(e) => handleChange("object_code", e.target.value)} placeholder="Bijv. OBJ-001" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Naam</Label>
                <Input value={form.name} onChange={(e) => handleChange("name", e.target.value)} placeholder="Bijv. Kantoor ABC" required />
              </div>
            </div>

            <div className="space-y-2 relative">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Adres</Label>
              <Input 
                value={form.address} 
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

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Opmerkingen</Label>
              <Textarea value={form.notes} onChange={(e) => handleChange("notes", e.target.value)} rows={2} placeholder="Extra informatie..." />
            </div>

            <TaskSpacingGroupsEditor
              groups={form.task_spacing_groups || []}
              objectTaskTypes={[...new Set(objectTasks.map(task => task.task_type).filter(Boolean))]}
              onChange={(groups) => handleChange("task_spacing_groups", normalizeTaskSpacingGroups(groups))}
            />

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Mobiele app</Label>
                <p className="text-xs text-slate-500 mt-1">Instructies en kaartgegevens voor de surveillant.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Textarea value={form.parking_instruction || ""} onChange={(e) => handleChange("parking_instruction", e.target.value)} rows={2} placeholder="Parkeerinstructie" />
                <Textarea value={form.entry_instruction || ""} onChange={(e) => handleChange("entry_instruction", e.target.value)} rows={2} placeholder="Ingangsinstructie" />
                <Textarea value={form.walking_instruction || ""} onChange={(e) => handleChange("walking_instruction", e.target.value)} rows={2} placeholder="Loopinstructie" />
                <Textarea value={form.access_instruction || ""} onChange={(e) => handleChange("access_instruction", e.target.value)} rows={2} placeholder="Toegangsinstructie" />
                <Textarea value={form.alarm_instruction || ""} onChange={(e) => handleChange("alarm_instruction", e.target.value)} rows={2} placeholder="Alarminstructie" />
                <Textarea value={form.key_instruction || ""} onChange={(e) => handleChange("key_instruction", e.target.value)} rows={2} placeholder="Sleutelinstructie" />
                <Textarea value={form.object_notes || ""} onChange={(e) => handleChange("object_notes", e.target.value)} rows={2} placeholder="Objectnotities" />
                <Textarea value={form.safety_notes || ""} onChange={(e) => handleChange("safety_notes", e.target.value)} rows={2} placeholder="Veiligheidsnotities" />
              </div>
              <Textarea value={form.last_incident_notes || ""} onChange={(e) => handleChange("last_incident_notes", e.target.value)} rows={2} placeholder="Laatste incidenten / bijzonderheden" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input value={form.object_map_url || ""} onChange={(e) => handleChange("object_map_url", e.target.value)} placeholder="Objectkaart URL" />
                <Input type="number" value={form.mobile_map_priority || 0} onChange={(e) => handleChange("mobile_map_priority", Number(e.target.value))} placeholder="Kaartprioriteit" />
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.show_on_mobile_map !== false} onChange={(e) => handleChange("show_on_mobile_map", e.target.checked)} /> Toon op mobiele kaart</label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={onCancel}><X className="w-4 h-4 mr-1" /> Annuleren</Button>
              <Button type="submit" className="bg-slate-900 hover:bg-slate-800"><Save className="w-4 h-4 mr-1" /> Opslaan</Button>
            </div>
    </form>

    {object && object.id && <TaskList objectId={object.id} />}
  </div>
  );
}