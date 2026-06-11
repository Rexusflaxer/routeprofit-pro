import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Edit, Plus, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

const DELETE_PASSWORD = "verwijder";

const ACCREDITATION_TEMPLATES = {
  veb_4: {
    category: "technical_certification",
    accreditation_type: "veb_4",
    name: "VEB 4 Kwaliteitsregeling",
    issuer: "Vereniging Erkende Beveiligingsbedrijven (VEB)",
  },
  veb_pbo: {
    category: "quality_mark",
    accreditation_type: "veb_pbo_kwaliteitsregeling",
    name: "VEB PBO Kwaliteitsregeling",
    issuer: "Vereniging Erkende Beveiligingsbedrijven (VEB)",
  },
  nvb_beveiliging: {
    category: "quality_mark",
    accreditation_type: "nvb_keurmerk_beveiliging",
    name: "Nederlandse Veiligheidsbranche Keurmerk Beveiliging",
    issuer: "Nederlandse Veiligheidsbranche",
  },
  nvb_evenementen: {
    category: "quality_mark",
    accreditation_type: "nvb_keurmerk_evenementenbeveiliging",
    name: "Nederlandse Veiligheidsbranche Keurmerk Evenementenbeveiliging",
    issuer: "Nederlandse Veiligheidsbranche",
  },
  nvb_horeca: {
    category: "quality_mark",
    accreditation_type: "nvb_keurmerk_horecabeveiliging",
    name: "Nederlandse Veiligheidsbranche Keurmerk Horecabeveiliging",
    issuer: "Nederlandse Veiligheidsbranche",
  },
  nvb_gwt: {
    category: "quality_mark",
    accreditation_type: "nvb_keurmerk_gwt",
    name: "Nederlandse Veiligheidsbranche Keurmerk Geld- en Waardetransport",
    issuer: "Nederlandse Veiligheidsbranche",
  },
  nvb_pob: {
    category: "quality_mark",
    accreditation_type: "nvb_keurmerk_pob",
    name: "Nederlandse Veiligheidsbranche Keurmerk Particulier Onderzoeksbureau",
    issuer: "Nederlandse Veiligheidsbranche",
  },
  vvnl_regulier: {
    category: "quality_mark",
    accreditation_type: "vvnl_kwaliteitslabel_regulier",
    name: "VVNL Kwaliteitslabel Reguliere beveiliging",
    issuer: "Vereniging Veiligheidsdomein Nederland (VVNL)",
  },
  vvnl_ehb: {
    category: "quality_mark",
    accreditation_type: "vvnl_kwaliteitslabel_ehb",
    name: "VVNL Kwaliteitslabel Evenementen-/horecabeveiliging",
    issuer: "Vereniging Veiligheidsdomein Nederland (VVNL)",
  },
  vvnl_verkeersregelaars: {
    category: "quality_mark",
    accreditation_type: "vvnl_kwaliteitslabel_verkeersregelaars",
    name: "VVNL Kwaliteitslabel Verkeersregelaars",
    issuer: "Vereniging Veiligheidsdomein Nederland (VVNL)",
  },
  bpob_keurmerk: {
    category: "quality_mark",
    accreditation_type: "bpob_keurmerk_particulier_onderzoeksbureau",
    name: "BPOB Keurmerk Particulier Onderzoeksbureau",
    issuer: "Branchevereniging Particuliere Onderzoeksbureaus (BPOB)",
  },
  techniek_kwaliteit: {
    category: "technical_certification",
    accreditation_type: "other_technical",
    name: "Techniek Nederland kwaliteitsbewijs beveiligingsinstallatie",
    issuer: "Techniek Nederland",
  },
  nvb_bhv_opleider: {
    category: "quality_mark",
    accreditation_type: "nvb_bhv_opleidingsinstituut",
    name: "NVB-BHV Opleidingsinstituut / instructeursregistratie",
    issuer: "Nederlandse Vereniging Bedrijfshulpverlening (NVB-BHV)",
  },
};

