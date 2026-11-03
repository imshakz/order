/* eslint-disable no-console */
import { OrderSource, OrderStatus, PaymentMethod, PrismaClient, StaffRole, TableShape, Tier } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

/**
 * Runs on every container start. Always makes sure tier rules and an admin exist.
 * With SEED_DEMO_DATA=true on an empty database it also loads a sample restaurant
 * with a month of order history so the dashboards have something to show.
 */
const prisma = new PrismaClient();
const code = () => randomBytes(4).toString('hex');
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const r2 = (n: number) => Math.round(n * 100) / 100;

async function tiers() {
  const rules = [
    { tier: Tier.MEMBER, minLifetimePoints: 0, discountPercent: 0, pointsMultiplier: 1, color: '#a1a1aa', perks: ['Earn 1 point per $1', 'Birthday dessert'] },
    { tier: Tier.SILVER, minLifetimePoints: 500, discountPercent: 5, pointsMultiplier: 1.25, color: '#cbd5e1', perks: ['5% off every order', '1.25x points', 'Priority waitlist'] },
    { tier: Tier.GOLD, minLifetimePoints: 1500, discountPercent: 10, pointsMultiplier: 1.5, color: '#f5c451', perks: ['10% off every order', '1.5x points', 'Gold-only chef specials', 'Guaranteed table with booking'] },
  ];
  for (const r of rules) await prisma.tierRule.upsert({ where: { tier: r.tier }, update: {}, create: r });
}

async function admin() {
  if (await prisma.staff.count()) return;
  const email = (process.env.ADMIN_EMAIL || 'manager@demo.com').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'password123';
  await prisma.staff.create({
    data: { name: 'Manager', email, role: StaffRole.MANAGER, passwordHash: await bcrypt.hash(password, 10) },
  });
  console.log(`Created manager login: ${email}`);
}

const MENU: Record<string, [string, string, number, string[], number][]> = {
  'Small plates': [
    ['Charred Edamame', 'Smoked salt, chilli oil, lime', 9, ['vegan', 'gf'], 6],
    ['Burrata', 'Heirloom tomato, basil oil, grilled sourdough', 19, ['vegetarian'], 8],
    ['Crispy Calamari', 'Szechuan pepper, aioli, lemon', 17, [], 10],
    ['Beef Tartare', 'Cured yolk, capers, potato crisps', 22, ['gf'], 10],
  ],
  'From the grill': [
    ['Wagyu Rump MB6+', '300g, bone marrow butter, watercress', 52, ['gf'], 22],
    ['Half Chicken', 'Peri-peri glaze, charred lemon', 34, ['gf', 'spicy'], 20],
    ['Market Fish', 'Brown butter, capers, green beans', 39, ['gf'], 18],
    ['Cauliflower Steak', 'Tahini, pomegranate, dukkah', 28, ['vegan'], 16],
  ],
  Pasta: [
    ['Cacio e Pepe', 'Tonnarelli, pecorino, black pepper', 26, ['vegetarian'], 12],
    ['Prawn Linguine', 'Garlic, chilli, cherry tomato, bottarga', 32, ['spicy'], 14],
    ['Slow-cooked Lamb Ragu', 'Pappardelle, gremolata', 30, [], 14],
  ],
  Sides: [
    ['Hand-cut Fries', 'Rosemary salt', 10, ['vegan', 'gf'], 8],
    ['Charred Broccolini', 'Almond, lemon', 12, ['vegan', 'gf'], 8],
    ['Leaf Salad', 'Shallot vinaigrette', 9, ['vegan', 'gf'], 4],
  ],
  Desserts: [
    ['Basque Cheesecake', 'Poached stone fruit', 16, ['vegetarian'], 5],
    ['Dark Chocolate Mousse', 'Hazelnut praline, sea salt', 15, ['vegetarian', 'gf'], 5],
    ['Affogato', 'Vanilla gelato, espresso, Frangelico', 14, ['vegetarian'], 3],
  ],
  Drinks: [
    ['Espresso Martini', 'Vodka, coffee liqueur, espresso', 21, [], 4],
    ['Negroni', 'Gin, Campari, vermouth', 20, ['vegan'], 3],
    ['Pinot Noir, Yarra Valley', 'Glass', 16, ['vegan'], 1],
    ['Sparkling Water', '750ml', 8, ['vegan'], 1],
    ['House Lemonade', 'Mint, lime', 7, ['vegan'], 2],
  ],
};

