import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Users, Building2, User, X, Save, MapPin } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import PageHeader from "../components/ui-custom/PageHeader";
import EmptyState from "../components/ui-custom/EmptyState";

function CustomerForm({ customer, onSave, onCancel }) {
  const [form, setForm] = useState(customer || {
    customer_type: "bedrijf",
    name: "",
    contact_person: "",
    email: "",
    phone: "",
    address: "",
    kvk_number: "",
    notes: "",
  });

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="w-5 h-5 text-amber-600" />
          {customer ? "Klant bewerken" : "Nieuwe klant"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Type klant *</Label>
            <Select value={form.customer_type} onValueChange={(v) => handleChange("customer_type", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bedrijf">Bedrijf</SelectItem>
                <SelectItem value="particulier">Particulier</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {form.customer_type === "bedrijf" ? "Bedrijfsnaam *" : "Naam *"}
              </Label>
              <Input
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder={form.customer_type === "bedrijf" ? "Bijv. Beveiliging BV" : "Bijv. Jan Jansen"}
                required
              />
            </div>
            {form.customer_type === "bedrijf" && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Contactpersoon</Label>
                <Input
                  value={form.contact_person || ""}
                  onChange={(e) => handleChange("contact_person", e.target.value)}
                  placeholder="Naam contactpersoon"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">E-mailadres</Label>
              <Input type="email" value={form.email || ""} onChange={(e) => handleChange("email", e.target.value)} placeholder="email@voorbeeld.nl" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Telefoonnummer</Label>
              <Input value={form.phone || ""} onChange={(e) => handleChange("phone", e.target.value)} placeholder="06-12345678" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Adres</Label>
              <Input value={form.address || ""} onChange={(e) => handleChange("address", e.target.value)} placeholder="Straat 1, Stad" />
            </div>
            {form.customer_type === "bedrijf" && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">KVK-nummer</Label>
                <Input value={form.kvk_number || ""} onChange={(e) => handleChange("kvk_number", e.target.value)} placeholder="12345678" />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Opmerkingen</Label>
            <Textarea value={form.notes || ""} onChange={(e) => handleChange("notes", e.target.value)} rows={2} placeholder="Extra informatie..." />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onCancel}><X className="w-4 h-4 mr-1" /> Annuleren</Button>
            <Button type="submit" className="bg-slate-900 hover:bg-slate-800"><Save className="w-4 h-4 mr-1" /> Opslaan</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function CustomerCard({ customer, objects, onEdit, onDelete }) {
  const customerObjects = objects.filter(o => o.customer_id === customer.id);

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${customer.customer_type === "bedrijf" ? "bg-blue-100" : "bg-purple-100"}`}>
              {customer.customer_type === "bedrijf"
                ? <Building2 className="w-5 h-5 text-blue-600" />
                : <User className="w-5 h-5 text-purple-600" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-slate-900 text-sm">{customer.name}</h3>
                <Badge variant="outline" className="text-xs capitalize">
                  {customer.customer_type}
                </Badge>
              </div>
              {customer.contact_person && (
                <p className="text-xs text-slate-500 mt-0.5">Contactpersoon: {customer.contact_person}</p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                {customer.email && <span className="text-xs text-slate-500">{customer.email}</span>}
                {customer.phone && <span className="text-xs text-slate-500">{customer.phone}</span>}
              </div>
              {customerObjects.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs text-slate-500">{customerObjects.length} object{customerObjects.length !== 1 ? "en" : ""}:</span>
                  {customerObjects.map(obj => (
                    <Badge key={obj.id} variant="secondary" className="text-xs px-1.5 py-0">{obj.object_code ? `[${obj.object_code}] ` : ""}{obj.name}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-700" onClick={() => onEdit(customer)}>
              <Pencil className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600" onClick={() => {
              if (customerObjects.length > 0) {
                alert(`Deze klant heeft nog ${customerObjects.length} gekoppeld object(en). Koppel de objecten eerst aan een andere klant.`);
                return;
              }
              if (confirm(`Klant "${customer.name}" verwijderen?`)) onDelete(customer.id);
            }}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Customers() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const queryClient = useQueryClient();

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list(),
  });

  const { data: objects = [] } = useQuery({
    queryKey: ["objects"],
    queryFn: () => base44.entities.SurveillanceObject.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Customer.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["customers"] }); setShowForm(false); setEditing(null); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Customer.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["customers"] }); setShowForm(false); setEditing(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Customer.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });

  const handleSave = (data) => {
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (customer) => {
    setEditing(customer);
    setShowForm(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Klanten"
        subtitle="Beheer particulieren en bedrijven die gekoppeld zijn aan objecten"
        actions={
          <Button onClick={() => { setEditing(null); setShowForm(true); }} className="bg-slate-900 hover:bg-slate-800">
            <Plus className="w-4 h-4 mr-1" /> Nieuwe klant
          </Button>
        }
      />

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <CustomerForm
              customer={editing}
              onSave={handleSave}
              onCancel={() => { setShowForm(false); setEditing(null); }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="text-center text-slate-400 py-10">Laden...</div>
      ) : customers.length > 0 ? (
        <div className="grid grid-cols-1 gap-3">
          {customers.map(customer => (
            <CustomerCard
              key={customer.id}
              customer={customer}
              objects={objects}
              onEdit={handleEdit}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>
      ) : !showForm && (
        <EmptyState
          icon={Users}
          title="Geen klanten"
          description="Voeg uw eerste klant toe om objecten aan te koppelen."
          actionLabel="Klant toevoegen"
          onAction={() => setShowForm(true)}
        />
      )}
    </div>
  );
}