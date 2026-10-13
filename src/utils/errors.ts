/**
 * Traduce errores conocidos de la API de Spotify a mensajes accionables
 * en español. El mensaje original se sigue registrando en consola para
 * depuración.
 */
export function humanizeMusicError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('premium subscription required')) {
    return (
      'Spotify exige que la cuenta propietaria de la app de desarrollador tenga ' +
      'Premium activo (política del modo desarrollo). Revisa la suscripción en ' +
      'spotify.com/account; si acabas de activarla, Spotify puede tardar unas horas ' +
      'en habilitar las peticiones.'
    );
  }

  if (lower.includes('user not registered') || lower.includes('not allowlisted')) {
    return (
      'Tu usuario de Spotify no está en la lista de usuarios permitidos de la app. ' +
      'Añádelo en el dashboard de Spotify → tu app → Settings → Users Management.'
    );
  }

  if (lower.includes('quota')) {
    return 'Has superado la cuota de peticiones de Spotify por ahora. Espera unos minutos y reintenta.';
  }

  return message;
}
