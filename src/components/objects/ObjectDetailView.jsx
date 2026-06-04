import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Building2, Mail, MapPin, Pencil, Phone, User, Hash, Box } from "lucide-react";
import TaskForm from "./TaskForm";
import ObjectWeekSchedule from "./ObjectWeekSchedule";
import { TaskSpacingGroupsSummary } from "./TaskSpacingGroupsEditor";
import ObjectFloorPlanTab from "./ObjectFloorPlanTab";

export default function ObjectDetailView({ object, onBack, onEditObject }) {
  const [editingTask, setEditingTask] = useState(null);
  const queryClient = useQueryClient();


  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => base44.entities.Customer.list() });
  const { data: directTasks = [] } = useQuery({ queryKey: ["tasks", object.id], queryFn: () => base44.entities.Task.filter({ object_id: object.id }) });
  const { data: allTasks = [] } = useQuery({ queryKey: ["all-tasks-list"], queryFn: () => base44.entities.Task.list() });
  const { data: collectiefs = [] } = useQuery({ queryKey: ["collectieven"], queryFn: () => base44.entities.Collectief.list() });

  const customer = customers.find(item => item.id === object.customer_id);
  const collectiefTasks = allTasks.filter(task => task.collectief_id && (task.selected_object_ids || []).includes(object.id));
  const tasks = [...directTasks, ...collectiefTasks];
  const collectief = collectiefs.find(item => (item.object_ids || []).includes(object.id));

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", object.id] });
      queryClient.invalidateQueries({ queryKey: ["all-tasks-list"] });
      setEditingTask(null);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" onClick={onBack} className="w-fit">
          <ArrowLeft className="w-4 h-4 mr-1" /> Terug naar objecten
        </Button>
        <Button onClick={() => onEditObject(object)} className="w-fit bg-slate-900 hover:bg-slate-800">
          <Pencil className="w-4 h-4 mr-1" /> Objectkaart bewerken
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="w-5 h-5 text-slate-500" /> Objectinformatie
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900">{object.name}</h1>
                {object.object_code && <Badge variant="secondary"><Hash className="w-3 h-3 mr-1" />{object.object_code}</Badge>}
              </div>
              <p className="mt-2 flex items-start gap-2 text-sm text-slate-600">
                <MapPin className="w-4 h-4 mt-0.5 text-slate-400" /> {object.address}
              </p>
            </div>
            {collectief && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800">
                Onderdeel van collectief: <strong>{collectief.name}</strong>
              </div>
            )}
            {object.notes && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 whitespace-pre-wrap">{object.notes}</p>}
            <TaskSpacingGroupsSummary groups={object.task_spacing_groups || []} />
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="w-5 h-5 text-slate-500" /> Klantinformatie
            </CardTitle>
          </CardHeader>
          <CardContent>
            {customer ? (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Klant</p>
                  <p className="text-lg font-bold text-slate-900">{customer.name}</p>
                  {customer.contact_person && <p className="text-slate-500">Contactpersoon: {customer.contact_person}</p>}
                </div>
                {customer.email && <p className="flex items-center gap-2 text-slate-600"><Mail className="w-4 h-4 text-slate-400" /> {customer.email}</p>}
                {customer.phone && <p className="flex items-center gap-2 text-slate-600"><Phone className="w-4 h-4 text-slate-400" /> {customer.phone}</p>}
                {customer.address && <p className="flex items-start gap-2 text-slate-600"><MapPin className="w-4 h-4 mt-0.5 text-slate-400" /> {customer.address}</p>}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Geen klant gekoppeld.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="taken">
        <TabsList className="mb-4">
          <TabsTrigger value="taken">Taken & Schema</TabsTrigger>
          <TabsTrigger value="plattegrond"><Box className="w-4 h-4 mr-1.5 inline-block" />Plattegrond</TabsTrigger>
        </TabsList>
        <TabsContent value="taken">
          <ObjectWeekSchedule tasks={tasks} onEditTask={setEditingTask} />
        </TabsContent>
        <TabsContent value="plattegrond">
          <ObjectFloorPlanTab objectId={object.id} />
        </TabsContent>
      </Tabs>

      <Dialog open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Taak bewerken</DialogTitle>
          </DialogHeader>
          {editingTask && (
            <TaskForm
              task={editingTask}
              onSave={(data) => updateTaskMutation.mutate({ id: editingTask.id, data })}
              onCancel={() => setEditingTask(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}