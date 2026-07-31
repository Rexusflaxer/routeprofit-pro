import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, MapPin, Layers } from "lucide-react";
import {
  OBJECT_STATUS_CLASSES,
  OBJECT_STATUS_LABELS,
  getObjectStatus,
} from "./objectDossierConfig";

export default function ObjectTable({ objects, onSelect }) {
  const objectIds = objects.map(object => object.id).filter(Boolean);
  const objectScopeKey = [...objectIds].sort().join(",");
  const { data: allTasks = [] } = useQuery({
    queryKey: ["object-table", "tasks", objectScopeKey],
    queryFn: () => base44.entities.Task.filter(
      { $or: objectIds.flatMap(objectId => [
        { object_id: objectId },
        { selected_object_ids: { $all: [objectId] } },
      ]) },
      "task_type",
      500,
      0,
      ["id", "object_id", "collectief_id", "selected_object_ids", "repeat_count"],
    ),
    enabled: objectIds.length > 0,
  });

  const { data: allCollectieven = [] } = useQuery({
    queryKey: ["object-table", "collectives", objectScopeKey],
    queryFn: () => base44.entities.Collectief.filter(
      { $or: objectIds.map(objectId => ({ object_ids: { $all: [objectId] } })) },
      "name",
      100,
      0,
      ["id", "name", "object_ids"],
    ),
    enabled: objectIds.length > 0,
  });

  const getTaskCount = (objectId) => {
    return allTasks.filter(t => t.object_id === objectId).length;
  };

  const getExecutionCount = (objectId) => {
    return allTasks
      .filter(t => t.object_id === objectId)
      .reduce((sum, task) => sum + Math.max(1, Number(task.repeat_count || 1)), 0);
  };

  // Direct object tasks + collectief tasks where this object is selected
  const getCollectiefTasks = (objectId) => {
    return allTasks.filter(t => t.collectief_id && (t.selected_object_ids || []).includes(objectId));
  };

  const getCollectief = (objectId) => {
    return allCollectieven.find(c => (c.object_ids || []).includes(objectId));
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50/80">
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Code</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Object</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Adres</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Collectief / Taken</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Status</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {objects.map((obj) => {
            const collectief = getCollectief(obj.id);
            const directTaskCount = getTaskCount(obj.id);
            const directExecutionCount = getExecutionCount(obj.id);
            const collectiefTasks = getCollectiefTasks(obj.id);
            const status = getObjectStatus(obj);
            return (
              <TableRow
                key={obj.id}
                onClick={() => onSelect?.(obj)}
                className="cursor-pointer transition-colors hover:bg-slate-50/50"
              >
                <TableCell>
                  {obj.object_code
                    ? <span className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{obj.object_code}</span>
                    : <span className="text-slate-300 text-xs">—</span>}
                </TableCell>
                <TableCell className="font-medium text-slate-900">
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      onSelect?.(obj);
                    }}
                    className="rounded-sm text-left font-medium text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    aria-label={`Objectdossier van ${obj.name || "naamloos object"} openen`}
                  >
                    {obj.name}
                  </button>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-sm truncate max-w-[250px]">{obj.address}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    {collectief && (
                      <div className="flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-xs text-blue-700 font-medium">{collectief.name}</span>
                      </div>
                    )}
                    {directTaskCount > 0 && (
                      <Badge variant="secondary" className="bg-amber-50 text-amber-700 border border-amber-200 text-xs w-fit">
                        {directExecutionCount} {directExecutionCount === 1 ? 'eigen taak' : 'eigen taken'}
                      </Badge>
                    )}
                    {collectiefTasks.length > 0 && (
                      <Badge variant="secondary" className="bg-blue-50 text-blue-700 border border-blue-200 text-xs w-fit">
                        {collectiefTasks.length} {collectiefTasks.length === 1 ? "collectief taak" : "collectief taken"}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[11px] ${OBJECT_STATUS_CLASSES[status] || ""}`}>
                    {OBJECT_STATUS_LABELS[status] || status}
                  </Badge>
                </TableCell>
                <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
