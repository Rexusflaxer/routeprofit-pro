import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronLeft, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import TeamhubStep2Location from "./teamhub-wizard/Step2Location";
import TeamhubStep3Services from "./teamhub-wizard/Step3Services";
import TeamhubStep4Regions from "./teamhub-wizard/Step4Regions";

const STEPS = [
  { id: 1, label: "Vestiging" },
  { id: 2, label: "Diensten" },
  { id: 3, label: "Regio's" },
];

export default function TeamhubWizard({
  form,
  set,
  save,
  isSaving,
  selectableTeamhubLocations,
  selectableTeamhubLocationIds,
  effectiveWpbrLicenseType,
  qualifiedServiceTypes,
  technicalCertificationTypes,
  qualificationDataLoading,
  teamhubReferencesLoading,
  hasActiveWpbrLicense,
  hasSelectableTeamhubLocations,
  hasValidPublicLocation,
  hasSelectedTeamhubServices,
  company,
}) {
  const [step, setStep] = useState(1);
  const isFirstStep = step === 1;
  const isLastStep = step === STEPS.length;
  const locationStepComplete = hasActiveWpbrLicense && hasSelectableTeamhubLocations && hasValidPublicLocation;
  const servicesStepComplete = locationStepComplete && hasSelectedTeamhubServices;

  const canContinue = useMemo(() => {
    if (step === 1) return locationStepComplete;
    if (step === 2) return servicesStepComplete;
    if (step === 3) return servicesStepComplete;
    return false;
  }, [step, locationStepComplete, servicesStepComplete]);

  const canOpenStep = (targetStep) => {
    if (targetStep === 1) return true;
    if (targetStep === 2) return locationStepComplete;
    if (targetStep === 3) return servicesStepComplete;
    return false;
  };

  const handleNext = () => {
    if (!canContinue) return;
    if (isLastStep) {
      save();
    } else {
      setStep(step + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirstStep) setStep(step - 1);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Progress bar */}
      <div className="flex gap-2">
        {STEPS.map((s, idx) => (
          <div key={s.id} className="flex items-center gap-2">
            <button
              onClick={() => canOpenStep(s.id) && setStep(s.id)}
              disabled={!canOpenStep(s.id)}
              className={`flex h-10 w-10 items-center justify-center rounded-md text-sm font-medium transition-colors ${
                step === s.id
                  ? "bg-primary text-primary-foreground"
                  : step > s.id
                  ? "bg-green-500/20 text-green-700 dark:text-green-200"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {step > s.id ? <Check className="h-4 w-4" /> : s.id}
            </button>
            {idx < STEPS.length - 1 && (
              <div className={`h-0.5 w-12 transition-colors ${step > s.id ? "bg-green-500" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="min-h-[400px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {step === 1 && (
              <TeamhubStep2Location
                form={form}
                set={set}
                selectableTeamhubLocations={selectableTeamhubLocations}
                hasActiveWpbrLicense={hasActiveWpbrLicense}
                hasSelectableTeamhubLocations={hasSelectableTeamhubLocations}
              />
            )}
            {step === 2 && (
              <TeamhubStep3Services
                form={form}
                set={set}
                effectiveWpbrLicenseType={effectiveWpbrLicenseType}
                qualifiedServiceTypes={qualifiedServiceTypes}
                technicalCertificationTypes={technicalCertificationTypes}
                qualificationDataLoading={qualificationDataLoading}
                hasActiveWpbrLicense={hasActiveWpbrLicense}
                hasSelectedTeamhubServices={hasSelectedTeamhubServices}
              />
            )}
            {step === 3 && <TeamhubStep4Regions form={form} set={set} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={handlePrev}
          disabled={isFirstStep}
          className="gap-2"
        >
          <ChevronLeft className="h-4 w-4" />
          Terug
        </Button>

        <div className="flex gap-2">
          {STEPS.map((s) => (
            <Badge
              key={s.id}
              variant={step === s.id ? "default" : "secondary"}
              className="text-xs"
            >
              {s.label}
            </Badge>
          ))}
        </div>

        <Button
          onClick={handleNext}
          disabled={!canContinue || isSaving || teamhubReferencesLoading}
          className="gap-2"
        >
          {isSaving || teamhubReferencesLoading ? (
            <>Laden...</>
          ) : isLastStep ? (
            <>
              <Check className="h-4 w-4" />
              Opslaan
            </>
          ) : (
            <>
              Volgende
              <ChevronRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
