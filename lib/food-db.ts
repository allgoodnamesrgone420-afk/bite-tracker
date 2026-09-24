/**
 * Built-in food library for instant, offline, zero-cost parsing of common foods.
 * Values are per ONE base unit; typical Indian home-cooked portions and
 * standard label values. Estimates, not lab data.
 */

export type N5 = [kcal: number, protein: number, carbs: number, fat: number, fibre: number];

export type Food = {
  name: string;
  aliases: string[];
  /** Base unit (normalised), e.g. "piece", "katori", "g". */
  unit: string;
  /** Grams (or ml) per base unit; enables g/ml and household-measure conversion. */
  grams: number;
  /** g per ml, for converting volume units (default 1). */
  density?: number;
  n: N5;
  /** Other units expressed in base units, e.g. { handful: 20 } for almonds (piece base). */
  units?: Record<string, number>;
  /** Default quantity (base units) when none is given. */
  def?: number;
  /** Quantity (base units) when mentioned as "with X" and no amount is given. */
  addon?: number;
  /** Mentioning this food alone is too vague to estimate well (asks AI when available). */
  vague?: boolean;
};

const per100 = (n: N5): N5 => n.map((v) => v / 100) as N5;

export const FOODS: Food[] = [
  // ---------- gym & packaged ----------
  { name: "Whey protein", aliases: ["whey", "whey protein", "protein powder", "protein shake", "whey isolate", "isolate"], unit: "scoop", grams: 30, n: [120, 24, 3, 1.5, 0], units: { tbsp: 0.33 } },
  { name: "Creatine", aliases: ["creatine", "creatine monohydrate"], unit: "scoop", grams: 5, n: [0, 0, 0, 0, 0], units: { tsp: 1 } },
  { name: "Protein bar", aliases: ["protein bar"], unit: "bar", grams: 60, n: [220, 20, 22, 7, 5] },
  { name: "Oats (dry)", aliases: ["oats", "oatmeal", "rolled oats", "porridge"], unit: "g", grams: 1, density: 0.4, n: per100([389, 13, 66, 7, 10]), def: 40 },
  { name: "Peanut butter", aliases: ["peanut butter", "pb"], unit: "tbsp", grams: 16, n: [95, 4, 3.2, 8, 1], def: 1, addon: 1 },
  { name: "Almonds", aliases: ["almonds", "almond", "badam"], unit: "piece", grams: 1.2, n: [7, 0.25, 0.25, 0.6, 0.15], units: { handful: 20 }, def: 10 },
  { name: "Walnuts", aliases: ["walnuts", "walnut", "akhrot"], unit: "piece", grams: 4, n: [26, 0.6, 0.6, 2.6, 0.3], units: { handful: 7 }, def: 4 },
  { name: "Peanuts", aliases: ["peanuts", "peanut", "moongfali", "moongphali", "groundnuts"], unit: "g", grams: 1, n: per100([567, 26, 16, 49, 8.5]), units: { handful: 30 }, def: 30 },
  { name: "Roasted chana", aliases: ["roasted chana", "bhuna chana", "chana roasted"], unit: "g", grams: 1, n: per100([370, 20, 58, 6, 17]), units: { handful: 30 }, def: 30 },
  { name: "Makhana", aliases: ["makhana", "fox nuts", "foxnuts", "lotus seeds"], unit: "g", grams: 1, n: per100([350, 10, 77, 0.5, 14]), units: { cup: 15, bowl: 20, handful: 10 }, def: 20 },
  { name: "Soya chunks (dry)", aliases: ["soya chunks", "soya", "soy chunks", "nutrela"], unit: "g", grams: 1, n: per100([345, 52, 33, 0.5, 13]), def: 30 },
  { name: "Greek yogurt", aliases: ["greek yogurt", "greek yoghurt", "hung curd"], unit: "g", grams: 1, n: per100([73, 10, 3.9, 2, 0]), units: { katori: 150, cup: 200 }, def: 150 },
  { name: "Cornflakes", aliases: ["cornflakes", "corn flakes", "cereal"], unit: "g", grams: 1, density: 0.12, n: per100([370, 7, 84, 0.6, 3]), def: 30 },
  { name: "Muesli", aliases: ["muesli", "granola"], unit: "g", grams: 1, density: 0.45, n: per100([380, 10, 66, 8, 8]), def: 45 },
  { name: "Cheese slice", aliases: ["cheese slice", "cheese"], unit: "slice", grams: 20, n: [60, 4, 1, 4.5, 0] },

  // ---------- eggs, meat, fish ----------
  { name: "Egg", aliases: ["egg", "eggs", "anda", "ande", "boiled egg", "boiled eggs", "whole egg", "whole eggs"], unit: "piece", grams: 50, n: [72, 6.3, 0.4, 4.8, 0] },
  { name: "Egg white", aliases: ["egg white", "egg whites"], unit: "piece", grams: 33, n: [17, 3.6, 0.2, 0.1, 0] },
  { name: "Omelette (2 eggs)", aliases: ["omelette", "omelet", "omlette", "anda bhurji", "egg bhurji", "scrambled eggs"], unit: "serving", grams: 120, n: [190, 13, 2, 15, 0.3] },
  { name: "Chicken breast (cooked)", aliases: ["chicken breast", "grilled chicken", "boiled chicken", "chicken"], unit: "g", grams: 1, n: per100([165, 31, 0, 3.6, 0]), units: { piece: 120 }, def: 150, vague: true },
  { name: "Chicken curry", aliases: ["chicken curry", "chicken gravy", "chicken masala"], unit: "katori", grams: 150, n: [240, 20, 6, 15, 1] },
  { name: "Butter chicken", aliases: ["butter chicken", "chicken makhani"], unit: "katori", grams: 150, n: [330, 20, 8, 24, 1] },
  { name: "Chicken tikka", aliases: ["chicken tikka", "tandoori chicken"], unit: "piece", grams: 35, n: [55, 8, 1, 2, 0], def: 6 },
  { name: "Chicken biryani", aliases: ["chicken biryani", "biryani"], unit: "plate", grams: 350, n: [550, 25, 65, 20, 3] },
  { name: "Fish curry", aliases: ["fish curry", "machli", "machhli", "fish"], unit: "katori", grams: 150, n: [200, 18, 5, 12, 1] },
  { name: "Mutton curry", aliases: ["mutton curry", "mutton", "lamb curry", "gosht"], unit: "katori", grams: 150, n: [300, 22, 5, 21, 1] },

  // ---------- dairy ----------
  { name: "Milk (toned)", aliases: ["milk", "doodh", "toned milk"], unit: "glass", grams: 250, n: [150, 8, 12, 7.5, 0], addon: 0.2 },
  { name: "Curd", aliases: ["curd", "dahi", "yogurt", "yoghurt", "plain curd"], unit: "katori", grams: 150, n: [95, 5.2, 7, 5, 0] },
  { name: "Raita", aliases: ["raita"], unit: "katori", grams: 150, n: [80, 4, 6, 4, 0.5] },
  { name: "Chaas", aliases: ["chaas", "chhaas", "chach", "buttermilk", "mattha"], unit: "glass", grams: 250, n: [50, 3, 5, 2, 0] },
  { name: "Sweet lassi", aliases: ["lassi", "sweet lassi"], unit: "glass", grams: 250, n: [220, 7, 34, 6, 0] },
  { name: "Paneer", aliases: ["paneer", "cottage cheese", "paneer bhurji"], unit: "g", grams: 1, n: per100([265, 18, 3.6, 20, 0]), units: { piece: 25, cube: 10 }, def: 100 },
  { name: "Paneer butter masala", aliases: ["paneer butter masala", "paneer makhani", "shahi paneer", "kadai paneer", "paneer tikka masala"], unit: "katori", grams: 150, n: [350, 13, 12, 28, 2] },
  { name: "Palak paneer", aliases: ["palak paneer"], unit: "katori", grams: 150, n: [260, 12, 9, 20, 3] },
  { name: "Tofu", aliases: ["tofu"], unit: "g", grams: 1, n: per100([76, 8, 1.9, 4.8, 0.3]), def: 100 },

  // ---------- breads & grains ----------
  { name: "Roti", aliases: ["roti", "rotis", "chapati", "chapatis", "chapathi", "phulka", "phulkas", "fulka"], unit: "piece", grams: 40, n: [110, 3.5, 20, 1.5, 3] },
  { name: "Plain paratha", aliases: ["paratha", "parantha", "plain paratha", "lachha paratha"], unit: "piece", grams: 80, n: [230, 5, 32, 9, 3] },
  { name: "Aloo paratha", aliases: ["aloo paratha", "aloo parantha", "gobi paratha", "stuffed paratha"], unit: "piece", grams: 130, n: [300, 6, 42, 12, 4] },
  { name: "Puri", aliases: ["puri", "poori", "puris"], unit: "piece", grams: 25, n: [100, 1.8, 11, 5.5, 0.6] },
  { name: "Naan", aliases: ["naan", "butter naan"], unit: "piece", grams: 90, n: [290, 8, 48, 7, 2] },
  { name: "Cooked rice", aliases: ["rice", "chawal", "white rice", "steamed rice", "jeera rice", "boiled rice"], unit: "katori", grams: 150, n: [195, 4, 43, 0.4, 0.6], vague: true },
  { name: "Brown rice (cooked)", aliases: ["brown rice"], unit: "katori", grams: 150, n: [165, 3.8, 34, 1.3, 2.7] },
  { name: "Veg biryani", aliases: ["veg biryani", "vegetable biryani", "pulao", "pulav", "veg pulao"], unit: "plate", grams: 300, n: [450, 10, 70, 14, 5] },
  { name: "Khichdi", aliases: ["khichdi", "khichri"], unit: "katori", grams: 200, n: [180, 6, 30, 4, 3] },
  { name: "Bread (white)", aliases: ["bread", "white bread", "toast", "bread slice", "bread slices"], unit: "slice", grams: 25, n: [67, 2.2, 12.5, 0.8, 0.6] },
  { name: "Brown bread", aliases: ["brown bread", "whole wheat bread", "multigrain bread"], unit: "slice", grams: 28, n: [70, 3, 12, 1, 1.9] },
  { name: "Poha", aliases: ["poha", "pohe"], unit: "plate", grams: 200, n: [270, 5, 45, 8, 2] },
  { name: "Upma", aliases: ["upma", "rava upma"], unit: "katori", grams: 150, n: [200, 5, 30, 7, 2] },
  { name: "Idli", aliases: ["idli", "idlis", "idly"], unit: "piece", grams: 50, n: [58, 2, 12, 0.3, 0.8], def: 3 },
  { name: "Plain dosa", aliases: ["dosa", "plain dosa", "dosai"], unit: "piece", grams: 100, n: [150, 3.5, 25, 4, 1] },
  { name: "Masala dosa", aliases: ["masala dosa"], unit: "piece", grams: 250, n: [400, 8, 55, 16, 5] },
  { name: "Medu vada", aliases: ["medu vada", "vada", "wada"], unit: "piece", grams: 50, n: [145, 4, 14, 8, 1.5] },
  { name: "Instant noodles", aliases: ["maggi", "instant noodles", "noodles"], unit: "packet", grams: 70, n: [350, 8, 50, 13, 2] },

  // ---------- dals, curries, veg ----------
  { name: "Dal", aliases: ["dal", "daal", "dhal", "dal tadka", "dal fry", "moong dal", "toor dal", "arhar dal", "masoor dal", "lentils"], unit: "katori", grams: 150, n: [175, 8.5, 23, 5.5, 5] },
  { name: "Dal makhani", aliases: ["dal makhani", "dal makhni", "maa ki dal"], unit: "katori", grams: 150, n: [280, 10, 25, 15, 6] },
  { name: "Rajma", aliases: ["rajma", "kidney beans"], unit: "katori", grams: 150, n: [200, 9, 28, 6, 8] },
  { name: "Chole", aliases: ["chole", "chana masala", "chhole", "chickpea curry", "chana"], unit: "katori", grams: 150, n: [220, 9, 30, 7, 8] },
  { name: "Sambar", aliases: ["sambar", "sambhar"], unit: "katori", grams: 150, n: [110, 5, 15, 3.5, 4] },
  { name: "Sprouts", aliases: ["sprouts", "moong sprouts", "sprout salad"], unit: "katori", grams: 100, n: [100, 7, 15, 0.8, 4] },
  { name: "Mixed sabzi", aliases: ["sabzi", "sabji", "subzi", "sabjee", "veg curry", "vegetable curry", "mix veg", "mixed veg", "bhindi", "gobi", "aloo gobi", "baingan", "lauki", "tori", "cabbage", "beans"], unit: "katori", grams: 150, n: [150, 3, 14, 9, 4] },
  { name: "Aloo sabzi", aliases: ["aloo sabzi", "aloo", "potato curry", "jeera aloo", "aloo matar"], unit: "katori", grams: 150, n: [180, 3, 24, 8, 3] },
  { name: "Salad", aliases: ["salad", "green salad", "cucumber", "kheera"], unit: "bowl", grams: 150, n: [40, 1.5, 8, 0.3, 3] },

  // ---------- fruit ----------
  { name: "Banana", aliases: ["banana", "bananas", "kela", "kele"], unit: "piece", grams: 118, n: [105, 1.3, 27, 0.4, 3.1] },
  { name: "Apple", aliases: ["apple", "apples", "seb"], unit: "piece", grams: 180, n: [95, 0.5, 25, 0.3, 4.4] },
  { name: "Orange", aliases: ["orange", "oranges", "santra"], unit: "piece", grams: 130, n: [62, 1.2, 15, 0.2, 3.1] },
  { name: "Mango", aliases: ["mango", "mangoes", "aam"], unit: "piece", grams: 200, n: [120, 1.6, 30, 0.8, 3.2] },
  { name: "Papaya", aliases: ["papaya", "papita"], unit: "bowl", grams: 150, n: [65, 0.7, 16, 0.4, 2.5] },
  { name: "Watermelon", aliases: ["watermelon", "tarbooz"], unit: "bowl", grams: 150, n: [45, 0.9, 11, 0.2, 0.6] },
  { name: "Grapes", aliases: ["grapes", "angoor"], unit: "bowl", grams: 150, n: [104, 1.1, 27, 0.2, 1.4] },
  { name: "Dates", aliases: ["dates", "date", "khajur", "khajoor"], unit: "piece", grams: 8, n: [23, 0.2, 6, 0, 0.6], def: 2 },
  { name: "Coconut water", aliases: ["coconut water", "nariyal pani", "tender coconut"], unit: "glass", grams: 240, n: [45, 1.7, 9, 0.5, 2.6] },

  // ---------- fats & sweeteners ----------
  { name: "Ghee", aliases: ["ghee"], unit: "tsp", grams: 5, n: [45, 0, 0, 5, 0], addon: 1 },
  { name: "Butter", aliases: ["butter", "makhan"], unit: "tsp", grams: 5, n: [36, 0, 0, 4, 0], addon: 1 },
  { name: "Cooking oil", aliases: ["oil", "cooking oil", "olive oil", "mustard oil"], unit: "tsp", grams: 5, n: [40, 0, 0, 4.5, 0], addon: 1 },
  { name: "Sugar", aliases: ["sugar", "cheeni", "chini"], unit: "tsp", grams: 4, n: [16, 0, 4, 0, 0], addon: 1 },
  { name: "Honey", aliases: ["honey", "shahad"], unit: "tsp", grams: 7, n: [21, 0, 5.7, 0, 0], addon: 1 },
  { name: "Jaggery", aliases: ["jaggery", "gud", "gur"], unit: "piece", grams: 10, n: [38, 0, 9.8, 0, 0], addon: 1 },

  // ---------- drinks ----------
  { name: "Chai (milk + sugar)", aliases: ["chai", "tea", "masala chai", "milk tea", "adrak chai"], unit: "cup", grams: 150, n: [105, 3, 14, 4, 0] },
  { name: "Black coffee", aliases: ["black coffee", "americano", "espresso"], unit: "cup", grams: 240, n: [5, 0.3, 0, 0, 0] },
  { name: "Coffee (milk + sugar)", aliases: ["coffee", "filter coffee", "cappuccino", "latte", "cold coffee"], unit: "cup", grams: 200, n: [110, 4, 14, 4, 0] },
  { name: "Green tea", aliases: ["green tea", "black tea"], unit: "cup", grams: 240, n: [2, 0, 0.5, 0, 0] },
  { name: "Soft drink", aliases: ["coke", "pepsi", "cola", "soft drink", "soda", "sprite", "thums up", "thumbs up"], unit: "can", grams: 330, n: [140, 0, 35, 0, 0] },
  { name: "Beer", aliases: ["beer"], unit: "bottle", grams: 330, n: [150, 1.6, 13, 0, 0] },
  { name: "Fresh juice", aliases: ["juice", "orange juice", "mosambi juice", "fruit juice"], unit: "glass", grams: 250, n: [115, 1.5, 27, 0.4, 0.5] },

  // ---------- snacks & sweets ----------
  { name: "Marie biscuit", aliases: ["biscuit", "biscuits", "marie", "marie biscuit", "cookie", "cookies"], unit: "piece", grams: 7, n: [30, 0.5, 5, 0.9, 0.1], def: 4 },
  { name: "Samosa", aliases: ["samosa", "samosas"], unit: "piece", grams: 100, n: [260, 4, 30, 14, 2] },
  { name: "Pakora", aliases: ["pakora", "pakoras", "pakode", "pakoda", "bhajji", "bhajiya"], unit: "piece", grams: 30, n: [75, 2, 7, 4.5, 1], def: 4 },
  { name: "Vada pav", aliases: ["vada pav", "wada pav"], unit: "piece", grams: 150, n: [300, 7, 40, 12, 3] },
  { name: "Pani puri", aliases: ["pani puri", "golgappa", "golgappe", "puchka"], unit: "piece", grams: 20, n: [36, 0.6, 5, 1.5, 0.4], def: 6 },
  { name: "Namkeen", aliases: ["namkeen", "bhujia", "mixture", "chips"], unit: "g", grams: 1, n: per100([540, 9, 50, 34, 4]), units: { handful: 30, packet: 50 }, def: 30 },
  { name: "Pizza", aliases: ["pizza", "pizza slice"], unit: "slice", grams: 107, n: [285, 12, 36, 10, 2.5], def: 2 },
  { name: "Burger", aliases: ["burger"], unit: "piece", grams: 200, n: [450, 20, 45, 20, 3] },
  { name: "French fries", aliases: ["fries", "french fries"], unit: "serving", grams: 117, n: [365, 4, 48, 17, 4] },
  { name: "Ice cream", aliases: ["ice cream", "icecream", "kulfi"], unit: "scoop", grams: 65, n: [140, 2.5, 16, 7, 0.5] },
  { name: "Gulab jamun", aliases: ["gulab jamun", "gulab jamuns"], unit: "piece", grams: 50, n: [150, 2, 25, 5, 0.3] },
  { name: "Rasgulla", aliases: ["rasgulla", "rasgullas", "rosogolla"], unit: "piece", grams: 50, n: [120, 2, 26, 1.5, 0] },
  { name: "Dark chocolate", aliases: ["dark chocolate", "chocolate"], unit: "piece", grams: 10, n: [55, 0.8, 4.5, 4, 1], def: 2 },
];
