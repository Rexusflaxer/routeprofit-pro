import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Box, Image, CalendarDays, User, GitBranch, AlertTriangle,
  Camera, Siren, Phone, Key, Shield, Flame, Eye, Zap,
  Bell, Lock, Smartphone, HelpCircle
} from "lucide-react";

const SENSOR_ICONS = {
  zones:           { label: "Zones",           icon: Shield,      color: "text-blue-500" },
  pir:             { label: "PIR",             icon: Eye,         color: "text-amber-500" },
  magneetcontact:  { label: "Magneetcontact",  icon: Lock,        color: "text-slate-500" },
  glasbreuk:       { label: "Glasbreuk",       icon: Zap,         color: "text-orange-500" },
  rook_brand:      { label: "Rook/Brand",      icon: Flame,       color: "text-red-500" },
  sabotage:        { label: "Sabotage",        icon: AlertTriangle, color: "text-red-600" },
  camera:          { label: "Camera",          icon: Camera,      color: "text-purple-500" },
  sirene_flitser:  { label: "Sirene/Flitser",  icon: Siren,       color: "text-yellow-500" },
  alarmcentrale:   { label: "Alarmcentrale",   icon: Bell,        color: "text-blue-600" },
  keypad:          { label: "Keypad",          icon: Smartphone,  color: "text-teal-500" },
  sleutelkluis:    { label: "Sleutelkluis",    icon: Key,         color: "text-amber-600" },
  noodknop:        { label: "Noodknop",        icon: Phone,       color: "text-red-400" },
  overig:          { label: "Overig",          icon: HelpCircle,  color: "text-slate-400" },
};

function SensorCount({ type, annotations }) {
  const config = SENSOR_ICONS[type];
  if (!config) return null;
  const items = annotations?.[type];
  const count = Array.isArray(items) ? items.length : (items ? 1 : 0);
  if (!count) return null;
  const Icon = config.icon;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <Icon className={`h-4 w-4 shrink-0 ${config.color}`} />
      <span className="text-sm font-medium text-slate-700">{config.label}</span>
      <Badge variant="secondary" className="ml-auto text-xs">{count}</Badge>
    </div>
  );
}

export default function ObjectFloorPlanTab({ objectId }) {
  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["object-floorplans", objectId],
    queryFn: () => base44.entities.ObjectFloorPlan.filter({ object_id: objectId }),
    enabled: !!objectId,
  });

  const current = plans.find(p => p.is_current && p.status === "published");

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-slate-400">Laden...</div>;
  }

  if (!current) {
    return (
      <div className="py-12 text-center text-sm text-slate-400">
        <Box className="mx-auto mb-3 h-10 w-10 text-slate-300" />
        <p>Nog geen plattegrond gepubliceerd voor dit object.</p>
        <p className="mt-1 text-xs text-slate-300">Scan het object via de iOS app met RoomPlan/LiDAR.</p>
      </div>
    );
  }

  const annotations = current.annotations_json || {};
  const sensorTypes = Object.keys(SENSOR_ICONS);
  const hasSensors = sensorTypes.some(type => {
    const items = annotations[type];
    return Array.isArray(items) ? items.length > 0 : !!items;
  });

  return (
    <div className="space-y-5">
      {/* Meta info */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Box className="h-4 w-4 text-slate-500" />
            {current.title || "Objectplattegrond"}
            <Badge className="ml-2 bg-green-100 text-green-800">Revisie {current.revision}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          {current.captured_by && (
            <div className="flex items-center gap-2 text-slate-600">
              <User className="h-4 w-4 text-slate-400" />
              <span><span className="text-slate-400">Vastgelegd door:</span> {current.captured_by}</span>
            </div>
          )}
          {current.published_at && (
            <div className="flex items-center gap-2 text-slate-600">
              <CalendarDays className="h-4 w-4 text-slate-400" />
              <span><span className="text-slate-400">Gepubliceerd:</span> {new Date(current.published_at).toLocaleDateString("nl-NL")}</span>
            </div>
          )}
          {current.source && (
            <div className="flex items-center gap-2 text-slate-600">
              <GitBranch className="h-4 w-4 text-slate-400" />
              <span><span className="text-slate-400">Bron:</span> {current.source}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2D Preview */}
      {current.preview_2d_file_url && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Image className="h-4 w-4 text-slate-500" /> 2D Plattegrond
            </CardTitle>
          </CardHeader>
          <CardContent>
            <img
              src={current.preview_2d_file_url}
              alt="2D plattegrond preview"
              className="w-full max-h-96 rounded-lg object-contain border border-slate-100 bg-slate-50"
            />
          </CardContent>
        </Card>
      )}

      {/* 3D USDZ */}
      {current.usdz_file_url && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Box className="h-4 w-4 text-slate-500" /> 3D Model (USDZ)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <a
              href={current.usdz_file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <Box className="h-5 w-5 text-blue-500" />
              USDZ bestand openen / downloaden
            </a>
            <p className="mt-2 text-xs text-slate-400">Open op een Apple-apparaat voor AR-weergave.</p>
          </CardContent>
        </Card>
      )}

      {/* Sensoren & Zones */}
      {hasSensors && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-slate-500" /> Zones &amp; Sensoren
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {sensorTypes.map(type => (
                <SensorCount key={type} type={type} annotations={annotations} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Revision history */}
      {plans.length > 1 && (
        <div className="text-xs text-slate-400 text-right">
          {plans.length} revisies aanwezig — alleen de huidige is actief.
        </div>
      )}
    </div>
  );
}