const ASSOCIATION_OPTIONS = [
  {
    key: "nederlandse_veiligheidsbranche",
    label: "Nederlandse Veiligheidsbranche",
    shortLabel: "NVB",
    desc: "Particuliere beveiliging, EHB, GWT, PAC en POB",
    logoUrl: "https://d1p3jfjj2ztqji.cloudfront.net/wp-content/uploads/2019/12/06115338/logo-nvb-300x136.jpg",
    defaultPublicProfileUrl: "https://www.veiligheidsbranche.nl/over-ons/leden/",
    membershipTypes: [
      {
        key: "mkb",
        label: "MKB - particuliere beveiliging",
        desc: "Object-, mobiele en reguliere particuliere beveiliging.",
        actions: [ACCREDITATION_TEMPLATES.nvb_beveiliging],
      },
      {
        key: "ehb",
        label: "EHB - evenementen en horeca",
        desc: "Evenementenbeveiliging en horecabeveiliging.",
        actions: [ACCREDITATION_TEMPLATES.nvb_evenementen, ACCREDITATION_TEMPLATES.nvb_horeca],
      },
      {
        key: "gwt",
        label: "GWT - geld- en waardetransport",
        desc: "Geld- en waardetransportbedrijven.",
        actions: [ACCREDITATION_TEMPLATES.nvb_gwt],
      },
      {
        key: "pac",
        label: "PAC - particuliere alarmcentrales",
        desc: "Particuliere alarmcentrales.",
        actions: [],
      },
      {
        key: "pob",
        label: "POB - particulier onderzoeksbureau",
        desc: "Particuliere onderzoeksbureaus.",
        actions: [ACCREDITATION_TEMPLATES.nvb_pob],
      },
    ],
  },
  {
    key: "vereniging_veiligheidsdomein_nederland",
    label: "Vereniging Veiligheidsdomein Nederland (VVNL)",
    shortLabel: "VVNL",
    desc: "Reguliere beveiliging, horeca/evenementen, verkeersregelaars, brandwachten en BHV",
    logoUrl: "https://veiligheidsdomein.nl/wp-content/uploads/2022/07/VVNL_Logo_Blauw_L-300x162.png",
    defaultPublicProfileUrl: "https://veiligheidsdomein.nl/",
    membershipTypes: [
      {
        key: "reguliere_beveiliging",
        label: "Reguliere beveiliging",
        desc: "Reguliere particuliere beveiligingsdiensten.",
        actions: [ACCREDITATION_TEMPLATES.vvnl_regulier],
      },
      {
        key: "evenementen_horeca",
        label: "Evenementen-/horecabeveiliging",
        desc: "Crowdmanagement, evenementen en horeca.",
        actions: [ACCREDITATION_TEMPLATES.vvnl_ehb],
      },
      {
        key: "verkeersregelaars",
        label: "Verkeersregelaars",
        desc: "Verkeersregelaarsbedrijven binnen het veiligheidsdomein.",
        actions: [ACCREDITATION_TEMPLATES.vvnl_verkeersregelaars],
      },
      {
        key: "brandwachten_bhv",
        label: "Brandwachten en BHV",
        desc: "Brandwachten, basishulpverlening en aanverwante veiligheidsdiensten.",
        actions: [],
      },
    ],
  },
  {
    key: "veb",
    label: "Vereniging Erkende Beveiligingsbedrijven (VEB)",
    shortLabel: "VEB",
    desc: "Technische beveiligingsbedrijven en particuliere beveiligingsorganisaties",
    logoUrl: "https://veb.nl/wp-content/uploads/2024/10/VEB-Logo.png",
    defaultPublicProfileUrl: "https://veb.nl/",
    membershipTypes: [
      {
        key: "techniek",
        label: "Techniek",
        desc: "Technische beveiligingsbedrijven en installateurs.",
        actions: [ACCREDITATION_TEMPLATES.veb_4],
      },
      {
        key: "pbo",
        label: "PBO",
        desc: "Particuliere beveiligingsorganisaties.",
        actions: [ACCREDITATION_TEMPLATES.veb_pbo],
      },
    ],
  },
  {
    key: "bpob",
    label: "Branchevereniging Particuliere Onderzoeksbureaus (BPOB)",
    shortLabel: "BPOB",
    desc: "Particuliere onderzoeksbureaus en recherchewerkzaamheden",
    logoUrl: "https://media.base44.com/images/public/698e307ed3aa4cab3729bbf1/695cde5fc_BPOB_afkorting_Kleur_versie_1.png",
    defaultPublicProfileUrl: "https://bpob.nl/",
    membershipTypes: [
      {
        key: "particulier_onderzoeksbureau",
        label: "Particulier onderzoeksbureau",
        desc: "Recherchewerkzaamheden met POB-vergunning.",
        actions: [ACCREDITATION_TEMPLATES.bpob_keurmerk],
      },
    ],
  },
  {
    key: "techniek_nederland",
    label: "Techniek Nederland",
    shortLabel: "TN",
    desc: "Brand- en beveiligingstechniek en technische installatiebedrijven",
    logoUrl: "https://www.technieknederland.nl/media/quvnnxsy/logo-techniek-nederland.svg",
    defaultPublicProfileUrl: "https://www.technieknederland.nl/ledenzoek-resultaat",
    membershipTypes: [
      {
        key: "brand_en_beveiligingstechniek",
        label: "Brand- en beveiligingstechniek",
        desc: "Technische installaties met aantoonbare certificering of erkenning.",
        actions: [ACCREDITATION_TEMPLATES.techniek_kwaliteit],
      },
    ],
  },
  {
    key: "nvb_bhv",
    label: "Nederlandse Vereniging Bedrijfshulpverlening (NVB-BHV)",
    shortLabel: "BHV",
    desc: "BHV-organisaties, BHV-opleiders en BHV-instructeurs",
    logoUrl: "https://nvb-bhv.nl/wp-content/themes/nvb/img/nvb_logo.svg",
    defaultPublicProfileUrl: "https://nvb-bhv.nl/",
    membershipTypes: [
      {
        key: "bedrijf_instelling",
        label: "Bedrijf / instelling",
        desc: "Organisatie met eigen BHV-inrichting.",
        actions: [],
      },
      {
        key: "vol_lid",
        label: "VOL-lid",
        desc: "Volwaardig lidmaatschap binnen NVB-BHV.",
        actions: [],
      },
      {
        key: "zzp_lid",
        label: "ZZP-lid",
        desc: "Zelfstandig BHV-professional of instructeur.",
        actions: [],
      },
      {
        key: "opleidingsinstituut_instructeur",
        label: "Opleidingsinstituut / instructeur",
        desc: "BHV-opleiding, instructeur of opleidingsorganisatie.",
        actions: [ACCREDITATION_TEMPLATES.nvb_bhv_opleider],
      },
    ],
  },
  {
    key: "other",
    label: "Andere branchevereniging",
    shortLabel: "Anders",
    desc: "Gebruik dit voor een eigen vereniging of niche-brancheorganisatie",
    membershipTypes: [],
  },
];

