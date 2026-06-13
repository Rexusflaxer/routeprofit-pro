import React, { useMemo, useState } from "react";
import PageTransition from "@/components/ui-custom/PageTransition";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Pencil, Plus, Search, Trash2 } from "lucide-react";
import PageHeader from "../components/ui-custom/PageHeader";
import CustomerWizard from "../components/customers/CustomerWizard";

const TYPE_LABELS = {
  bedrijf: "Bedrijf",
  particulier: "Particulier",
};

function text(value) {
  return String(value || "").toLowerCase();
}

function objectLabel(object) {
  return `${object.object_code ? `[${object.object_code}] ` : ""}${object.name || "Object"}`;
}

function TypeBadge({ type }) {
  return (
    <Badge variant="outline" className="border-border bg-muted/40 text-xs font-medium text-foreground">
      {TYPE_LABELS[type] || type || "Onbekend"}
    </Badge>
  );
}

function CustomerObjects({ objects }) {
  if (!objects.length) {
    return <span className="text-sm text-muted-foreground">Geen objecten</span>;
  }

  const visibleObjects = objects.slice(0, 2);
  const remaining = objects.length - visibleObjects.length;

  return (
    <div className="flex max-w-[360px] flex-wrap gap-1.5">
      {visibleObjects.map((object) => (
        <span
          key={object.id}
          className="max-w-[170px] truncate rounded border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium text-foreground"
          title={objectLabel(object)}
        >
          {objectLabel(object)}
        </span>
      ))}
      {remaining > 0 && (
        <span className="rounded border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium text-muted-foreground">
          +{remaining} meer
        </span>
      )}
    </div>
  );
}

function ContactCell({ customer }) {
  const contactRows = [
    customer.contact_person && `Contact: ${customer.contact_person}`,
    customer.email,
    customer.phone,
  ].filter(Boolean);

  if (!contactRows.length) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <div className="space-y-0.5">
      {contactRows.map((row) => (
        <div key={row} className="max-w-[260px] truncate text-sm text-muted-foreground" title={row}>
          {row}
        </div>
      ))}
    </div>
  );
}

