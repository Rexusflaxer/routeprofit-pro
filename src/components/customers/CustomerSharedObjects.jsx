import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { invokeCustomerPlatformRead } from "./customerDossierUtils";

// Deliberately separate from the commercial/report object query: a responsible
// customer does not automatically become a payer or report recipient.
export default function CustomerSharedObjects({ customerId, navigate }) {
  const query = useQuery({
    queryKey: ["customer-shared-objects", customerId],
    queryFn: () => invokeCustomerPlatformRead({ action: "list_customer_shared_objects", customer_id: customerId, include_inactive: true }),
  });
  const roles = { joint_responsible: "Gezamenlijk verantwoordelijk", manager: "Beheerder", client: "Opdrachtgever" };
  if (query.isPending) return <p className="border-t p-4 text-xs text-muted-foreground">Gedeelde objecten laden…</p>;
  if (query.isError) return <div className="border-t p-4"><p className="text-xs text-destructive">Gedeelde objecten konden niet worden geladen.</p><Button variant="ghost" size="sm" onClick={() => query.refetch()}>Opnieuw</Button></div>;
  if (!query.data?.items?.length) return null;
  return <section className="border-t p-4"><h4 className="text-sm font-semibold">Ook verantwoordelijk voor</h4><p className="mb-3 mt-1 text-xs text-muted-foreground">Deze objecten hebben een andere hoofdklant. Facturatie en rapportagetoegang worden niet gedeeld door deze koppeling.</p>
    <ul className="divide-y rounded-lg border">{query.data.items.map(item => <li key={item.responsibility_id} className="flex items-center justify-between gap-3 p-3 text-sm"><div><p className="font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.object_code} · {roles[item.role]}{!item.active_now ? " · Niet momenteel actief" : ""}</p></div><Button variant="outline" size="sm" onClick={() => navigate(`/Objects?id=${encodeURIComponent(item.id)}&tab=participation`)}>Object bekijken</Button></li>)}</ul>
  </section>;
}
