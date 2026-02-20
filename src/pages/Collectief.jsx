import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Building, MapPin, ChevronRight, ArrowLeft, Layers } from "lucide-react";
import PageHeader from "../components/ui-custom/PageHeader";
import EmptyState from "../components/ui-custom/EmptyState";
import CollectiefForm from "../components/collectief/CollectiefForm";
import CollectiefTaskList from "../components/collectief/CollectiefTaskList";

const TYPE_LABELS = {
  regio_groep: "Regio / Groep",
  bedrijventerrein: "Bedrijventerrein",
  bedrijfsverzamelgebouw: "Bedrijfsverzamelgebouw",
};

const TYPE_COLORS = {
  regio_groep: "bg-purple-100 text-purple-700",
  bedrijventerrein: "bg-green-100 text-green-700",
  bedrijfsverzamelgebouw: "bg-blue-100 text-blue-700",
};

function CollectiefCard({ collectief, customers, objects, allCollectieven, onEdit, onDelete }) {
  const customer = customers.find(c => c.id === collectief.customer_id);
  const linkedObjects = objects.filter(o => (collectief.object_ids || []).includes(o.id));
  const childCollectieven = allCollectieven.filter(c => c.parent_collectief_id === collectief.id);

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
              <Building className="w-5 h-5 text-slate-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-slate-900 text-sm">{collectief.name}</h3>
                <Badge className={`text-xs ${TYPE_COLORS[collectief.collectief_type] || ""}`}>
                  {TYPE_LABELS[collectief.collectief_type] || collectief.collectief_type}
                </Badge>
              </div>
              {customer && (
                <p className="text-xs text-slate-500 mt-0.5">Beheerder: <span className="font-medium">{customer.name}</span></p>
              )}
              {collectief.address && (
                <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {collectief.address}
                </p>
              )}
              <div className="flex flex-wrap gap-2 mt-2">
                {linkedObjects.length > 0 && (
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                    {linkedObjects.length} object{linkedObjects.length !== 1 ? "en" : ""}
                  </span>
                )}
                {childCollectieven.length > 0 && (
                  <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                    {childCollectieven.length} sub-collectief{childCollectieven.length !== 1 ? "en" : ""}
                  </span>
                )}
              </div>
              {linkedObjects.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {linkedObjects.map(obj => (
                    <Badge key={obj.id} variant="outline" className="text-xs px-1.5 py-0">
                      {obj.object_code ? `[${obj.object_code}] ` : ""}{obj.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-700" onClick={() => onEdit(collectief)}>
              <Pencil className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600" onClick={() => {
              if (childCollectieven.length > 0) {
                alert(`Dit collectief bevat nog ${childCollectieven.length} sub-collectief(en). Verwijder deze eerst.`);
                return;
              }
              if (confirm(`Collectief "${collectief.name}" verwijderen?`)) onDelete(collectief.id);
            }}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CollectiefPage() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const queryClient = useQueryClient();

  const { data: collectieven = [], isLoading } = useQuery({
    queryKey: ["collectieven"],
    queryFn: () => base44.entities.Collectief.list(),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list(),
  });

  const { data: objects = [] } = useQuery({
    queryKey: ["objects"],
    queryFn: () => base44.entities.SurveillanceObject.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Collectief.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["collectieven"] }); setShowForm(false); setEditing(null); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Collectief.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["collectieven"] }); setShowForm(false); setEditing(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Collectief.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["collectieven"] }),
  });

  const handleSave = (data) => {
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (c) => {
    setEditing(c);
    setShowForm(true);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (showForm) {
    return (
      <div className="space-y-6">
        <button onClick={() => { setShowForm(false); setEditing(null); }} className="flex items-center gap-1 text-slate-500 hover:text-slate-800 text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" /> Terug naar collectieven
        </button>
        <CollectiefForm
          collectief={editing}
          customers={customers}
          objects={objects}
          collectieven={collectieven}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          saving={isPending}
        />
      </div>
    );
  }

  // Group: top-level first, then nested
  const topLevel = collectieven.filter(c => !c.parent_collectief_id);
  const nested = collectieven.filter(c => !!c.parent_collectief_id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Collectieven"
        subtitle="Beheer bedrijventerreinen, bedrijfsverzamelgebouwen en regio's"
        actions={
          <Button onClick={() => setShowForm(true)} className="bg-slate-900 hover:bg-slate-800">
            <Plus className="w-4 h-4 mr-1" /> Nieuw collectief
          </Button>
        }
      />

      {isLoading ? (
        <div className="text-center text-slate-400 py-10">Laden...</div>
      ) : collectieven.length > 0 ? (
        <div className="space-y-6">
          {topLevel.length > 0 && (
            <div className="space-y-3">
              {topLevel.map(c => (
                <div key={c.id}>
                  <CollectiefCard
                    collectief={c}
                    customers={customers}
                    objects={objects}
                    allCollectieven={collectieven}
                    onEdit={handleEdit}
                    onDelete={(id) => deleteMutation.mutate(id)}
                  />
                  {/* Sub-collectieven */}
                  {nested.filter(n => n.parent_collectief_id === c.id).map(sub => (
                    <div key={sub.id} className="ml-6 mt-2 flex gap-2">
                      <div className="flex flex-col items-center">
                        <div className="w-px flex-1 bg-slate-200" />
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                      </div>
                      <div className="flex-1">
                        <CollectiefCard
                          collectief={sub}
                          customers={customers}
                          objects={objects}
                          allCollectieven={collectieven}
                          onEdit={handleEdit}
                          onDelete={(id) => deleteMutation.mutate(id)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon={Layers}
          title="Geen collectieven"
          description="Voeg een bedrijventerrein, bedrijfsverzamelgebouw of regio toe."
          actionLabel="Collectief toevoegen"
          onAction={() => setShowForm(true)}
        />
      )}
    </div>
  );
}