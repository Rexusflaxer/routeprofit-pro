import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Download, FileText, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import CompetencyCatalogDialog, { COMPETENCY_CATEGORIES } from "@/components/personnel/CompetencyCatalogDialog";
import CompetencyRating from "@/components/personnel/CompetencyRating";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("nl-NL", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function emptyProfile(personnelId) {
  return {
    personnel_id: personnelId,
    competencies: [],
    cv_file_url: null,
    cv_file_id: null,
    cv_download_filename: null,
    cv_uploaded_at: null,
  };
}

function ProfileSection({ title, children }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function PersonnelPropertiesTab({ person, profile = null }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [uploadingCv, setUploadingCv] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [form, setForm] = useState(emptyProfile(person.id));

  const currentProfile = profile;

  useEffect(() => {
    setForm({ ...emptyProfile(person.id), ...(currentProfile || {}) });
  }, [currentProfile, person.id]);

  const competencies = form.competencies || [];
  const grouped = useMemo(() => COMPETENCY_CATEGORIES.map(category => ({
    ...category,
    items: competencies.filter(item => item.category === category.key),
  })).filter(category => category.items.length > 0), [competencies]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { ...form, personnel_id: person.id, competencies };
      return currentProfile?.id
        ? base44.entities.PersonnelProfile.update(currentProfile.id, payload)
        : base44.entities.PersonnelProfile.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personnel-profiles", person.id] });
      queryClient.invalidateQueries({ queryKey: ["personnel-profiles"] });
      setEditing(false);
    },
  });

  const addCompetency = item => {
    if (competencies.some(current => current.key === item.key)) return;
    setForm(current => ({
      ...current,
      competencies: [...(current.competencies || []), { ...item, level: 3 }],
    }));
  };

  const updateLevel = (key, level) => {
    setForm(current => ({
      ...current,
      competencies: current.competencies.map(item => item.key === key ? { ...item, level } : item),
    }));
  };

  const removeCompetency = key => {
    setForm(current => ({
      ...current,
      competencies: current.competencies.filter(item => item.key !== key),
    }));
  };

  const cancelEditing = () => {
    setForm({ ...emptyProfile(person.id), ...(currentProfile || {}) });
    setUploadError("");
    setEditing(false);
  };

  const uploadCv = async file => {
    const allowed = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!allowed.includes(file.type) && !/\.(pdf|doc|docx)$/i.test(file.name)) {
      setUploadError("Gebruik een PDF-, DOC- of DOCX-bestand.");
      return;
    }
    setUploadError("");
    setUploadingCv(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(current => ({
        ...current,
        cv_file_url: file_url,
        cv_download_filename: file.name,
        cv_uploaded_at: new Date().toISOString(),
      }));
    } catch {
      setUploadError("Het CV kon niet worden geüpload. Probeer het opnieuw.");
    } finally {
      setUploadingCv(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Eigenschappenkaart</h2>
          <p className="text-xs text-muted-foreground">Vaardigheden, gedrag en kennis van deze medewerker.</p>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button variant="outline" size="sm" onClick={cancelEditing} disabled={saveMutation.isPending || uploadingCv}>
                <X className="mr-1 h-3.5 w-3.5" /> Annuleren
              </Button>
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || uploadingCv}>
                <Check className="mr-1 h-3.5 w-3.5" /> {saveMutation.isPending ? "Opslaan..." : "Opslaan"}
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> Wijzigen
            </Button>
          )}
        </div>
      </div>

      <ProfileSection title="Eigenschappen & competenties">
        {competencies.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border px-4 py-10 text-center">
            <p className="text-sm font-medium text-foreground">Nog geen eigenschappen toegevoegd</p>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">Bouw een profiel op met talen, software, vakkennis en persoonlijke competenties.</p>
            {editing && <Button size="sm" className="mt-4" onClick={() => setCatalogOpen(true)}><Plus className="mr-1 h-3.5 w-3.5" /> Open catalogus</Button>}
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(category => (
              <div key={category.key}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{category.label}</p>
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {category.items.map(item => (
                    <div key={item.key} className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{item.label}</span>
                      <CompetencyRating value={item.level} editable={editing} onChange={level => updateLevel(item.key, level)} />
                      {editing && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeCompetency(item.key)} title="Verwijderen">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {editing && <Button variant="outline" size="sm" onClick={() => setCatalogOpen(true)}><Plus className="mr-1 h-3.5 w-3.5" /> Eigenschap toevoegen</Button>}
          </div>
        )}
      </ProfileSection>

      <ProfileSection title="Curriculum vitae">
        {form.cv_file_url ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <FileText className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{form.cv_download_filename || "Curriculum vitae"}</p>
                <p className="text-xs text-muted-foreground">Geüpload op {formatDate(form.cv_uploaded_at)}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => window.open(form.cv_file_url, "_blank", "noopener,noreferrer")}>
                <Download className="mr-1 h-3.5 w-3.5" /> Bekijken
              </Button>
              {editing && <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}><Upload className="mr-1 h-3.5 w-3.5" /> Vervangen</Button>}
              {editing && <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setForm(current => ({ ...current, cv_file_url: null, cv_download_filename: null, cv_uploaded_at: null }))}><Trash2 className="h-3.5 w-3.5" /></Button>}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border px-4 py-8 text-center">
            <FileText className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">Nog geen CV geüpload.</p>
            {editing && <Button variant="outline" size="sm" className="mt-3" onClick={() => fileInputRef.current?.click()} disabled={uploadingCv}><Upload className="mr-1 h-3.5 w-3.5" /> {uploadingCv ? "Uploaden..." : "CV uploaden"}</Button>}
          </div>
        )}
        {uploadError && <p className="mt-2 text-xs text-destructive">{uploadError}</p>}
        <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) uploadCv(file); event.target.value = ""; }} />
      </ProfileSection>

      <CompetencyCatalogDialog
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        existingKeys={competencies.map(item => item.key)}
        onAdd={addCompetency}
      />
    </div>
  );
}