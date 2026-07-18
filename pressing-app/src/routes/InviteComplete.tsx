import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";

// better-auth's magic-link verify endpoint redirects here (see the
// callbackURL set in requestMagicLink) once the session cookie is set; this
// screen finishes the job by granting release_access for the invite.
export function InviteComplete() {
  const { token } = useParams<{ token: string }>();
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) return;
    api
      .acceptInvite(token)
      .then(() => navigate("/", { replace: true }))
      .catch((e: Error) => setError(e.message));
  }, [token, navigate]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-10 text-center font-display text-2xl font-black text-dim">
        {error}
      </div>
    );
  }
  return null;
}
