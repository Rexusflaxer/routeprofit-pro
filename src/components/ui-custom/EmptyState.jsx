import React from "react";
import { Button } from "@/components/ui/button";

export default function EmptyState({ icon: Icon, title, description, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      {Icon && (
        <div className="rounded-2xl bg-slate-100 p-5 mb-6">
          <Icon className="w-10 h-10 text-slate-400" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-500 text-center max-w-sm mb-6">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} className="bg-slate-900 hover:bg-slate-800 text-white">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}