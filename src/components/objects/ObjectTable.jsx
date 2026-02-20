import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, MapPin, Layers } from "lucide-react";

export default function ObjectTable({ objects, onEdit, onDelete }) {
  const { data: allTasks = [] } = useQuery({
    queryKey: ['all-tasks'],
    queryFn: () => base44.entities.Task.list(),
  });

  const { data: allCollectieven = [] } = useQuery({
    queryKey: ['collectieven'],
    queryFn: () => base44.entities.Collectief.list(),
  });

  const getTaskCount = (objectId) => {
    return allTasks.filter(t => t.object_id === objectId).length;
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
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500 text-right">Acties</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {objects.map((obj) => {
            const collectief = getCollectief(obj.id);
            const directTaskCount = getTaskCount(obj.id);
            const collectiefTasks = getCollectiefTasks(obj.id);
            return (
              <TableRow key={obj.id} className="hover:bg-slate-50/50 transition-colors">
                <TableCell>
                  {obj.object_code
                    ? <span className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{obj.object_code}</span>
                    : <span className="text-slate-300 text-xs">—</span>}
                </TableCell>
                <TableCell className="font-medium text-slate-900">
                  {obj.name}
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
                        {directTaskCount} {directTaskCount === 1 ? 'eigen taak' : 'eigen taken'}
                      </Badge>
                    )}
                    {collectiefTasks.length > 0 && (
                      <Badge variant="secondary" className="bg-blue-50 text-blue-700 border border-blue-200 text-xs w-fit">
                        {collectiefTasks.length} {collectiefTasks.length === 1 ? "collectief taak" : "collectief taken"}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => onEdit(obj)} className="h-8 w-8 text-slate-400 hover:text-slate-700">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(obj.id)} className="h-8 w-8 text-slate-400 hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}