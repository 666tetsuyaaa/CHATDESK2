const KEYWORD_STOPWORDS = new Set(
  "a an the is are do does did i my me how what when where why who which can could to of for in on at and or with from about po ba ko ang ng sa mga paano ano saan kailan".split(" ")
);

// "How do I get a good moral certificate?" -> "get_good_moral_certificate"
export function suggestIntentKeyword(question) {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !KEYWORD_STOPWORDS.has(word));
  return words.slice(0, 5).join("_").slice(0, 100);
}
