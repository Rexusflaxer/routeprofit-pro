import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronDown, Folder, Pencil, Trash2 } from "lucide-react";
import RouteAnalysisCard from "./RouteAnalysisCard";
import { Badge } from "@/components/ui/badge";

const COLORS = {
  slate: "bg-slate-500",
  blue: "bg-blue-500",
  green: "bg-green-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
};

export default function RouteFolderView({ routes, folders, vehicles, costSettings, onEdit, onDelete }) {
  const [expandedFolders, setExpandedFolders] = useState(new Set());

  const groupedRoutes = useMemo(() => {
    const grouped = {};
    
    folders.forEach(folder => {
      grouped[folder.id] = {
        folder,
        routes: routes.filter(r => r.folder_id === folder.id)
      };
    });
    
    // Routes zonder folder
    const orphanRoutes = routes.filter(r => !r.folder_id || !folders.find(f => f.id === r.folder_id));
    if (orphanRoutes.length > 0) {
      grouped["_orphan"] = {
        folder: { id: "_orphan", name: "Geen map", color: "slate" },
        routes: orphanRoutes
      };
    }
    
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
            
            {isExpanded && data.routes.length > 0 && (
              <CardContent className="pt-0 pb-4 px-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 ml-8">
                  {data.routes.map(route => (
                    <div key={route.id} className="relative group">
                      <RouteAnalysisCard route={route} vehicles={vehicles} costSettings={costSettings} />
                      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <Button variant="outline" size="icon" className="h-7 w-7 bg-white" onClick={() => onEdit(route)}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-7 w-7 bg-white text-red-500 hover:text-red-700" onClick={() => onDelete(route.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}