// Übersetzt Supabase-Auth-Fehler in nutzerfreundliche deutsche Meldungen.
// Bewusst tolerant: prüft sowohl error.code als auch den Klartext (message),
// da Supabase je nach Endpoint mal das eine, mal das andere liefert.

type AuthFehler = { message?: string; code?: string } | null | undefined

export function uebersetzeAuthFehler(error: AuthFehler): string {
  const code = error?.code ?? ''
  const msg = error?.message ?? ''

  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) {
    return 'Deine E-Mail-Adresse ist noch nicht bestätigt. Der Login ist erst möglich, nachdem du auf den Bestätigungslink in der E-Mail geklickt hast, die wir dir geschickt haben.'
  }
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) {
    return 'E-Mail-Adresse oder Passwort ist nicht korrekt.'
  }
  if (code === 'user_already_exists' || /already registered|already been registered/i.test(msg)) {
    return 'Für diese E-Mail-Adresse besteht bereits ein Konto. Bitte melde dich an.'
  }
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || /rate limit/i.test(msg)) {
    return 'Zu viele Versuche in kurzer Zeit. Bitte warte einen Moment und versuche es erneut.'
  }
  if (/network|fetch|connection/i.test(msg)) {
    return 'Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.'
  }

  return msg || 'Es ist ein Fehler aufgetreten. Bitte versuche es erneut.'
}
