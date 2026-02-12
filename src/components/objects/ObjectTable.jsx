import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, MapPin, Clock } from "lucide-react";

const taskTypeLabels = {
  sluitronde: "Sluitronde",
  openronde: "Openronde",
  alarmopvolging: "Alarm",
  surveillance: "Surveillance",
  anders: "Anders",
};

const taskTypeColors = {
  sluitronde: "bg-blue-50 text-blue-700 border-blue-200",
  openronde: "bg-emerald-50 text-emerald-700 border-emerald-200",
  alarmopvolging: "bg-red-50 text-red-700 border-red-200",
  surveillance: "bg-amber-50 text-amber-700 border-amber-200",
  anders: "bg-slate-50 text-slate-700 border-slate-200",
};

export default function ObjectTable({ objects, onEdit, onDelete }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50/80">
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Object</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Adres</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Type</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Duur</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Prijs/bezoek</TableHead>
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
                  <span className="text-sm truncate max-w-[200px]">{obj.address}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className={`${taskTypeColors[obj.task_type]} border text-xs`}>
                  {taskTypeLabels[obj.task_type] || obj.task_type}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5 text-slate-600">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-sm">{obj.service_duration_minutes} min</span>
                </div>
              </TableCell>
              <TableCell className="text-sm font-medium text-slate-900">€{(obj.price_per_visit || 0).toFixed(2)}</TableCell>
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