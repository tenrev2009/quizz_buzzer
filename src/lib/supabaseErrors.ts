/**
 * Traduit les echecs d'ecriture les plus courants en consigne actionnable.
 *
 * PostgREST renvoie « Could not find the 'x' column ... in the schema cache »,
 * qui decrit le symptome sans nommer la cause : une migration non appliquee.
 * Laisser passer ce message tel quel oblige l'utilisateur a le decoder.
 */
export function describeWriteError(message: string): string {
  const missingColumn = message.match(/Could not find the '([^']+)' column/i);
  if (missingColumn) {
    const column = missingColumn[1];
    return (
      `La colonne « ${column} » n'existe pas encore dans votre base. ` +
      `Appliquez la migration correspondante dans le SQL Editor de Supabase, ` +
      `puis reessayez :\n\nALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS ${column} text;`
    );
  }

  if (/schema cache/i.test(message) && /relation|table/i.test(message)) {
    return (
      `Table introuvable dans votre base : une migration n'a pas ete appliquee. ` +
      `Verifiez le dossier supabase/migrations et executez celle qui manque.\n\n${message}`
    );
  }

  if (/row-level security|violates row-level/i.test(message)) {
    return (
      `Ecriture refusee par la securite de la base. Verifiez que vous etes bien ` +
      `connecte avec le compte administrateur de cette session.\n\n${message}`
    );
  }

  return message;
}
