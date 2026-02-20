import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Users, Building2, User, MapPin, ArrowLeft } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import PageHeader from "../components/ui-custom/PageHeader";
import EmptyState from "../components/ui-custom/EmptyState";
import CustomerWizard from "../components/customers/CustomerWizard";

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
                <Badge variant="outline" className="text-xs capitalize">{customer.customer_type}</Badge>
              </div>
              {customer.contact_person && (
                <p className="text-xs text-slate-500 mt-0.5">Contactpersoon: {customer.contact_person}</p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                {customer.email && <span className="text-xs text-slate-500">{customer.email}</span>}
                {customer.phone && <span className="text-xs text-slate-500">{customer.phone}</span>}
                {customer.kvk_number && <span className="text-xs text-slate-500">KVK: {customer.kvk_number}</span>}
              </div>
              {customerObjects.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs text-slate-500">{customerObjects.length} object{customerObjects.length !== 1 ? "en" : ""}:</span>
                  {customerObjects.map(obj => (
                    <Badge key={obj.id} variant="secondary" className="text-xs px-1.5 py-0">
                      {obj.object_code ? `[${obj.object_code}] ` : ""}{obj.name}
                    </Badge>
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
  const [showWizard, setShowWizard] = useState(false);
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["customers"] }); setShowWizard(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Customer.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });

  const handleSave = (data) => createMutation.mutate(data);

  if (showWizard) {
    return (
      <div className="space-y-6">
        <button onClick={() => setShowWizard(false)} className="flex items-center gap-1 text-slate-500 hover:text-slate-800 text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" /> Terug naar klanten
        </button>
        <CustomerWizard
          onSave={handleSave}
          onCancel={() => setShowWizard(false)}
          saving={createMutation.isPending}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Klanten"
        subtitle="Beheer particulieren en bedrijven die gekoppeld zijn aan objecten"
        actions={
          <Button onClick={() => setShowWizard(true)} className="bg-slate-900 hover:bg-slate-800">
            <Plus className="w-4 h-4 mr-1" /> Nieuwe klant
          </Button>
        }
      />

      {isLoading ? (
        <div className="text-center text-slate-400 py-10">Laden...</div>
      ) : customers.length > 0 ? (
        <div className="grid grid-cols-1 gap-3">
          {customers.map(customer => (
            <CustomerCard
              key={customer.id}
              customer={customer}
              objects={objects}
              onEdit={() => {}}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Users}
          title="Geen klanten"
          description="Voeg uw eerste klant toe om objecten aan te koppelen."
          actionLabel="Klant toevoegen"
          onAction={() => setShowWizard(true)}
        />
      )}
    </div>
  );
}