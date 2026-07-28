import { useState, useEffect, useCallback } from 'react';
import { TriageEmail } from '../types';

export function useTriageEmails() {
  const [emails, setEmails] = useState<TriageEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEmails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Claude deberá exponer este endpoint en el backend
      const response = await fetch('/api/emails?actionable=true');
      if (!response.ok) {
        throw new Error('No se pudieron cargar los correos de triage');
      }
      const data = await response.json();
      setEmails(data.data || data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  return { emails, loading, error, refetch: fetchEmails };
}
