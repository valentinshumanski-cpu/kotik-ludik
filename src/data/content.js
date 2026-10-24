// Game content as data. Prices follow GDD v1 starting numbers.

// Room places for the MVP. Order = shop order.
export const PLACES = [
  { id: 'bed', name: 'Лежанка' },
  { id: 'scratcher', name: 'Когтеточка' },
  { id: 'bowl', name: 'Миска' },
  { id: 'toy', name: 'Игрушка' },
  { id: 'plant', name: 'Растение' },
  { id: 'rug', name: 'Коврик' },
];

export const ITEMS = [
  { id: 'cat-bed', place: 'bed', name: 'Лежанка-домик', price: 80, img: 'cat-bed' },
  { id: 'scratcher', place: 'scratcher', name: 'Когтеточка «Уютный домик»', price: 150, img: 'scratcher' },
  { id: 'toy-mouse', place: 'toy', name: 'Плюшевая мышка', price: 40, img: 'toy-mouse' },
  { id: 'yarn', place: 'toy', name: 'Клубок', price: 30, img: 'yarn' },
  { id: 'plant-large', place: 'plant', name: 'Большое растение', price: 0, img: 'plant-large' },
  { id: 'plant-flowers', place: 'plant', name: 'Розовые цветы', price: 60, img: 'plant-flowers' },
  { id: 'rug', place: 'rug', name: 'Коврик с лапкой', price: 0, img: 'rug' },
];

export const BREEDS = [
  { id: 'ginger', name: 'Рыжий', price: 0 },
  { id: 'persian', name: 'Персидский', price: 30 },
  { id: 'sphynx', name: 'Сфинкс', price: 30 },
];

export const itemById = (id) => ITEMS.find((item) => item.id === id);

// Daily tasks: 3 of these per day. `event` is a counter from progress.track().
export const TASKS = [
  { id: 'spin10', title: 'Покрути автомат 10 раз', event: 'spins', target: 10, reward: { fish: 5 } },
  { id: 'pet15', title: 'Погладь Алекса 15 раз', event: 'pets', target: 15, reward: { fish: 3 } },
  { id: 'game2', title: 'Сыграй 2 мини-игры', event: 'games', target: 2, reward: { crystals: 1 } },
  { id: 'catch10', title: 'Поймай 10 мышек или точек', event: 'catches', target: 10, reward: { fish: 5 } },
  { id: 'win5', title: 'Выиграй на автомате 5 раз', event: 'wins', target: 5, reward: { coins: 30 } },
  { id: 'buy1', title: 'Купи вещь в магазине', event: 'buys', target: 1, reward: { crystals: 1 } },
];

// One-time milestones.
export const ACHIEVEMENTS = [
  { id: 'spins100', title: 'Постоянный игрок', text: '100 прокруток', target: 100, value: (s) => s.stats.spins, reward: { crystals: 5 } },
  { id: 'spins500', title: 'Мастер автомата', text: '500 прокруток', target: 500, value: (s) => s.stats.spins, reward: { crystals: 10 } },
  { id: 'pets100', title: 'Лучший друг', text: 'Погладь Алекса 100 раз', target: 100, value: (s) => s.stats.pets, reward: { crystals: 3 } },
  { id: 'catch50', title: 'Охотник', text: 'Поймай 50 мышек или точек', target: 50, value: (s) => s.stats.catches, reward: { crystals: 3 } },
  { id: 'room', title: 'Уютный дом', text: 'Купи все вещи', target: ITEMS.length, value: (s) => s.owned.length, reward: { crystals: 10 } },
  { id: 'breeds', title: 'Тысяча обличий', text: 'Открой все породы', target: BREEDS.length, value: (s) => s.breeds.length, reward: { crystals: 10 } },
];

// Alex's requests: no deadline, done when the counter grows by `target`.
export const REQUESTS = [
  { id: 'pet', text: 'Погладь меня!', event: 'pets', target: 3 },
  { id: 'play', text: 'Поиграем?', event: 'games', target: 1 },
  { id: 'spin', text: 'Покрути автомат!', event: 'spins', target: 3 },
  { id: 'catch', text: 'Хочу поймать 5 мышек!', event: 'catches', target: 5 },
];
