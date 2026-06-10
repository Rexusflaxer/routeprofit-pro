import React, { useState } from "react";
import { Plus, X, Archive, Trash2, RotateCcw, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const DELETE_CONFIRM_WORD = "verwijder";

// Converts display label → snake_key
function toKey(label) {
  return String(label || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

// Display label from key
function toLabel(key) {
  return String(key || "").replace(/[_-]+/g, " ");
}

function ArchiveDeleteBar({ value, onArchive, onDelete, onCancel }) {
  const [deleteInput, setDeleteInput] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  if (showDelete) {
    const confirmed = deleteInput === DELETE_CONFIRM_WORD;
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2 mt-1">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div className="text-xs text-foreground">
            <p className="font-semibold mb-0.5">Definitief verwijderen: <span className="font-mono">{toLabel(value)}</span></p>
            <p className="text-muted-foreground">Bestaande arbeidscontracten en diensten die deze functie gebruiken blijven intact. Nieuwe koppelingen zijn niet meer mogelijk.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={deleteInput}
            onChange={(e) => setDeleteInput(e.target.value)}
            placeholder={DELETE_CONFIRM_WORD}
            className={`h-7 text-xs font-mono max-w-[160px] ${!confirmed && deleteInput ? "border-destructive" : ""}`}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && confirmed && onDelete(value)}
          />
          <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={!confirmed} onClick={() => onDelete(value)}>
            <Trash2 className="w-3 h-3 mr-1" /> Verwijderen
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowDelete(false); setDeleteInput(""); }}>
            Annuleren
          </Button>
        </div>
        {!confirmed && deleteInput && (
          <p className="text-xs text-destructive">Typ "<strong>{DELETE_CONFIRM_WORD}</strong>" om te bevestigen</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex gap-2 mt-1">
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onArchive(value)}>
        <Archive className="w-3 h-3 mr-1" /> Archiveren
      </Button>
      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setShowDelete(true)}>
        <Trash2 className="w-3 h-3 mr-1" /> Verwijderen
      </Button>
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
        Annuleren
      </Button>
    </div>
  );
}

export default function CaoCustomFunctionsManager({
  customFunctions,       // [{ value, label, category, archived }]
  onAdd,                 // (value, label, category) => void
  onArchive,             // (value) => void
  onRestore,             // (value) => void
  onDelete,              // (value) => void
  existingCategories,    // string[] — categories already in use
}) {
  const [labelInput, setLabelInput] = useState("");
  const [categoryInput, setCategoryInput] = useState("");
  const [categoryMode, setCategoryMode] = useState("existing"); // "existing" | "new"
  const [selectedCategory, setSelectedCategory] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const [managingValue, setManagingValue] = useState(null);

  const active = customFunctions.filter(f => !f.archived);
  const archived = customFunctions.filter(f => f.archived);

  const categories = [...new Set([
    ...existingCategories,
    ...active.map(f => f.category).filter(Boolean),
  ])];

  const handleAdd = () => {
    const label = labelInput.trim();
    if (!label) return;
    const value = toKey(label);
    const category = categoryMode === "new"
      ? categoryInput.trim() || "Overig"
      : (selectedCategory || categories[0] || "Overig");
    onAdd(value, label, category);
    setLabelInput("");
    setCategoryInput("");
  };

  // Group active functions by category
  const grouped = active.reduce((acc, f) => {
    const cat = f.category || "Overig";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(f);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Active custom functions grouped by category */}
      {active.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Handmatig toegevoegde functies</p>
          {Object.entries(grouped).map(([cat, fns]) => (
            <div key={cat}>
              <p className="text-xs text-muted-foreground mb-1.5 font-medium">{cat}</p>
              <div className="space-y-1">
                {fns.map(f => (
                  <div key={f.value}>
                    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                      <span className="text-sm text-foreground">{f.label || toLabel(f.value)}</span>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-[10px] text-muted-foreground mr-1">Aangepast</Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => setManagingValue(managingValue === f.value ? null : f.value)}
                        >
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${managingValue === f.value ? "rotate-180" : ""}`} />
                        </Button>
                      </div>
                    </div>
                    {managingValue === f.value && (
                      <ArchiveDeleteBar
                        value={f.value}
                        onArchive={(v) => { onArchive(v); setManagingValue(null); }}
                        onDelete={(v) => { onDelete(v); setManagingValue(null); }}
                        onCancel={() => setManagingValue(null)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Archived functions */}
      {archived.length > 0 && (
        <div>
          <button
            onClick={() => setShowArchive(v => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            {showArchive ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Archive className="w-3.5 h-3.5" />
            Archief ({archived.length})
          </button>
          {showArchive && (
            <div className="space-y-1 border border-border rounded-lg p-2 bg-muted/20">
              {archived.map(f => (
                <div key={f.value}>
                  <div className="flex items-center justify-between rounded-md px-2 py-1.5">
                    <div>
                      <span className="text-sm text-muted-foreground line-through">{f.label || toLabel(f.value)}</span>
                      {f.category && <span className="text-xs text-muted-foreground ml-2">({f.category})</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => onRestore(f.value)}
                        title="Herstellen"
                      >
                        <RotateCcw className="w-3 h-3 mr-1" /> Herstellen
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setManagingValue(managingValue === f.value ? null : f.value)}
                        title="Definitief verwijderen"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  {managingValue === f.value && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2 mx-2 mb-1">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground">
                          Bestaande contracten en diensten blijven intact. Nieuwe koppelingen zijn niet meer mogelijk.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => { onDelete(f.value); setManagingValue(null); }}>
                          <Trash2 className="w-3 h-3 mr-1" /> Definitief verwijderen
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setManagingValue(null)}>Annuleren</Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add new custom function */}
      <div className="space-y-2 pt-1 border-t border-border">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-1">Functie toevoegen</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="bijv. Alarmopvolger"
            className="h-8 text-sm"
          />
          <div className="flex gap-2">
            {categories.length > 0 && (
              <button
                type="button"
                onClick={() => setCategoryMode(m => m === "existing" ? "new" : "existing")}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 shrink-0 self-center"
              >
                {categoryMode === "existing" ? "+ Nieuwe categorie" : "Bestaande categorie"}
              </button>
            )}
          </div>
        </div>

        {/* Category selection */}
        {categoryMode === "existing" && categories.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  selectedCategory === cat
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground bg-card"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        ) : (
          <Input
            value={categoryInput}
            onChange={(e) => setCategoryInput(e.target.value)}
            placeholder="Categorie naam, bijv. Operationele functies"
            className="h-8 text-sm"
          />
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={!labelInput.trim()}
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Toevoegen
        </Button>
      </div>
    </div>
  );
}