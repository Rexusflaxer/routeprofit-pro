import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2 } from "lucide-react";

export default function PersonnelTable({ personnel, onEdit, onDelete }) {
  const effectiveRate = (p, surcharge) => {
    const base = p.base_hourly_rate || 0;
    const withSurcharge = base * (1 + (surcharge || 0) / 100);
    const withVacation = withSurcharge * (1 + (p.vacation_allowance_pct || 0) / 100);
    return withVacation * (1 + (p.employer_costs_pct || 0) / 100);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50/80">
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Naam</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Basis/uur</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Effectief dag</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Effectief nacht</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Status</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500 text-right">Acties</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {personnel.map((p) => (
            <TableRow key={p.id} className="hover:bg-slate-50/50 transition-colors">
              <TableCell className="font-medium text-slate-900">{p.name}</TableCell>
              <TableCell className="text-sm text-slate-700">€{(p.base_hourly_rate || 0).toFixed(2)}</TableCell>
              <TableCell className="text-sm font-medium text-slate-900">€{effectiveRate(p, 0).toFixed(2)}</TableCell>
              <TableCell className="text-sm font-medium text-slate-900">€{effectiveRate(p, p.night_surcharge_pct).toFixed(2)}</TableCell>
              <TableCell>
                <Badge variant="secondary" className={p.is_active !== false ? "bg-emerald-50 text-emerald-700 border-emerald-200 border" : "bg-slate-100 text-slate-500 border-slate-200 border"}>
                  {p.is_active !== false ? "Actief" : "Inactief"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" onClick={() => onEdit(p)} className="h-8 w-8 text-slate-400 hover:text-slate-700">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onDelete(p.id)} className="h-8 w-8 text-slate-400 hover:text-red-600">
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