import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import SecurityPlanCategoryTable from "./SecurityPlanCategoryTable";
import SecurityPlanWizard from "./SecurityPlanWizard";
import SecurityPlanWorkspace from "./SecurityPlanWorkspace";
import { createObjectSecurityPlan, createSecurityPlanMutationKey, listObjectSecurityPlans } from "./securityPlanWorkflow";

function LoadingTable() {
  return <div className="space-y-2 p-4" aria-label="Plannen laden" aria-busy="true">{[1, 2, 3].map(index => <div key={index} className="h-12 animate-pulse rounded-lg bg-muted/30" />)}</div>;
}

function TableError({ error, onRetry }) {
  return <div className="flex min-h-52 items-center justify-center p-6 text-center"><div><AlertCircle className="mx-auto h-5 w-5 text-destructive" /><p className="mt-3 text-sm font-medium">De beveiligingsplannen konden niet worden geladen</p><p className="mt-1 text-xs text-muted-foreground">{error?.message || "Probeer het opnieuw."}</p><Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" /> Opnieuw proberen</Button></div></div>;
}

export default function ObjectSecurityPlanTab({ object, view, selectedRow, onOpenCreate, onOpenEdit, onCloseView }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createKeyRef = useRef(null);
  const [expanded, setExpanded] = useState([]);
  const archived = object.status === "archived";
  const wizardOpen = view === "new" && !archived;
  const detailOpen = view === "edit" && Boolean(selectedRow);
  const query = useQuery({ queryKey: ["object-card", object.id, "security-plans", "table"], queryFn: () => listObjectSecurityPlans({ customerId: object.customer_id, objectId: object.id, page: 1, pageSize: 250 }), enabled: !detailOpen, retry: 1 });

  useEffect(() => { if (wizardOpen && !createKeyRef.current) createKeyRef.current = createSecurityPlanMutationKey("create"); if (!wizardOpen) createKeyRef.current = null; }, [wizardOpen]);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["object-card", object.id, "security-plans"] });
  const create = useMutation({
    mutationFn: data => createObjectSecurityPlan({ customerId: object.customer_id, objectId: object.id, data, idempotencyKey: createKeyRef.current || createSecurityPlanMutationKey("create") }),
    onSuccess: async (result, data) => { await invalidate(); createKeyRef.current = null; setExpanded(current => current.includes(data.task_type) ? current : [...current, data.task_type]); onCloseView(); toast({ title: "Plan toegevoegd" }); },
    onError: async error => { if (Number(error?.status) === 409) await invalidate(); },
  });

  if (detailOpen) return <SecurityPlanWorkspace object={object} securityPlanId={selectedRow} onBack={onCloseView} onOpenPlan={onOpenEdit} />;
  return <div className="flex min-h-[620px] flex-col bg-card/35 backdrop-blur-xl">
    {wizardOpen && <SecurityPlanWizard saving={create.isPending} error={create.error} onCancel={onCloseView} onSave={data => create.mutate(data)} />}
    <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-card/25 px-4 py-3 backdrop-blur-xl"><div><h2 className="text-sm font-semibold">Beveiligingsplan</h2><p className="mt-1 text-xs text-muted-foreground">Beheer plannen per categorie.</p></div>{!wizardOpen && <Button type="button" size="sm" onClick={onOpenCreate} disabled={archived}><Plus className="h-3.5 w-3.5" /> Plan toevoegen</Button>}</div>
    <div className="min-h-0 flex-1">{query.isLoading ? <LoadingTable /> : query.isError ? <TableError error={query.error} onRetry={() => query.refetch()} /> : <SecurityPlanCategoryTable plans={query.data?.items || []} expanded={expanded} onToggle={key => setExpanded(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key])} onOpen={onOpenEdit} />}</div>
  </div>;
}