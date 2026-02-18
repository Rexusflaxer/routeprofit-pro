import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronUp } from "lucide-react";

export default function SectionWrapper({ icon: Icon, title, color = "text-amber-600", total, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => setOpen(v => !v)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon className={`w-4 h-4 ${color}`} />
            {title}
          </CardTitle>
          <div className="flex items-center gap-3">
            {total !== undefined && (
              <span className="text-sm font-semibold text-slate-700">€{Number(total).toFixed(2)}/mnd</span>
            )}
            {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </div>
        </div>
      </CardHeader>
      {open && <CardContent className="space-y-4 pt-0">{children}</CardContent>}
    </Card>
  );
}