const EMPTY_FORM = {
  association_type: "",
  association_name: "",
  membership_number: "",
  membership_types: [],
  membership_type: "",
  member_since: "",
  status: "active",
  public_profile_url: "",
};

function associationLabel(value) {
  return ASSOCIATION_OPTIONS.find(option => option.key === value)?.label || value || "Branchevereniging";
}

function associationMeta(value) {
  return ASSOCIATION_OPTIONS.find(option => option.key === value) || {
    key: value || "other",
    label: value || "Branchevereniging",
    shortLabel: "Org",
    desc: "",
    membershipTypes: [],
  };
}

function effectiveAssociationName(membership) {
  return membership.association_name || associationLabel(membership.association_type);
}

function AssociationLogo({ associationType, className = "" }) {
  const [failed, setFailed] = useState(false);
  const association = associationMeta(associationType);
  const fallback = association.shortLabel || association.label?.slice(0, 3) || "Org";

  if (!association.logoUrl || failed) {
    return (
      <div className={`flex items-center justify-center rounded-md border border-border bg-muted text-[10px] font-semibold text-muted-foreground ${className}`}>
        {fallback}
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center rounded-md border border-border bg-white p-1 ${className}`}>
      <img
        src={association.logoUrl}
        alt={`${association.label} logo`}
        className="max-h-full max-w-full object-contain"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function WizardSteps({ step }) {
  const steps = ["Vereniging", "Gegevens", "Erkenningen"];
  const CheckIcon = () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
  return (
    <div className="flex items-center gap-1 mb-4">
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full transition-colors ${
            i + 1 === step ? "bg-primary text-primary-foreground" :
            i + 1 < step ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" :
            "text-muted-foreground"}`}>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
              i + 1 === step ? "bg-primary-foreground text-primary" :
              i + 1 < step ? "text-green-700 dark:text-green-300" :
              "border border-muted-foreground/30 text-muted-foreground"}`}>
              {i + 1 < step ? <CheckIcon /> : i + 1}
            </span>
            {s}
          </div>
          {i < steps.length - 1 && <div className={`h-px flex-1 ${i + 1 < step ? "bg-green-200 dark:bg-green-900" : "bg-border"}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}

