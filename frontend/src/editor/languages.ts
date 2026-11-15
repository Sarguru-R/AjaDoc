/** Languages in the code cell picker; must match the server's sanitizer allow-list. */
export const CODE_LANGUAGES = [
  ['plaintext', 'Plain text'], ['python', 'Python'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'],
  ['java', 'Java'], ['c', 'C'], ['cpp', 'C++'], ['csharp', 'C#'], ['go', 'Go'], ['rust', 'Rust'], ['sql', 'SQL'],
  ['bash', 'Shell'], ['json', 'JSON'], ['xml', 'HTML / XML'], ['css', 'CSS'], ['yaml', 'YAML'], ['markdown', 'Markdown'],
  ['php', 'PHP'], ['ruby', 'Ruby'], ['kotlin', 'Kotlin'], ['swift', 'Swift'],
] as const;
