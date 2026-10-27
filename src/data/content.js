// Game content as data. Prices follow GDD v1 starting numbers.

// Room places. Order = shop order; `room` = which screen the place is on.
export const PLACES = [
  { id: 'bed', name: 'Лежанка' },
  { id: 'scratcher', name: 'Когтеточка' },
  { id: 'bowl', name: 'Миска' },
  { id: 'toy', name: 'Игрушка' },
  { id: 'plant', name: 'Растение' },
  { id: 'rug', name: 'Коврик' },
  { id: 'seat', name: 'Диван', room: 'living' },
  { id: 'tv', name: 'Телевизор', room: 'living' },
  { id: 'lamp', name: 'Торшер', room: 'living' },
  { id: 'lr-rug', name: 'Ковёр', room: 'living' },
  { id: 'lr-wall', name: 'Обои', room: 'living' },
  { id: 'lr-floor', name: 'Пол', room: 'living' },
];

// Extra colours of an item: base look is free with the item, each other colour costs COLOR_PRICE.
export const COLOR_PRICE = 15;
const COLORS = (id, base) => [
  { id: 'base', name: base.name, swatch: base.swatch, img: id },
  { id: 'blue', name: 'Голубая', swatch: '#7fb2e8', img: `${id}-blue` },
  { id: 'mint', name: 'Мятная', swatch: '#98d9b9', img: `${id}-mint` },
];

export const ITEMS = [
  { id: 'cat-bed', place: 'bed', name: 'Лежанка-домик', price: 80, img: 'cat-bed', colors: COLORS('cat-bed', { name: 'Кремовая', swatch: '#f3e3cf' }) },
  { id: 'bed-basket', place: 'bed', name: 'Плетёная корзинка', price: 60, img: 'bed-basket' },
  { id: 'scratcher', place: 'scratcher', name: 'Когтеточка «Уютный домик»', price: 150, img: 'scratcher', colors: COLORS('scratcher', { name: 'Ягодная', swatch: '#b8304e' }) },
  { id: 'scratcher-post', place: 'scratcher', name: 'Столбик-когтеточка', price: 100, img: 'scratcher-post' },
  { id: 'bowl-ceramic', place: 'bowl', name: 'Керамическая миска', price: 40, img: 'bowl-ceramic-empty', full: 'bowl-ceramic-full' },
  { id: 'bowl-metal', place: 'bowl', name: 'Миска на подставке', price: 90, img: 'bowl-metal-empty', full: 'bowl-metal-full' },
  { id: 'toy-mouse', place: 'toy', name: 'Плюшевая мышка', price: 40, img: 'toy-mouse' },
  { id: 'yarn', place: 'toy', name: 'Клубок', price: 30, img: 'yarn' },
  { id: 'toy-ball', place: 'toy', name: 'Мячик с колокольчиком', price: 35, img: 'toy-ball-bell' },
  { id: 'plant-large', place: 'plant', name: 'Большое растение', price: 0, img: 'plant-large' },
  { id: 'plant-flowers', place: 'plant', name: 'Розовые цветы', price: 60, img: 'plant-flowers' },
  { id: 'rug', place: 'rug', name: 'Коврик с лапкой', price: 0, img: 'rug', colors: COLORS('rug', { name: 'Розовый', swatch: '#e58a9b' }) },
  { id: 'rug-square', place: 'rug', name: 'Коврик с кисточками', price: 50, img: 'rug-square' },
  // living room. `seat` = where Alex's paws go on it, % of the stage
  { id: 'armchair', place: 'seat', name: 'Кресло с пледом', price: 0, img: 'armchair', seat: [31, 58.6] },
  { id: 'sofa-cozy', place: 'seat', name: 'Уютный диван', price: 120, img: 'sofa-cozy', seat: [20, 66], colors: COLORS('sofa-cozy', { name: 'Розовый', swatch: '#d9606e' }) },
  { id: 'sofa-corner', place: 'seat', name: 'Угловой диван', price: 160, img: 'sofa-corner', seat: [18, 64] },
  { id: 'tv-retro', place: 'tv', name: 'Ретро-телевизор', price: 150, img: 'tv-retro' },
  { id: 'tv-flat', place: 'tv', name: 'Плоский телевизор', price: 220, img: 'tv-flat' },
  { id: 'floor-lamp', place: 'lamp', name: 'Торшер', price: 70, img: 'floor-lamp' },
  { id: 'lr-rug-tassel', place: 'lr-rug', name: 'Ковёр с кисточками', price: 0, img: 'rug-square' },
  { id: 'lr-rug-oval', place: 'lr-rug', name: 'Овальный ковёр', price: 50, img: 'lr-rug-oval' },
  { id: 'lr-wall-cream', place: 'lr-wall', name: 'Кремовые обои', price: 0, img: 'lr-wall-cream' },
  { id: 'lr-wall-green', place: 'lr-wall', name: 'Зелёные в полоску', price: 60, img: 'lr-wall-green' },
  { id: 'lr-wall-blue', place: 'lr-wall', name: 'Голубые с облачками', price: 60, img: 'lr-wall-blue' },
  { id: 'lr-floor-oak', place: 'lr-floor', name: 'Светлый дуб', price: 0, img: 'lr-floor-oak' },
  { id: 'lr-floor-dark', place: 'lr-floor', name: 'Тёмное дерево', price: 50, img: 'lr-floor-dark' },
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
  { id: 'feed2', title: 'Покорми Алекса 2 раза', event: 'feeds', target: 2, reward: { fish: 3 }, needs: 'bowl' },
  { id: 'tv2', title: 'Посмотри мультики с Алексом 2 раза', event: 'tv', target: 2, reward: { fish: 3 }, needs: 'tv' },
  { id: 'read2', title: 'Почитай Алексу 2 раза', event: 'reads', target: 2, reward: { fish: 3 } },
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

// Alex's requests: no deadline, done when the counter grows by `target`. `needs` = a room place that must be filled.
export const REQUESTS = [
  { id: 'pet', text: 'Погладь меня!', event: 'pets', target: 3 },
  { id: 'play', text: 'Поиграем?', event: 'games', target: 1 },
  { id: 'spin', text: 'Покрути автомат!', event: 'spins', target: 3 },
  { id: 'catch', text: 'Хочу поймать 5 мышек!', event: 'catches', target: 5 },
  { id: 'feed', text: 'Я проголодался! Нажми на миску', event: 'feeds', target: 1, needs: 'bowl' },
  { id: 'tv', text: 'Посмотрим мультики?', event: 'tv', target: 1, needs: 'tv' },
  { id: 'read', text: 'Почитаешь мне?', event: 'reads', target: 1 },
];
