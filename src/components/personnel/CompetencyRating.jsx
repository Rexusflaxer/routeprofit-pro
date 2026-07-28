import React from "react";

const LEVEL_LABELS = ["", "Beginner", "Basis", "Zelfstandig", "Gevorderd", "Expert"];

export default function CompetencyRating({ value = 1, editable = false, onChange }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Niveau ${value} van 5: ${LEVEL_LABELS[value]}`}>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(level => (
          <button
            key={level}
            type="button"
            disabled={!editable}
            onClick={() => onChange?.(level)}
            className={`h-2.5 w-5 rounded-full transition-colors ${
              level <= value ? "bg-primary" : "bg-muted"
            } ${editable ? "cursor-pointer hover:bg-primary/70" : "cursor-default"}`}
            title={`${level} – ${LEVEL_LABELS[level]}`}
          />
        ))}
      </div>
      <span className="w-20 text-xs text-muted-foreground">{LEVEL_LABELS[value]}</span>
    </div>
  );
}