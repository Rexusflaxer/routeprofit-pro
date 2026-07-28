import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Check,
  Download,
  FileImage,
  FileText,
  Globe,
  Languages,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Sparkles,
  Table,
  Upload,
  Video,
  X,
} from "lucide-react";

const SOFTWARE_OPTIONS = [
  { key: "word", label: "Microsoft Word", icon: FileText },
  { key: "excel", label: "Microsoft Excel", icon: Table },
  { key: "outlook", label: "Microsoft Outlook", icon: Mail },
  { key: "teams", label: "Microsoft Teams", icon: MessageSquare },
  { key: "whatsapp", label: "WhatsApp", icon: Phone },
  { key: "google_workspace", label: "Google Workspace", icon: Globe },
  { key: "zoom", label: "Zoom", icon: Video },
  { key: "adobe", label: "Adobe Acrobat", icon: FileImage },
];

const LANGUAGE_OPTIONS = [
  "Nederlands", "Engels", "Duits", "Frans", "Spaans", "Portugees",
  "Arabisch", "Turks", "Italiaans", "Grieks", "Russisch", "Chinees",
  "Japans", "Zuid-Afrikaans", "Zweeks", "Noors", "Zens", "Roemeens",
  "Polish", "Bulgaars", "Hongaars", "Fins", "Deens", "Zweedse",
];

const LEVEL_CONFIG = {
  none: { label: "Geen", className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
  basic: { label: "Basis", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300" },
  intermediate: { label: "Gemiddeld", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300" },
  advanced: { label: "Gevorderd", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" },
};

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function SectionCard({ title, icon: Icon, children }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function PersonnelPropertiesTab({ person, profile = null }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [uploadingCv, setUploadingCv] = useState(false);
  const [newLanguage, setNewLanguage] = useState("");
  const fileInputRef = useRef(null);

  const { data: profiles = [] } = useQuery({
    queryKey: ["personnel-profiles", person.id],
    queryFn: () => base44.entities.PersonnelProfile.filter({ personnel_id: person.id }),
  });

  const currentProfile = profiles[0] || profile;

  useEffect(() => {
    const defaults = {
      personnel_id: person.id,
      languages: [],
      software_skills: [],
      cv_file_url: null,
      cv_file_id: null,
      cv_download_filename: null,
      cv_uploaded_at: null,
      notes: null,
    };
    setForm(currentProfile ? { ...defaults, ...currentProfile } : defaults);
  }, [currentProfile, person.id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        languages: form.languages || [],
        software_skills: form.software_skills || [],
      };
      if (currentProfile?.id) {
        return base44.entities.PersonnelProfile.update(currentProfile.id, payload);
      }
      return base44.entities.PersonnelProfile.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personnel-profiles", person.id] });
      setEditing(false);
    },
  });

  const handleCvUpload = async (file) => {
    setUploadingCv(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(cur => ({
        ...cur,
        cv_file_url: file_url,
        cv_download_filename: file.name,
        cv_uploaded_at: new Date().toISOString(),
      }));
    } finally {
      setUploadingCv(false);
    }
  };

  if (!form) return <div className="py-8 text-center text-sm text-muted-foreground">Laden...</div>;

  const set = (field, value) => setForm(cur => ({ ...cur, [field]: value }));

  const addLanguage = () => {
    const lang = newLanguage.trim();
    if (!lang || form.languages?.includes(lang)) return;
    set("languages", [...(form.languages || []), lang]);
    setNewLanguage("");
  };

  const removeLanguage = (lang) => {
    set("languages", form.languages.filter(l => l !== lang));
  };

  const setSoftwareLevel = (softwareKey, level) => {
    const skills = [...(form.software_skills || [])];
    const idx = skills.findIndex(s => s.software === softwareKey);
    if (idx >= 0) {
      skills[idx] = { ...skills[idx], level };
    } else {
      skills.push({ software: softwareKey, level });
    }
    set("software_skills", skills);
  };

  const getSoftwareLevel = (softwareKey) => {
    const skill = form.software_skills?.find(s => s.software === softwareKey);
    return skill?.level || "none";
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end gap-2">
        {editing ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setForm(currentProfile || null); setEditing(false); }}
              disabled={saveMutation.isPending || uploadingCv}
            >
              <X className="mr-1 h-4 w-4" /> Annuleren
            </Button>
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || uploadingCv}>
              <Check className="mr-1 h-4 w-4" /> {saveMutation.isPending ? "Opslaan..." : "Opslaan"}
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="mr-1 h-4 w-4" /> Wijzigen
          </Button>
        )}
      </div>

      {/* Talen */}
      <SectionCard title="Talen" icon={Languages}>
        {form.languages?.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {form.languages.map(lang => (
              <Badge key={lang} className="gap-1 border-0 bg-primary/10 text-primary">
                {lang}
                {editing && (
                  <button type="button" onClick={() => removeLanguage(lang)} className="ml-0.5 hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nog geen talen geregistreerd.</p>
        )}
        {editing && (
          <div className="mt-3 flex gap-2">
            <Input
              value={newLanguage}
              onChange={e => setNewLanguage(e.target.value)}
              onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addLanguage())}
              placeholder="Voeg een taal toe..."
              className="h-8 text-sm"
              list="language-suggestions"
            />
            <datalist id="language-suggestions">
              {LANGUAGE_OPTIONS.map(l => <option key={l} value={l} />)}
            </datalist>
            <Button size="sm" variant="outline" onClick={addLanguage} disabled={!newLanguage.trim()}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Toevoegen
            </Button>
          </div>
        )}
      </SectionCard>

      {/* Softwarevaardigheden */}
      <SectionCard title="Softwarevaardigheden" icon={Sparkles}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SOFTWARE_OPTIONS.map(opt => {
            const level = getSoftwareLevel(opt.key);
            const config = LEVEL_CONFIG[level];
            return (
              <div key={opt.key} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <opt.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium text-foreground">{opt.label}</span>
                </div>
                {editing ? (
                  <Select value={level} onValueChange={v => setSoftwareLevel(opt.key, v)}>
                    <SelectTrigger className="h-7 w-32 shrink-0 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(LEVEL_CONFIG).map(([val, cfg]) => (
                        <SelectItem key={val} value={val}>{cfg.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge className={`border-0 whitespace-nowrap text-xs ${config.className}`}>{config.label}</Badge>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* CV */}
      <SectionCard title="CV" icon={FileText}>
        {form.cv_file_url ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{form.cv_download_filename || "CV"}</p>
                {form.cv_uploaded_at && (
                  <p className="text-xs text-muted-foreground">Geüpload op {formatDate(form.cv_uploaded_at)}</p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="sm" variant="outline" onClick={() => window.open(form.cv_file_url, "_blank")}>
                <Download className="mr-1 h-3.5 w-3.5" /> Bekijken
              </Button>
              {editing && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => set("cv_file_url", null)}
                  title="CV verwijderen"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        ) : editing ? (
          <div
            className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border py-8 cursor-pointer hover:bg-accent/30"
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadingCv ? (
              <p className="text-sm text-muted-foreground">Uploaden...</p>
            ) : (
              <>
                <Upload className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Klik om CV te uploaden</p>
                <p className="text-xs text-muted-foreground/60">PDF, DOC of DOCX</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleCvUpload(file);
                e.target.value = "";
              }}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nog geen CV geüpload.</p>
        )}
      </SectionCard>
    </div>
  );
}