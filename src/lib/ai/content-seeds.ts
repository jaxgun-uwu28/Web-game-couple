// Explicit saved fallback content; no personal data or answer keys.
const moments = [
  "a rainy afternoon",
  "a slow Sunday",
  "a sunrise walk",
  "a quiet evening",
  "a surprise day off",
  "a picnic",
  "a little road trip",
  "a cozy movie night",
  "a breakfast together",
  "a new adventure",
];
const dailyTemplates = [
  ["cozy", "What would make {m} feel extra cozy?"],
  ["silly", "What playful tradition could we invent for {m}?"],
  ["dreamy", "What would our dream version of {m} look like?"],
  ["nostalgic", "What happy memory would you bring into {m}?"],
  ["deep", "What could we learn about each other during {m}?"],
  ["future", "What small plan could we make together on {m}?"],
  ["food", "What delicious treat would you share on {m}?"],
  ["travel", "Where would you take us for {m}?"],
  ["gratitude", "What little kindness would you appreciate on {m}?"],
  ["cozy", "What song would you choose as the soundtrack for {m}?"],
];
export const seedDaily = moments.flatMap((m) =>
  dailyTemplates.map(([mood, template]) => ({
    text: template.replace("{m}", m),
    mood,
  })),
);
const pairs = [
  ["Sunrise walk", "Sunset picnic"],
  ["Handwritten note", "Surprise playlist"],
  ["Cat café", "Garden stroll"],
  ["Sushi date", "Burger date"],
  ["Museum afternoon", "Bookshop afternoon"],
  ["Cozy film night", "Board game night"],
  ["Beach picnic", "Mountain picnic"],
  ["Bake bread together", "Make pasta together"],
  ["Sketch each other", "Take portraits together"],
  ["Stargazing", "Cloud watching"],
  ["Flower market", "Farmers market"],
  ["Train adventure", "Coastal road trip"],
  ["Pottery class", "Painting class"],
  ["Matching mugs", "Matching bookmarks"],
  ["Breakfast in bed", "Late-night pancakes"],
  ["Watercolor cards", "Photo postcards"],
  ["Jazz evening", "Acoustic evening"],
  ["Small cabin getaway", "Seaside getaway"],
  ["Homemade pizza", "Homemade dumplings"],
  ["A memory scrapbook", "A shared sketchbook"],
];
// One hundred distinct activity comparisons, rather than rewording the same pair.
const activities = pairs.flat();
export const seedChoices = [1, 2, 3]
  .flatMap((offset) =>
    activities.map((optionA, i) => ({
      optionA,
      optionB: activities[(i + offset) % activities.length],
    })),
  )
  .slice(0, 100);
