/**
 * Deterministically designates one member of a match as responsible for
 * reaching out first, based on a hash of the match ID.
 *
 * This keeps the reveal email and the match page in agreement about who is
 * "it" for a given match without needing a new DB column — both just call
 * this function with the same match ID. Roughly 50/50 split across matches.
 */
export function isMember1Initiator(matchId: string): boolean {
  let hash = 0;
  for (let i = 0; i < matchId.length; i++) {
    hash = (hash * 31 + matchId.charCodeAt(i)) | 0;
  }
  return hash % 2 === 0;
}
