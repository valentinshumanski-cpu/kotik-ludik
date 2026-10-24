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