function CustomerRow({ customer, objects, onEdit, onDelete }) {
  return (
    <TableRow className="hover:bg-muted/35">
      <TableCell className="min-w-[220px]">
        <div className="space-y-0.5">
          <div className="font-medium text-foreground">{customer.name || "Naamloos"}</div>
          {customer.notes && (
            <div className="max-w-[280px] truncate text-xs text-muted-foreground" title={customer.notes}>
              {customer.notes}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell>
        <TypeBadge type={customer.customer_type} />
      </TableCell>
      <TableCell className="min-w-[220px]">
        <ContactCell customer={customer} />
      </TableCell>
      <TableCell className="min-w-[260px]">
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">
            {objects.length} object{objects.length !== 1 ? "en" : ""}
          </div>
          <CustomerObjects objects={objects} />
        </div>
      </TableCell>
      <TableCell className="max-w-[260px] truncate text-sm text-muted-foreground" title={customer.address || ""}>
        {customer.address || "—"}
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
        {customer.kvk_number || "—"}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => onEdit(customer)}
            title="Klant wijzigen"
            aria-label={`Klant ${customer.name || ""} wijzigen`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(customer, objects)}
            title="Klant verwijderen"
            aria-label={`Klant ${customer.name || ""} verwijderen`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function Customers() {
  const [showWizard, setShowWizard] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [objectFilter, setObjectFilter] = useState("all");
  const queryClient = useQueryClient();

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list(),
  });

  const { data: objects = [] } = useQuery({
    queryKey: ["objects"],
    queryFn: () => base44.entities.SurveillanceObject.list(),
  });

  const objectsByCustomer = useMemo(() => {
    const grouped = {};
    for (const object of objects) {
      if (!object.customer_id) continue;
      grouped[object.customer_id] = grouped[object.customer_id] || [];
      grouped[object.customer_id].push(object);
    }
    return grouped;
  }, [objects]);

  const filteredCustomers = useMemo(() => {
    const query = text(searchTerm).trim();

    return customers.filter((customer) => {
      const customerObjects = objectsByCustomer[customer.id] || [];
      const hasObjects = customerObjects.length > 0;

      if (typeFilter !== "all" && customer.customer_type !== typeFilter) return false;
      if (objectFilter === "with" && !hasObjects) return false;
      if (objectFilter === "without" && hasObjects) return false;

      if (!query) return true;

      const searchable = [
        customer.name,
        customer.contact_person,
        customer.email,
        customer.phone,
        customer.address,
        customer.kvk_number,
        customer.notes,
        ...customerObjects.flatMap((object) => [object.name, object.object_code, object.address]),
      ].map(text).join(" ");

      return searchable.includes(query);
    });
  }, [customers, objectFilter, objectsByCustomer, searchTerm, typeFilter]);

  const filteredCompanyCount = filteredCustomers.filter((customer) => customer.customer_type === "bedrijf").length;
  const filteredPrivateCount = filteredCustomers.filter((customer) => customer.customer_type === "particulier").length;
  const hasActiveFilters = searchTerm || typeFilter !== "all" || objectFilter !== "all";

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Customer.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setShowWizard(false);
      setEditingCustomer(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Customer.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setShowWizard(false);
      setEditingCustomer(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Customer.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });

  const openCreateWizard = () => {
    setEditingCustomer(null);
    setShowWizard(true);
  };

  const openEditWizard = (customer) => {
    setEditingCustomer(customer);
    setShowWizard(true);
  };

  const closeWizard = () => {
    setShowWizard(false);
    setEditingCustomer(null);
  };

  const resetFilters = () => {
    setSearchTerm("");
    setTypeFilter("all");
    setObjectFilter("all");
  };

  const handleSave = (data) => {
    if (editingCustomer) {
      updateMutation.mutate({ id: editingCustomer.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (customer, customerObjects) => {
    if (customerObjects.length > 0) {
      alert(`Deze klant heeft nog ${customerObjects.length} gekoppeld object(en). Koppel de objecten eerst aan een andere klant.`);
      return;
    }

    if (confirm(`Klant "${customer.name}" verwijderen?`)) {
      deleteMutation.mutate(customer.id);
    }
  };

  if (showWizard) {
    return (
      <PageTransition>
        <Button variant="ghost" size="sm" onClick={closeWizard} className="w-fit text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Terug naar klanten
        </Button>
        <CustomerWizard
          customer={editingCustomer}
          onSave={handleSave}
          onCancel={closeWizard}
          saving={createMutation.isPending || updateMutation.isPending}
        />
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <PageHeader
        title="Klanten"
        subtitle="Beheer particulieren en bedrijven die gekoppeld zijn aan objecten"
        actions={
          <Button onClick={openCreateWizard}>
            <Plus className="h-4 w-4" /> Nieuwe klant
          </Button>
        }
      />

      {!isLoading && customers.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_180px_190px_auto] lg:items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Zoek op naam, contact, e-mail, telefoon, adres, KVK of object..."
                className="pl-9"
              />
            </div>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Klanttype" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle klanttypes</SelectItem>
                <SelectItem value="bedrijf">Bedrijven</SelectItem>
                <SelectItem value="particulier">Particulieren</SelectItem>
              </SelectContent>
            </Select>

            <Select value={objectFilter} onValueChange={setObjectFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Objecten" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle objecten</SelectItem>
                <SelectItem value="with">Met objecten</SelectItem>
                <SelectItem value="without">Zonder objecten</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex flex-wrap items-center justify-between gap-2 lg:justify-end">
              <div className="whitespace-nowrap rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{filteredCustomers.length}</span> klanten ·{" "}
                <span className="font-semibold text-foreground">{filteredCompanyCount}</span> bedrijven ·{" "}
                <span className="font-semibold text-foreground">{filteredPrivateCount}</span> particulieren
              </div>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Reset
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="rounded-lg border border-border bg-card py-10 text-center text-sm text-muted-foreground">
          Laden...
        </div>
      ) : customers.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="font-semibold text-muted-foreground">Klant</TableHead>
                <TableHead className="font-semibold text-muted-foreground">Type</TableHead>
                <TableHead className="font-semibold text-muted-foreground">Contact</TableHead>
                <TableHead className="font-semibold text-muted-foreground">Objecten</TableHead>
                <TableHead className="font-semibold text-muted-foreground">Adres</TableHead>
                <TableHead className="font-semibold text-muted-foreground">KvK</TableHead>
                <TableHead className="text-right font-semibold text-muted-foreground">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.map((customer) => (
                <CustomerRow
                  key={customer.id}
                  customer={customer}
                  objects={objectsByCustomer[customer.id] || []}
                  onEdit={openEditWizard}
                  onDelete={handleDelete}
                />
              ))}
            </TableBody>
          </Table>

          {filteredCustomers.length === 0 && (
            <div className="border-t border-border px-4 py-10 text-center">
              <p className="text-sm font-medium text-foreground">Geen klanten gevonden</p>
              <p className="mt-1 text-sm text-muted-foreground">Pas de zoekterm of filters aan.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={resetFilters}>
                Filters wissen
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card px-6 py-12 text-center shadow-sm">
          <p className="text-sm font-medium text-foreground">Geen klanten</p>
          <p className="mt-1 text-sm text-muted-foreground">Voeg de eerste klant toe om objecten aan te koppelen.</p>
          <Button className="mt-4" size="sm" onClick={openCreateWizard}>
            <Plus className="h-4 w-4" /> Klant toevoegen
          </Button>
        </div>
      )}
    </PageTransition>
  );
}
