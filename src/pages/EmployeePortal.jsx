import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, UserCheck, UserX, Clock, CheckCircle, AlertCircle, Mail, LogIn } from "lucide-react";

export default function EmployeePortal() {
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [user, setUser] = useState(null);

  const fetchContext = async () => {
    setLoading(true);
    const isAuthed = await base44.auth.isAuthenticated();
    if (!isAuthed) { setLoading(false); return; }
    const me = await base44.auth.me();
    setUser(me);
    const res = await base44.functions.invoke("employeePortalApi", { action: "context" });
    setCtx(res.data?.employee_context || null);
    setLoading(false);
  };

  useEffect(() => { fetchContext(); }, []);

  const handleInvitation = async (invitationId, action) => {
    setActionLoading(invitationId + action);
    await base44.functions.invoke("employeePortalApi", {
      action: "invitation",
      operation: action,
      invitation_id: invitationId,
    });
    await fetchContext();
    setActionLoading(null);
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-border border-t-foreground rounded-full animate-spin" />
    </div>
  );

  if (!user) return (
    <div className="max-w-md mx-auto mt-16 text-center space-y-4">
      <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto" />
      <h2 className="text-xl font-semibold">Niet ingelogd</h2>
      <p className="text-muted-foreground text-sm">Log in om uw medewerkeromgeving te bekijken.</p>
      <Button onClick={() => base44.auth.redirectToLogin()} className="gap-2">
        <LogIn className="w-4 h-4" /> Inloggen
      </Button>
    </div>
  );

  // ── LINKED ────────────────────────────────────────────────────────────
  if (ctx?.is_linked) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-8 px-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
            <UserCheck className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{ctx.employee_display_name || user.full_name || "Medewerker"}</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <Badge className="ml-auto bg-emerald-100 text-emerald-700">Gekoppeld</Badge>
        </div>

        {/* Bedrijven */}
        {ctx.companies.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="w-4 h-4 text-muted-foreground" /> Werkgever(s)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {ctx.companies.map((co, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium">{co.company_name}</p>
                    {co.trade_name && <p className="text-xs text-muted-foreground">{co.trade_name}</p>}
                  </div>
                  {co.is_primary && <Badge variant="outline" className="text-xs">Primair</Badge>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Placeholders voor toekomstige modules */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { title: "Contracten", desc: "Dienstverbanden en contractgegevens — beschikbaar in een toekomstige versie." },
            { title: "Planning", desc: "Dienstroosters en ingeplande routes — beschikbaar in een toekomstige versie." },
          ].map((item, i) => (
            <Card key={i} className="opacity-60">
              <CardContent className="pt-5">
                <p className="text-sm font-semibold mb-1">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ── PENDING INVITATIONS ───────────────────────────────────────────────
  if (ctx?.pending_invitations?.length > 0) {
    return (
      <div className="max-w-lg mx-auto space-y-6 py-8 px-4">
        <div className="text-center space-y-2">
          <Mail className="w-12 h-12 text-primary mx-auto" />
          <h1 className="text-xl font-bold">Uitnodiging(en) ontvangen</h1>
          <p className="text-sm text-muted-foreground">Een of meer werkgevers hebben u uitgenodigd om uw medewerkeraccount te koppelen.</p>
        </div>

        {ctx.pending_invitations.map(inv => (
          <Card key={inv.id} className="border-primary/30">
            <CardContent className="pt-5 space-y-4">
              <div className="flex items-start gap-3">
                <Building2 className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">{inv.company_name || "Onbekend bedrijf"}</p>
                  {inv.employee_display_name && <p className="text-sm text-muted-foreground">Dossier: {inv.employee_display_name}</p>}
                  {inv.expires_at && (
                    <div className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                      <Clock className="w-3 h-3" /> Verloopt op {new Date(inv.expires_at).toLocaleDateString('nl-NL')}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={!!actionLoading}
                  onClick={() => handleInvitation(inv.id, "accept")}>
                  <CheckCircle className="w-4 h-4 mr-1" />
                  {actionLoading === inv.id + "accept" ? "Bezig..." : "Accepteren"}
                </Button>
                <Button size="sm" variant="outline" className="flex-1"
                  disabled={!!actionLoading}
                  onClick={() => handleInvitation(inv.id, "decline")}>
                  <UserX className="w-4 h-4 mr-1" />
                  {actionLoading === inv.id + "decline" ? "Bezig..." : "Weigeren"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // ── NO LINK, NO INVITATION ────────────────────────────────────────────
  return (
    <div className="max-w-md mx-auto mt-16 text-center space-y-4 px-4">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
        <UserX className="w-8 h-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold">Nog geen werkgever gekoppeld</h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Er is nog geen medewerkerdossier gekoppeld aan uw account ({user.email}).
        Zodra uw werkgever uw account koppelt, verschijnt hier een uitnodiging.
      </p>
      <Button variant="outline" size="sm" onClick={fetchContext}>Opnieuw controleren</Button>
    </div>
  );
}
