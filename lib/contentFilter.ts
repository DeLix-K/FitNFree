// A first line of defence for text that other people see (display names,
// challenge titles, squad names, trainer bios). App Review Guideline 1.2
// expects apps with user-generated content to filter objectionable material
// as well as let people report it. This is deliberately simple: it blocks
// common profanity and slurs as whole words (so ordinary words that merely
// contain them, like "Scunthorpe", are not caught). Reports (see
// lib/contentReports.ts) handle everything a word list can't.

const BLOCKED_WORDS = [
  'fuck', 'fucker', 'fucking', 'motherfucker', 'shit', 'bullshit', 'shitty', 'bitch', 'bastard',
  'cunt', 'dickhead', 'asshole', 'arsehole', 'pussy', 'slut', 'whore', 'wanker', 'twat',
  'nigger', 'nigga', 'faggot', 'fag', 'kike', 'spic', 'chink', 'tranny', 'retard', 'retarded',
  'porn', 'porno', 'rapist', 'rape', 'kys',
];

const BLOCKED_PHRASES = ['kill yourself', 'kill your self'];

// Undo the usual character swaps ("sh1t", "f*ck") before checking.
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/[4@]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[*#]/g, 'u');
}

// The worst words are also caught when someone spaces the letters out ("f.u.c.k"). The
// word-start anchor (\b) keeps ordinary words that merely contain them safe.
const SPACED_OUT = ['fuck', 'cunt', 'nigger', 'nigga', 'faggot'].map(
  (word) => new RegExp(`\\b${word.split('').join('[^a-z]*')}`)
);

export function containsObjectionableText(text: string): boolean {
  const cleaned = normalise(text);
  const squashed = cleaned.replace(/\s+/g, ' ');
  if (BLOCKED_PHRASES.some((phrase) => squashed.includes(phrase))) return true;
  if (SPACED_OUT.some((pattern) => pattern.test(cleaned))) return true;
  const words = cleaned.split(/[^a-z]+/).filter(Boolean);
  return words.some((word) => BLOCKED_WORDS.includes(word));
}

// Throws a friendly error if the text isn't allowed. `label` is what the person
// was filling in, e.g. "Your display name".
export function assertCleanText(label: string, text: string | null | undefined): void {
  if (text && containsObjectionableText(text)) {
    throw new Error(`${label} contains language that isn't allowed in FitNFree. Please change it and try again.`);
  }
}
