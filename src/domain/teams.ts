import type { Group, Team } from './types';

/**
 * Word that precedes an auto-composed team label: "Grupos 1 y 5", as in the
 * original sheet. It lives here, next to the joining " y ", because this module
 * is the single place that turns a team into words — splitting that decision
 * across the PDF and the UI is how the two end up disagreeing.
 */
export const TEAM_PREFIX = 'Grupos';

/**
 * Display label for a team, e.g. "1 y 5".
 *
 * Composed from the team's active groups unless the administrator set an
 * explicit displayName. This lives here — and not in the PDF or the UI —
 * so that both render teams identically, and so nothing downstream has to
 * know how a team is made up.
 *
 * A team whose groups are all inactive returns an empty string. That is a
 * legitimate state (the team still exists and is still assignable); it is the
 * caller's job to surface it, not this function's job to invent a name.
 */
export function teamLabel(team: Team, groups: readonly Group[]): string {
  if (team.displayName !== null && team.displayName !== '') {
    return team.displayName;
  }

  return groups
    .filter((g) => g.teamId === team.id && g.active)
    .slice()
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((g) => g.name)
    .join(' y ');
}

/**
 * The text actually shown for a team: "Grupos 1 y 5", or the administrator's
 * own name for it ("Equipo Norte") with no prefix, because naming it was a
 * deliberate act.
 *
 * This — and not the bare label — is what gets denormalized into a saved
 * program. Storing "1 y 5" would lose the distinction between an auto-composed
 * label and a chosen name, and a reprinted programme from last year would come
 * out reading differently from the one that was handed round.
 */
export function teamDisplayText(team: Team, groups: readonly Group[]): string {
  if (team.displayName !== null && team.displayName !== '') return team.displayName;
  const label = teamLabel(team, groups);
  return label === '' ? '' : `${TEAM_PREFIX} ${label}`;
}
