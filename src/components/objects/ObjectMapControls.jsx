import React from "react";
import { Box, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, LocateFixed, Minus, Moon, Navigation2, Plus, Sun, SunMoon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const BUTTON_CLASS = "h-9 w-9 rounded-lg text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring";
const LIGHTING_LABELS = { app: "App volgen", day: "Dag", night: "Nacht" };

function CameraDirection({ direction }) {
  const DirectionIcon = { left: ChevronLeft, right: ChevronRight, up: ChevronUp, down: ChevronDown }[direction];
  return <span aria-hidden="true" className="relative block h-6 w-7">
    <Box className="absolute left-1 top-1" style={{ width: 17, height: 17 }} strokeWidth={1.65} />
    <DirectionIcon className="absolute -right-0.5 bottom-0 rounded-sm bg-background/95" style={{ width: 12, height: 12 }} strokeWidth={2.5} />
  </span>;
}

/** Position the whole panel above map attribution; never position its buttons separately. */
export default function ObjectMapControls({
  ready = false,
  groundEditing = false,
  lightingMode = "app",
  effectiveLightPreset = "day",
  onLightingModeChange,
  onZoomIn,
  onZoomOut,
  onRotateLeft,
  onRotateRight,
  onPitchUp,
  onPitchDown,
  onResetNorth,
  onFitBounds,
  className,
}) {
  const LightingIcon = lightingMode === "app" ? SunMoon : lightingMode === "night" ? Moon : Sun;
  const lightingDescription = `${LIGHTING_LABELS[lightingMode] || LIGHTING_LABELS.app} · ${effectiveLightPreset === "night" ? "nacht" : "dag"}`;
  const pitchHelp = groundEditing
    ? "Tijdens grens aanpassen en luchtfoto blijft de kaart vlak voor nauwkeurigheid"
    : "Kijkhoek aanpassen · rechtermuisknop + omhoog/omlaag slepen werkt ook";
  const control = (label, callback, icon, title = label, disabled = !ready) => (
    <Button type="button" variant="ghost" size="icon" className={BUTTON_CLASS} aria-label={label} title={title} disabled={disabled} onClick={callback}>{icon}</Button>
  );

  return <div role="group" aria-label="Kaartbediening" className={cn("grid grid-cols-3 gap-0.5 rounded-xl border border-border/80 bg-background/95 p-1 text-foreground shadow-lg backdrop-blur-xl", className)}>
    {control("Uitzoomen", onZoomOut, <Minus aria-hidden="true" />)}
    {control("Passend tonen", onFitBounds, <LocateFixed aria-hidden="true" />, "Gebouwen en terrein passend in beeld brengen")}
    {control("Inzoomen", onZoomIn, <Plus aria-hidden="true" />)}
    {control("Kaart linksom draaien", onRotateLeft, <CameraDirection direction="left" />, "Kaart linksom draaien · rechtermuisknop + horizontaal slepen werkt ook")}
    {control("Noord boven", onResetNorth, <span aria-hidden="true" className="flex h-6 flex-col items-center justify-center"><span className="text-[9px] font-semibold leading-none">N</span><Navigation2 style={{ width: 14, height: 14 }} /></span>, "Kaart weer naar het noorden richten")}
    {control("Kaart rechtsom draaien", onRotateRight, <CameraDirection direction="right" />, "Kaart rechtsom draaien · rechtermuisknop + horizontaal slepen werkt ook")}
    {control("3D-kijkhoek verkleinen", onPitchDown, <CameraDirection direction="down" />, pitchHelp, !ready || groundEditing)}
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className={BUTTON_CLASS} aria-label="Kaartverlichting" title={`Kaartverlichting: ${lightingDescription}`} disabled={!ready}>
          <LightingIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" sideOffset={8} aria-label="Kaartverlichting kiezen">
        <DropdownMenuLabel>Kaartverlichting</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={lightingMode} onValueChange={onLightingModeChange} aria-label="Kaartverlichting">
          <DropdownMenuRadioItem value="app">App volgen</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="day">Dag</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="night">Nacht</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <p className="max-w-48 px-2 py-1.5 text-[10px] text-muted-foreground">Verandert alleen deze kaart, niet het thema van de app.</p>
      </DropdownMenuContent>
    </DropdownMenu>
    {control("3D-kijkhoek vergroten", onPitchUp, <CameraDirection direction="up" />, pitchHelp, !ready || groundEditing)}
  </div>;
}
