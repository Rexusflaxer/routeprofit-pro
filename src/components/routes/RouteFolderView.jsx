import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronDown, Folder, Pencil, Trash2, MapPin, Clock, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { createPageUrl } from "../../utils";

const COLORS = {
  slate: "bg-slate-500",
  blue: "bg-blue-500",
  green: "bg-green-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
};

const WEEKDAYS = [
  { value: 1, label: "Ma" },
  { value: 2, label: "Di" },
  { value: 3, label: "Wo" },
  { value: 4, label: "Do" },
  { value: 5, label: "Vr" },
  { value: 6, label: "Za" },
  { value: 7, label: "Zo" },
];

export default function RouteFolderView({ routes, folders, vehicles, onEdit, onDelete, onAddRoute }) {
  const [expandedFolders, setExpandedFolders] = useState(new Set(folders.map(f => f.id)));

  const groupedRoutes = useMemo(() => {
    const grouped = {};
    
    // Toon alle folders, ook als er geen routes in zitten
    folders.forEach(folder => {
      grouped[folder.id] = {
        folder,
        routes: routes.filter(r => r.folder_id === folder.id)
      };
    });
    
    return grouped;
  }, [routes, folders]);

  const toggleFolder = (folderId) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

  return (
    <>
      <div className="space-y-3">
        {Object.entries(groupedRoutes).map(([folderId, data]) => {
        const isExpanded = expandedFolders.has(folderId);
        const colorClass = COLORS[data.folder.color] || COLORS.slate;
        
        return (
          <Card key={folderId} className="border-slate-200">
            <div
              className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() => toggleFolder(folderId)}
            >
              {isExpanded ? (
                <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0" />
              )}
              <div className={`w-4 h-4 rounded ${colorClass} flex-shrink-0`} />
              <Folder className="w-5 h-5 text-slate-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-slate-900">{data.folder.name}</h3>
                {data.folder.description && (
                  <p className="text-xs text-slate-500 mt-0.5">{data.folder.description}</p>
                )}
              </div>
              <Badge variant="secondary" className="text-xs">
                {data.routes.length} {data.routes.length === 1 ? "route" : "routes"}
              </Badge>
            </div>
            
            {isExpanded && (
              <CardContent className="pt-0 pb-4 px-4">
                <div className="grid grid-cols-7 gap-2 ml-8">
                  {WEEKDAYS.map(day => {
                    const dayRoutes = data.routes.filter(r => r.weekdays?.includes(day.value));
                    
                    return (
                      <div key={day.value} className="flex flex-col">
                        <div className="text-xs font-semibold text-slate-500 mb-2 text-center">
                          {day.label}
                        </div>
                        {dayRoutes.length > 0 ? (
                          <div className="space-y-2">
                            {dayRoutes.map(dayRoute => (
                              <Link 
                                key={dayRoute.id}
                                to={createPageUrl(`RouteDetails?id=${dayRoute.id}`)}
                                className="flex flex-col p-3 bg-slate-50 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors group min-h-[100px]"
                              >
                                <div className="flex-1">
                                  <div className="space-y-1">
                                    <span className="text-xs font-semibold text-slate-700 truncate">{dayRoute.name}</span>
                                    <span className="text-xs text-slate-500 flex items-center gap-1">
                                      <MapPin className="w-3 h-3" />
                                      {dayRoute.assigned_tasks?.length || 0}
                                    </span>
                                    <span className="text-xs text-slate-500 flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {dayRoute.time_window_start?.slice(0,5)}-{dayRoute.time_window_end?.slice(0,5)}
                                    </span>
                                  </div>
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 mt-2 justify-end">
                                  <Button 
                                    variant="outline" 
                                    size="icon" 
                                    className="h-6 w-6" 
                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); onEdit(dayRoute); }}
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                  <Button 
                                    variant="outline" 
                                    size="icon" 
                                    className="h-6 w-6 text-red-500 hover:text-red-700" 
                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); onDelete(dayRoute.id); }}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <button
                            onClick={() => onAddRoute(data.folder.id, day.value)}
                            className="flex flex-col items-center justify-center p-3 bg-slate-50 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors border-2 border-dashed border-slate-200 hover:border-slate-300 min-h-[100px]"
                          >
                            <Plus className="w-5 h-5 text-slate-400 mb-1" />
                            <span className="text-xs text-slate-400">Toevoegen</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
      </div>
    </>
  );
}