const TABLES: [string, number, string, TableShape, number, number][] = [
  ['T1', 2, 'Main', TableShape.ROUND, 0, 0],
  ['T2', 2, 'Main', TableShape.ROUND, 1, 0],
  ['T3', 4, 'Main', TableShape.SQUARE, 2, 0],
  ['T4', 4, 'Main', TableShape.SQUARE, 3, 0],
  ['T5', 6, 'Main', TableShape.RECT, 0, 1],
  ['T6', 6, 'Main', TableShape.RECT, 2, 1],
  ['B1', 4, 'Booths', TableShape.BOOTH, 0, 2],
  ['B2', 4, 'Booths', TableShape.BOOTH, 1, 2],
  ['B3', 6, 'Booths', TableShape.BOOTH, 2, 2],
  ['P1', 2, 'Patio', TableShape.ROUND, 0, 3],
  ['P2', 4, 'Patio', TableShape.SQUARE, 1, 3],
  ['P3', 8, 'Patio', TableShape.RECT, 2, 3],
];

const NAMES = [
  'Olivia Chen', 'Jack Wilson', 'Mia Nguyen', 'Noah Patel', 'Ava Rossi', 'Liam Murphy', 'Isla Kim', 'Leo Santos',
  'Grace Taylor', 'Ethan Brown', 'Chloe Martin', 'Lucas Ahmed', 'Zoe Williams', 'Henry Lee', 'Ruby Singh', 'Oscar Jones',
  'Matilda Clarke', 'William Tran', 'Sophie Walker', 'Thomas Wright', 'Harper Hall', 'Charlie Young', 'Amelia Scott', 'Jacob King',
];

