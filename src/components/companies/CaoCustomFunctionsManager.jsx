import React, { useState } from "react";
import { Plus, Archive, Trash2, RotateCcw, AlertTriangle, ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const DELETE_CONFIRM_WORD = "verwijder";

function toKey(label) {
  return String(label || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

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
  customFunctions,
  onAdd,
  onArchive,
  onRestore,
  onDelete,
  existingCategories,
  predefinedCategories = [],
  onStepChange,
  onLabelChange,
}) {
  // Step 1: enter name, Step 2: pick category
  const [step, setStep] = useState(1);

  const goToStep = (s) => { setStep(s); onStepChange?.(s); };
  const [labelInput, setLabelInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [categoryMode, setCategoryMode] = useState("existing"); // "existing" | "new"
  const [showArchive, setShowArchive] = useState(false);
  const [managingValue, setManagingValue] = useState(null);

  const active = customFunctions.filter(f => !f.archived);
  const archived = customFunctions.filter(f => f.archived);

  const allCategories = [...new Set([
    ...predefinedCategories,
    ...existingCategories,
    ...active.map(f => f.category).filter(Boolean),
  ])];

  const handleNext = () => {
    if (!labelInput.trim()) return;
    if (!selectedCategory && allCategories.length > 0) setSelectedCategory(allCategories[0]);
    setCategoryMode(allCategories.length > 0 ? "existing" : "new");
    goToStep(2);
  };

  const handleAdd = () => {
    const label = labelInput.trim();
    if (!label) return;
    const value = toKey(label);
    const category = categoryMode === "new"
      ? (newCategoryInput.trim() || "Overig")
      : (selectedCategory || allCategories[0] || "Overig");
    onAdd(value, label, category);
    setLabelInput("");
    setSelectedCategory("");
    setNewCategoryInput("");
    goToStep(1);
    setCategoryMode("existing");
    onLabelChange?.("");
  };

  const handleBack = () => {
    goToStep(1);
  };

  // Group active functions by category
  const grouped = active.reduce((acc, f) => {
    const cat = f.category || "Overig";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(f);
    return acc;
  }, {});

  return (
    <div className="space-y-2">
      {/* Active custom functions as pills */}
      {active.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Aangepaste functies</p>
          <div className="flex flex-wrap gap-1.5">
            {active.map(f => (
              <div key={f.value} className="relative group">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-secondary/50 text-foreground border border-secondary font-medium">
                  {f.label || toLabel(f.value)}
                  <button
                    onClick={() => setManagingValue(managingValue === f.value ? null : f.value)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="Beheer"
                  >
                    <ChevronDown className={`w-3 h-3 transition-transform ${managingValue === f.value ? "rotate-180" : ""}`} />
                  </button>
                </span>
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
      )}

      {/* Archived functions — compact collapsible */}
      {archived.length > 0 && (
        <div className="pt-1 border-t border-border">
          <button
            onClick={() => setShowArchive(v => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showArchive ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Archive className="w-3.5 h-3.5" />
            <span className="font-medium">Archief ({archived.length})</span>
          </button>
          {showArchive && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {archived.map(f => (
                <div key={f.value} className="relative group">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground border border-border line-through font-medium">
                    {f.label || toLabel(f.value)}
                    <button
                      onClick={() => setManagingValue(managingValue === f.value ? null : f.value)}
                      className="hover:text-foreground transition-colors"
                      title="Beheer"
                    >
                      <ChevronDown className={`w-3 h-3 transition-transform ${managingValue === f.value ? "rotate-180" : ""}`} />
                    </button>
                  </span>
                  {managingValue === f.value && (
                    <div className="absolute top-full left-0 mt-1 z-10 bg-card border border-border rounded-lg p-2 w-max shadow-sm">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-6 text-xs px-1.5 text-muted-foreground hover:text-foreground" onClick={() => onRestore(f.value)}>
                          <RotateCcw className="w-3 h-3 mr-1" /> Herstellen
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setManagingValue(managingValue === f.value ? null : f.value)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add new custom function — 2-step flow */}
      <div className="pt-2 border-t border-border">
        {step === 1 && (
          <div className="flex gap-2">
            <Input
              value={labelInput}
              onChange={(e) => { setLabelInput(e.target.value); onLabelChange?.(e.target.value); }}
              onKeyDown={(e) => e.key === "Enter" && handleNext()}
              placeholder="Bijv. Alarmopvolger"
              className="h-7 text-xs flex-1"
              autoFocus
            />
            <Button
              type="button"
              variant={labelInput.trim() ? "default" : "outline"}
              size="sm"
              onClick={handleNext}
              disabled={!labelInput.trim()}
              className="h-7 text-xs whitespace-nowrap"
            >
              <Plus className="w-3 h-3 mr-1" /> Toevoegen
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleBack} className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-sm font-medium text-foreground">{labelInput}</span>
            </div>

            {/* Categories as pills + "Nieuwe categorie" option */}
            <div className="flex flex-wrap gap-1.5">
              {allCategories.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => { setSelectedCategory(cat); setCategoryMode("existing"); }}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    categoryMode === "existing" && selectedCategory === cat
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground bg-card"
                  }`}
                >
                  {cat}
                </button>
              ))}
              {categoryMode !== "new" && (
                <button
                  type="button"
                  onClick={() => { setCategoryMode("new"); setSelectedCategory(""); }}
                  className="px-2.5 py-1 rounded-full text-xs border border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-foreground bg-card transition-colors"
                >
                  + Nieuwe categorie
                </button>
              )}
            </div>

            {/* New category inline input */}
            {categoryMode === "new" && (
              <Input
                value={newCategoryInput}
                onChange={(e) => setNewCategoryInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder="Naam nieuwe categorie"
                className="h-8 text-sm"
                autoFocus
              />
            )}

            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleAdd}
              disabled={
                categoryMode === "existing"
                  ? !selectedCategory && allCategories.length > 0
                  : !newCategoryInput.trim() && allCategories.length > 0
              }
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Toevoegen
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}