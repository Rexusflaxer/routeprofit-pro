import React, { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const COMPETENCY_CATEGORIES = [
  { key: "languages", label: "Talen" },
  { key: "software", label: "Software & digitaal" },
  { key: "security", label: "Beveiliging & veiligheid" },
  { key: "communication", label: "Communicatie" },
  { key: "personal", label: "Persoonlijke eigenschappen" },
  { key: "leadership", label: "Leiderschap & organisatie" },
  { key: "service", label: "Service & samenwerking" },
  { key: "practical", label: "Praktische vaardigheden" },
];

const SOFTWARE_LOGOS = {
  word: "https://cdn.simpleicons.org/microsoftword/2B579A",
  excel: "https://cdn.simpleicons.org/microsoftexcel/217346",
  outlook: "https://cdn.simpleicons.org/microsoftoutlook/0078D4",
  teams: "https://cdn.simpleicons.org/microsoftteams/6264A7",
  powerpoint: "https://cdn.simpleicons.org/microsoftpowerpoint/B7472A",
  google: "https://cdn.simpleicons.org/googleworkspace/4285F4",
  adobe: "https://cdn.simpleicons.org/adobeacrobatreader/EC1C24",
};

export function getSoftwareLogo(key) {
  return SOFTWARE_LOGOS[key] || null;
}

export const COMPETENCY_CATALOG = [
  ["nl", "Nederlands", "languages"], ["en", "Engels", "languages"], ["de", "Duits", "languages"],
  ["fr", "Frans", "languages"], ["es", "Spaans", "languages"], ["ar", "Arabisch", "languages"],
  ["tr", "Turks", "languages"], ["pl", "Pools", "languages"], ["ro", "Roemeens", "languages"],
  ["word", "Microsoft Word", "software"], ["excel", "Microsoft Excel", "software"],
  ["outlook", "Microsoft Outlook", "software"], ["teams", "Microsoft Teams", "software"],
  ["powerpoint", "Microsoft PowerPoint", "software"], ["google", "Google Workspace", "software"],
  ["adobe", "Adobe Acrobat", "software"], ["planning", "Planningssoftware", "software"],
  ["reporting", "Digitale rapportagesystemen", "software"], ["mobile_apps", "Mobiele werkapps", "software"],
  ["observation", "Observeren en signaleren", "security"], ["deescalation", "De-escaleren", "security"],
  ["conflict", "Conflicthantering", "security"], ["risk", "Risico-inschatting", "security"],
  ["incident", "Incidentafhandeling", "security"], ["access", "Toegangscontrole", "security"],
  ["surveillance", "Surveillancewerk", "security"], ["emergency", "Handelen bij calamiteiten", "security"],
  ["report_writing", "Rapporteren en verslagleggen", "security"], ["situational", "Situationeel bewustzijn", "security"],
  ["verbal", "Mondeling communiceren", "communication"], ["written", "Schriftelijk communiceren", "communication"],
  ["listening", "Actief luisteren", "communication"], ["nonverbal", "Non-verbale communicatie", "communication"],
  ["multicultural", "Omgaan met culturele verschillen", "communication"], ["presenting", "Presenteren", "communication"],
  ["stress", "Stressbestendigheid", "personal"], ["integrity", "Integriteit", "personal"],
  ["reliable", "Betrouwbaarheid", "personal"], ["alert", "Oplettendheid", "personal"],
  ["decisive", "Besluitvaardigheid", "personal"], ["independent", "Zelfstandigheid", "personal"],
  ["flexible", "Flexibiliteit", "personal"], ["accurate", "Nauwkeurigheid", "personal"],
  ["resilience", "Emotionele weerbaarheid", "personal"], ["initiative", "Initiatief nemen", "personal"],
  ["lead", "Leidinggeven", "leadership"], ["coach", "Coachen en begeleiden", "leadership"],
  ["prioritize", "Prioriteiten stellen", "leadership"], ["planning_work", "Plannen en organiseren", "leadership"],
  ["decision", "Beslissingen nemen", "leadership"], ["handover", "Duidelijke dienstoverdracht", "leadership"],
  ["customer", "Klantgerichtheid", "service"], ["teamwork", "Samenwerken", "service"],
  ["hospitality", "Gastvrijheid", "service"], ["professional", "Professionele houding", "service"],
  ["feedback", "Feedback geven en ontvangen", "service"], ["privacy", "Discreet omgaan met informatie", "service"],
  ["driving", "Professioneel rijgedrag", "practical"], ["navigation", "Navigeren en routekennis", "practical"],
  ["radio", "Portofoongebruik", "practical"], ["keys", "Sleutel- en sluitbeheer", "practical"],
  ["first_response", "Eerste optreden bij incidenten", "practical"], ["technical", "Technisch inzicht", "practical"],
].map(([key, label, category]) => ({ key, label, category }));

export default function CompetencyCatalogDialog({ open, onOpenChange, existingKeys = [], onAdd }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [customName, setCustomName] = useState("");
  const [customCategory, setCustomCategory] = useState("personal");

  const filtered = useMemo(() => COMPETENCY_CATALOG.filter(item => {
    const matchesCategory = category === "all" || item.category === category;
    const matchesQuery = item.label.toLowerCase().includes(query.toLowerCase());
    return matchesCategory && matchesQuery;
  }), [category, query]);

  const addCustom = () => {
    const label = customName.trim();
    if (!label) return;
    onAdd({ key: `custom_${Date.now()}`, label, category: customCategory, source: "custom" });
    setCustomName("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-hidden sm:max-w-3xl">
        <DialogHeader><DialogTitle>Eigenschap toevoegen</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Zoek in de catalogus..." className="pl-9" />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle categorieën</SelectItem>
              {COMPETENCY_CATEGORIES.map(item => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="max-h-[46vh] overflow-y-auto rounded-md border border-border">
          {filtered.map(item => {
            const added = existingKeys.includes(item.key);
            return (
              <div key={item.key} className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5 last:border-0">
                <div className="flex min-w-0 items-center gap-3">
                  {getSoftwareLogo(item.key) && (
                    <img src={getSoftwareLogo(item.key)} alt="" className="h-6 w-6 shrink-0 object-contain" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{COMPETENCY_CATEGORIES.find(c => c.key === item.category)?.label}</p>
                  </div>
                </div>
                <Button size="sm" variant={added ? "ghost" : "outline"} disabled={added} onClick={() => onAdd({ ...item, source: "catalog" })}>
                  {added ? "Toegevoegd" : <><Plus className="mr-1 h-3.5 w-3.5" /> Toevoegen</>}
                </Button>
              </div>
            );
          })}
          {filtered.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Geen resultaten gevonden.</p>}
        </div>
        <div className="rounded-md border border-dashed border-border p-3">
          <Label className="text-xs font-semibold text-muted-foreground">Eigen eigenschap</Label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Bijvoorbeeld: kennis van camerasystemen" />
            <Select value={customCategory} onValueChange={setCustomCategory}>
              <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>{COMPETENCY_CATEGORIES.map(item => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={addCustom} disabled={!customName.trim()}><Plus className="mr-1 h-3.5 w-3.5" /> Toevoegen</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}