async function demo() {
  if ((await prisma.menuItem.count()) > 0) return; // already have a restaurant
  console.log('Loading demo restaurant...');

  const pw = await bcrypt.hash('password123', 10);
  const staff = await Promise.all(
    [
      ['Hana Host', 'host@demo.com', StaffRole.HOST],
      ['Sam Server', 'server@demo.com', StaffRole.SERVER],
      ['Riley Server', 'riley@demo.com', StaffRole.SERVER],
      ['Kai Kitchen', 'kitchen@demo.com', StaffRole.KITCHEN],
    ].map(([name, email, role]) =>
      prisma.staff.upsert({ where: { email }, update: {}, create: { name, email, role: role as StaffRole, passwordHash: pw } }),
    ),
  );
  const servers = staff.filter((s) => s.role === StaffRole.SERVER);

  const items: { id: string; name: string; price: number }[] = [];
  let sort = 0;
  for (const [cat, list] of Object.entries(MENU)) {
    const c = await prisma.category.create({ data: { name: cat, sortOrder: sort++ } });
    for (const [i, [name, description, price, tags, prepMinutes]] of list.entries()) {
      const m = await prisma.menuItem.create({ data: { name, description, price, tags, prepMinutes, categoryId: c.id, sortOrder: i } });
      items.push({ id: m.id, name, price });
    }
  }

  const byName = (n: string) => items.find((i) => i.name === n)!;
  await prisma.chefSpecial.create({
    data: { menuItemId: byName('Market Fish').id, headline: "Tonight's catch: Murray cod", note: 'Line-caught, served with saffron beurre blanc', specialPrice: 36 },
  });
  await prisma.chefSpecial.create({
    data: {
      menuItemId: byName('Wagyu Rump MB6+').id,
      headline: 'Gold members: Wagyu night',
      note: 'Our MB6+ rump at a members-only price',
      specialPrice: 42,
      minTier: Tier.GOLD,
    },
  });

  const tables = [];
  for (const [label, seats, section, shape, posX, posY] of TABLES) {
    tables.push(await prisma.table.create({ data: { label, seats, section, shape, posX, posY, code: code() } }));
  }

  const customers = [];
  for (const [i, name] of NAMES.entries()) {
    const email = `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`;
    customers.push(
      await prisma.customer.create({
        data: {
          name,
          email,
          phone: `04${String(10000000 + i * 137731).slice(0, 8)}`,
          passwordHash: i < 3 ? pw : null,
          createdAt: new Date(Date.now() - (30 + i * 4) * 86400_000),
        },
      }),
    );
  }

  // A month of history. Some customers are regulars so the tiers spread out.
  const weights = customers.map((_, i) => (i < 4 ? 8 : i < 10 ? 4 : 1));
  const weighted = customers.flatMap((c, i) => Array(weights[i]).fill(c));
  const stats = new Map<string, { spend: number; visits: number; last: Date }>();

  for (let day = 29; day >= 0; day--) {
    const count = 8 + Math.floor(Math.random() * 10) + (day % 7 < 2 ? 6 : 0);
    for (let k = 0; k < count; k++) {
      const hour = pick([12, 12, 13, 13, 14, 18, 18, 19, 19, 19, 20, 20, 21]);
      const created = new Date();
      created.setDate(created.getDate() - day);
      created.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
      if (created > new Date()) continue;
      const customer = Math.random() < 0.65 ? pick(weighted) : null;
      const lines = Array.from({ length: 2 + Math.floor(Math.random() * 4) }, () => {
        const it = pick(items);
        return { menuItemId: it.id, name: it.name, unitPrice: it.price, quantity: Math.random() < 0.2 ? 2 : 1, status: 'DONE' as const };
      });
      const subtotal = r2(lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0));
      const tax = r2((subtotal * 0.1) / 1.1);
      const tip = Math.random() < 0.4 ? r2(subtotal * 0.1) : 0;
      const paidAt = new Date(created.getTime() + (45 + Math.random() * 40) * 60_000);
      const method = pick([PaymentMethod.CARD_ONLINE, PaymentMethod.CARD_TERMINAL, PaymentMethod.CARD_TERMINAL, PaymentMethod.CASH]);
      const source = method === PaymentMethod.CARD_ONLINE ? OrderSource.CUSTOMER : pick([OrderSource.STAFF, OrderSource.CUSTOMER]);
      await prisma.order.create({
        data: {
          status: OrderStatus.PAID,
          source,
          tableId: pick(tables).id,
          customerId: customer?.id,
          staffId: source === OrderSource.STAFF ? pick(servers).id : null,
          subtotal,
          tax,
          tip,
          total: subtotal,
          createdAt: created,
          paidAt,
          items: { create: lines },
          payments: {
            create: { amount: r2(subtotal + tip), tip, method, status: 'SUCCEEDED', provider: method === PaymentMethod.CARD_ONLINE ? 'simulated' : 'manual', createdAt: paidAt },
          },
        },
      });
      if (customer) {
        const s = stats.get(customer.id) ?? { spend: 0, visits: 0, last: paidAt };
        s.spend += subtotal;
        s.visits += 1;
        if (paidAt > s.last) s.last = paidAt;
        stats.set(customer.id, s);
      }
    }
  }

  for (const [id, s] of stats) {
    const lifetimePoints = Math.floor(s.spend);
    const tier = lifetimePoints >= 1500 ? Tier.GOLD : lifetimePoints >= 500 ? Tier.SILVER : Tier.MEMBER;
    const points = Math.floor(lifetimePoints * 0.6);
    await prisma.customer.update({
      where: { id },
      data: { lifetimePoints, points, tier, lifetimeSpend: r2(s.spend), visits: s.visits, lastVisitAt: s.last },
    });
    await prisma.pointsLedger.create({ data: { customerId: id, delta: points, reason: 'Opening balance' } });
  }

  // A few tables in service right now so the floor isn't empty.
  const now = Date.now();
  for (const [ti, status] of [
    [2, OrderStatus.PREPARING],
    [4, OrderStatus.PLACED],
    [6, OrderStatus.READY],
    [9, OrderStatus.SERVED],
  ] as const) {
    const lines = [pick(items), pick(items), pick(items)].map((it) => ({
      menuItemId: it.id,
      name: it.name,
      unitPrice: it.price,
      quantity: 1,
      status: status === OrderStatus.PLACED ? ('QUEUED' as const) : status === OrderStatus.PREPARING ? ('COOKING' as const) : ('DONE' as const),
    }));
    const subtotal = r2(lines.reduce((s, l) => s + l.unitPrice, 0));
    await prisma.order.create({
      data: {
        status,
        source: OrderSource.CUSTOMER,
        tableId: tables[ti].id,
        customerId: Math.random() < 0.5 ? customers[ti].id : null,
        subtotal,
        tax: r2((subtotal * 0.1) / 1.1),
        total: subtotal,
        createdAt: new Date(now - (10 + ti * 4) * 60_000),
        items: { create: lines },
      },
    });
    await prisma.table.update({
      where: { id: tables[ti].id },
      data: { status: status === OrderStatus.READY ? 'NEEDS_ATTENTION' : 'ORDERED', guests: Math.min(tables[ti].seats, 2 + (ti % 3)), seatedAt: new Date(now - (15 + ti * 4) * 60_000) },
    });
  }
  await prisma.table.update({ where: { id: tables[1].id }, data: { status: 'SEATED', guests: 2, seatedAt: new Date(now - 5 * 60_000) } });
  await prisma.table.update({ where: { id: tables[10].id }, data: { status: 'CLEANING' } });

  const evening = new Date();
  evening.setHours(19, 30, 0, 0);
  await prisma.reservation.createMany({
    data: [
      { name: customers[0].name, phone: customers[0].phone, partySize: 4, time: evening, customerId: customers[0].id, tableId: tables[7].id, notes: 'Anniversary' },
      { name: 'Walk-in group', partySize: 8, time: new Date(evening.getTime() + 45 * 60_000), tableId: tables[11].id },
      { name: customers[5].name, partySize: 2, time: new Date(evening.getTime() + 90 * 60_000), customerId: customers[5].id },
    ],
  });
  await prisma.table.update({ where: { id: tables[7].id }, data: { status: 'RESERVED' } });

  console.log('Demo data loaded. Staff logins use password "password123".');
}

async function main() {
  await tiers();
  await admin();
  if ((process.env.SEED_DEMO_DATA ?? 'true') === 'true') await demo();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
