import type { Category, Listing } from "@/lib/types";
export const categories: Category[] = [
 {
  "id": "toy",
  "name": "To'y va tadbir"
 },
 {
  "id": "qurilish",
  "name": "Qurilish"
 },
 {
  "id": "oshxona",
  "name": "Oshxona va oshpaz"
 },
 {
  "id": "foto",
  "name": "Foto va video"
 },
 {
  "id": "trening",
  "name": "Trening va ta'lim"
 },
 {
  "id": "gozallik",
  "name": "Go'zallik"
 },
 {
  "id": "bolalar",
  "name": "Bolalar tadbirlari"
 }
];
export const seedListings: Listing[] = [
 {
  "id": 1,
  "title": "Banket stollari (6 kishilik, yumaloq)",
  "category": "toy",
  "pricePerDay": 25000,
  "deposit": 100000,
  "quantity": 40,
  "city": "Toshkent",
  "delivery": true,
  "rating": 4.8,
  "reviews": 36,
  "image": "https://placehold.co/600x400?text=Stol",
  "description": "Oq choyshabli, tez yig'iladigan yumaloq stollar. To'y va yig'inlar uchun.",
  "owner": {
   "name": "Akmal Rahimov",
   "phone": "+998 90 000 00 01"
  },
  "showPhone": true,
  "showTelegram": true,
  "telegramUsername": "akmal_rahimov",
  "ownerVerified": true
 },
 {
  "id": 2,
  "title": "Chiavari stullar (oltin rang)",
  "category": "toy",
  "pricePerDay": 8000,
  "deposit": 50000,
  "quantity": 300,
  "city": "Toshkent",
  "delivery": true,
  "rating": 4.9,
  "reviews": 52,
  "image": "https://placehold.co/600x400?text=Stul",
  "description": "Yumshoq o'rindiqli bezakli stullar, minimal buyurtma 20 dona.",
  "owner": {
   "name": "Akmal Rahimov",
   "phone": "+998 90 000 00 01"
  },
  "showPhone": true,
  "showTelegram": true,
  "telegramUsername": "akmal_rahimov"
 },
 {
  "id": 3,
  "title": "Shatr 6x12 metr",
  "category": "toy",
  "pricePerDay": 700000,
  "deposit": 1000000,
  "quantity": 5,
  "city": "Samarqand",
  "delivery": true,
  "rating": 4.7,
  "reviews": 18,
  "image": "https://placehold.co/600x400?text=Shatr",
  "description": "Yomg'ir va quyoshdan himoya qiluvchi katta shatr, o'rnatish bilan.",
  "owner": {
   "name": "Dilshod Karimov",
   "phone": "+998 91 000 00 02"
  },
  "showPhone": true,
  "showTelegram": true,
  "telegramUsername": "dilshod_karimov",
  "ownerVerified": true
 },
 {
  "id": 4,
  "title": "Idish-tovoq to'plami (100 kishilik)",
  "category": "toy",
  "pricePerDay": 300000,
  "deposit": 500000,
  "quantity": 8,
  "city": "Toshkent",
  "delivery": true,
  "rating": 4.6,
  "reviews": 24,
  "image": "https://placehold.co/600x400?text=Idish",
  "description": "Likop, choynak, kosa, qoshiq-vilka, stakan. Yuvilgan holda topshiriladi.",
  "owner": {
   "name": "Madina Yusupova",
   "phone": "+998 93 000 00 03"
  },
  "showPhone": true,
  "showTelegram": true,
  "telegramUsername": "madina_yusupova"
 },
 {
  "id": 5,
  "title": "Proyektor Full HD + ekran",
  "category": "trening",
  "pricePerDay": 150000,
  "deposit": 500000,
  "quantity": 6,
  "city": "Toshkent",
  "delivery": true,
  "rating": 4.8,
  "reviews": 41,
  "image": "https://placehold.co/600x400?text=Proyektor",
  "description": "Trening, taqdimot va kino kechasi uchun. HDMI kabel bilan.",
  "owner": {
   "name": "Sardor Tursunov",
   "phone": "+998 94 000 00 04"
  },
  "showPhone": true,
  "showTelegram": true,
  "telegramUsername": "sardor_tursunov",
  "ownerVerified": true
 },
 {
  "id": 6,
  "title": "Ovoz tizimi (2 kolonka + mikrofon)",
  "category": "toy",
  "pricePerDay": 250000,
  "deposit": 800000,
  "quantity": 10,
  "city": "Buxoro",
  "delivery": true,
  "rating": 4.5,
  "reviews": 29,
  "image": "https://placehold.co/600x400?text=Ovoz",
  "description": "Kichik va o'rta tadbirlar uchun quvvatli ovoz tizimi, 2 ta simsiz mikrofon.",
  "owner": {
   "name": "Bobur Alimov",
   "phone": "+998 95 000 00 05"
  },
  "showPhone": true,
  "showTelegram": false,
  "telegramUsername": "bobur_alimov"
 },
 {
  "id": 7,
  "title": "Perforator (professional)",
  "category": "qurilish",
  "pricePerDay": 60000,
  "deposit": 300000,
  "quantity": 12,
  "city": "Toshkent",
  "delivery": false,
  "rating": 4.7,
  "reviews": 63,
  "image": "https://placehold.co/600x400?text=Perforator",
  "description": "Beton va g'isht uchun, 3 ta uchlik bilan.",
  "owner": {
   "name": "Jasur Ergashev",
   "phone": "+998 97 000 00 06"
  },
  "showPhone": true,
  "showTelegram": true,
  "telegramUsername": "jasur_ergashev"
 },
 {
  "id": 8,
  "title": "Iskala (qurilish tayanchi) 3 sektsiya",
  "category": "qurilish",
  "pricePerDay": 90000,
  "deposit": 400000,
  "quantity": 15,
  "city": "Andijon",
  "delivery": true,
  "rating": 4.4,
  "reviews": 14,
  "image": "https://placehold.co/600x400?text=Iskala",
  "description": "Ichki va tashqi ishlar uchun mustahkam temir iskala.",
  "owner": {
   "name": "Ulug'bek Nazarov",
   "phone": "+998 98 000 00 07"
  },
  "showPhone": true,
  "showTelegram": true,
  "telegramUsername": "ulugbek_nazarov",
  "ownerVerified": true
 },
 {
  "id": 9,
  "title": "Katta qozon + gaz plita (to'y oshi uchun)",
  "category": "oshxona",
  "pricePerDay": 200000,
  "deposit": 600000,
  "quantity": 7,
  "city": "Farg'ona",
  "delivery": true,
  "rating": 4.9,
  "reviews": 47,
  "image": "https://placehold.co/600x400?text=Qozon",
  "description": "100 kishilik osh uchun qozon, o'choq va gaz ballon bilan.",
  "owner": {
   "name": "Rustam Oshpaz",
   "phone": "+998 99 000 00 08"
  },
  "showPhone": true,
  "showTelegram": false,
  "telegramUsername": "rustam_oshpaz"
 },
 {
  "id": 10,
  "title": "Kamera Sony A7 + 2 ta obyektiv",
  "category": "foto",
  "pricePerDay": 350000,
  "deposit": 3000000,
  "quantity": 2,
  "city": "Toshkent",
  "delivery": false,
  "rating": 5.0,
  "reviews": 22,
  "image": "https://placehold.co/600x400?text=Kamera",
  "description": "To'y va portret suratlari uchun, 2 ta batareya va xotira kartasi bilan.",
  "owner": {
   "name": "Nodira Foto",
   "phone": "+998 90 000 00 09"
  },
  "showPhone": false,
  "showTelegram": true,
  "telegramUsername": "nodira_foto"
 },
 {
  "id": 11,
  "title": "Ko'chma sartarosh kreslosi va jihozlari",
  "category": "gozallik",
  "pricePerDay": 120000,
  "deposit": 400000,
  "quantity": 3,
  "city": "Namangan",
  "delivery": true,
  "rating": 4.6,
  "reviews": 9,
  "image": "https://placehold.co/600x400?text=Sartarosh",
  "description": "Ko'chma xizmat va tadbirlarda ishlash uchun to'plam.",
  "owner": {
   "name": "Shahlo Go'zallik",
   "phone": "+998 91 000 00 10"
  },
  "showPhone": true,
  "showTelegram": true,
  "telegramUsername": "shahlo_gozallik",
  "ownerVerified": true
 },
 {
  "id": 12,
  "title": "Batut va shar bezagi to'plami",
  "category": "bolalar",
  "pricePerDay": 180000,
  "deposit": 500000,
  "quantity": 4,
  "city": "Toshkent",
  "delivery": true,
  "rating": 4.8,
  "reviews": 33,
  "image": "https://placehold.co/600x400?text=Batut",
  "description": "Tug'ilgan kun uchun xavfsiz batut, shar arkasi va multfilm bezaklari.",
  "owner": {
   "name": "Feruza Bayram",
   "phone": "+998 93 000 00 11"
  },
  "showPhone": true,
  "showTelegram": true,
  "telegramUsername": "feruza_bayram"
 }
];
