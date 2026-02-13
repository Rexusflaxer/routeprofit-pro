import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, MapPin } from "lucide-react";

export default function ObjectTable({ objects, onEdit, onDelete }) {
  const { data: allTasks = [] } = useQuery({
    queryKey: ['all-tasks'],
    queryFn: () => base44.entities.Task.list(),
  });

  const getTaskCount = (objectId) => {
    return allTasks.filter(t => t.object_id === objectId).length;
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50/80">
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Object</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Adres</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Aantal taken</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500 text-right">Acties</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {objects.map((obj) => (
            <TableRow key={obj.id} className="hover:bg-slate-50/50 transition-colors">
              <TableCell className="font-medium text-slate-900">{obj.name}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5 text-slate-600">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-sm truncate max-w-[300px]">{obj.address}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className="bg-slate-100 text-slate-800 text-xs">
                  {getTaskCount(obj.id)} {getTaskCount(obj.id) === 1 ? 'taak' : 'taken'}
                </Badge>
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
          ))}
        </TableBody>
      </Table>
    </div>
  );
}