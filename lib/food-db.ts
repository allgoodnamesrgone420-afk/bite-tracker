/**
 * Built-in food library for instant, offline, zero-cost parsing of common foods.
 * Values are per ONE base unit; typical Indian home-cooked portions and
 * standard label values (IFCT 2017 / USDA as the reference points). Estimates,
 * not lab data: home cooking varies, especially salt and oil.
 */
import type { M5 } from "./micros";

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
  /** Micros per base unit: [sodium mg, sugar g, sat fat g, calcium mg, iron mg]. */
  m?: M5;
  /** Other units expressed in base units, e.g. { handful: 20 } for almonds (piece base). */
  units?: Record<string, number>;
  /** Default quantity (base units) when none is given. */
  def?: number;
  /** Quantity (base units) when mentioned as "with X" and no amount is given. */
  addon?: number;
  /** Mentioning this food alone is too vague to estimate well (asks AI when available). */
  vague?: boolean;
};

const per100 = <T extends number[]>(a: [...T]): T => a.map((v) => v / 100) as T;

export const FOODS: Food[] = [
  // ---------- gym & packaged ----------
  { name: "Whey protein", aliases: ["whey", "whey protein", "protein powder", "protein shake", "whey isolate", "isolate"], unit: "scoop", grams: 30, n: [120, 24, 3, 1.5, 0], m: [50, 2, 1, 120, 0.5], units: { tbsp: 0.33 } },
  { name: "Mass gainer", aliases: ["mass gainer", "weight gainer", "gainer"], unit: "scoop", grams: 75, n: [280, 10, 55, 2, 1], m: [150, 10, 0.8, 150, 2] },
  { name: "Creatine", aliases: ["creatine", "creatine monohydrate"], unit: "scoop", grams: 5, n: [0, 0, 0, 0, 0], m: [0, 0, 0, 0, 0], units: { tsp: 1 } },
  { name: "Protein bar", aliases: ["protein bar"], unit: "bar", grams: 60, n: [220, 20, 22, 7, 5], m: [200, 6, 3, 150, 2] },
  { name: "Granola bar", aliases: ["granola bar", "cereal bar", "energy bar", "oats bar"], unit: "bar", grams: 35, n: [150, 3, 21, 6, 2], m: [70, 9, 1, 15, 0.8] },
  { name: "Oats (dry)", aliases: ["oats", "oatmeal", "rolled oats", "porridge"], unit: "g", grams: 1, density: 0.4, n: per100([389, 13, 66, 7, 10]), m: per100([2, 1, 1.2, 54, 4.3]), def: 40 },
  { name: "Peanut butter", aliases: ["peanut butter", "pb"], unit: "tbsp", grams: 16, n: [95, 4, 3.2, 8, 1], m: [70, 1.5, 1.6, 7, 0.3], def: 1, addon: 1 },
  { name: "Chocolate spread", aliases: ["nutella", "chocolate spread", "hazelnut spread"], unit: "tbsp", grams: 19, n: [100, 1, 11, 5.8, 0.5], m: [8, 10.5, 2, 20, 0.8], def: 1, addon: 1 },
  { name: "Almonds", aliases: ["almonds", "almond", "badam"], unit: "piece", grams: 1.2, n: [7, 0.25, 0.25, 0.6, 0.15], m: [0, 0.05, 0.05, 3, 0.04], units: { handful: 20 }, def: 10 },
  { name: "Cashews", aliases: ["cashews", "cashew", "kaju"], unit: "piece", grams: 1.5, n: [8.3, 0.27, 0.45, 0.66, 0.05], m: [0.2, 0.09, 0.12, 0.6, 0.1], units: { handful: 15 }, def: 10 },
  { name: "Pistachios", aliases: ["pistachios", "pistachio", "pista"], unit: "piece", grams: 0.7, n: [4, 0.14, 0.2, 0.32, 0.07], m: [0, 0.05, 0.04, 0.7, 0.03], units: { handful: 30 }, def: 20 },
  { name: "Walnuts", aliases: ["walnuts", "walnut", "akhrot"], unit: "piece", grams: 4, n: [26, 0.6, 0.6, 2.6, 0.3], m: [0, 0.1, 0.25, 4, 0.1], units: { handful: 7 }, def: 4 },
  { name: "Raisins", aliases: ["raisins", "raisin", "kishmish", "kismis"], unit: "g", grams: 1, n: per100([300, 3, 79, 0.5, 3.7]), m: per100([11, 59, 0.1, 50, 1.9]), units: { handful: 30, tbsp: 10 }, def: 15 },
  { name: "Peanuts", aliases: ["peanuts", "peanut", "moongfali", "moongphali", "groundnuts"], unit: "g", grams: 1, n: per100([567, 26, 16, 49, 8.5]), m: per100([18, 4, 7, 92, 4.6]), units: { handful: 30 }, def: 30 },
  { name: "Roasted chana", aliases: ["roasted chana", "bhuna chana", "chana roasted"], unit: "g", grams: 1, n: per100([370, 20, 58, 6, 17]), m: per100([25, 2, 0.6, 58, 6]), units: { handful: 30 }, def: 30 },
  { name: "Makhana", aliases: ["makhana", "fox nuts", "foxnuts", "lotus seeds"], unit: "g", grams: 1, n: per100([350, 10, 77, 0.5, 14]), m: per100([1, 0, 0.1, 60, 1.4]), units: { cup: 15, bowl: 20, handful: 10 }, def: 20 },
  { name: "Chia seeds", aliases: ["chia seeds", "chia", "chia seed"], unit: "tbsp", grams: 12, n: [58, 2, 5, 3.7, 4.1], m: [2, 0, 0.4, 76, 0.9], addon: 1 },
  { name: "Flax seeds", aliases: ["flax seeds", "flaxseed", "flaxseeds", "alsi"], unit: "tbsp", grams: 10, n: [53, 1.8, 2.9, 4.2, 2.7], m: [3, 0.2, 0.4, 26, 0.6], addon: 1 },
  { name: "Pumpkin seeds", aliases: ["pumpkin seeds", "pepitas"], unit: "tbsp", grams: 9, n: [50, 2.7, 1, 4.4, 0.5], m: [1, 0.1, 0.8, 4, 0.8], addon: 1 },
  { name: "Sunflower seeds", aliases: ["sunflower seeds"], unit: "tbsp", grams: 9, n: [52, 1.9, 1.8, 4.6, 0.8], m: [1, 0.2, 0.4, 7, 0.5], addon: 1 },
  { name: "Soya chunks (dry)", aliases: ["soya chunks", "soya", "soy chunks", "nutrela"], unit: "g", grams: 1, n: per100([345, 52, 33, 0.5, 13]), m: per100([15, 7, 0.1, 350, 11]), def: 30 },
  { name: "Greek yogurt", aliases: ["greek yogurt", "greek yoghurt", "hung curd"], unit: "g", grams: 1, n: per100([73, 10, 3.9, 2, 0]), m: per100([36, 3.2, 1.3, 110, 0.1]), units: { katori: 150, cup: 200 }, def: 150 },
  { name: "Cornflakes", aliases: ["cornflakes", "corn flakes", "cereal"], unit: "g", grams: 1, density: 0.12, n: per100([370, 7, 84, 0.6, 3]), m: per100([570, 8, 0.2, 5, 8]), def: 30 },
  { name: "Muesli", aliases: ["muesli", "granola"], unit: "g", grams: 1, density: 0.45, n: per100([380, 10, 66, 8, 8]), m: per100([150, 20, 1.5, 50, 4]), def: 45 },
  { name: "Cheese slice", aliases: ["cheese slice", "cheese"], unit: "slice", grams: 20, n: [60, 4, 1, 4.5, 0], m: [260, 0.5, 2.8, 120, 0.1] },
  { name: "Hummus", aliases: ["hummus", "houmous"], unit: "tbsp", grams: 15, n: [25, 1.2, 2.1, 1.4, 0.9], m: [60, 0, 0.2, 6, 0.4], def: 2, addon: 2 },

  // ---------- eggs, meat, fish ----------
  { name: "Egg", aliases: ["egg", "eggs", "anda", "ande", "boiled egg", "boiled eggs", "whole egg", "whole eggs"], unit: "piece", grams: 50, n: [72, 6.3, 0.4, 4.8, 0], m: [70, 0.2, 1.6, 28, 0.9] },
  { name: "Egg white", aliases: ["egg white", "egg whites"], unit: "piece", grams: 33, n: [17, 3.6, 0.2, 0.1, 0], m: [55, 0.2, 0, 2, 0] },
  { name: "Omelette (2 eggs)", aliases: ["omelette", "omelet", "omlette", "anda bhurji", "egg bhurji", "scrambled eggs"], unit: "serving", grams: 120, n: [190, 13, 2, 15, 0.3], m: [400, 1, 4, 60, 1.8] },
  { name: "Egg curry", aliases: ["egg curry", "anda curry", "egg masala"], unit: "katori", grams: 150, n: [260, 14, 8, 19, 1.5], m: [650, 3, 4, 70, 2.2] },
  { name: "Chicken breast (cooked)", aliases: ["chicken breast", "grilled chicken", "boiled chicken", "chicken"], unit: "g", grams: 1, n: per100([165, 31, 0, 3.6, 0]), m: per100([250, 0, 1, 15, 1]), units: { piece: 120 }, def: 150, vague: true },
  { name: "Chicken curry", aliases: ["chicken curry", "chicken gravy", "chicken masala"], unit: "katori", grams: 150, n: [240, 20, 6, 15, 1], m: [600, 2, 4, 30, 1.5] },
  { name: "Butter chicken", aliases: ["butter chicken", "chicken makhani"], unit: "katori", grams: 150, n: [330, 20, 8, 24, 1], m: [700, 5, 11, 50, 1.5] },
  { name: "Chicken tikka", aliases: ["chicken tikka", "tandoori chicken"], unit: "piece", grams: 35, n: [55, 8, 1, 2, 0], m: [150, 0.3, 0.6, 8, 0.3], def: 6 },
  { name: "Chicken 65", aliases: ["chicken 65", "chicken pakora", "chicken fry"], unit: "piece", grams: 25, n: [70, 5, 2.5, 4.5, 0.1], m: [150, 0.3, 0.8, 5, 0.3], def: 6 },
  { name: "Fried chicken", aliases: ["fried chicken", "kfc", "chicken wings", "wings"], unit: "piece", grams: 100, n: [290, 20, 10, 19, 0.5], m: [650, 0, 5, 20, 1] },
  { name: "Chicken nuggets", aliases: ["nuggets", "chicken nuggets"], unit: "piece", grams: 18, n: [50, 2.7, 3, 3, 0.2], m: [95, 0, 0.5, 3, 0.2], def: 6 },
  { name: "Chicken sausage", aliases: ["sausage", "sausages", "chicken sausage", "chicken sausages"], unit: "piece", grams: 30, n: [60, 5, 1.5, 4, 0], m: [300, 0.5, 1.3, 5, 0.4], def: 2 },
  { name: "Chilli chicken", aliases: ["chilli chicken", "chili chicken", "chicken manchurian"], unit: "katori", grams: 150, n: [330, 22, 14, 20, 1.5], m: [1100, 5, 4, 20, 1.2] },
  { name: "Chicken biryani", aliases: ["chicken biryani", "biryani"], unit: "plate", grams: 350, n: [550, 25, 65, 20, 3], m: [1200, 3, 6, 60, 2.5] },
  { name: "Mutton biryani", aliases: ["mutton biryani", "gosht biryani"], unit: "plate", grams: 350, n: [650, 30, 65, 28, 3], m: [1300, 3, 10, 70, 3.5] },
  { name: "Egg biryani", aliases: ["egg biryani", "anda biryani"], unit: "plate", grams: 350, n: [520, 20, 68, 18, 3], m: [1100, 3, 5, 60, 2.5] },
  { name: "Keema", aliases: ["keema", "kheema", "mutton keema", "chicken keema", "keema matar"], unit: "katori", grams: 150, n: [330, 24, 6, 23, 1.5], m: [650, 2, 9, 40, 3] },
  { name: "Fish curry", aliases: ["fish curry", "machli", "machhli", "fish"], unit: "katori", grams: 150, n: [200, 18, 5, 12, 1], m: [550, 2, 3, 40, 1] },
  { name: "Fish fry", aliases: ["fish fry", "fried fish", "fish tawa fry"], unit: "piece", grams: 80, n: [200, 17, 5, 12, 0.5], m: [350, 0, 2, 30, 0.8] },
  { name: "Prawn curry", aliases: ["prawn curry", "prawns", "shrimp curry", "jhinga"], unit: "katori", grams: 150, n: [220, 20, 6, 13, 1], m: [800, 2, 3, 90, 1.5] },
  { name: "Tuna (canned)", aliases: ["tuna", "canned tuna"], unit: "g", grams: 1, n: per100([110, 25, 0, 1, 0]), m: per100([350, 0, 0.3, 10, 1.3]), units: { can: 100 }, def: 100 },
  { name: "Salmon (cooked)", aliases: ["salmon"], unit: "g", grams: 1, n: per100([206, 22, 0, 12, 0]), m: per100([60, 0, 2.5, 10, 0.3]), def: 120 },
  { name: "Mutton curry", aliases: ["mutton curry", "mutton", "lamb curry", "gosht"], unit: "katori", grams: 150, n: [300, 22, 5, 21, 1], m: [600, 2, 8, 30, 2.5] },

  // ---------- dairy & milk drinks ----------
  { name: "Milk (toned)", aliases: ["milk", "doodh", "toned milk"], unit: "glass", grams: 250, n: [150, 8, 12, 7.5, 0], m: [110, 12, 4.5, 300, 0.5], addon: 0.2 },
  { name: "Skimmed milk", aliases: ["skimmed milk", "skim milk", "double toned milk", "low fat milk"], unit: "glass", grams: 250, n: [90, 8.5, 12, 0.5, 0], m: [120, 12, 0.3, 300, 0.2], addon: 0.2 },
  { name: "Full cream milk", aliases: ["full cream milk", "whole milk", "full fat milk", "buffalo milk"], unit: "glass", grams: 250, n: [220, 8, 12, 15, 0], m: [110, 12, 9.5, 300, 0.2], addon: 0.2 },
  { name: "Soy milk", aliases: ["soy milk", "soya milk"], unit: "glass", grams: 250, n: [100, 7, 8, 4, 1.5], m: [120, 6, 0.5, 300, 1] },
  { name: "Almond milk (unsweetened)", aliases: ["almond milk"], unit: "glass", grams: 250, n: [40, 1, 1.5, 3, 0.5], m: [170, 0, 0.2, 450, 0.5] },
  { name: "Milkshake", aliases: ["milkshake", "milk shake", "banana shake", "mango shake", "chocolate shake", "shake"], unit: "glass", grams: 300, n: [300, 9, 45, 9, 1], m: [180, 40, 6, 300, 0.5] },
  { name: "Curd", aliases: ["curd", "dahi", "yogurt", "yoghurt", "plain curd"], unit: "katori", grams: 150, n: [95, 5.2, 7, 5, 0], m: [70, 7, 3.2, 180, 0.2] },
  { name: "Raita", aliases: ["raita", "boondi raita"], unit: "katori", grams: 150, n: [80, 4, 6, 4, 0.5], m: [300, 5, 2.5, 150, 0.4] },
  { name: "Chaas", aliases: ["chaas", "chhaas", "chach", "buttermilk", "mattha"], unit: "glass", grams: 250, n: [50, 3, 5, 2, 0], m: [350, 5, 1.3, 150, 0.1] },
  { name: "Sweet lassi", aliases: ["lassi", "sweet lassi"], unit: "glass", grams: 250, n: [220, 7, 34, 6, 0], m: [100, 30, 4, 250, 0.2] },
  { name: "Paneer", aliases: ["paneer", "cottage cheese", "paneer bhurji"], unit: "g", grams: 1, n: per100([265, 18, 3.6, 20, 0]), m: per100([20, 2.6, 13, 480, 0.2]), units: { piece: 25, cube: 10 }, def: 100 },
  { name: "Paneer tikka", aliases: ["paneer tikka"], unit: "piece", grams: 30, n: [75, 4.5, 1.5, 6, 0.2], m: [120, 0.5, 3.5, 120, 0.2], def: 6 },
  { name: "Paneer butter masala", aliases: ["paneer butter masala", "paneer makhani", "shahi paneer", "kadai paneer", "paneer tikka masala"], unit: "katori", grams: 150, n: [350, 13, 12, 28, 2], m: [650, 6, 16, 250, 1.5] },
  { name: "Palak paneer", aliases: ["palak paneer"], unit: "katori", grams: 150, n: [260, 12, 9, 20, 3], m: [550, 3, 11, 300, 3] },
  { name: "Matar paneer", aliases: ["matar paneer", "mutter paneer"], unit: "katori", grams: 150, n: [280, 12, 14, 19, 4], m: [550, 4, 9, 250, 1.5] },
  { name: "Chilli paneer", aliases: ["chilli paneer", "chili paneer"], unit: "katori", grams: 150, n: [360, 15, 15, 26, 2], m: [1000, 5, 11, 300, 1] },
  { name: "Malai kofta", aliases: ["malai kofta", "kofta", "kofta curry"], unit: "katori", grams: 150, n: [380, 9, 20, 30, 3], m: [650, 6, 12, 150, 1.5] },
  { name: "Tofu", aliases: ["tofu"], unit: "g", grams: 1, n: per100([76, 8, 1.9, 4.8, 0.3]), m: per100([7, 0.6, 0.7, 350, 5.4]), def: 100 },

  // ---------- breads ----------
  { name: "Roti", aliases: ["roti", "rotis", "chapati", "chapatis", "chapathi", "phulka", "phulkas", "fulka"], unit: "piece", grams: 40, n: [110, 3.5, 20, 1.5, 3], m: [60, 0.2, 0.3, 12, 1.2] },
  { name: "Tandoori roti", aliases: ["tandoori roti", "tandoori rotis"], unit: "piece", grams: 60, n: [160, 5, 32, 1.5, 3.5], m: [250, 0.5, 0.3, 15, 1.5] },
  { name: "Missi roti", aliases: ["missi roti", "besan roti"], unit: "piece", grams: 60, n: [180, 6, 26, 6, 4], m: [200, 0.5, 1, 30, 2] },
  { name: "Jowar roti", aliases: ["jowar roti", "jowar bhakri", "jolada rotti"], unit: "piece", grams: 50, n: [150, 4.5, 29, 1.8, 4.5], m: [5, 0.5, 0.3, 12, 1.5] },
  { name: "Bajra roti", aliases: ["bajra roti", "bajre ki roti", "bajra rotla"], unit: "piece", grams: 50, n: [160, 4.5, 27, 3.5, 4.5], m: [5, 0.5, 0.7, 20, 3] },
  { name: "Ragi roti", aliases: ["ragi roti", "ragi mudde", "nachni roti", "ragi"], unit: "piece", grams: 50, n: [150, 3.5, 32, 1, 4.5], m: [5, 0.3, 0.2, 150, 2] },
  { name: "Plain paratha", aliases: ["paratha", "parantha", "plain paratha", "lachha paratha"], unit: "piece", grams: 80, n: [230, 5, 32, 9, 3], m: [280, 0.5, 3, 20, 1.6] },
  { name: "Aloo paratha", aliases: ["aloo paratha", "aloo parantha", "gobi paratha", "stuffed paratha", "methi paratha", "mooli paratha"], unit: "piece", grams: 130, n: [300, 6, 42, 12, 4], m: [450, 1.5, 4, 25, 2] },
  { name: "Paneer paratha", aliases: ["paneer paratha", "paneer parantha"], unit: "piece", grams: 130, n: [330, 12, 35, 15, 3.5], m: [450, 1.5, 6, 150, 1.5] },
  { name: "Thepla", aliases: ["thepla", "theplas", "methi thepla"], unit: "piece", grams: 45, n: [130, 3.5, 17, 5.5, 2.5], m: [150, 0.5, 0.8, 25, 1] },
  { name: "Puri", aliases: ["puri", "poori", "puris"], unit: "piece", grams: 25, n: [100, 1.8, 11, 5.5, 0.6], m: [80, 0.1, 1, 5, 0.4] },
  { name: "Bhatura", aliases: ["bhatura", "bhature", "bhaturas"], unit: "piece", grams: 80, n: [270, 6, 35, 12, 1.5], m: [300, 1, 2, 20, 1.2] },
  { name: "Naan", aliases: ["naan", "butter naan", "garlic naan"], unit: "piece", grams: 90, n: [290, 8, 48, 7, 2], m: [420, 3, 1.8, 40, 2.5] },
  { name: "Kulcha", aliases: ["kulcha", "amritsari kulcha"], unit: "piece", grams: 80, n: [240, 7, 40, 6, 1.5], m: [380, 2, 1.5, 30, 1.8] },
  { name: "Pav", aliases: ["pav", "pao", "ladi pav", "bun"], unit: "piece", grams: 40, n: [110, 3.5, 20, 1.5, 0.8], m: [200, 1.5, 0.4, 20, 1] },
  { name: "Bread (white)", aliases: ["bread", "white bread", "toast", "bread slice", "bread slices"], unit: "slice", grams: 25, n: [67, 2.2, 12.5, 0.8, 0.6], m: [125, 1.3, 0.2, 40, 0.9] },
  { name: "Brown bread", aliases: ["brown bread", "whole wheat bread", "multigrain bread", "atta bread"], unit: "slice", grams: 28, n: [70, 3, 12, 1, 1.9], m: [130, 1.5, 0.2, 30, 0.9] },
  { name: "Rusk", aliases: ["rusk", "rusks", "toast rusk"], unit: "piece", grams: 10, n: [40, 1.1, 7.5, 0.8, 0.3], m: [25, 1.5, 0.3, 3, 0.2], def: 2 },
  { name: "Tortilla wrap", aliases: ["tortilla", "wrap", "wraps"], unit: "piece", grams: 45, n: [140, 3.7, 23, 3.5, 1.5], m: [330, 1, 1, 40, 1.5] },

  // ---------- rice & grains ----------
  { name: "Cooked rice", aliases: ["rice", "chawal", "white rice", "steamed rice", "jeera rice", "boiled rice", "basmati rice"], unit: "katori", grams: 150, n: [195, 4, 43, 0.4, 0.6], m: [2, 0, 0.1, 5, 0.3], vague: true },
  { name: "Brown rice (cooked)", aliases: ["brown rice"], unit: "katori", grams: 150, n: [165, 3.8, 34, 1.3, 2.7], m: [5, 0.5, 0.3, 15, 0.6] },
  { name: "Quinoa (cooked)", aliases: ["quinoa"], unit: "katori", grams: 150, n: [180, 6.6, 32, 3, 4], m: [10, 1.3, 0.4, 25, 2.2] },
  { name: "Lemon rice", aliases: ["lemon rice", "chitranna", "tamarind rice", "puliyogare"], unit: "katori", grams: 150, n: [250, 4, 40, 8, 1.5], m: [450, 0.3, 1, 10, 0.8] },
  { name: "Curd rice", aliases: ["curd rice", "thayir sadam", "dahi chawal"], unit: "katori", grams: 150, n: [200, 5, 30, 6, 0.8], m: [350, 3, 3.5, 120, 0.3] },
  { name: "Veg biryani", aliases: ["veg biryani", "vegetable biryani", "pulao", "pulav", "veg pulao"], unit: "plate", grams: 300, n: [450, 10, 70, 14, 5], m: [900, 4, 4, 50, 2] },
  { name: "Fried rice", aliases: ["fried rice", "veg fried rice", "egg fried rice", "chicken fried rice", "schezwan rice"], unit: "plate", grams: 250, n: [430, 9, 65, 14, 2.5], m: [1000, 2, 2, 30, 1.5] },
  { name: "Khichdi", aliases: ["khichdi", "khichri"], unit: "katori", grams: 200, n: [180, 6, 30, 4, 3], m: [400, 1, 1.5, 30, 1.5] },
  { name: "Pongal", aliases: ["pongal", "ven pongal"], unit: "katori", grams: 150, n: [220, 6, 30, 8, 2], m: [400, 0.5, 4, 20, 1] },
  { name: "Sabudana khichdi", aliases: ["sabudana khichdi", "sabudana", "sago khichdi"], unit: "katori", grams: 150, n: [330, 3.5, 50, 13, 1.5], m: [400, 1, 2.5, 20, 1] },

  // ---------- breakfast & South Indian ----------
  { name: "Poha", aliases: ["poha", "pohe"], unit: "plate", grams: 200, n: [270, 5, 45, 8, 2], m: [500, 3, 1, 20, 3] },
  { name: "Upma", aliases: ["upma", "rava upma"], unit: "katori", grams: 150, n: [200, 5, 30, 7, 2], m: [450, 1.5, 1.5, 15, 1] },
  { name: "Idli", aliases: ["idli", "idlis", "idly"], unit: "piece", grams: 50, n: [58, 2, 12, 0.3, 0.8], m: [130, 0.2, 0.1, 8, 0.4], def: 3 },
  { name: "Plain dosa", aliases: ["dosa", "plain dosa", "dosai"], unit: "piece", grams: 100, n: [150, 3.5, 25, 4, 1], m: [300, 0.5, 0.8, 15, 0.8] },
  { name: "Masala dosa", aliases: ["masala dosa"], unit: "piece", grams: 250, n: [400, 8, 55, 16, 5], m: [700, 3, 4, 30, 2] },
  { name: "Rava dosa", aliases: ["rava dosa"], unit: "piece", grams: 90, n: [180, 3.5, 25, 7, 1], m: [350, 0.5, 1, 15, 0.6] },
  { name: "Uttapam", aliases: ["uttapam", "uthappam", "onion uttapam"], unit: "piece", grams: 150, n: [210, 6, 32, 6, 2.5], m: [450, 2, 1, 30, 1.2] },
  { name: "Pesarattu", aliases: ["pesarattu", "moong dosa"], unit: "piece", grams: 100, n: [160, 8, 22, 4.5, 4], m: [300, 1, 0.6, 25, 1.8] },
  { name: "Appam", aliases: ["appam", "appams"], unit: "piece", grams: 60, n: [120, 2, 23, 2, 0.6], m: [150, 2, 1.5, 6, 0.3] },
  { name: "Medu vada", aliases: ["medu vada", "vada", "wada"], unit: "piece", grams: 50, n: [145, 4, 14, 8, 1.5], m: [200, 0.5, 1, 15, 1] },
  { name: "Besan chilla", aliases: ["chilla", "cheela", "besan chilla", "besan cheela", "moong chilla", "moong dal chilla"], unit: "piece", grams: 80, n: [170, 8, 17, 7.5, 3], m: [300, 1.5, 1, 25, 1.8] },
  { name: "Dhokla", aliases: ["dhokla", "khaman", "khaman dhokla"], unit: "piece", grams: 30, n: [50, 2, 7, 1.7, 0.6], m: [150, 1.5, 0.2, 8, 0.4], def: 4 },
  { name: "Instant noodles", aliases: ["maggi", "instant noodles", "cup noodles", "ramen"], unit: "packet", grams: 70, n: [350, 8, 50, 13, 2], m: [1100, 1.5, 6, 20, 1] },

  // ---------- dals, curries, veg ----------
  { name: "Dal", aliases: ["dal", "daal", "dhal", "dal tadka", "dal fry", "moong dal", "toor dal", "arhar dal", "masoor dal", "lentils", "chana dal"], unit: "katori", grams: 150, n: [175, 8.5, 23, 5.5, 5], m: [450, 1, 1, 30, 2] },
  { name: "Dal makhani", aliases: ["dal makhani", "dal makhni", "maa ki dal"], unit: "katori", grams: 150, n: [280, 10, 25, 15, 6], m: [550, 2, 8, 60, 2.5] },
  { name: "Rajma", aliases: ["rajma", "kidney beans"], unit: "katori", grams: 150, n: [200, 9, 28, 6, 8], m: [500, 2, 1, 50, 2.5] },
  { name: "Chole", aliases: ["chole", "chana masala", "chhole", "chickpea curry", "chana"], unit: "katori", grams: 150, n: [220, 9, 30, 7, 8], m: [550, 3, 1, 60, 2.5] },
  { name: "Boiled chickpeas", aliases: ["boiled chana", "boiled chickpeas", "chickpeas", "kabuli chana", "chana salad"], unit: "katori", grams: 100, n: [164, 8.9, 27, 2.6, 7.6], m: [7, 4.8, 0.3, 49, 2.9] },
  { name: "Kadhi", aliases: ["kadhi", "kadi", "kadhi pakora"], unit: "katori", grams: 150, n: [170, 5, 12, 11, 1], m: [500, 4, 4, 120, 0.8] },
  { name: "Sambar", aliases: ["sambar", "sambhar"], unit: "katori", grams: 150, n: [110, 5, 15, 3.5, 4], m: [500, 3, 0.5, 40, 1.5] },
  { name: "Rasam", aliases: ["rasam", "saaru"], unit: "katori", grams: 150, n: [60, 1.5, 8, 2.5, 1.5], m: [550, 2, 0.3, 20, 0.6] },
  { name: "Sprouts", aliases: ["sprouts", "moong sprouts", "sprout salad"], unit: "katori", grams: 100, n: [100, 7, 15, 0.8, 4], m: [10, 4, 0.1, 15, 1] },
  { name: "Soya chunks curry", aliases: ["soya chunks curry", "soya curry", "soya sabzi", "meal maker curry"], unit: "katori", grams: 150, n: [220, 17, 15, 10, 5], m: [550, 3, 1.5, 120, 4] },
  { name: "Mixed sabzi", aliases: ["sabzi", "sabji", "subzi", "sabjee", "veg curry", "vegetable curry", "mix veg", "mixed veg", "gobi", "lauki", "tori", "cabbage", "beans", "tinda", "karela"], unit: "katori", grams: 150, n: [150, 3, 14, 9, 4], m: [450, 5, 1.2, 50, 1.5] },
  { name: "Bhindi masala", aliases: ["bhindi", "bhindi masala", "bhindi fry", "okra"], unit: "katori", grams: 150, n: [160, 3, 12, 11, 5], m: [350, 3, 1.5, 110, 1] },
  { name: "Baingan bharta", aliases: ["baingan bharta", "baingan", "brinjal curry", "eggplant"], unit: "katori", grams: 150, n: [140, 3, 12, 9, 5], m: [400, 6, 1.2, 20, 0.6] },
  { name: "Saag", aliases: ["saag", "sarson ka saag", "palak sabzi", "palak", "spinach"], unit: "katori", grams: 150, n: [180, 5, 12, 13, 5], m: [400, 2, 3, 200, 3] },
  { name: "Aloo sabzi", aliases: ["aloo sabzi", "aloo", "potato curry", "jeera aloo", "aloo matar", "aloo gobi", "dum aloo"], unit: "katori", grams: 150, n: [180, 3, 24, 8, 3], m: [450, 2, 1.2, 20, 1] },
  { name: "Veg manchurian", aliases: ["manchurian", "veg manchurian", "gobi manchurian"], unit: "katori", grams: 150, n: [280, 5, 24, 18, 3], m: [1100, 6, 2.5, 40, 1.2] },
  { name: "Salad", aliases: ["salad", "green salad", "cucumber", "kheera"], unit: "bowl", grams: 150, n: [40, 1.5, 8, 0.3, 3], m: [10, 5, 0, 30, 0.5] },
  { name: "Boiled potato", aliases: ["boiled potato", "boiled potatoes", "potato"], unit: "piece", grams: 150, n: [130, 3, 30, 0.2, 3], m: [8, 1.3, 0, 8, 0.5] },
  { name: "Sweet potato", aliases: ["sweet potato", "shakarkandi", "shakarkand"], unit: "piece", grams: 130, n: [115, 2, 27, 0.2, 4], m: [45, 5.5, 0, 40, 0.9] },
  { name: "Corn on the cob", aliases: ["corn", "bhutta", "sweet corn", "corn cob"], unit: "piece", grams: 150, n: [130, 5, 29, 2, 3], m: [20, 6, 0.3, 4, 0.8] },
  { name: "Carrot", aliases: ["carrot", "carrots", "gajar"], unit: "piece", grams: 60, n: [25, 0.6, 6, 0.1, 1.7], m: [40, 2.8, 0, 20, 0.2] },
  { name: "Tomato", aliases: ["tomato", "tomatoes", "tamatar"], unit: "piece", grams: 100, n: [18, 0.9, 3.9, 0.2, 1.2], m: [5, 2.6, 0, 10, 0.3] },
  { name: "Tomato soup", aliases: ["tomato soup"], unit: "bowl", grams: 250, n: [110, 2.5, 17, 3.5, 1.5], m: [750, 10, 1.5, 30, 1.2] },
  { name: "Vegetable soup", aliases: ["soup", "veg soup", "vegetable soup", "clear soup", "manchow soup"], unit: "bowl", grams: 250, n: [80, 2.5, 12, 2.5, 3], m: [700, 4, 0.5, 40, 1] },
  { name: "Sweet corn soup", aliases: ["sweet corn soup", "corn soup"], unit: "bowl", grams: 250, n: [120, 3, 20, 3, 2], m: [800, 6, 0.6, 10, 0.6] },

  // ---------- street food & eating out ----------
  { name: "Pav bhaji", aliases: ["pav bhaji", "paav bhaji"], unit: "plate", grams: 350, n: [600, 13, 75, 28, 9], m: [1200, 10, 11, 90, 3.5] },
  { name: "Misal pav", aliases: ["misal pav", "misal"], unit: "plate", grams: 300, n: [480, 16, 55, 22, 10], m: [1100, 6, 4, 80, 4.5] },
  { name: "Chole bhature", aliases: ["chole bhature", "chole bhatura", "chhole bhature"], unit: "plate", grams: 350, n: [750, 20, 85, 38, 12], m: [1100, 5, 6, 90, 5] },
  { name: "Samosa", aliases: ["samosa", "samosas"], unit: "piece", grams: 100, n: [260, 4, 30, 14, 2], m: [400, 2, 3, 20, 1.5] },
  { name: "Kachori", aliases: ["kachori", "kachoris", "pyaaz kachori"], unit: "piece", grams: 60, n: [250, 5, 24, 15, 2], m: [350, 1, 3, 20, 1.3] },
  { name: "Pakora", aliases: ["pakora", "pakoras", "pakode", "pakoda", "bhajji", "bhajiya", "onion bhaji"], unit: "piece", grams: 30, n: [75, 2, 7, 4.5, 1], m: [150, 0.5, 0.6, 10, 0.6], def: 4 },
  { name: "Aloo tikki", aliases: ["aloo tikki", "tikki", "potato patty"], unit: "piece", grams: 60, n: [140, 2, 17, 7, 2], m: [250, 1, 1, 10, 0.6] },
  { name: "Veg cutlet", aliases: ["cutlet", "veg cutlet", "cutlets"], unit: "piece", grams: 60, n: [150, 3, 18, 7, 2.5], m: [300, 1.5, 1, 15, 0.8] },
  { name: "Vada pav", aliases: ["vada pav", "wada pav"], unit: "piece", grams: 150, n: [300, 7, 40, 12, 3], m: [650, 4, 2.5, 40, 2.5] },
  { name: "Dabeli", aliases: ["dabeli", "kutchi dabeli"], unit: "piece", grams: 130, n: [300, 6, 42, 12, 3], m: [550, 6, 2.5, 30, 1.8] },
  { name: "Pani puri", aliases: ["pani puri", "golgappa", "golgappe", "puchka"], unit: "piece", grams: 20, n: [36, 0.6, 5, 1.5, 0.4], m: [120, 0.8, 0.2, 3, 0.2], def: 6 },
  { name: "Bhel puri", aliases: ["bhel", "bhel puri", "jhal muri"], unit: "plate", grams: 150, n: [290, 6, 45, 9, 4], m: [600, 6, 1.5, 30, 2.5] },
  { name: "Sev puri", aliases: ["sev puri", "dahi puri", "papdi chaat", "chaat"], unit: "plate", grams: 150, n: [350, 6, 40, 18, 3], m: [700, 6, 3, 30, 2] },
  { name: "Veg momos", aliases: ["momos", "momo", "veg momos", "dumplings"], unit: "piece", grams: 30, n: [40, 1.3, 6.5, 1, 0.5], m: [120, 0.3, 0.2, 5, 0.3], def: 6 },
  { name: "Chicken momos", aliases: ["chicken momos", "chicken momo", "chicken dumplings"], unit: "piece", grams: 30, n: [45, 3, 5, 1.3, 0.3], m: [130, 0.2, 0.4, 5, 0.3], def: 6 },
  { name: "Spring roll", aliases: ["spring roll", "spring rolls"], unit: "piece", grams: 60, n: [150, 3, 17, 8, 1], m: [300, 1.5, 1.2, 10, 0.6] },
  { name: "Hakka noodles", aliases: ["chowmein", "chow mein", "hakka noodles", "veg noodles", "schezwan noodles", "noodles"], unit: "plate", grams: 250, n: [420, 10, 60, 15, 4], m: [1300, 5, 2.5, 40, 2] },
  { name: "Shawarma", aliases: ["shawarma", "chicken shawarma", "shawarma roll"], unit: "piece", grams: 250, n: [550, 28, 50, 25, 3], m: [1300, 4, 6, 60, 3] },
  { name: "Kathi roll", aliases: ["kathi roll", "frankie", "roll", "egg roll", "paneer roll", "chicken roll"], unit: "piece", grams: 200, n: [450, 15, 50, 20, 3], m: [900, 3, 5, 50, 2.5] },
  { name: "Veg sandwich", aliases: ["sandwich", "veg sandwich", "bombay sandwich"], unit: "piece", grams: 150, n: [280, 8, 38, 10, 3], m: [600, 4, 4, 80, 1.5] },
  { name: "Grilled cheese sandwich", aliases: ["cheese sandwich", "grilled cheese", "grilled sandwich", "cheese toast"], unit: "piece", grams: 130, n: [380, 14, 33, 21, 1.8], m: [850, 4, 11, 300, 2] },
  { name: "Chicken sandwich", aliases: ["chicken sandwich", "chicken sub", "subway"], unit: "piece", grams: 180, n: [380, 25, 35, 15, 2.5], m: [850, 4, 3.5, 80, 2.5] },
  { name: "Pasta", aliases: ["pasta", "white sauce pasta", "red sauce pasta", "penne", "spaghetti", "macaroni"], unit: "plate", grams: 250, n: [450, 13, 60, 17, 3.5], m: [800, 6, 7, 150, 2.5] },
  { name: "Pizza", aliases: ["pizza", "pizza slice"], unit: "slice", grams: 107, n: [285, 12, 36, 10, 2.5], m: [640, 3.5, 4.5, 190, 2.5], def: 2 },
  { name: "Garlic bread", aliases: ["garlic bread", "garlic breadsticks"], unit: "piece", grams: 30, n: [100, 2.5, 13, 4.5, 0.6], m: [180, 1, 2.5, 20, 0.8], def: 2 },
  { name: "Burger", aliases: ["burger", "veg burger", "chicken burger", "aloo tikki burger"], unit: "piece", grams: 200, n: [450, 20, 45, 20, 3], m: [900, 8, 7, 100, 3] },
  { name: "French fries", aliases: ["fries", "french fries"], unit: "serving", grams: 117, n: [365, 4, 48, 17, 4], m: [250, 0.3, 2.5, 15, 1] },

  // ---------- fruit ----------
  { name: "Banana", aliases: ["banana", "bananas", "kela", "kele"], unit: "piece", grams: 118, n: [105, 1.3, 27, 0.4, 3.1], m: [1, 14, 0.1, 6, 0.3] },
  { name: "Apple", aliases: ["apple", "apples", "seb"], unit: "piece", grams: 180, n: [95, 0.5, 25, 0.3, 4.4], m: [2, 19, 0.1, 11, 0.2] },
  { name: "Orange", aliases: ["orange", "oranges", "santra", "mosambi", "sweet lime"], unit: "piece", grams: 130, n: [62, 1.2, 15, 0.2, 3.1], m: [0, 12, 0, 52, 0.1] },
  { name: "Mango", aliases: ["mango", "mangoes", "aam"], unit: "piece", grams: 200, n: [120, 1.6, 30, 0.8, 3.2], m: [2, 27, 0.2, 22, 0.3] },
  { name: "Papaya", aliases: ["papaya", "papita"], unit: "bowl", grams: 150, n: [65, 0.7, 16, 0.4, 2.5], m: [12, 12, 0.1, 30, 0.4] },
  { name: "Watermelon", aliases: ["watermelon", "tarbooz"], unit: "bowl", grams: 150, n: [45, 0.9, 11, 0.2, 0.6], m: [2, 9, 0, 10, 0.4] },
  { name: "Muskmelon", aliases: ["muskmelon", "kharbuja", "cantaloupe"], unit: "bowl", grams: 150, n: [50, 1.3, 12, 0.3, 1.4], m: [25, 12, 0, 14, 0.3] },
  { name: "Pineapple", aliases: ["pineapple", "ananas"], unit: "bowl", grams: 150, n: [75, 0.8, 20, 0.2, 2], m: [2, 15, 0, 20, 0.4] },
  { name: "Grapes", aliases: ["grapes", "angoor"], unit: "bowl", grams: 150, n: [104, 1.1, 27, 0.2, 1.4], m: [3, 23, 0.1, 15, 0.5] },
  { name: "Pomegranate", aliases: ["pomegranate", "anar"], unit: "katori", grams: 100, n: [83, 1.7, 19, 1.2, 4], m: [3, 14, 0.1, 10, 0.3] },
  { name: "Guava", aliases: ["guava", "amrood", "peru"], unit: "piece", grams: 100, n: [68, 2.6, 14, 1, 5.4], m: [2, 9, 0.3, 18, 0.3] },
  { name: "Chikoo", aliases: ["chikoo", "chiku", "sapota"], unit: "piece", grams: 100, n: [83, 0.4, 20, 1, 5.3], m: [12, 15, 0.2, 21, 0.8] },
  { name: "Pear", aliases: ["pear", "pears", "nashpati"], unit: "piece", grams: 170, n: [100, 0.6, 27, 0.2, 5.5], m: [2, 17, 0, 15, 0.3] },
  { name: "Kiwi", aliases: ["kiwi", "kiwis"], unit: "piece", grams: 75, n: [45, 0.8, 11, 0.4, 2.3], m: [2, 7, 0, 26, 0.2] },
  { name: "Strawberries", aliases: ["strawberries", "strawberry"], unit: "bowl", grams: 150, n: [48, 1, 11.5, 0.5, 3], m: [2, 7, 0, 24, 0.6] },
  { name: "Avocado", aliases: ["avocado", "avocados"], unit: "piece", grams: 136, n: [220, 2.7, 12, 20, 9], m: [10, 0.9, 2.9, 16, 0.8] },
  { name: "Dates", aliases: ["dates", "date", "khajur", "khajoor"], unit: "piece", grams: 8, n: [23, 0.2, 6, 0, 0.6], m: [0, 5, 0, 5, 0.1], def: 2 },
  { name: "Coconut water", aliases: ["coconut water", "nariyal pani", "tender coconut"], unit: "glass", grams: 240, n: [45, 1.7, 9, 0.5, 2.6], m: [250, 6, 0.4, 58, 0.7] },

  // ---------- fats, sweeteners, condiments ----------
  { name: "Ghee", aliases: ["ghee"], unit: "tsp", grams: 5, n: [45, 0, 0, 5, 0], m: [0, 0, 3.2, 0, 0], addon: 1 },
  { name: "Butter", aliases: ["butter", "makhan"], unit: "tsp", grams: 5, n: [36, 0, 0, 4, 0], m: [30, 0, 2.5, 1, 0], addon: 1 },
  { name: "Cooking oil", aliases: ["oil", "cooking oil", "olive oil", "mustard oil"], unit: "tsp", grams: 5, n: [40, 0, 0, 4.5, 0], m: [0, 0, 0.6, 0, 0], addon: 1 },
  { name: "Sugar", aliases: ["sugar", "cheeni", "chini"], unit: "tsp", grams: 4, n: [16, 0, 4, 0, 0], m: [0, 4, 0, 0, 0], addon: 1 },
  { name: "Honey", aliases: ["honey", "shahad"], unit: "tsp", grams: 7, n: [21, 0, 5.7, 0, 0], m: [0, 5.7, 0, 0.4, 0], addon: 1 },
  { name: "Jaggery", aliases: ["jaggery", "gud", "gur"], unit: "piece", grams: 10, n: [38, 0, 9.8, 0, 0], m: [3, 9.7, 0, 8, 1.1], addon: 1 },
  { name: "Mayonnaise", aliases: ["mayo", "mayonnaise"], unit: "tbsp", grams: 15, n: [95, 0.1, 0.1, 10, 0], m: [90, 0.2, 1.5, 1, 0], addon: 1 },
  { name: "Ketchup", aliases: ["ketchup", "tomato ketchup"], unit: "tbsp", grams: 17, n: [20, 0.2, 4.5, 0, 0.1], m: [150, 3.7, 0, 3, 0.1], addon: 1 },
  { name: "Pickle", aliases: ["pickle", "achar", "achaar", "aachar"], unit: "tsp", grams: 5, n: [15, 0.1, 0.3, 1.4, 0.2], m: [150, 0.1, 0.2, 3, 0.1], addon: 1 },
  { name: "Green chutney", aliases: ["chutney", "green chutney", "pudina chutney", "hari chutney"], unit: "tbsp", grams: 15, n: [10, 0.4, 1.5, 0.3, 0.6], m: [80, 0.5, 0, 10, 0.3], addon: 1 },
  { name: "Coconut chutney", aliases: ["coconut chutney", "nariyal chutney"], unit: "tbsp", grams: 15, n: [35, 0.4, 1.2, 3.2, 0.8], m: [40, 0.5, 2.8, 3, 0.2], addon: 2 },
  { name: "Papad", aliases: ["papad", "papads", "papadum", "appalam"], unit: "piece", grams: 12, n: [40, 2.5, 7, 0.4, 1.5], m: [200, 0.2, 0.1, 10, 0.6], addon: 1 },

  // ---------- drinks ----------
  { name: "Chai (milk + sugar)", aliases: ["chai", "tea", "masala chai", "milk tea", "adrak chai"], unit: "cup", grams: 150, n: [105, 3, 14, 4, 0], m: [30, 12, 2.5, 100, 0.3] },
  { name: "Black coffee", aliases: ["black coffee", "americano", "espresso"], unit: "cup", grams: 240, n: [5, 0.3, 0, 0, 0], m: [5, 0, 0, 5, 0.1] },
  { name: "Coffee (milk + sugar)", aliases: ["coffee", "filter coffee", "cappuccino", "latte", "cold coffee"], unit: "cup", grams: 200, n: [110, 4, 14, 4, 0], m: [40, 13, 2.5, 120, 0.1] },
  { name: "Green tea", aliases: ["green tea", "black tea"], unit: "cup", grams: 240, n: [2, 0, 0.5, 0, 0], m: [2, 0, 0, 0, 0.1] },
  { name: "Soft drink", aliases: ["coke", "pepsi", "cola", "soft drink", "soda", "sprite", "thums up", "thumbs up", "fanta", "limca"], unit: "can", grams: 330, n: [140, 0, 35, 0, 0], m: [30, 35, 0, 5, 0] },
  { name: "Diet soft drink", aliases: ["diet coke", "coke zero", "diet pepsi", "pepsi black", "diet soda", "zero sugar soda"], unit: "can", grams: 330, n: [1, 0, 0, 0, 0], m: [40, 0, 0, 0, 0] },
  { name: "Energy drink", aliases: ["energy drink", "red bull", "redbull", "monster"], unit: "can", grams: 250, n: [110, 0, 28, 0, 0], m: [100, 27, 0, 0, 0] },
  { name: "Fresh juice", aliases: ["juice", "orange juice", "mosambi juice", "fruit juice", "apple juice"], unit: "glass", grams: 250, n: [115, 1.5, 27, 0.4, 0.5], m: [5, 21, 0, 25, 0.5] },
  { name: "Sugarcane juice", aliases: ["sugarcane juice", "ganne ka ras", "ganne ka juice"], unit: "glass", grams: 250, n: [180, 0.3, 45, 0.3, 0], m: [40, 40, 0, 20, 0.8] },
  { name: "Nimbu pani", aliases: ["nimbu pani", "shikanji", "lemonade", "nimbu soda"], unit: "glass", grams: 250, n: [60, 0.1, 15, 0, 0.2], m: [300, 14, 0, 5, 0.1] },
  { name: "Lemon water", aliases: ["lemon water", "warm lemon water", "detox water"], unit: "glass", grams: 250, n: [5, 0, 1.5, 0, 0], m: [5, 0.5, 0, 5, 0] },
  { name: "Beer", aliases: ["beer", "beers", "lager"], unit: "bottle", grams: 330, n: [150, 1.6, 13, 0, 0], m: [14, 0, 0, 14, 0.1] },
  { name: "Wine", aliases: ["wine", "red wine", "white wine"], unit: "glass", grams: 150, n: [125, 0.1, 4, 0, 0], m: [7, 1.4, 0, 12, 0.7] },
  { name: "Spirits", aliases: ["whisky", "whiskey", "vodka", "rum", "gin", "brandy", "tequila"], unit: "peg", grams: 30, n: [70, 0, 0, 0, 0], m: [0, 0, 0, 0, 0] },

  // ---------- snacks & sweets ----------
  { name: "Marie biscuit", aliases: ["biscuit", "biscuits", "marie", "marie biscuit", "cookie", "cookies"], unit: "piece", grams: 7, n: [30, 0.5, 5, 0.9, 0.1], m: [25, 1.5, 0.4, 4, 0.2], def: 4 },
  { name: "Glucose biscuit", aliases: ["parle g", "parle-g", "glucose biscuit", "glucose biscuits"], unit: "piece", grams: 6, n: [27, 0.4, 4.5, 0.8, 0.1], m: [20, 1.5, 0.4, 1, 0.1], def: 4 },
  { name: "Digestive biscuit", aliases: ["digestive", "digestives", "digestive biscuit", "oat biscuit"], unit: "piece", grams: 15, n: [70, 1, 10, 3, 0.6], m: [90, 2.5, 1.4, 5, 0.4], def: 2 },
  { name: "Cream biscuit", aliases: ["cream biscuit", "cream biscuits", "bourbon", "oreo", "oreos", "good day"], unit: "piece", grams: 12, n: [60, 0.7, 8, 2.8, 0.2], m: [35, 3.5, 1.4, 5, 0.2], def: 3 },
  { name: "Namkeen", aliases: ["namkeen", "bhujia", "mixture", "kurkure", "sev"], unit: "g", grams: 1, n: per100([540, 9, 50, 34, 4]), m: per100([800, 3, 10, 50, 3]), units: { handful: 30, packet: 50 }, def: 30 },
  { name: "Potato chips", aliases: ["chips", "potato chips", "lays", "crisps", "wafers"], unit: "g", grams: 1, n: per100([536, 7, 53, 34, 4.8]), m: per100([525, 0.3, 11, 24, 1.6]), units: { handful: 25, packet: 50 }, def: 30 },
  { name: "Popcorn", aliases: ["popcorn", "butter popcorn"], unit: "cup", grams: 10, n: [50, 1, 6, 2.5, 1], m: [90, 0.1, 0.5, 1, 0.2], def: 3 },
  { name: "Peanut chikki", aliases: ["chikki", "peanut chikki", "gajak"], unit: "piece", grams: 20, n: [100, 2.5, 11, 5, 1], m: [5, 8, 1, 10, 0.4] },
  { name: "Ice cream", aliases: ["ice cream", "icecream", "kulfi"], unit: "scoop", grams: 65, n: [140, 2.5, 16, 7, 0.5], m: [50, 14, 4.5, 85, 0.1] },
  { name: "Gulab jamun", aliases: ["gulab jamun", "gulab jamuns"], unit: "piece", grams: 50, n: [150, 2, 25, 5, 0.3], m: [30, 22, 2.5, 40, 0.3] },
  { name: "Rasgulla", aliases: ["rasgulla", "rasgullas", "rosogolla"], unit: "piece", grams: 50, n: [120, 2, 26, 1.5, 0], m: [20, 24, 1, 50, 0.1] },
  { name: "Rasmalai", aliases: ["rasmalai", "ras malai"], unit: "piece", grams: 60, n: [150, 5, 17, 7, 0], m: [60, 14, 4.5, 150, 0.2] },
  { name: "Jalebi", aliases: ["jalebi", "jalebis", "imarti"], unit: "piece", grams: 30, n: [150, 0.8, 22, 6, 0.2], m: [10, 17, 2.5, 5, 0.3] },
  { name: "Ladoo", aliases: ["ladoo", "laddoo", "laddu", "besan ladoo", "motichoor ladoo", "boondi ladoo"], unit: "piece", grams: 40, n: [180, 3, 22, 9, 1], m: [20, 15, 4.5, 15, 0.8] },
  { name: "Barfi", aliases: ["barfi", "burfi", "kaju katli", "kaju barfi", "peda", "mithai"], unit: "piece", grams: 25, n: [110, 2, 14, 5.5, 0.3], m: [10, 11, 2.5, 30, 0.3] },
  { name: "Halwa", aliases: ["halwa", "sooji halwa", "gajar halwa", "sheera", "moong dal halwa"], unit: "katori", grams: 100, n: [300, 4, 40, 14, 1.5], m: [60, 25, 8, 80, 0.8] },
  { name: "Kheer", aliases: ["kheer", "payasam", "rice kheer", "seviyan"], unit: "katori", grams: 150, n: [230, 6, 35, 7, 0.3], m: [80, 26, 4.5, 200, 0.3] },
  { name: "Cake", aliases: ["cake", "cake slice", "cupcake", "muffin"], unit: "slice", grams: 70, n: [260, 3, 37, 11, 0.6], m: [220, 25, 5, 40, 1] },
  { name: "Pastry", aliases: ["pastry", "pastries", "black forest"], unit: "piece", grams: 90, n: [320, 3.5, 40, 16, 0.8], m: [180, 28, 9, 40, 1] },
  { name: "Doughnut", aliases: ["doughnut", "donut", "donuts"], unit: "piece", grams: 60, n: [250, 3.5, 30, 13, 1], m: [230, 12, 6, 25, 1.2] },
  { name: "Brownie", aliases: ["brownie", "brownies"], unit: "piece", grams: 60, n: [270, 3.5, 33, 14, 1.5], m: [120, 24, 5, 20, 1.5] },
  { name: "Milk chocolate", aliases: ["milk chocolate", "dairy milk", "kitkat", "kit kat", "snickers"], unit: "g", grams: 1, n: per100([535, 7.6, 59, 30, 3.4]), m: per100([80, 52, 18, 190, 2.3]), units: { bar: 38, piece: 6 }, def: 25 },
  { name: "Dark chocolate", aliases: ["dark chocolate", "chocolate"], unit: "piece", grams: 10, n: [55, 0.8, 4.5, 4, 1], m: [2, 2.4, 2.4, 7, 1.2], def: 2 },
];
