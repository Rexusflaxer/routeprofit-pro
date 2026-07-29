import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { UserCheck, UserX, Mail, RefreshCw, Clock, AlertTriangle, Plus } from "lucide-react";

const STATUS_COLORS = {
  pending: "bg-amber-100 text-amber-700",
  accepted: "bg-emerald-100 text-emerald-700",
  declined: "bg-red-100 text-red-700",
  revoked: "bg-slate-100 text-slate-600",
  expired: "bg-slate-100 text-slate-500",
};

export default function PersonnelAccessTab({ personnel }) {
  const queryClient = useQueryClient();
  const [newEmail, setNewEmail] = useState(personnel.email || "");
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const { data: invitations = [] } = useQuery({
    queryKey: ["employee_invitations", personnel.id],
    queryFn: () => base44.entities.EmployeeInvitation.filter({ personnel_id: personnel.id }),
  });

  const createInvitation = async () => {
    if (!newEmail) return;
    setCreating(true);
    await base44.functions.invoke("employeePortalApi", {
      action: "invitation",
      operation: "create_invitation",
      personnel_id: personnel.id,
      email: newEmail,
    });
    queryClient.invalidateQueries({ queryKey: ["employee_invitations", personnel.id] });
    setCreating(false);
  };

  const revokeLink = async () => {
    if (!confirm("Weet u zeker dat u de koppeling wilt intrekken? Het medewerkerdossier blijft behouden.")) return;
    setRevoking(true);
    await base44.functions.invoke("employeePortalApi", {
      action: "invitation",
      operation: "revoke_link",
      personnel_id: personnel.id,
    });
    queryClient.invalidateQueries({ queryKey: ["personnel"] });
    setRevoking(false);
  };

  const isLinked = !!personnel.linked_user_id;

  return (
    <div className="space-y-6">
      {/* Koppelstatus */}
      <Card className={isLinked ? "border-emerald-200" : "border-amber-200"}>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2">
            {isLinked ? <UserCheck className="w-5 h-5 text-emerald-500" /> : <UserX className="w-5 h-5 text-amber-500" />}
            <span className="font-medium text-sm">{isLinked ? "Gekoppeld aan app-account" : "Nog niet gekoppeld"}</span>
          </div>
          {isLinked && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Login e-mail</p>
                <p className="font-mono">{personnel.linked_user_email || personnel.login_email || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">User ID</p>
                <p className="font-mono text-xs truncate">{personnel.linked_user_id}</p>
              </div>
              {personnel.linked_at && (
                <div>
                  <p className="text-xs text-muted-foreground">Gekoppeld op</p>
                  <p>{new Date(personnel.linked_at).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              )}
            </div>
          )}
          {isLinked && (
            <Button size="sm" variant="destructive" onClick={revokeLink} disabled={revoking}>
              <UserX className="w-3.5 h-3.5 mr-1" />{revoking ? "Intrekken..." : "Koppeling intrekken"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Uitnodiging aanmaken */}
      {!isLinked && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Uitnodiging sturen</Label>
          <div className="flex gap-2">
            <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="medewerker@email.nl" type="email" />
            <Button onClick={createInvitation} disabled={creating || !newEmail} size="sm">
              <Plus className="w-3.5 h-3.5 mr-1" />{creating ? "Aanmaken..." : "Uitnodigen"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">De medewerker ziet een uitnodiging nadat hij/zij inlogt met dit e-mailadres.</p>
        </div>
      )}

      {/* Uitnodigingen overzicht */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Uitnodigingen</p>
        {invitations.length === 0 && <p className="text-xs text-muted-foreground">Nog geen uitnodigingen verstuurd.</p>}
        {invitations.map(inv => (
          <div key={inv.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border text-sm">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
              <div>
                <p className="font-medium">{inv.email}</p>
                <p className="text-xs text-muted-foreground">{new Date(inv.created_at).toLocaleDateString('nl-NL')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {inv.expires_at && new Date(inv.expires_at) < new Date() && (
                <div className="flex items-center gap-1 text-xs text-amber-600"><Clock className="w-3 h-3" />Verlopen</div>
              )}
              <Badge className={STATUS_COLORS[inv.status] || "bg-muted text-muted-foreground"}>
                {inv.status === 'pending' ? 'Openstaand' : inv.status === 'accepted' ? 'Geaccepteerd' : inv.status === 'declined' ? 'Geweigerd' : inv.status === 'revoked' ? 'Ingetrokken' : 'Verlopen'}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
