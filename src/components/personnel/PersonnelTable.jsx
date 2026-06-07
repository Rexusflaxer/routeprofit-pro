import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, User, Briefcase, Calculator } from "lucide-react";

const CAO_LABELS = {
  cao_particuliere_beveiliging: "CAO Particuliere Beveiliging",
  cao_evenementen_horecabeveiliging: "CAO Evenementen- en Horecabeveiliging",
  cao_verkeersregelaars: "CAO Verkeersregelaars",
  cao_veiligheidsdomein: "CAO Veiligheidsdomein",
  eigen_tarief: "Eigen tarief"
};

export default function PersonnelTable({ personnel, onEdit, onDelete, onCalculate }) {
  const getDisplayInfo = (p) => {
    if (p.employee_type === "zzp") {
      return {
        type: "ZZP",
        rate: `€${(p.zzp_hourly_rate_excl_vat || 0).toFixed(2)} excl. BTW`,
        details: "Per uur"
      };
    } else {
      // Loondienst
      let contractLabel = "";
      if (p.contract_type === "fulltime") contractLabel = "Fulltime";
      else if (p.contract_type === "parttime") contractLabel = `Parttime (${p.parttime_hours || 0}u)`;
      else if (p.contract_type === "0_uren") contractLabel = "0-uren";
      else if (p.contract_type === "min_max") contractLabel = `Min-max (${p.min_hours || 0}-${p.max_hours || 0}u)`;

      let caoLabel = CAO_LABELS[p.cao] || p.cao || "CAO onbekend";
      if (p.cao === "cao_particuliere_beveiliging") {
        caoLabel = p.cao_scope_profile === "non_security_work_article_3_exception"
          ? `Eigen uurloon €${(p.custom_hourly_rate || 0).toFixed(2)} (bijlage 2 n.v.t.)`
          : `CAO schaal ${p.cao_scale ?? "-"}, periode ${p.cao_period ?? "-"}`;
      } else if (p.cao === "eigen_tarief") {
        caoLabel = `Eigen tarief €${(p.custom_hourly_rate || 0).toFixed(2)}`;
      }

      return {
        type: "Loondienst",
        rate: contractLabel,
        details: caoLabel
      };
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50/80">
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Naam</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Functie</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Type</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Contract/Tarief</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Details</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500">Status</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-slate-500 text-right">Acties</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {personnel.map((p) => {
            const info = getDisplayInfo(p);
            return (
              <TableRow key={p.id} className="hover:bg-slate-50/50 transition-colors">
                <TableCell className="font-medium text-slate-900">{p.name}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {p.function_type === "surveillant" ? (
                      <User className="w-4 h-4 text-slate-400" />
                    ) : (
                      <Briefcase className="w-4 h-4 text-slate-400" />
                    )}
                    <span className="text-sm text-slate-700 capitalize">{p.function_type}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={p.employee_type === "zzp" ? "bg-purple-50 text-purple-700" : "bg-blue-50 text-blue-700"}>
                    {info.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-slate-700">{info.rate}</TableCell>
                <TableCell className="text-xs text-slate-500">{info.details}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={p.is_active !== false ? "bg-emerald-50 text-emerald-700 border-emerald-200 border" : "bg-slate-100 text-slate-500 border-slate-200 border"}>
                    {p.is_active !== false ? "Actief" : "Inactief"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {onCalculate && (
                      <Button variant="ghost" size="icon" onClick={() => onCalculate(p)} className="h-8 w-8 text-slate-400 hover:text-amber-600">
                        <Calculator className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => onEdit(p)} className="h-8 w-8 text-slate-400 hover:text-slate-700">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(p.id)} className="h-8 w-8 text-slate-400 hover:text-red-600">
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
