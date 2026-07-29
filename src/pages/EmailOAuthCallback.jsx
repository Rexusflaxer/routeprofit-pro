import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export default function EmailOAuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("E-mailkoppeling afronden...");
  const [companyId, setCompanyId] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function completeOAuth() {
      const params = new URLSearchParams(window.location.search);
      const error = params.get("error");
      const errorDescription = params.get("error_description");
      const code = params.get("code");
      const state = params.get("state");

      if (error) {
        setStatus("error");
        setMessage(errorDescription || error);
        return;
      }

      if (!code || !state) {
        setStatus("error");
        setMessage("De provider gaf geen geldige koppelcode terug.");
        return;
      }

      try {
        const redirectUri = `${window.location.origin}/email-oauth/callback`;
        const { data } = await base44.functions.invoke("companyEmailService", {
          action: "complete_oauth",
          code,
          state,
          redirect_uri: redirectUri,
        });

        if (!mounted) return;
        const nextCompanyId = data?.company_id;
        setCompanyId(nextCompanyId || null);
        setStatus("success");
        setMessage("E-mailkoppeling voltooid. Je wordt teruggestuurd naar het bedrijfsprofiel.");

        try {
          window.sessionStorage.setItem(
            "loq_email_oauth_completed",
            JSON.stringify({
              company_id: nextCompanyId,
              settings_id: data?.settings?.id || null,
              completed_at: new Date().toISOString(),
            })
          );
        } catch {
          // De flow blijft werken zonder sessionStorage.
        }

        window.setTimeout(() => {
          if (nextCompanyId) {
            navigate(`/CompanyDetail?id=${encodeURIComponent(nextCompanyId)}&tab=email&emailSetup=sender`, { replace: true });
          } else {
            navigate("/Companies", { replace: true });
          }
        }, 900);
      } catch (err) {
        if (!mounted) return;
        setStatus("error");
        setMessage(err?.response?.data?.error || err?.message || "De e-mailkoppeling kon niet worden afgerond.");
      }
    }

    completeOAuth();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
        {status === "loading" && (
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        )}
        {status === "success" && (
          <CheckCircle2 className="mx-auto h-8 w-8 text-green-600" />
        )}
        {status === "error" && (
          <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
        )}

        <h1 className="mt-4 text-lg font-semibold text-foreground">
          {status === "error" ? "Koppeling mislukt" : "Zakelijke e-mail"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>

        <div className="mt-5 flex justify-center">
          <Button
            variant={status === "error" ? "default" : "outline"}
            onClick={() => navigate(companyId ? `/CompanyDetail?id=${encodeURIComponent(companyId)}&tab=email` : "/Companies", { replace: true })}
          >
            Terug naar bedrijfsprofiel
          </Button>
        </div>
      </div>
    </div>
  );
}