function DeleteConfirmBar({ label, onConfirm, onCancel, isPending }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleConfirm = () => {
    if (password !== DELETE_PASSWORD) {
      setError(`Typ "${DELETE_PASSWORD}" om te bevestigen`);
      return;
    }
    onConfirm();
  };

  return (
    <div className="border-b border-destructive/20 bg-destructive/5 p-4">
      <div className="flex items-start gap-3 mb-3">
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-foreground">Branchevereniging verwijderen?</p>
          <p className="text-xs text-muted-foreground mt-0.5"><strong>{label}</strong> wordt verwijderd.</p>
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground block">Typ <strong className="text-foreground font-mono">{DELETE_PASSWORD}</strong> om te bevestigen:</label>
        <div className="flex gap-2">
          <Input value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} placeholder={DELETE_PASSWORD} className={`h-8 text-sm font-mono max-w-[200px] ${error ? "border-destructive" : ""}`} onKeyDown={(event) => event.key === "Enter" && handleConfirm()} autoFocus />
          <Button variant="destructive" size="sm" onClick={handleConfirm} disabled={isPending}><Trash2 className="w-3.5 h-3.5 mr-1" />{isPending ? "Verwijderen..." : "Verwijderen"}</Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>Annuleren</Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}

function getMembershipTypeOptions(associationType) {
  return associationMeta(associationType).membershipTypes || [];
}

function getSelectedMembershipTypeOptions(associationType, membershipTypes = []) {
  const options = getMembershipTypeOptions(associationType);
  const byKey = new Map(options.map(option => [option.key, option]));
  return (membershipTypes || []).map(typeKey => byKey.get(typeKey) || { key: typeKey, label: typeKey, desc: "", actions: [] });
}

function getMembershipTypeLabels(membership) {
  const typeKeys = Array.isArray(membership.membership_types) ? membership.membership_types : [];
  if (typeKeys.length > 0) {
    return getSelectedMembershipTypeOptions(membership.association_type, typeKeys).map(option => option.label);
  }
  if (membership.membership_type) {
    return membership.membership_type.split(",").map(label => label.trim()).filter(Boolean);
  }
  return [];
}

function uniqueAccreditationActions(actions) {
  const byType = new Map();
  actions.forEach(action => {
    const key = `${action.category}:${action.accreditation_type}`;
    if (!byType.has(key)) byType.set(key, action);
  });
  return [...byType.values()];
}

function getAccreditationActionsForSelection(associationType, membershipTypes = []) {
  const selectedTypes = getSelectedMembershipTypeOptions(associationType, membershipTypes);
  return uniqueAccreditationActions(selectedTypes.flatMap(type => (
    type.actions || []
  ).map(action => ({
    ...action,
    source_membership_type: type.key,
    source_membership_label: type.label,
  }))));
}

function actionKey(action) {
  return `${action.category}:${action.accreditation_type}`;
}

