// Word lists Faker has no locale data for: Lagos neighbourhoods and menus by cuisine.
// Prices are ranges in whole naira; the seed converts them to kobo.

export const AREAS = [
  'Yaba',
  'Surulere',
  'Ikeja',
  'Ikeja GRA',
  'Lekki Phase 1',
  'Victoria Island',
  'Ikoyi',
  'Ajah',
  'Gbagada',
  'Maryland',
  'Magodo',
  'Festac Town',
  'Ogba',
  'Ojodu',
  'Ilupeju',
  'Oshodi',
  'Apapa',
  'Sangotedo',
  'Anthony',
  'Obalende',
] as const;

export type Category = { name: string; minNaira: number; maxNaira: number; dishes: string[] };

const DRINKS: Category = {
  name: 'Drinks',
  minNaira: 300,
  maxNaira: 2000,
  dishes: ['Zobo', 'Chapman', 'Bottled water', 'Soft drink', 'Fresh orange juice', 'Malt drink'],
};

export const MENUS: Record<string, Category[]> = {
  Nigerian: [
    {
      name: 'Mains',
      minNaira: 2500,
      maxNaira: 8000,
      dishes: [
        'Jollof rice & chicken',
        'Fried rice & turkey',
        'Ofada rice & ayamase',
        'Pounded yam & egusi',
        'Amala & ewedu',
        'Eba & okra soup',
        'Semovita & ogbono',
        'Beans & plantain',
        'Yam porridge',
        'Native rice',
        'Efo riro & fufu',
        'Banga soup & starch',
      ],
    },
    {
      name: 'Sides',
      minNaira: 400,
      maxNaira: 2000,
      dishes: ['Dodo', 'Moi moi', 'Coleslaw', 'Boiled egg', 'Fried fish', 'Assorted meat'],
    },
    DRINKS,
  ],
  Grills: [
    {
      name: 'Grills',
      minNaira: 2000,
      maxNaira: 9000,
      dishes: [
        'Beef suya',
        'Chicken suya',
        'Ram suya',
        'Asun',
        'Grilled catfish',
        'Grilled croaker',
        'Peppered gizzard',
        'Chicken wings',
        'Kilishi',
        'Grilled turkey',
      ],
    },
    {
      name: 'Sides',
      minNaira: 500,
      maxNaira: 2000,
      dishes: ['Yam chips', 'Fried plantain', 'Onion & tomato salad', 'Roasted corn', 'Fries'],
    },
    DRINKS,
  ],
  Chinese: [
    {
      name: 'Starters',
      minNaira: 1500,
      maxNaira: 4000,
      dishes: ['Spring rolls', 'Prawn crackers', 'Hot and sour soup', 'Sesame prawn toast'],
    },
    {
      name: 'Mains',
      minNaira: 4000,
      maxNaira: 12000,
      dishes: [
        'Sweet and sour chicken',
        'Chicken fried rice',
        'Beef in black bean sauce',
        'Singapore noodles',
        'Egg fried rice',
        'Chicken chow mein',
        'Kung pao chicken',
        'Szechuan beef',
      ],
    },
    DRINKS,
  ],
  Continental: [
    {
      name: 'Mains',
      minNaira: 4500,
      maxNaira: 15000,
      dishes: [
        'Chicken Caesar salad',
        'Spaghetti bolognese',
        'Grilled chicken breast',
        'Beef burger',
        'Club sandwich',
        'Fish and chips',
        'Chicken alfredo',
        'Steak and fries',
      ],
    },
    {
      name: 'Sides',
      minNaira: 1000,
      maxNaira: 3000,
      dishes: ['Fries', 'Mashed potatoes', 'Garden salad', 'Garlic bread'],
    },
    {
      name: 'Desserts',
      minNaira: 1500,
      maxNaira: 4500,
      dishes: ['Chocolate cake', 'Ice cream', 'Cheesecake', 'Fruit salad'],
    },
    DRINKS,
  ],
  Pastries: [
    {
      name: 'Pastries',
      minNaira: 500,
      maxNaira: 2500,
      dishes: [
        'Meat pie',
        'Chicken pie',
        'Sausage roll',
        'Fish roll',
        'Doughnut',
        'Puff-puff',
        'Chin chin',
        'Scotch egg',
      ],
    },
    {
      name: 'Cakes',
      minNaira: 1500,
      maxNaira: 4000,
      dishes: ['Red velvet slice', 'Banana bread', 'Carrot cake slice', 'Cupcake'],
    },
    {
      name: 'Drinks',
      minNaira: 800,
      maxNaira: 3000,
      dishes: ['Coffee', 'Hot chocolate', 'Iced tea', 'Smoothie'],
    },
  ],
  Seafood: [
    {
      name: 'Mains',
      minNaira: 5000,
      maxNaira: 20000,
      dishes: [
        'Peppered prawns',
        'Seafood okra',
        'Catfish pepper soup',
        'Grilled tilapia',
        'Periwinkle stir-fry',
        'Seafood fried rice',
        'Lobster tail',
        'Crab claws',
      ],
    },
    {
      name: 'Sides',
      minNaira: 500,
      maxNaira: 2500,
      dishes: ['Fried plantain', 'Boiled yam', 'Jollof rice', 'Garden salad'],
    },
    DRINKS,
  ],
};

export const CUISINES = Object.keys(MENUS);
