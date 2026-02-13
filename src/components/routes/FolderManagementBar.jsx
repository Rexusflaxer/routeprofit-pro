import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FolderPlus, Trash2, Pencil, X, Save } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const COLORS = [
  { value: "slate", label: "Grijs", class: "bg-slate-500" },
  { value: "blue", label: "Blauw", class: "bg-blue-500" },
  { value: "green", label: "Groen", class: "bg-green-500" },
  { value: "amber", label: "Oranje", class: "bg-amber-500" },
  { value: "red", label: "Rood", class: "bg-red-500" },
  { value: "purple", label: "Paars", class: "bg-purple-500" },
  { value: "pink", label: "Roze", class: "bg-pink-500" },
];

export default function FolderManagementBar({ folders }) {
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", description: "", color: "slate" });
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.RouteFolder.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.RouteFolder.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.RouteFolder.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["folders"] }),
  });

  const resetForm = () => {
    setForm({ name: "", description: "", color: "slate" });
    setShowDialog(false);
    setEditing(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleEdit = (folder) => {
    setEditing(folder);
    setForm({ name: folder.name, description: folder.description || "", color: folder.color || "slate" });
    setShowDialog(true);
  };

  return (
    <>
      <Button size="sm" onClick={() => setShowDialog(true)} variant="outline">
        <FolderPlus className="w-4 h-4 mr-1" />
        Nieuwe map
      </Button>

      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Map bewerken" : "Nieuwe map aanmaken"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Naam *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Bijv. Dagdienst"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Beschrijving</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optionele beschrijving"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Kleur</Label>
              <Select value={form.color} onValueChange={(v) => setForm({ ...form, color: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLORS.map(color => (
                    <SelectItem key={color.value} value={color.value}>
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded ${color.class}`} />
                        {color.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={resetForm}>Annuleren</Button>
              <Button type="submit"><Save className="w-4 h-4 mr-1" /> Opslaan</Button>
            </div>
          </form>

          {folders && folders.length > 0 && (
            <div className="space-y-2 pt-4 border-t">
              <h3 className="text-sm font-medium text-slate-700">Bestaande mappen</h3>
              {folders.map(folder => {
                const color = COLORS.find(c => c.value === folder.color) || COLORS[0];
                return (
                  <div key={folder.id} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
                    <div className={`w-3 h-3 rounded ${color.class} flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">{folder.name}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(folder)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => deleteMutation.mutate(folder.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}