export default function BranchMembershipsTab({ companyId }) {
  const queryClient = useQueryClient();
  const wizardRef = useRef(null);
  const [showWizard, setShowWizard] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [deleteId, setDeleteId] = useState(null);

  useEffect(() => {
    if (!showWizard) return undefined;
    const timer = setTimeout(() => wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
    return () => clearTimeout(timer);
  }, [step, showWizard]);

  const { data: memberships = [] } = useQuery({
    queryKey: ["company-branch-memberships", companyId],
    queryFn: () => base44.entities.CompanyBranchMembership.filter({ company_id: companyId }, "-created_date"),
    enabled: !!companyId,
  });

  const { data: accreditations = [] } = useQuery({
    queryKey: ["company-accreditations", companyId],
    queryFn: () => base44.entities.CompanyAccreditation.filter({ company_id: companyId }, "-created_date"),
    enabled: !!companyId,
  });

  const existingAccreditationKeys = useMemo(() => new Set(
    accreditations
      .filter(item => item.status !== "superseded" && item.status !== "archived")
      .map(item => item.category && item.accreditation_type ? `${item.category}:${item.accreditation_type}` : null)
      .filter(Boolean)
  ), [accreditations]);

  const membershipTypeOptions = getMembershipTypeOptions(form.association_type);
  const selectedMembershipTypeOptions = getSelectedMembershipTypeOptions(form.association_type, form.membership_types);
  const accreditationActions = getAccreditationActionsForSelection(form.association_type, form.membership_types);

  const createMissingAccreditationActions = async (data) => {
    const actions = getAccreditationActionsForSelection(data.association_type, data.membership_types);
    const currentKeys = new Set(
      accreditations
        .filter(item => item.status !== "superseded" && item.status !== "archived")
        .map(item => item.category && item.accreditation_type ? `${item.category}:${item.accreditation_type}` : null)
        .filter(Boolean)
    );
    const missingActions = actions.filter(action => !currentKeys.has(actionKey(action)));
    await Promise.all(missingActions.map(action => base44.entities.CompanyAccreditation.create({
      company_id: companyId,
      category: action.category,
      accreditation_type: action.accreditation_type,
      name: action.name,
      issuer: action.issuer,
      certificate_number: null,
      valid_from: null,
      valid_until: null,
      status: "pending_review",
      notes: `Aangemaakt vanuit branchevereniging ${associationLabel(data.association_type)} (${action.source_membership_label}). Vul nummer, geldigheid en bewijsstuk aan.`,
    })));
  };

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const association = associationMeta(data.association_type);
      const selectedTypeLabels = getSelectedMembershipTypeOptions(data.association_type, data.membership_types).map(option => option.label);
      const payload = {
        company_id: companyId,
        association_type: data.association_type,
        association_name: data.association_name?.trim() || associationLabel(data.association_type),
        membership_number: data.membership_number.trim(),
        membership_types: data.membership_types || [],
        membership_type: selectedTypeLabels.join(", ") || null,
        member_since: data.member_since,
        valid_until: null,
        status: data.status || "active",
        public_profile_url: data.public_profile_url || association.defaultPublicProfileUrl || null,
        notes: null,
      };
      const saved = editingId
        ? await base44.entities.CompanyBranchMembership.update(editingId, payload)
        : await base44.entities.CompanyBranchMembership.create(payload);
      await createMissingAccreditationActions(data);
      return saved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-branch-memberships", companyId] });
      queryClient.invalidateQueries({ queryKey: ["company-accreditations", companyId] });
      cancelWizard();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CompanyBranchMembership.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-branch-memberships", companyId] });
      setDeleteId(null);
    },
  });

  const setField = (field, value) => setForm(current => ({ ...current, [field]: value }));

  const selectAssociation = (association) => {
    setForm({
      ...EMPTY_FORM,
      association_type: association.key,
      association_name: association.key === "other" ? "" : association.label,
      public_profile_url: association.defaultPublicProfileUrl || "",
    });
    setErrors({});
    setStep(2);
  };

  const toggleMembershipType = (typeKey) => {
    setForm(current => {
      const selected = new Set(current.membership_types || []);
      if (selected.has(typeKey)) {
        selected.delete(typeKey);
      } else {
        selected.add(typeKey);
      }
      return { ...current, membership_types: [...selected] };
    });
    setErrors(current => ({ ...current, membership_types: undefined }));
  };

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setStep(1);
    setShowWizard(true);
  };

  const openEdit = (membership) => {
    setEditingId(membership.id);
    setForm({
      association_type: membership.association_type || "other",
      association_name: membership.association_name || associationLabel(membership.association_type),
      membership_number: membership.membership_number || "",
      membership_types: Array.isArray(membership.membership_types) ? membership.membership_types : [],
      membership_type: membership.membership_type || "",
      member_since: membership.member_since || "",
      status: membership.status || "active",
      public_profile_url: membership.public_profile_url || "",
    });
    setErrors({});
    setStep(2);
    setShowWizard(true);
  };

  const cancelWizard = () => {
    setShowWizard(false);
    setEditingId(null);
    setStep(1);
    setForm(EMPTY_FORM);
    setErrors({});
  };

  const validateStep2 = () => {
    const nextErrors = {};
    if (!form.association_type) nextErrors.association_type = "Kies een branchevereniging.";
    if (!form.association_name?.trim()) nextErrors.association_name = "Naam is verplicht.";
    if (!form.membership_number?.trim()) nextErrors.membership_number = "Lidnummer is verplicht.";
    if (!form.member_since) nextErrors.member_since = "Lid sinds is verplicht.";
    if (membershipTypeOptions.length > 0 && !form.membership_types?.length) {
      nextErrors.membership_types = "Kies minimaal 1 categorie.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const membershipToDelete = memberships.find(membership => membership.id === deleteId);

  return (
    <div className="flex flex-col h-full">
      <AnimatePresence>
        {deleteId && membershipToDelete && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
            <DeleteConfirmBar
              label={effectiveAssociationName(membershipToDelete)}
              onConfirm={() => deleteMutation.mutate(deleteId)}
              onCancel={() => setDeleteId(null)}
              isPending={deleteMutation.isPending}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showWizard && (
          <motion.div
            ref={wizardRef}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="border-b border-primary/30 bg-muted/20 p-5"
          >
            {editingId && <p className="text-xs font-semibold text-primary mb-3 uppercase tracking-wider">Branchevereniging bewerken</p>}
            {!editingId && <p className="text-xs font-semibold text-primary mb-3 uppercase tracking-wider">Nieuwe branchevereniging</p>}
            <WizardSteps step={step} />
            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease: "easeOut" }}>
                {step === 1 && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-foreground">Kies de branchevereniging</p>
                    <div className="grid grid-cols-1 gap-2">
                      {ASSOCIATION_OPTIONS.map(association => (
                        <button
                          key={association.key}
                          type="button"
                          onClick={() => selectAssociation(association)}
                          className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99] ${
                            form.association_type === association.key ? "border-primary bg-accent" : "border-border bg-card"
                          }`}
                        >
                          <AssociationLogo associationType={association.key} className="mr-3 h-12 w-20 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-semibold text-foreground">{association.label}</span>
                            <span className="block text-xs text-muted-foreground mt-0.5">{association.desc}</span>
                          </div>
                          <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                    {errors.association_type && <p className="text-xs text-destructive">{errors.association_type}</p>}
                    <div className="flex justify-end pt-1">
                      <Button variant="outline" size="sm" onClick={cancelWizard}>Annuleren</Button>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-4">
                    <p className="text-sm font-medium text-foreground">
                      Lidmaatschapsgegevens <span className="text-muted-foreground font-normal">- {form.association_name || associationLabel(form.association_type)}</span>
                    </p>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                      {form.association_type === "other" && (
                        <div className="space-y-1 lg:col-span-2">
                          <Label>Naam branchevereniging</Label>
                          <Input
                            className={`h-8 ${errors.association_name ? "border-destructive" : ""}`}
                            value={form.association_name}
                            onChange={event => { setField("association_name", event.target.value); setErrors(current => ({ ...current, association_name: undefined })); }}
                            placeholder="Naam van de branchevereniging"
                          />
                          {errors.association_name && <p className="text-xs text-destructive">{errors.association_name}</p>}
                        </div>
                      )}
                      <div className="space-y-1">
                        <Label>Lidnummer</Label>
                        <Input
                          className={`h-8 ${errors.membership_number ? "border-destructive" : ""}`}
                          value={form.membership_number}
                          onChange={event => { setField("membership_number", event.target.value); setErrors(current => ({ ...current, membership_number: undefined })); }}
                          placeholder="Verplicht"
                        />
                        {errors.membership_number && <p className="text-xs text-destructive">{errors.membership_number}</p>}
                      </div>
                      <div className="space-y-1">
                        <Label>Lid sinds</Label>
                        <Input
                          className={`h-8 ${errors.member_since ? "border-destructive" : ""}`}
                          type="date"
                          value={form.member_since}
                          onChange={event => { setField("member_since", event.target.value); setErrors(current => ({ ...current, member_since: undefined })); }}
                        />
                        {errors.member_since && <p className="text-xs text-destructive">{errors.member_since}</p>}
                      </div>
                      {membershipTypeOptions.length > 0 && (
                        <div className="space-y-2 lg:col-span-4">
                          <Label>Categorie / sectie</Label>
                          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                            {membershipTypeOptions.map(type => {
                              const selected = form.membership_types?.includes(type.key);
                              return (
                                <button
                                  key={type.key}
                                  type="button"
                                  onClick={() => toggleMembershipType(type.key)}
                                  className={`flex min-h-[74px] items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${
                                    selected ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/60"
                                  }`}
                                >
                                  <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                    selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
                                  }`}>
                                    {selected && <Check className="h-3 w-3" />}
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block text-sm font-medium text-foreground">{type.label}</span>
                                    <span className="mt-0.5 block text-xs text-muted-foreground">{type.desc}</span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          {errors.membership_types && <p className="text-xs text-destructive">{errors.membership_types}</p>}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-between pt-1">
                      {editingId ? (
                        <Button variant="outline" size="sm" onClick={cancelWizard}>Annuleren</Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => { setStep(1); setErrors({}); }}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
                      )}
                      <Button size="sm" onClick={() => { if (validateStep2()) setStep(3); }}>Volgende <ChevronRight className="w-4 h-4 ml-1" /></Button>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-border bg-card p-4 text-sm">
                      <div className="flex items-center gap-3">
                        <AssociationLogo associationType={form.association_type} className="h-12 w-20 shrink-0" />
                        <div className="min-w-0">
                          <span className="text-muted-foreground block mb-1">Branchevereniging</span>
                          <span className="font-medium text-foreground">{form.association_name || associationLabel(form.association_type)}</span>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {[form.membership_number && `Lidnummer ${form.membership_number}`, form.member_since && `Lid sinds ${form.member_since}`].filter(Boolean).join(" - ")}
                          </p>
                          {selectedMembershipTypeOptions.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {selectedMembershipTypeOptions.map(type => (
                                <Badge key={type.key} variant="secondary" className="text-xs normal-case">{type.label}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Erkenningen die worden klaargezet</p>
                      {accreditationActions.length === 0 ? (
                        <div className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
                          Voor deze categorie staat geen vaste erkenningsactie klaar. Eventuele certificaten kunnen handmatig onder Erkenningen worden toegevoegd.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                          {accreditationActions.map(action => {
                            const alreadyExists = existingAccreditationKeys.has(actionKey(action));
                            return (
                              <div key={actionKey(action)} className="rounded-lg border border-border bg-card p-3">
                                <div className="mb-1 flex items-start justify-between gap-2">
                                  <p className="text-sm font-medium text-foreground">{action.name}</p>
                                  <Badge variant={alreadyExists ? "secondary" : "outline"} className="shrink-0 text-xs">
                                    {alreadyExists ? "Bestaat al" : "Actie nodig"}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">{action.issuer}</p>
                                <p className="mt-1 text-xs text-muted-foreground">Uit categorie: {action.source_membership_label}</p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between pt-1">
                      <Button variant="ghost" size="sm" onClick={() => setStep(2)}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={cancelWizard}>Annuleren</Button>
                        <Button size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
                          <Check className="w-4 h-4 mr-1" /> {saveMutation.isPending ? "Opslaan..." : (editingId ? "Wijzigingen opslaan" : "Lidmaatschap opslaan")}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center px-4 py-2 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="flex-1 min-w-0">Branchevereniging</span>
        <span className="w-36 shrink-0">Lidnummer</span>
        <span className="w-36 shrink-0">Lid sinds</span>
        <span className="w-80 shrink-0">Categorieen</span>
        <div className="w-24 shrink-0 flex justify-end">
          {!showWizard && !deleteId && (
            <Button size="sm" variant="outline" onClick={openNew} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
              <Plus className="w-3 h-3 mr-1" /> Nieuwe vereniging
            </Button>
          )}
        </div>
      </div>

      {memberships.length === 0 && !showWizard && (
        <p className="px-4 py-3 text-sm text-muted-foreground">Nog geen branchevereniging geregistreerd.</p>
      )}

      <div className="divide-y divide-border">
        {memberships.map(membership => {
          const membershipTypeLabels = getMembershipTypeLabels(membership);
          return (
            <div key={membership.id} className="flex items-center px-4 py-3 group hover:bg-accent/30 transition-colors">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <AssociationLogo associationType={membership.association_type} className="h-10 w-16 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{effectiveAssociationName(membership)}</p>
                  <p className="truncate text-xs text-muted-foreground">{associationLabel(membership.association_type)}</p>
                </div>
              </div>
              <div className="w-36 shrink-0 text-sm text-muted-foreground">{membership.membership_number || "-"}</div>
              <div className="w-36 shrink-0 text-sm text-muted-foreground">{membership.member_since || "-"}</div>
              <div className="w-80 shrink-0">
                {membershipTypeLabels.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {membershipTypeLabels.map(label => <Badge key={label} variant="secondary" className="text-xs normal-case">{label}</Badge>)}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Geen categorie</span>
                )}
              </div>
              <div className="flex w-24 shrink-0 justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(membership)} title="Bewerken"><Edit className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteId(membership.id)} title="Verwijderen"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
