import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Building2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function PlanningObjectInfoDialog({ resource, onClose }) {
  const object = resource?.object;
  const open = Boolean(resource);

  return (
    <Dialog open={open} onOpenChange={nextOpen => { if (!nextOpen) onClose?.(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3 pr-8">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white">
              {resource?.logoUrl ? <img src={resource.logoUrl} alt="" className="h-full w-full object-contain p-1" /> : <Building2 className="h-6 w-6 text-primary" />}
            </div>
            <div className="min-w-0 text-left">
              <DialogTitle className="truncate">{resource?.label || "Object"}</DialogTitle>
              <DialogDescription className="mt-1">Objectinformatie</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <dl className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
          <div><dt className="text-xs text-muted-foreground">Objectcode</dt><dd className="mt-0.5 font-medium">{object?.object_code || "Niet vastgelegd"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Adres</dt><dd className="mt-0.5 flex items-start gap-1.5 font-medium"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />{object?.address || resource?.subtitle || "Niet vastgelegd"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Regio</dt><dd className="mt-0.5 font-medium">{object?.region || "Niet vastgelegd"}</dd></div>
        </dl>
        <Button asChild className="w-full">
          <Link to={`/Objects?id=${encodeURIComponent(resource?.id || "")}&tab=warning-addresses`}>Ga naar objectkaart <ArrowRight className="h-4 w-4" /></Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}